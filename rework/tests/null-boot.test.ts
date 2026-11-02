// Owns: rule A6: the whole game frame runs on every null version, with no browser and no GPU.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { startGame } from '../src/app/game.ts';
import { createNullParts } from '../src/app/null-parts.ts';
import { createHeadlessGpu } from '../src/gpu/headless/index.ts';
import { createLoopbackTransport } from '../src/net/loopback/index.ts';
import { createStubPlatform } from '../src/platform/stub/index.ts';

test('frames run on all null versions, in pass order', () => {
  const platform = createStubPlatform(1764, 822);
  const gpu = createHeadlessGpu();
  startGame({ ...createNullParts(), platform, gpu, build: 0 });
  platform.runFrames(120, 1000 / 60);
  const passes = gpu.takePasses();
  assert.equal(passes.length, 240);
  assert.deepEqual(passes.slice(0, 2), ['post-plain', 'ui-stats']);
  assert.deepEqual(platform.fatalMessages, []);
});

test('the loopback hands back what was sent, once', () => {
  const transport = createLoopbackTransport();
  const message = new Uint8Array([1, 2, 3]);
  transport.send(message);
  const received: Uint8Array[] = [];
  transport.receive((arrived) => received.push(arrived));
  transport.receive((arrived) => received.push(arrived));
  assert.deepEqual(received, [message]);
});
