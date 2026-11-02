// Owns: the browser entry point: picks the implementations and starts the game.
import { createWebGl2Gpu } from '../gpu/webgl2/index.ts';
import { createBrowserPlatform } from '../platform/browser/index.ts';
import { startGame } from './game.ts';
import { createNullParts } from './null-parts.ts';

declare const BUILD_NUMBER: number;

const platform = createBrowserPlatform();
const gpu = createWebGl2Gpu(platform.surface);
if (gpu) startGame({ ...createNullParts(), platform, gpu, build: BUILD_NUMBER });
else platform.fatal('This device or browser has no WebGL2, which the game needs.');
