// Owns: the core helpers' behaviour, starting with the seeded random numbers that replays depend on.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRng } from '../src/core/index.ts';

test('the same seed gives the same numbers', () => {
  const first = createRng(417);
  const second = createRng(417);
  for (let i = 0; i < 1000; i++) assert.equal(first.next(), second.next());
  assert.equal(first.state(), second.state());
});

test('numbers stay in range', () => {
  const rng = createRng(1);
  for (let i = 0; i < 1000; i++) {
    const value = rng.next();
    assert.ok(value >= 0 && value < 1);
  }
});
