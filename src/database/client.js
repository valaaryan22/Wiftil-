'use strict';

require('dotenv').config();
const db     = require('../models');
const logger = require('../utils/logger');

async function connectDB() {
  try {
    await db.sequelize.authenticate();
    logger.info('✅ MySQL connected via Sequelize');
    return db;
  } catch (error) {
    logger.error('❌ Database connection failed:', error.message);
    throw error;
  }
}

async function disconnectDB() {
  await db.sequelize.close();
  logger.info('Database disconnected');
}

module.exports = { db, connectDB, disconnectDB };


