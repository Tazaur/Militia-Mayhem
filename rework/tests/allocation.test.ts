// Owns: rule L5 as a test: a frame must allocate next to nothing, because garbage becomes stutter on phones.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import v8 from 'node:v8';
import vm from 'node:vm';
import { startGame } from '../src/app/game.ts';
import { createNullParts } from '../src/app/null-parts.ts';
import { createHeadlessGpu } from '../src/gpu/headless/index.ts';
import { createStubPlatform } from '../src/platform/stub/index.ts';

const WINDOW_FRAMES = 3000;
const MAX_WINDOWS = 40;
// Measured at 242 once warm, including the test GPU's own pass list. That is 15 KB/s: harmless. The limit catches
// allocating per sprite: 126 sprites at even 32 bytes each is 4 KB per frame, in every window.
const MAX_BYTES_PER_FRAME = 400;

test('frames allocate almost nothing once the code is optimised', async () => {
  v8.setFlagsFromString('--expose-gc');
  const collect = vm.runInNewContext('gc') as () => void;
  const platform = createStubPlatform(1764, 822);
  const gpu = createHeadlessGpu();
  const atlasImage = await platform.decodeImage('stub');
  startGame({ ...createNullParts(), platform, gpu, build: 0, atlasImage });

  // Unoptimised code boxes numbers, and when the optimiser finishes varies between runs. So measure repeatedly,
  // yielding so it can finish, and judge the best window.
  let best = Infinity;
  for (let window = 0; window < MAX_WINDOWS && best >= MAX_BYTES_PER_FRAME; window++) {
    gpu.takePasses();
    collect();
    const before = process.memoryUsage().heapUsed;
    platform.runFrames(WINDOW_FRAMES, 1000 / 60);
    best = Math.min(best, (process.memoryUsage().heapUsed - before) / WINDOW_FRAMES);
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  assert.ok(best < MAX_BYTES_PER_FRAME, `${best.toFixed(0)} bytes per frame`);
});
