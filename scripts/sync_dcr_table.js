'use strict';
require('dotenv').config();
const { Sequelize, DataTypes } = require('sequelize');
const cfg = require('./src/config/sequelize')['development'];
const seq = new Sequelize(cfg.database, cfg.username, cfg.password, { host: cfg.host, port: cfg.port, dialect: cfg.dialect, logging: false });
seq.query(`ALTER TABLE notifications MODIFY COLUMN type ENUM('TASK_ASSIGNED','TASK_ACCEPTED','TASK_REJECTED','TASK_SUBMITTED','TASK_APPROVED','TASK_REOPENED','TASK_DUE_SOON','TASK_OVERDUE','SUBTASK_ASSIGNED','SUBTASK_SUBMITTED','SUBTASK_APPROVED','SUBTASK_REJECTED','DEPENDENCY_UNLOCKED','RATING_SUBMITTED','MENTION','DATE_CHANGE_REQUESTED','DATE_CHANGE_APPROVED','DATE_CHANGE_REJECTED') NOT NULL`)
.then(() => seq.query(`CREATE TABLE IF NOT EXISTS date_change_requests (id CHAR(36) NOT NULL PRIMARY KEY,entity_type ENUM('Docket','Task','SubTask') NOT NULL,entity_id CHAR(36) NOT NULL,requested_by_id CHAR(36) NOT NULL,requested_start_date DATE,requested_end_date DATE,current_start_date DATE,current_end_date DATE,status ENUM('PENDING','APPROVED','REJECTED') NOT NULL DEFAULT 'PENDING',reviewed_by_id CHAR(36),review_comment TEXT,reviewed_at DATETIME,created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,INDEX idx_entity (entity_type, entity_id),INDEX idx_requester (requested_by_id),INDEX idx_status (status))`))
.then(() => { console.log('OK: notifications ENUM updated + date_change_requests table created'); process.exit(0); })
.catch(e => { console.error(e.message); process.exit(1); });

