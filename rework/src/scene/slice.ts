// Owns: Stage 1's hand-written scene: one block of props and a wandering camera. Stage 2 replaces it with the sim.
import { ATLAS_SPRITES, SLICE_BLOCK_HEIGHT, SLICE_BLOCK_WIDTH, SLICE_PROPS } from '../content/index.ts';
import type { FrameScene } from '../contracts/index.ts';

const BLOCKS_ACROSS = 3;
const BLOCKS_DOWN = 3;
const WANDER_X = 900;
const WANDER_Y = 500;

export interface SliceScene {
  readonly scene: FrameScene;
  update(nowMs: number, taps: number): void;
  /** What the readout says about the current test. */
  note(): string;
}

export function createSliceScene(): SliceScene {
  const count = SLICE_PROPS.length * BLOCKS_ACROSS * BLOCKS_DOWN;
  const atlasRect = new Float32Array(count * 4);
  const position = new Float32Array(count * 3);
  const pivot = new Float32Array(count * 2);
  const transform = new Float32Array(count * 2);
  const tint = new Float32Array(count * 4).fill(1);

  let index = 0;
  for (let blockY = 0; blockY < BLOCKS_DOWN; blockY++) {
    for (let blockX = 0; blockX < BLOCKS_ACROSS; blockX++) {
      for (const prop of SLICE_PROPS) {
        const sprite = ATLAS_SPRITES[prop.sprite];
        if (!sprite) throw new Error(`no sprite ${prop.sprite}`);
        atlasRect.set(sprite.slice(0, 4), index * 4);
        position[index * 3] = prop.x + blockX * SLICE_BLOCK_WIDTH;
        position[index * 3 + 1] = prop.y + blockY * SLICE_BLOCK_HEIGHT;
        pivot[index * 2] = sprite[4];
        pivot[index * 2 + 1] = sprite[5];
        transform[index * 2 + 1] = 1;
        index++;
      }
    }
  }

  const centerX = (BLOCKS_ACROSS * SLICE_BLOCK_WIDTH) / 2;
  const centerY = (BLOCKS_DOWN * SLICE_BLOCK_HEIGHT) / 2;
  const camera = { x: centerX, y: centerY, tilt: 0, zoom: 1, subPixel: true };
  const none = new Float32Array(0);
  const scene: FrameScene = {
    camera,
    environment: {
      sunDirection: [0, 0, 1],
      sunColor: { r: 1, g: 1, b: 1 },
      ambientColor: { r: 0.05, g: 0.06, b: 0.05 },
    },
    sprites: { count, atlasRect, position, pivot, transform, tint },
    casters: { count: 0, atlasRect: none, position: none, transform: none },
    lights: { count: 0, position: none, color: none, shape: none },
    particles: { count: 0, position: none, color: none },
    volumes: { width: 0, height: 0, density: none },
    stains: [],
    visibility: { polygon: none, pointCount: 0 },
    worldOverlay: { count: 0, position: none, color: none },
  };

  return {
    scene,
    update(nowMs, taps) {
      // Up to about 230 px/s, slowing to a crawl at each end: sub-pixel judder shows most at slow speeds.
      const seconds = nowMs / 1000;
      camera.x = centerX + WANDER_X * Math.sin(seconds * 0.21);
      camera.y = centerY + WANDER_Y * Math.sin(seconds * 0.29 + 1);
      if (taps % 2 === 1) camera.subPixel = !camera.subPixel;
    },
    note() {
      return camera.subPixel ? 'CAMERA SMOOTH  TAP TO COMPARE' : 'CAMERA WHOLE PIXELS  TAP TO COMPARE';
    },
  };
}
