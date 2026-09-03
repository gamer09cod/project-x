/**
 * @format
 */

import {parsePong, makePing} from '../src/bridge/ping';

test('ping/pong contract round-trips', () => {
  const ping = makePing('abc');
  expect(ping).toEqual({v: 1, type: 'ping', nonce: 'abc'});
  const pong = parsePong(
    JSON.stringify({
      v: 1,
      type: 'pong',
      nonce: 'abc',
      unityBuildId: 'basketball_v1-phase3-embed',
    }),
  );
  expect(pong?.nonce).toBe('abc');
  expect(pong?.unityBuildId).toBe('basketball_v1-phase3-embed');
});

test('parsePong rejects junk', () => {
  expect(parsePong('not-json')).toBeNull();
  expect(parsePong('{"type":"score"}')).toBeNull();
});
