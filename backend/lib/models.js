'use strict';

/**
 * Hardcoded AI model configurations used across the backend.
 * Centralizing these prevents redundant/inconsistent variable definitions in multiple routes.
 *
 * Three-tier fallback chain (text tasks):
 *   Tier 1  → Groq PRIMARY        (highest capability)
 *   Tier 2  → Groq FALLBACK_GROQ  (different model — genuine redundancy on same provider)
 *   Tier 3  → Gemini FALLBACK_GEMINI (separate provider — last resort)
 *
 * Vision tasks use an inverted chain (Gemini first, Groq Vision second).
 *
 * ── Active (non-deprecated) Groq chat models as of June 2026 ──
 *   ✅ openai/gpt-oss-120b   — Active  (120B, OpenAI on Groq)
 *   ✅ openai/gpt-oss-20b    — Active  (20B,  OpenAI on Groq)
 *   ✅ qwen/qwen3.6-27b      — Active  (27B,  Alibaba on Groq — supports Vision too)
 *
 * ── Deprecated — DO NOT USE ──
 *   ❌ qwen/qwen3-32b                         → off Jul 17 2026
 *   ❌ meta-llama/llama-4-scout-17b-16e-instruct → off Jul 17 2026
 *   ❌ llama-3.1-8b-instant                   → off Aug 16 2026
 *   ❌ llama-3.3-70b-versatile                → off Aug 16 2026
 */
module.exports = {
  // Weekly Magazine generation — heavy creative task, full 3-tier
  WEEKLY_MAGAZINE: {
    PRIMARY:         'openai/gpt-oss-120b',   // Tier 1: Groq — 120B, best reasoning & creativity
    FALLBACK_GROQ:   'qwen/qwen3.6-27b',      // Tier 2: Groq — 27B Qwen, different model family
    FALLBACK_GEMINI: 'gemini-3.1-flash-lite'  // Tier 3: Gemini — separate provider last resort
  },

  // Workout Plan generation — complex structured JSON, full 3-tier
  WORKOUT_PLAN: {
    PRIMARY:         'openai/gpt-oss-120b',   // Tier 1: Groq — 120B, best for strict JSON schema
    FALLBACK_GROQ:   'qwen/qwen3.6-27b',      // Tier 2: Groq — 27B Qwen, solid JSON output
    FALLBACK_GEMINI: 'gemini-3.1-flash-lite'  // Tier 3: Gemini — last resort
  },

  // Squad synergy challenges (Titan Raid) — creative lore generation, full 3-tier
  SQUAD_CHALLENGE: {
    PRIMARY:         'openai/gpt-oss-120b',   // Tier 1: Groq — 120B, vivid lore & names
    FALLBACK_GROQ:   'qwen/qwen3.6-27b',      // Tier 2: Groq — 27B Qwen, creative writing capable
    FALLBACK_GEMINI: 'gemini-flash-latest'    // Tier 3: Gemini flash (latest alias)
  },

  // Personal challenges (Weak point & Favorite muscle) — lightweight task, full 3-tier
  PERSONAL_CHALLENGE: {
    PRIMARY:         'openai/gpt-oss-20b',    // Tier 1: Groq — 20B sufficient, fast & cheap
    FALLBACK_GROQ:   'qwen/qwen3.6-27b',      // Tier 2: Groq — 27B Qwen, step up if 20B fails
    FALLBACK_GEMINI: 'gemini-3.1-flash-lite'  // Tier 3: Gemini — last resort
  },

  // PR / Strength standard multipliers — factual low-temp lookup, full 3-tier
  PR_STATS: {
    PRIMARY:         'openai/gpt-oss-20b',    // Tier 1: Groq — 20B, fast factual retrieval
    FALLBACK_GROQ:   'qwen/qwen3.6-27b',      // Tier 2: Groq — 27B Qwen, accurate factual Q&A
    FALLBACK_GEMINI: 'gemini-3.1-flash-lite'  // Tier 3: Gemini — last resort
  },

  // Gym image verification — Vision path (inverted: Gemini primary, Groq Vision fallback)
  VISION: {
    PRIMARY: 'gemini-3.1-flash-lite',         // Tier 1: Gemini — best multimodal support
    FALLBACK: 'qwen/qwen3.6-27b'             // Tier 2: Groq Vision — Qwen supports image input
  }
};
