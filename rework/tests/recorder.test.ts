// Owns: what the pasted report must contain, since it is how phone runs reach the developer.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { startGame } from '../src/app/game.ts';
import { createNullParts } from '../src/app/null-parts.ts';
import { createRecorder } from '../src/app/recorder.ts';
import { createHeadlessGpu } from '../src/gpu/headless/index.ts';
import { createStubPlatform } from '../src/platform/stub/index.ts';

test('the report names a slow frame with what came either side of it', () => {
  const recorder = createRecorder();
  let now = 0;
  for (let i = 0; i <= 100; i++) {
    now += i === 50 ? 40 : 10;
    recorder.frame(now, 0.5);
  }
  const report = recorder.report('test');
  assert.match(report, /^MM REPORT {2}test/);
  assert.match(report, /frames 100 over/);
  assert.match(report, /max 40\.0/);
  assert.match(report, /\n[\d.]+ 40\.0 10\.0 10\.0 0\.5\n/);
});

test('it keeps only the newest frames once full, oldest first', () => {
  const recorder = createRecorder();
  let now = 0;
  for (let i = 0; i < 20000; i++) {
    now += i === 2000 ? 500 : 10;
    recorder.frame(now, 0);
  }
  const report = recorder.report('test');
  assert.match(report, /frames 14400 over 144\.0 s/);
  assert.doesNotMatch(report, /500\.0/);
});

test('the game offers a report, and it holds the build, the device and the scene', async () => {
  const platform = createStubPlatform(1764, 822);
  const gpu = createHeadlessGpu();
  const atlasImage = await platform.decodeImage('stub');
  startGame({ ...createNullParts(), platform, gpu, build: 7, atlasImage });
  platform.runFrames(200, 1000 / 60);
  const report = platform.takeReport();
  assert.match(report, /B7/);
  assert.match(report, /stub device/);
  assert.match(report, /headless gpu/);
  assert.match(report, /# TILT 0 {2}TAP/);
});
