// Owns: the browser entry point: picks the implementations and starts the game.
import { createWebGl2Gpu } from '../gpu/webgl2/index.ts';
import { createBrowserPlatform } from '../platform/browser/index.ts';
import { createFullPost } from '../render/post/full/index.ts';
import { startGame } from './game.ts';
import { createNullParts } from './null-parts.ts';

declare const BUILD_NUMBER: number;
declare const ATLAS_COLOR_URL: string;
declare const ROTATIONS_URL: string;

const platform = createBrowserPlatform();
const gpu = createWebGl2Gpu(platform.surface);
if (gpu) {
  Promise.all([platform.decodeImage(ATLAS_COLOR_URL), platform.decodeImage(ROTATIONS_URL)])
    .then(([atlasImage, rotationsImage]) => {
      const parts = { ...createNullParts(), post: createFullPost(), platform, gpu };
      startGame({ ...parts, build: BUILD_NUMBER, atlasImage, rotationsImage });
    })
    .catch((error: unknown) => platform.fatal(String(error)));
} else {
  platform.fatal('This device or browser has no WebGL2, which the game needs.');
}
