'use strict';

require('dotenv').config();

const config = {
  username: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  host:     process.env.DB_HOST,
  port:     parseInt(process.env.DB_PORT, 10) || 3306,
  dialect:  'mysql',
  logging:  process.env.DB_LOGGING === 'true' ? console.log : false,

  // ── Connection Pool ─────────────────────────────────────────
  // Tuned for remote AWS RDS (cross-region ~180-250ms RTT).
  // Larger pool means fewer cold-connection waits under concurrent load.
  pool: {
    max:     20,        // allow more concurrent connections
    min:     5,         // keep 5 warm connections alive at all times
    acquire: 60000,     // wait up to 60s to get a connection (remote DB)
    idle:    120000,    // keep idle connections alive for 2 min
    evict:   30000,     // check for idle connections every 30s
  },

  // ── Driver Options ───────────────────────────────────────────
  // socketKeepAlive (not keepAlive) is the correct mysql2 option.
  // connectTimeout bumped to 20s for cross-region AWS latency.
  // compress reduces bytes-over-wire for large result sets.
  dialectOptions: {
    connectTimeout:  20000,
    socketKeepAlive: true,   // correct mysql2 TCP keep-alive option
    compress:        true,   // wire-level compression for large payloads
  },
};

module.exports = {
  development: { ...config },
  test:        { ...config },
  production:  { ...config, logging: false },
};
