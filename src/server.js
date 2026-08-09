'use strict';

require('dotenv').config();
const app = require('./app');
const { connectDB } = require('./database/client');
const logger = require('./utils/logger');
const { startInvoiceCron } = require('./utils/invoiceCron');

const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';

async function startServer() {
  try {
    // Verify DB connection
    await connectDB();

    const server = app.listen(PORT, () => {
      logger.info(`🚀 Wiftil API running on port ${PORT} [${NODE_ENV.toUpperCase()}]`);
      logger.info(`📋 Docs: http://localhost:${PORT}/api/v1/health`);

      // Start background cron jobs
      startInvoiceCron();
    });

    // Graceful shutdown
    const shutdown = async (signal) => {
      logger.info(`${signal} received — shutting down gracefully...`);
      server.close(async () => {
        logger.info('HTTP server closed');
        process.exit(0);
      });
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

    process.on('unhandledRejection', (reason) => {
      logger.error('Unhandled Rejection:', reason);
      shutdown('UNHANDLED_REJECTION');
    });

    process.on('uncaughtException', (error) => {
      logger.error('Uncaught Exception:', error);
      shutdown('UNCAUGHT_EXCEPTION');
    });

  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();
