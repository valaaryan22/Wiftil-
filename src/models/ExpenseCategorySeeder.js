'use strict';

/**
 * Run this once to seed default expense categories.
 * Usage: node src/models/ExpenseCategorySeeder.js
 */
const { db } = require('../database/client');

const DEFAULT_CATEGORIES = [
  { name: 'Office Supplies',      description: 'Stationery, printing, furniture', colorCode: '#74b9ff' },
  { name: 'Software & SaaS',      description: 'Subscriptions, licenses, tools',   colorCode: '#a29bfe' },
  { name: 'Travel & Transport',   description: 'Flights, cabs, fuel, parking',      colorCode: '#fd79a8' },
  { name: 'Marketing & Ads',      description: 'Paid ads, promotions, campaigns',   colorCode: '#e17055' },
  { name: 'Utilities',            description: 'Electricity, internet, water',      colorCode: '#00cec9' },
  { name: 'Salaries & Payroll',   description: 'Staff salaries and benefits',        colorCode: '#6c5ce7' },
  { name: 'Professional Fees',    description: 'Legal, accounting, consulting',      colorCode: '#00b894' },
  { name: 'Rent & Premises',      description: 'Office rent, maintenance',           colorCode: '#fdcb6e' },
  { name: 'Client Entertainment', description: 'Client meals, events, gifts',        colorCode: '#d63031' },
  { name: 'Miscellaneous',        description: 'Other uncategorized expenses',       colorCode: '#b2bec3' },
];

module.exports = { DEFAULT_CATEGORIES };
