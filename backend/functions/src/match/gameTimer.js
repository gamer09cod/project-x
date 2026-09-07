'use strict';

/**
 * Play-clock epochs derived from match_players.started_at.
 * Distinct from score_deadline_at (started_at + 75s submit window).
 * Mirrors packages/shared RUN_DURATION_MS — do not accept client duration.
 */
const RUN_DURATION_MS = 60_000;

/**
 * @param {Date|string|number} startedAt
 * @param {number} [serverNowEpochMs]
 * @returns {{
 *   serverNowEpochMs: number,
 *   gameStartEpochMs: number,
 *   gameEndEpochMs: number,
 * }}
 */
function gameTimerFromStartedAt(startedAt, serverNowEpochMs = Date.now()) {
  const gameStartEpochMs = new Date(startedAt).getTime();
  if (!Number.isFinite(gameStartEpochMs)) {
    throw new Error('gameTimerFromStartedAt: invalid startedAt');
  }
  const now = Number(serverNowEpochMs);
  return {
    serverNowEpochMs: Number.isFinite(now) ? now : Date.now(),
    gameStartEpochMs,
    gameEndEpochMs: gameStartEpochMs + RUN_DURATION_MS,
  };
}

module.exports = {
  RUN_DURATION_MS,
  gameTimerFromStartedAt,
};
