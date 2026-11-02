// Owns: what counts as a late frame and an early one, since the phone's readout is judged by them.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createFrameStats } from '../src/app/frame-stats.ts';

const fillWindow = (stats: ReturnType<typeof createFrameStats>, start: number, intervals: readonly number[]) => {
  let now = start;
  for (const interval of intervals) {
    now += interval;
    stats.record(now);
  }
  return now;
};

test('a late frame that the next one makes up for counts as late and early, and costs no frame rate', () => {
  const stats = createFrameStats();
  stats.record(0);
  const steady = new Array<number>(61).fill(1000 / 60);
  const now = fillWindow(stats, 0, steady);
  const caughtUp: number[] = [];
  for (let i = 0; i < 30; i++) caughtUp.push(...(i < 6 ? [28, 1000 / 60 - 11.33] : [1000 / 60, 1000 / 60]));
  fillWindow(stats, now, [...caughtUp, 1000 / 60]);
  assert.equal(stats.dropped, 6);
  assert.equal(stats.early, 6);
  assert.equal(Math.round(stats.fps), 60);
});

test('a truly lost frame counts as late only, and the frame rate shows it', () => {
  const stats = createFrameStats();
  stats.record(0);
  const steady = new Array<number>(61).fill(1000 / 60);
  const now = fillWindow(stats, 0, steady);
  const lost = new Array<number>(55).fill(1000 / 60);
  for (let i = 0; i < 6; i++) lost[i] = 2000 / 60;
  fillWindow(stats, now, lost);
  assert.equal(stats.dropped, 6);
  assert.equal(stats.early, 0);
  assert.equal(Math.round(stats.fps), 54);
});
