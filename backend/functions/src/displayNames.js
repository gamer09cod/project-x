'use strict';

const crypto = require('crypto');

/** Welcome grant for first profile provision — $10.00. */
const WELCOME_CREDIT_CENTS = 1000;

const ADJECTIVES = [
  'Swift',
  'Lucky',
  'Silent',
  'Rapid',
  'Bold',
  'Crisp',
  'Neon',
  'Frost',
  'Solar',
  'Pixel',
  'Turbo',
  'Midnight',
  'Golden',
  'Iron',
  'Hyper',
  'Quiet',
];

const NOUNS = [
  'Hoop',
  'Swish',
  'Dunk',
  'Arc',
  'Net',
  'Court',
  'Clutch',
  'Rim',
  'Bounce',
  'Flyer',
  'Guard',
  'Ace',
  'Spark',
  'Blitz',
  'Comet',
  'Pulse',
];

/**
 * Gamer-style display name, e.g. SwiftHoop4821.
 * Not unique — display_name has no uniqueness constraint.
 */
function randomDisplayName() {
  const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
  const n = 1000 + Math.floor(Math.random() * 9000);
  return `${adj}${noun}${n}`;
}

/** Stable UUID so welcome ADMIN_CREDIT is idempotent across retries. */
function welcomeCreditIdempotencyKey(userId) {
  const hash = crypto
    .createHash('sha256')
    .update(`project-x:welcome-credit:v1:${userId}`)
    .digest();
  const bytes = Buffer.from(hash.subarray(0, 16));
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

module.exports = {
  WELCOME_CREDIT_CENTS,
  randomDisplayName,
  welcomeCreditIdempotencyKey,
};
