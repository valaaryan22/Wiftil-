'use strict';

const { db } = require('../src/database/client');

async function migrateLogs() {
  console.log('Starting audit logs migration...');
  const logs = await db.AuditLog.findAll();
  console.log(`Found ${logs.length} audit logs in total.`);

  let updatedCount = 0;

  for (const log of logs) {
    const desc = log.description || '';
    let newDesc = desc;
    let newEntityName = log.entityName;
    let newTargetUserId = log.targetUserId;
    let newTargetUserName = log.targetUserName;
    let changed = false;

    // 1. PAYROLL_APPROVED: Approved payroll #<uuid> for month <month>
    const mApproved = desc.match(/Approved payroll #([0-9a-f-]{36}) for month (\d{4}-\d{2})/i);
    if (mApproved) {
      const payrollId = mApproved[1];
      const month = mApproved[2];
      const payroll = await db.EmployeePayroll.findByPk(payrollId, {
        include: [{ model: db.User, as: 'employee', attributes: ['id', 'firstName', 'lastName'] }]
      });
      const empName = payroll?.employee ? `${payroll.employee.firstName} ${payroll.employee.lastName}`.trim() : null;
      if (empName) {
        newDesc = `Approved payroll for ${empName} for month ${month}`;
        newEntityName = empName;
        newTargetUserId = payroll.employee.id;
        newTargetUserName = empName;
        changed = true;
      }
    }

    // 2. PAYROLL_PAID: Marked payroll #<uuid> as PAID for <month>
    const mPaid = desc.match(/Marked payroll #([0-9a-f-]{36}) as PAID for (\d{4}-\d{2})/i);
    if (mPaid) {
      const payrollId = mPaid[1];
      const month = mPaid[2];
      const payroll = await db.EmployeePayroll.findByPk(payrollId, {
        include: [{ model: db.User, as: 'employee', attributes: ['id', 'firstName', 'lastName'] }]
      });
      const empName = payroll?.employee ? `${payroll.employee.firstName} ${payroll.employee.lastName}`.trim() : null;
      if (empName) {
        newDesc = `Marked payroll for ${empName} as PAID for ${month}`;
        newEntityName = empName;
        newTargetUserId = payroll.employee.id;
        newTargetUserName = empName;
        changed = true;
      }
    }

    // 3. PAYROLL_INCENTIVE_ADDED: Added (INCENTIVE|DEDUCTION) of ₹(\d+) to payroll #<uuid>
    const mIncentive = desc.match(/Added (INCENTIVE|DEDUCTION) of ₹([0-9.]+) to payroll #([0-9a-f-]{36})/i);
    if (mIncentive) {
      const type = mIncentive[1];
      const amount = mIncentive[2];
      const payrollId = mIncentive[3];
      const payroll = await db.EmployeePayroll.findByPk(payrollId, {
        include: [{ model: db.User, as: 'employee', attributes: ['id', 'firstName', 'lastName'] }]
      });
      const empName = payroll?.employee ? `${payroll.employee.firstName} ${payroll.employee.lastName}`.trim() : null;
      if (empName) {
        newDesc = `Added ${type} of ₹${amount} to payroll for ${empName} (${payroll.payrollMonth})`;
        newEntityName = empName;
        newTargetUserId = payroll.employee.id;
        newTargetUserName = empName;
        changed = true;
      }
    }

    // 4. DOCKET_CREATED: Created docket: <title> for client <uuid> (DRAFT)
    const mDocket = desc.match(/Created docket:?\s*([^(]+?)\s*for client ([0-9a-f-]{36})\s*(?:\(([^)]+)\))?/i);
    if (mDocket) {
      const title = mDocket[1].trim();
      const clientId = mDocket[2];
      const statusSuffix = mDocket[3] ? ` (${mDocket[3]})` : '';
      const client = await db.Client.findByPk(clientId, { attributes: ['id', 'name'] });
      const clientName = client?.name || clientId;
      newDesc = `Created docket "${title}" for client "${clientName}"${statusSuffix}`;
      changed = true;
    }

    // 5. PACKAGE_CREATED: Created package: <title> for client <uuid>
    const mPkg = desc.match(/Created package:?\s*(.+?)\s*for client ([0-9a-f-]{36})/i);
    if (mPkg) {
      const title = mPkg[1].trim();
      const clientId = mPkg[2];
      const client = await db.Client.findByPk(clientId, { attributes: ['id', 'name'] });
      const clientName = client?.name || clientId;
      newDesc = `Created package: ${title} for client "${clientName}"`;
      changed = true;
    }

    // 6. DOCKET_MANAGER_ADDED: Added manager <uuid> to docket: <title> with role <role>
    const mMgr = desc.match(/Added manager ([0-9a-f-]{36}) to docket:?\s*(.+?)\s*with role (.+)/i);
    if (mMgr) {
      const mgrId = mMgr[1];
      const docketTitle = mMgr[2].trim();
      const role = mMgr[3].trim();
      const mgr = await db.User.findByPk(mgrId, { attributes: ['id', 'firstName', 'lastName'] });
      const mgrName = mgr ? `${mgr.firstName} ${mgr.lastName}`.trim() : mgrId;
      newDesc = `Added manager "${mgrName}" to docket "${docketTitle}" with role ${role}`;
      newEntityName = `${docketTitle} → ${mgrName}`;
      newTargetUserId = mgrId;
      newTargetUserName = mgrName;
      changed = true;
    }

    if (changed) {
      console.log(`[Updating Log ${log.id}]`);
      console.log(`  OLD: ${desc}`);
      console.log(`  NEW: ${newDesc}`);
      await log.update({
        description: newDesc,
        entityName: newEntityName,
        targetUserId: newTargetUserId,
        targetUserName: newTargetUserName,
      });
      updatedCount++;
    }
  }

  console.log(`\nMigration completed! Updated ${updatedCount} logs.`);
  process.exit(0);
}

migrateLogs().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
