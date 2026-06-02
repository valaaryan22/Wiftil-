'use strict';

// Simple structured logger (console-based, production-ready format)
// Replace with winston/pino in production if needed

const LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };
const COLORS = {
  error: '\x1b[31m',   // red
  warn:  '\x1b[33m',   // yellow
  info:  '\x1b[36m',   // cyan
  debug: '\x1b[35m',   // magenta
  reset: '\x1b[0m',
};

const ENV = process.env.NODE_ENV || 'development';
const LOG_LEVEL = ENV === 'production' ? 'info' : 'debug';

function formatMessage(level, message, meta) {
  const ts = new Date().toISOString();
  const color = COLORS[level];
  const reset = COLORS.reset;
  const prefix = `${color}[${level.toUpperCase()}]${reset} ${ts}`;
  const msg = typeof message === 'object' ? JSON.stringify(message) : message;
  const metaStr = meta ? ` ${JSON.stringify(meta)}` : '';
  return `${prefix} — ${msg}${metaStr}`;
}

function log(level, message, meta) {
  if (LEVELS[level] <= LEVELS[LOG_LEVEL]) {
    const output = formatMessage(level, message, meta);
    if (level === 'error') {
      console.error(output);
    } else {
      console.log(output);
    }
  }
}

const logger = {
  error: (msg, meta) => log('error', msg, meta),
  warn:  (msg, meta) => log('warn',  msg, meta),
  info:  (msg, meta) => log('info',  msg, meta),
  debug: (msg, meta) => log('debug', msg, meta),
};

module.exports = logger;
