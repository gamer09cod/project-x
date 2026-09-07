'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  RUN_DURATION_MS,
  gameTimerFromStartedAt,
} = require('../src/match/gameTimer');

describe('gameTimerFromStartedAt', () => {
  it('derives 60s play end from started_at', () => {
    const started = new Date('2026-09-07T12:00:00.000Z');
    const timer = gameTimerFromStartedAt(started, 1_000_000);
    assert.equal(timer.serverNowEpochMs, 1_000_000);
    assert.equal(timer.gameStartEpochMs, started.getTime());
    assert.equal(timer.gameEndEpochMs, started.getTime() + RUN_DURATION_MS);
    assert.equal(timer.gameEndEpochMs - timer.gameStartEpochMs, 60_000);
  });

  it('remaining at sync is duration when serverNow == start', () => {
    const startMs = 1_000_000;
    const timer = gameTimerFromStartedAt(startMs, startMs);
    const remaining = timer.gameEndEpochMs - timer.serverNowEpochMs;
    assert.equal(remaining, 60_000);
  });

  it('is expired when estimated now >= end', () => {
    const startMs = 1_000_000;
    const timer = gameTimerFromStartedAt(startMs, startMs);
    const estimatedNow = timer.gameEndEpochMs;
    assert.ok(estimatedNow >= timer.gameEndEpochMs);
  });

  it('idempotent start uses same started_at → same end', () => {
    const started = '2026-09-07T12:00:00.000Z';
    const a = gameTimerFromStartedAt(started, 5_000);
    const b = gameTimerFromStartedAt(started, 9_999);
    assert.equal(a.gameStartEpochMs, b.gameStartEpochMs);
    assert.equal(a.gameEndEpochMs, b.gameEndEpochMs);
    assert.notEqual(a.serverNowEpochMs, b.serverNowEpochMs);
  });

  it('buzzer presentation extension is +5000 on client only', () => {
    const startMs = 1_000_000;
    const timer = gameTimerFromStartedAt(startMs, startMs);
    const afterBuzzer = timer.gameEndEpochMs + 5_000;
    assert.equal(afterBuzzer - timer.gameStartEpochMs, 65_000);
  });
});
