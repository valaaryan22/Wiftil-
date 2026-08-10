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

// ── Core generation logic (called by cron + manual trigger) ───────────────────
async function generateClientInvoicesForDay(targetDay, systemUserId) {
  const today = new Date();
  const billingMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
  const todayStr     = today.toISOString().slice(0, 10);

  logger.info(`[InvoiceCron] Running for day=${targetDay}, month=${billingMonth}`);

  // 1. Find all active clients whose billing day is today
  const clients = await db.Client.findAll({
    where: {
      billingDate: targetDay,
      deletedAt:   null,
    },
  });

  if (clients.length === 0) {
    logger.info('[InvoiceCron] No clients due for billing today.');
    return { generated: [], skipped: [], totalGenerated: 0 };
  }

  const generated = [];
  const skipped   = [];

  for (const client of clients) {
    try {
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

      // 3. Find client's active packages
      const packages = await db.ClientPackage.findAll({
        where: { clientId: client.id, status: 'ACTIVE', deletedAt: null },
      });

      if (packages.length === 0) {
        skipped.push({ clientId: client.id, clientName: client.name, reason: 'No active packages' });
        logger.info(`[InvoiceCron] Skipping ${client.name} – no active packages`);
        continue;
      }

      // 4. Build line items from ALL active packages + their DELIVERED add-ons
      const lineItems = [];
      let baseAmount  = 0;

      for (const pkg of packages) {
        const pkgAmount = parseFloat(pkg.basePrice || 0);
        lineItems.push({
          description: `${pkg.name} — Retainer (${today.toLocaleString('default', { month: 'long' })} ${today.getFullYear()})`,
          quantity:    1,
          unitPrice:   pkgAmount,
          amount:      pkgAmount,
        });
        baseAmount += pkgAmount;

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

      // 5. Try to get tax rate from billing config, default to 18%
      const billingConfig = await db.InvoiceBillingConfig.findOne({
        where: { clientId: client.id, isActive: true },
      });
      const taxRate   = billingConfig?.defaultTaxRate ? parseFloat(billingConfig.defaultTaxRate) : 18;
      const dueDays   = billingConfig?.defaultDueDays || 15;
      const taxAmount = parseFloat(((baseAmount * taxRate) / 100).toFixed(2));

      const dueDate = new Date(today);
      dueDate.setDate(dueDate.getDate() + dueDays);

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
        dueDate:       dueDate.toISOString().slice(0, 10),
        amount:        baseAmount,
        taxAmount,
        taxRate:       taxRate || null,
        discountAmount: 0,
        penaltyAmount:  0,
        paidAmount:    0,
        currency:      'INR',
        lineItems:     lineItems.length > 0 ? lineItems : null,
        description:   `Auto-generated invoice — ${client.name} (${billingMonth})`,
        billingMonth,
        billingConfigId: billingConfig?.id || null,
      });

      // 7. Update billing config's lastGeneratedAt
      if (billingConfig) {
        const nextDue = new Date(today);
        if (billingConfig.billingFrequency === 'MONTHLY')   nextDue.setMonth(nextDue.getMonth() + 1);
        else if (billingConfig.billingFrequency === 'QUARTERLY') nextDue.setMonth(nextDue.getMonth() + 3);
        else if (billingConfig.billingFrequency === 'ANNUAL')    nextDue.setFullYear(nextDue.getFullYear() + 1);
        nextDue.setDate(targetDay);

        await billingConfig.update({
          lastGeneratedAt: new Date(),
          nextDueAt: nextDue.toISOString().slice(0, 10),
        });
      }

      generated.push({
        invoiceId:   invoice.id,
        clientName:  client.name,
        amount:      baseAmount + taxAmount,
        lineItems:   lineItems.length,
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
    const today    = new Date();
    const todayDay = today.getDate();
    logger.info(`[DailyCron] 🕛 Triggered at 00:00 — day=${todayDay}`);

    try {
      // Find a BOSS user to attribute auto-generated records to
      const systemUser = await db.User.findOne({
        where: { roleLevel: 1, deletedAt: null },
        attributes: ['id'],
      });

      if (!systemUser) {
        logger.error('[DailyCron] No admin user found — skipping auto-generation');
        return;
      }

      // 1. Auto-generate client invoices
      const invoiceResult = await generateClientInvoicesForDay(todayDay, systemUser.id);
      logger.info(`[DailyCron] 📄 Invoices: ${invoiceResult.generated.length} generated, ${invoiceResult.skipped.length} skipped`);

      // 2. Auto-generate employee payroll entries
      const payrollResult = await generatePayrollForDay(todayDay, systemUser.id);
      logger.info(`[DailyCron] 💰 Payroll: ${payrollResult.generated.length} generated, ${payrollResult.skipped.length} skipped`);

    } catch (err) {
      logger.error('[DailyCron] Unhandled cron error:', err);
    }
  }, {
    timezone: 'Asia/Kolkata', // IST
  });

  logger.info('[DailyCron] ✅ Daily cron scheduled at 00:00 IST (invoices + payroll)');
}

module.exports = { startInvoiceCron, generateClientInvoicesForDay };

