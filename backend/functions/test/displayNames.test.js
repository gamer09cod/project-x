'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  WELCOME_CREDIT_CENTS,
  randomDisplayName,
  welcomeCreditIdempotencyKey,
} = require('../src/displayNames');

describe('displayNames', () => {
  it('welcome credit is $10 in cents', () => {
    assert.equal(WELCOME_CREDIT_CENTS, 1000);
  });

  it('randomDisplayName looks like AdjNoun####', () => {
    const name = randomDisplayName();
    assert.match(name, /^[A-Z][a-z]+[A-Z][a-z]+\d{4}$/);
  });

  it('welcomeCreditIdempotencyKey is stable UUID per user', () => {
    const a = welcomeCreditIdempotencyKey('11111111-1111-1111-1111-111111111111');
    const b = welcomeCreditIdempotencyKey('11111111-1111-1111-1111-111111111111');
    const c = welcomeCreditIdempotencyKey('22222222-2222-2222-2222-222222222222');
    assert.match(
      a,
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
    assert.equal(a, b);
    assert.notEqual(a, c);
  });
});
