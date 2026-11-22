'use strict';

require('dotenv').config();
const db = require('../src/models');

async function clear() {
  await db.sequelize.authenticate();
  console.log('✅ Connected\n');

  await db.sequelize.query('SET FOREIGN_KEY_CHECKS = 0');

  const tables = [
    'performance_ratings', 'task_attachments', 'task_comments',
    'sub_task_dependencies', 'sub_task_assignments', 'sub_tasks',
    'task_assignments', 'tasks', 'tokens', 'audit_logs',
    'notifications', 'leave_requests', 'users',
  ];

  for (const t of tables) {
    await db.sequelize.query(`TRUNCATE TABLE \`${t}\``);
    console.log(`  cleared: ${t}`);
  }

  await db.sequelize.query('SET FOREIGN_KEY_CHECKS = 1');
  console.log('\n✅ All tables cleared\n');
  await db.sequelize.close();
}

clear().catch(err => {
  console.error('❌', err.message);
  process.exit(1);
});
