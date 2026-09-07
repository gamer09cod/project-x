/**
 * @format
 */

import {parsePong, makePing} from '../src/bridge/ping';
import {makeStartRun, parseUnityMessage} from '../src/bridge/run';
import {GAME_ID_BASKETBALL_V1, RUN_DURATION_MS} from '@project-x/shared';

test('ping/pong contract round-trips', () => {
  const ping = makePing('abc');
  expect(ping).toEqual({v: 1, type: 'ping', nonce: 'abc'});
  const pong = parsePong(
    JSON.stringify({
      v: 1,
      type: 'pong',
      nonce: 'abc',
      unityBuildId: 'basketball_v1-phase6',
    }),
  );
  expect(pong?.nonce).toBe('abc');
  expect(pong?.unityBuildId).toBe('basketball_v1-phase6');
});

test('parsePong rejects junk', () => {
  expect(parsePong('not-json')).toBeNull();
  expect(parsePong('{"type":"score"}')).toBeNull();
});

test('startRun + scorePayload bridge envelope', () => {
  const start = makeStartRun({
    matchId: '11111111-1111-4111-8111-111111111111' as never,
    clientRunId: '22222222-2222-4222-8222-222222222222' as never,
    seat: 1,
    stakeCents: 500 as never,
    opponentPostedScore: null,
    scoreDeadlineAt: '2026-09-04T00:00:00.000Z' as never,
  });
  expect(start.type).toBe('startRun');
  expect(start.gameId).toBe(GAME_ID_BASKETBALL_V1);
  expect(start.runDurationMs).toBe(RUN_DURATION_MS);

  const ready = parseUnityMessage(
    JSON.stringify({
      v: 1,
      type: 'runReady',
      clientRunId: start.clientRunId,
    }),
  );
  expect(ready.kind).toBe('runReady');

  const scored = parseUnityMessage(
    JSON.stringify({
      v: 1,
      type: 'scorePayload',
      payload: {
        schemaVersion: 1,
        score: 4,
        durationMs: 60000,
        clockEndedAtMs: 60000,
        hasUsedBuzzerBeater: false,
        buzzerBeaterTriggered: false,
        shotLog: [{tMs: 1000, result: 'make', pointsClaimed: 2}],
        clientRunId: start.clientRunId,
        unityBuildId: 'basketball_v1-phase6',
      },
    }),
  );
  expect(scored.kind).toBe('scorePayload');
  if (scored.kind === 'scorePayload') {
    expect(scored.payload.score).toBe(4);
    expect(scored.payload.schemaVersion).toBe(1);
  }
});
