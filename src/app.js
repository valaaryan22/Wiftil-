'use strict'; // reloaded: dynamic-roles schema


require('dotenv').config();
const express     = require('express');
const helmet      = require('helmet');
const cors        = require('cors');
const morgan      = require('morgan');
const compression = require('compression');

// const { globalRateLimiter } = require('./middlewares/rateLimiter.middleware');
const { errorHandler, notFoundHandler } = require('./middlewares/error.middleware');
const apiRouter = require('./routes/index');
const logger = require('./utils/logger');

const app = express();

// ─────────────────────────────────────────────
// Response-Time Header (visible in Postman / DevTools)
// ─────────────────────────────────────────────
app.use((req, res, next) => {
  const start = Date.now();
  // Override res.end() to inject the header before the response is flushed
  const originalEnd = res.end.bind(res);
  res.end = function (...args) {
    if (!res.headersSent) {
      res.setHeader('X-Response-Time', `${Date.now() - start}ms`);
    }
    return originalEnd(...args);
  };
  next();
});

// ─────────────────────────────────────────────
// Gzip Compression (reduces payload up to 70%)
// ─────────────────────────────────────────────
app.use(compression({ level: 6, threshold: 1024 }));

// ─────────────────────────────────────────────
// Security Headers
// ─────────────────────────────────────────────
app.use(helmet());

// ─────────────────────────────────────────────
// CORS
// ─────────────────────────────────────────────
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '').split(',').map(o => o.trim());

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, Postman, etc.) or if in development
    if (!origin || process.env.NODE_ENV === 'development' || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('CORS policy: Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID'],
}));

// ─────────────────────────────────────────────
// Body Parsers
// ─────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ─────────────────────────────────────────────
// HTTP Request Logger
// ─────────────────────────────────────────────
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('combined', {
    stream: { write: (msg) => logger.info(msg.trim()) }
  }));
}

// ─────────────────────────────────────────────
// Global Rate Limiter
// ─────────────────────────────────────────────
// app.use(globalRateLimiter);

// ─────────────────────────────────────────────
// API Routes
// ─────────────────────────────────────────────
app.use('/api/v1', apiRouter);

// ─────────────────────────────────────────────
// 404 + Global Error Handler
// ─────────────────────────────────────────────
app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
