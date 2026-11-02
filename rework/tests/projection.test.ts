// Owns: the pixel grid's sizes (DECISIONS.md D7, D11) and the camera's whole-pixel snap.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createGridView, gridSize, projectY, updateGridView } from '../src/render/projection/index.ts';

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

test('the origin is whole and the fraction goes to the upscale', () => {
  const view = createGridView();
  updateGridView(view, 1000.25, 500.75, 1, 1920, 1080);
  assert.equal(Number.isInteger(view.originX) && Number.isInteger(view.originY), true);
  assert.equal(view.targetHeight, 482);
  // The screen's top-left must land on the same world point the camera asks for.
  assert.equal(view.originX + view.offsetX, 1000.25 - view.width / 2);
  assert.equal(view.originY + view.offsetY, 500.75 - view.height / 2);
});
