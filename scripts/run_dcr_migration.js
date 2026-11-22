require('dotenv').config();
const path = require('path');
const { Sequelize } = require('sequelize');
const cfg = require(path.join(__dirname, '../src/config/sequelize'))['development'];
const seq = new Sequelize(cfg.database, cfg.username, cfg.password, { host: cfg.host, port: cfg.port, dialect: cfg.dialect, logging: false, dialectOptions: cfg.dialectOptions });
async function run() {
  try { await seq.query("ALTER TABLE notifications MODIFY COLUMN type ENUM('TASK_ASSIGNED','TASK_ACCEPTED','TASK_REJECTED','TASK_SUBMITTED','TASK_APPROVED','TASK_REOPENED','TASK_DUE_SOON','TASK_OVERDUE','SUBTASK_ASSIGNED','SUBTASK_SUBMITTED','SUBTASK_APPROVED','SUBTASK_REJECTED','DEPENDENCY_UNLOCKED','RATING_SUBMITTED','MENTION','DATE_CHANGE_REQUESTED','DATE_CHANGE_APPROVED','DATE_CHANGE_REJECTED') NOT NULL"); console.log('OK notifications ENUM updated'); } catch(e) { console.log('ENUM skip:', e.message.slice(0,100)); }
  await seq.query("CREATE TABLE IF NOT EXISTS date_change_requests (id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY, entity_type ENUM('Docket','Task','SubTask') NOT NULL, entity_id CHAR(36) NOT NULL, requested_by_id CHAR(36) NOT NULL, requested_start_date DATE NULL, requested_end_date DATE NULL, current_start_date DATE NULL, current_end_date DATE NULL, status ENUM('PENDING','APPROVED','REJECTED') NOT NULL DEFAULT 'PENDING', reviewed_by_id CHAR(36) NULL, review_comment TEXT NULL, reviewed_at DATETIME NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP)");
  console.log('OK date_change_requests table exists/created');
  await seq.close(); process.exit(0);
}
run().catch(e => { console.error('FAIL', e.message); process.exit(1); });
