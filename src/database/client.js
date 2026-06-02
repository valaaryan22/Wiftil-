'use strict';

require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const logger = require('../utils/logger');

// Prisma 7 with the "client" engine requires either adapter or accelerateUrl.
// We use the pg adapter for direct PostgreSQL connection.
const { PrismaPg } = require('@prisma/adapter-pg');

let prisma;

function getPrismaClient() {
  if (!prisma) {
    const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
    prisma = new PrismaClient({
      adapter,
      log: process.env.NODE_ENV === 'development'
        ? [{ emit: 'stdout', level: 'warn' }, { emit: 'stdout', level: 'error' }]
        : [{ emit: 'stdout', level: 'error' }],
    });
  }
  return prisma;
}

async function connectDB() {
  try {
    const client = getPrismaClient();
    await client.$connect();
    logger.info('✅ PostgreSQL connected via Prisma');
    return client;
  } catch (error) {
    logger.error('❌ Database connection failed:', error.message);
    throw error;
  }
}

async function disconnectDB() {
  if (prisma) {
    await prisma.$disconnect();
    logger.info('Database disconnected');
  }
}

const db = getPrismaClient();

module.exports = { db, connectDB, disconnectDB, getPrismaClient };
