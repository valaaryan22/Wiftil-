'use strict';

require('dotenv').config();
const app = require('../src/app');
const { connectDB } = require('../src/database/client');

// Connect to the database when the Vercel lambda container cold-starts.
connectDB().catch(console.error);

// Export the Express app for Vercel Serverless Functions
module.exports = app;
