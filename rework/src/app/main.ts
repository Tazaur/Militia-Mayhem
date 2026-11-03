// Owns: the browser entry point: picks the implementations and starts the game.
import { createWebGl2Gpu } from '../gpu/webgl2/index.ts';
import { createBrowserPlatform } from '../platform/browser/index.ts';
import { createHeightMarchLighting } from '../render/lighting/height-march/index.ts';
import { createFullPost } from '../render/post/full/index.ts';
import { startGame } from './game.ts';
import { createNullParts } from './null-parts.ts';

declare const BUILD_NUMBER: number;
declare const ATLAS_COLOR_URL: string;

const platform = createBrowserPlatform();
const gpu = createWebGl2Gpu(platform.surface);
if (gpu) {
  platform
    .decodeImage(ATLAS_COLOR_URL)
    .then((atlasImage) => {
      startGame({
        ...createNullParts(),
        lighting: createHeightMarchLighting(),
        post: createFullPost(),
        platform,
        gpu,
        build: BUILD_NUMBER,
        atlasImage,
      });
    })
    .catch((error: unknown) => platform.fatal(String(error)));
} else {
  platform.fatal('This device or browser has no WebGL2, which the game needs.');
}
