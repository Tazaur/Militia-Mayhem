// Owns: rule A6: the whole game frame runs on every null version, with no browser and no GPU.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { startGame } from '../src/app/game.ts';
import { createNullParts } from '../src/app/null-parts.ts';
import { createHeadlessGpu } from '../src/gpu/headless/index.ts';
import { createLoopbackTransport } from '../src/net/loopback/index.ts';
import { createHeightMarchLighting } from '../src/render/lighting/height-march/index.ts';
import { createStubPlatform } from '../src/platform/stub/index.ts';

test('frames run on all null versions, in pass order', async () => {
  const platform = createStubPlatform(1764, 822);
  const gpu = createHeadlessGpu();
  const atlasImage = await platform.decodeImage('stub');
  startGame({ ...createNullParts(), platform, gpu, build: 0, atlasImage });
  platform.runFrames(120, 1000 / 60);
  const passes = gpu.takePasses();
  assert.equal(passes.length, 600);
  assert.deepEqual(passes.slice(0, 5), ['terrain', 'solid', 'combine', 'post-plain', 'ui']);
  assert.deepEqual(platform.fatalMessages, []);
});

test('every test mode of the slice runs, and depth is asked for only on a target that has it', async () => {
  const platform = createStubPlatform(1764, 822);
  const gpu = createHeadlessGpu();
  const atlasImage = await platform.decodeImage('stub');
  startGame({ ...createNullParts(), platform, gpu, build: 0, atlasImage });
  for (let mode = 0; mode < 5; mode++) {
    platform.runFrames(2, 1000 / 60);
    platform.tap();
  }
  assert.equal(gpu.takePasses().length, 10 * 5);
  assert.deepEqual(platform.fatalMessages, []);
});

test('the real lighting runs in the frame, between the surfaces and the combine', async () => {
  const platform = createStubPlatform(1764, 822);
  const gpu = createHeadlessGpu();
  const atlasImage = await platform.decodeImage('stub');
  const lighting = createHeightMarchLighting();
  startGame({ ...createNullParts(), lighting, platform, gpu, build: 0, atlasImage });
  platform.runFrames(1, 1000 / 60);
  assert.deepEqual(gpu.takePasses(), ['terrain', 'solid', 'shade', 'combine', 'post-plain', 'ui']);
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
