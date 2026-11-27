'use strict';

/**
 * Invoice Cron Job
 * ─────────────────────────────────────────────────────────────────────────────
 * Runs daily at 6:00 AM to auto-generate draft invoices for all clients whose
 * billingDate matches today's day-of-month.
 *
 * Logic:
 *  1. Find all active clients whose billingDate = today's day-of-month
 *  2. For each client, find their active packages + DELIVERED add-ons
 *  3. Build line items and create a DRAFT ClientPayment invoice
 *  4. Skip if an invoice for this client+month already exists
 */

const cron = require('node-cron');
const { Op } = require('sequelize');
const { db } = require('../database/client');
const logger = require('../utils/logger');

// ── IST Date & System User Helpers ───────────────────────────────────────────
function getIstDateInfo(baseDate = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(baseDate);

  const map = Object.fromEntries(parts.map(p => [p.type, p.value]));
  const year = parseInt(map.year, 10);
  const month = parseInt(map.month, 10);
  const day = parseInt(map.day, 10);
  const daysInMonth = new Date(year, month, 0).getDate();
  const todayStr = `${map.year}-${map.month}-${map.day}`;
  const billingMonth = `${map.year}-${map.month}`;
  const monthLabel = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Kolkata',
    month: 'long',
    year: 'numeric',
  }).format(baseDate);

  return { year, month, day, daysInMonth, todayStr, billingMonth, monthLabel };
}

async function findSystemUserId() {
  const bossUser = await db.User.findOne({
    where: { isActive: true, deletedAt: null },
    include: [{
      model: db.RoleDefinition,
      as: 'role',
      where: { accessLevel: 1 },
      attributes: [],
      required: true,
    }],
    attributes: ['id'],
  });
  if (bossUser) return bossUser.id;

  const fallback = await db.User.findOne({
    where: { isActive: true, deletedAt: null },
    attributes: ['id'],
  });
  return fallback ? fallback.id : null;
}

// ── Core generation logic (called by cron + manual trigger) ───────────────────
async function generateClientInvoicesForDay(targetDay, systemUserId) {
  const ist = getIstDateInfo();
  const resolvedDay = parseInt(targetDay, 10) || ist.day;
  const billingMonth = ist.billingMonth;
  const todayStr     = ist.todayStr;
  const isLastDayOfMonth = resolvedDay === ist.daysInMonth && ist.daysInMonth < 31;
  const billingDayCond = isLastDayOfMonth ? { [Op.gte]: resolvedDay } : resolvedDay;

  logger.info(`[InvoiceCron] Running for day=${resolvedDay}, month=${billingMonth}`);

  // 1. Find all active auto-generate billing configs due today
  let configByClientId = {};
  let configClientIds = [];
  try {
    const allConfigs = await db.InvoiceBillingConfig.findAll();
    for (const cfg of allConfigs) {
      configByClientId[cfg.clientId] = cfg;
      if (
        cfg.isActive &&
        cfg.isAutoGenerate &&
        (cfg.billingDay === resolvedDay || (isLastDayOfMonth && cfg.billingDay >= resolvedDay) || (cfg.nextDueAt && cfg.nextDueAt <= todayStr))
      ) {
        configClientIds.push(cfg.clientId);
      }
    }
  } catch (cfgErr) {
    logger.warn('[InvoiceCron] Could not query InvoiceBillingConfig:', cfgErr.message);
  }

  const clientWhere = {
    deletedAt: null,
  };
  if (configClientIds.length > 0) {
    clientWhere[Op.or] = [
      { billingDate: billingDayCond },
      { id: { [Op.in]: configClientIds } },
    ];
  } else {
    clientWhere.billingDate = billingDayCond;
  }

  const clients = await db.Client.findAll({ where: clientWhere });

  if (clients.length === 0) {
    logger.info('[InvoiceCron] No clients due for billing today.');
    return { generated: [], skipped: [], totalGenerated: 0 };
  }

  const generated = [];
  const skipped   = [];

  for (const client of clients) {
    try {
      const billingConfig = configByClientId[client.id] || null;

      // Respect InvoiceBillingConfig flags when present
      if (billingConfig) {
        if (!billingConfig.isActive) {
          skipped.push({ clientId: client.id, clientName: client.name, reason: 'Billing config is inactive' });
          continue;
        }
        if (!billingConfig.isAutoGenerate) {
          skipped.push({ clientId: client.id, clientName: client.name, reason: 'Auto-generate disabled in billing config' });
          continue;
        }
        if (billingConfig.billingFrequency !== 'MONTHLY' && billingConfig.nextDueAt && billingConfig.nextDueAt > todayStr) {
          skipped.push({ clientId: client.id, clientName: client.name, reason: `Not due until ${billingConfig.nextDueAt} (${billingConfig.billingFrequency})` });
          continue;
        }
      }

      // 2. Skip if an invoice for this client already exists this month
      const existing = await db.ClientPayment.findOne({
        where: {
          clientId:    client.id,
          paymentType: 'INVOICE',
          billingMonth,
          deletedAt:   null,
        },
      });

      if (existing) {
        skipped.push({ clientId: client.id, clientName: client.name, reason: 'Already generated this month' });
        logger.info(`[InvoiceCron] Skipping ${client.name} – invoice already exists for ${billingMonth}`);
        continue;
      }

      // 3. Find client's active packages (or configured package)
      const pkgWhere = { clientId: client.id, status: 'ACTIVE', deletedAt: null };
      if (billingConfig?.packageId) {
        pkgWhere.id = billingConfig.packageId;
      }
      const packages = await db.ClientPackage.findAll({ where: pkgWhere });

      if (packages.length === 0) {
        skipped.push({ clientId: client.id, clientName: client.name, reason: 'No active packages' });
        logger.info(`[InvoiceCron] Skipping ${client.name} – no active packages`);
        continue;
      }

      // 4. Build line items from active packages + DELIVERED add-ons (when enabled)
      const includeAddOns = billingConfig ? billingConfig.includeAddOns !== false : true;
      const lineItems = [];
      let baseAmount  = 0;

      for (const pkg of packages) {
        const pkgAmount = parseFloat(pkg.basePrice || 0);
        lineItems.push({
          description: `${pkg.name} — Retainer (${ist.monthLabel})`,
          quantity:    1,
          unitPrice:   pkgAmount,
          amount:      pkgAmount,
        });
        baseAmount += pkgAmount;

        if (includeAddOns) {
          // Include DELIVERED add-ons for this package
          const addOns = await db.PackageAddOn.findAll({
            where: { packageId: pkg.id, status: 'DELIVERED' },
            include: [{ model: db.ServiceCatalog, as: 'service', attributes: ['name'], required: false }],
          });

          for (const addOn of addOns) {
            const addOnAmount = parseFloat(addOn.totalPrice || addOn.unitPrice || 0);
            lineItems.push({
              description: addOn.service?.name || addOn.customDescription || 'Add-on Service',
              quantity:    addOn.quantity || 1,
              unitPrice:   parseFloat(addOn.unitPrice || 0),
              amount:      addOnAmount,
            });
            baseAmount += addOnAmount;

            // Mark add-on as BILLED
            await addOn.update({ status: 'BILLED', billedAt: new Date() });
          }
        }
      }

      // 5. Tax rate and due days from billing config, defaulting to 0% / 15 days
      const taxRate   = billingConfig?.defaultTaxRate ? parseFloat(billingConfig.defaultTaxRate) : 0;
      const dueDays   = billingConfig?.defaultDueDays || 15;
      const taxAmount = parseFloat(((baseAmount * taxRate) / 100).toFixed(2));

      const dueDate = new Date(Date.UTC(ist.year, ist.month - 1, ist.day + dueDays));
      const dueDateStr = dueDate.toISOString().slice(0, 10);

      // 6. Create the DRAFT invoice
      const invoice = await db.ClientPayment.create({
        clientId:      client.id,
        packageId:     packages[0]?.id || null, // primary package reference
        createdById:   systemUserId,
        paymentType:   'INVOICE',
        invoiceStatus: 'DRAFT',
        paymentStatus: 'UNPAID',
        status:        'DRAFT',
        invoiceDate:   todayStr,
        dueDate:       dueDateStr,
        amount:        baseAmount,
        taxAmount,
        taxRate:       taxRate || 0,
        discountAmount: 0,
        penaltyAmount:  0,
        paidAmount:    0,
        currency:      'INR',
        lineItems:     lineItems.length > 0 ? lineItems : null,
        description:   `Auto-generated invoice — ${client.name} (${billingMonth})`,
        internalNotes: billingConfig?.notes || null,
        billingMonth,
        billingConfigId: billingConfig?.id || null,
      });

      // 7. Update billing config's lastGeneratedAt & nextDueAt
      if (billingConfig) {
        let nextMonths = 1;
        if (billingConfig.billingFrequency === 'QUARTERLY') nextMonths = 3;
        else if (billingConfig.billingFrequency === 'ANNUAL') nextMonths = 12;

        const nextDue = new Date(Date.UTC(ist.year, ist.month - 1 + nextMonths, billingConfig.billingDay || resolvedDay));

        await billingConfig.update({
          lastGeneratedAt: new Date(),
          nextDueAt: nextDue.toISOString().slice(0, 10),
        });
      }

      generated.push({
        invoiceId:     invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        clientName:    client.name,
        amount:        baseAmount + taxAmount,
        lineItems:     lineItems.length,
      });

      logger.info(`[InvoiceCron] ✅ Draft invoice created for ${client.name} — ₹${(baseAmount + taxAmount).toFixed(2)}`);

    } catch (err) {
      logger.error(`[InvoiceCron] ❌ Failed to generate invoice for client ${client.name} (${client.id}):`, err);
      skipped.push({ clientId: client.id, clientName: client.name, reason: err.message });
    }
  }

  logger.info(`[InvoiceCron] Done. Generated: ${generated.length}, Skipped: ${skipped.length}`);
  return { generated, skipped, totalGenerated: generated.length };
}

// ── Schedule the cron ─────────────────────────────────────────────────────────
function startInvoiceCron() {
  const { generatePayrollForDay } = require('../services/salary.service');

  // Runs every day at 12:00 AM (midnight) IST
  cron.schedule('0 0 * * *', async () => {
    const ist      = getIstDateInfo();
    const todayDay = ist.day;
    logger.info(`[DailyCron] 🕛 Triggered at 00:00 IST — date=${ist.todayStr}, day=${todayDay}`);

    try {
      const systemUserId = await findSystemUserId();

      if (!systemUserId) {
        logger.error('[DailyCron] No admin user found — skipping auto-generation');
        return;
      }

      // 1. Auto-generate client invoices
      const invoiceResult = await generateClientInvoicesForDay(todayDay, systemUserId);
      logger.info(`[DailyCron] 📄 Invoices: ${invoiceResult.generated.length} generated, ${invoiceResult.skipped.length} skipped`);

      // 2. Auto-generate employee payroll entries
      const payrollResult = await generatePayrollForDay(todayDay, systemUserId);
      logger.info(`[DailyCron] 💰 Payroll: ${payrollResult.generated.length} generated, ${payrollResult.skipped.length} skipped`);

    } catch (err) {
      logger.error('[DailyCron] Unhandled cron error:', err);
    }
  }, {
    timezone: 'Asia/Kolkata', // IST
  });

  logger.info('[DailyCron] ✅ Daily cron scheduled at 00:00 IST (invoices + payroll)');
}

// ── Manual trigger helper ───────────────────────────────────────────────────
async function runDailyCronNow(forcedDay = null) {
  const { generatePayrollForDay } = require('../services/salary.service');
  const ist = getIstDateInfo();
  const todayDay = forcedDay !== null && forcedDay !== undefined && forcedDay !== ''
    ? parseInt(forcedDay, 10)
    : ist.day;

  const systemUserId = await findSystemUserId();

  if (!systemUserId) {
    throw new Error('No user found to attribute auto-generated records to');
  }

  const invoiceResult = await generateClientInvoicesForDay(todayDay, systemUserId);
  const payrollResult = await generatePayrollForDay(todayDay, systemUserId);

  return {
    day: todayDay,
    invoices: invoiceResult,
    payroll: payrollResult,
  };
}

module.exports = { startInvoiceCron, generateClientInvoicesForDay, runDailyCronNow, findSystemUserId };

