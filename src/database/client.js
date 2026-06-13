'use strict';

require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const { PrismaPg }    = require('@prisma/adapter-pg');
const logger          = require('../utils/logger');

// Use pooled URL at runtime if provided, fall back to direct URL
const runtimeUrl = process.env.POOLED_DATABASE_URL || process.env.DATABASE_URL;

let prisma;
let keepAliveTimer = null;

function getPrismaClient() {
  if (!prisma) {
    const adapter = new PrismaPg({
      connectionString: runtimeUrl,
      max:                     5,
      idleTimeoutMillis:   30000,
      connectionTimeoutMillis: 10000,
    });

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

    // ── Keep-Alive (opt-in) ────────────────────────────────────────────────────
    // WARNING: Enabling this on Neon free tier will use compute hours continuously.
    // Free tier limit = ~191 hours/month. A 24/7 server uses 720 hours/month.
    //
    // Set DB_KEEPALIVE=true in .env ONLY if:
    //   a) You are on a paid Neon plan, OR
    //   b) You only run the server during dev hours (not 24/7)
    //
    // Without keep-alive: first request after 5min idle takes ~3-5s (cold start).
    // With keep-alive:    all requests are fast but you pay for continuous compute.
    // ─────────────────────────────────────────────────────────────────────────────
    if (process.env.DB_KEEPALIVE === 'true') {
      startKeepAlive(client);
    } else {
      logger.info('💤 DB keep-alive disabled (set DB_KEEPALIVE=true to enable)');
    }

    return client;
  } catch (error) {
    logger.error('❌ Database connection failed:', error.message);
    throw error;
  }
}

function startKeepAlive(client) {
  if (keepAliveTimer) return;

  // 4 minutes — just under Neon's 5-minute scale-to-zero threshold
  const INTERVAL_MS = 4 * 60 * 1000;

  keepAliveTimer = setInterval(async () => {
    try {
      await client.$queryRaw`SELECT 1`;
      logger.debug('💓 DB keep-alive ping');
    } catch (err) {
      logger.warn('⚠️  DB keep-alive ping failed:', err.message);
    }
  }, INTERVAL_MS);

  if (keepAliveTimer.unref) keepAliveTimer.unref();
  logger.info('💓 DB keep-alive enabled (4min interval) — this uses Neon compute hours');
}

async function disconnectDB() {
  if (keepAliveTimer) {
    clearInterval(keepAliveTimer);
    keepAliveTimer = null;
  }
  if (prisma) {
    await prisma.$disconnect();
    logger.info('Database disconnected');
  }
}

const db = getPrismaClient();

module.exports = { db, connectDB, disconnectDB, getPrismaClient };

