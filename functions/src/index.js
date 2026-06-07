'use strict';

const { initializeApp } = require('firebase-admin/app');

// Initialize Firebase Admin globally
initializeApp();

// Export Cloud Functions
const { generatePlan } = require('./generatePlan');
const { generateChallenge } = require('./generateChallenge');

// Export under both names for frontend compatibility (if any frontend still uses generateWeeklyPlan)
exports.generatePlan = generatePlan;
exports.generateWeeklyPlan = generatePlan;
exports.generateChallenge = generateChallenge;
