// Owns: the pixel grid's sizes (DECISIONS.md D7, D11).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { gridSize, projectY } from '../src/render/projection/index.ts';

const size = (width: number, height: number, zoom: number) => {
  const out = { width: 0, height: 0 };
  gridSize(width, height, zoom, out);
  return out;
};

test('landscape is 15 tiles tall, and width follows the screen', () => {
  assert.deepEqual(size(1920, 1080, 1), { width: 853, height: 480 });
  assert.deepEqual(size(1764, 822, 1), { width: 1030, height: 480 });
});

test('in portrait the short side is the fixed one', () => {
  assert.deepEqual(size(822, 1764, 1), { width: 480, height: 1030 });
});

test('zooming out to 0.8 shows 600 game pixels top to bottom', () => {
  assert.equal(size(1920, 1080, 0.8).height, 600);
});

test('tilt 0 is straight down', () => {
  assert.equal(projectY(100, 48, 0), 100);
  assert.equal(projectY(100, 48, 0.25), 88);
});
