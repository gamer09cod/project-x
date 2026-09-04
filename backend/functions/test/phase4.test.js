'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { isUuid } = require('../src/auth');
const { MOCK_DEPOSIT_MAX_CENTS } = require('../src/wallet');

describe('auth helpers', () => {
  it('accepts UUID v4 shape', () => {
    assert.equal(isUuid('550e8400-e29b-41d4-a716-446655440000'), true);
    assert.equal(isUuid('not-a-uuid'), false);
    assert.equal(isUuid(null), false);
  });
});

describe('mock deposit cap', () => {
  it('matches shared 50000 cents', () => {
    assert.equal(MOCK_DEPOSIT_MAX_CENTS, 50_000);
  });
});
