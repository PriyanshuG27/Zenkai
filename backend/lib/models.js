'use strict';

/**
 * Hardcoded AI model configurations used across the backend.
 * Centralizing these prevents redundant/inconsistent variable definitions in multiple routes.
 */
module.exports = {
  // Weekly Magazine generation
  WEEKLY_MAGAZINE: {
    PRIMARY: 'meta-llama/llama-4-scout-17b-16e-instruct',
    FALLBACK_GROQ: 'llama-3.1-8b-instant',
    FALLBACK_GEMINI: 'gemini-3.1-flash-lite'
  },

  // Workout Plan generation
  WORKOUT_PLAN: {
    PRIMARY: 'llama-3.3-70b-versatile',
    FALLBACK: 'gemini-3.1-flash-lite'
  },

  // Squad synergy challenges (Titan Raid)
  SQUAD_CHALLENGE: {
    PRIMARY: 'llama-3.3-70b-versatile',
    FALLBACK: 'gemini-flash-latest'
  },

  // Personal challenges generation (Weak point & Favorite muscle)
  PERSONAL_CHALLENGE: {
    PRIMARY: 'llama-3.1-8b-instant',
    FALLBACK: 'gemini-3.1-flash-lite'
  },

  // Personal Record / Strength standard multipliers lookup fallback
  PR_STATS: {
    PRIMARY: 'llama-3.1-8b-instant',
    FALLBACK: 'gemini-3.1-flash-lite'
  },

  // Gym / workout image verification (Vision)
  VISION: {
    PRIMARY: 'gemini-3.1-flash-lite',
    FALLBACK: 'meta-llama/llama-4-scout-17b-16e-instruct'
  }
};
