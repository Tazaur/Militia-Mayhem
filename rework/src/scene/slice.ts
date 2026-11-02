// Owns: Stage 1's hand-written scene: the rotation test, three columns. Stage 2 replaces it with the sim.
import {
  ATLAS_SPRITES,
  ROTATION_COLUMN_SPACING,
  ROTATION_FRAMES,
  ROTATION_ITEMS,
  ROTATION_TABLE,
} from '../content/index.ts';
import type { FrameScene } from '../contracts/index.ts';

const COLUMNS = 3;
const METHOD_NEAREST = 0;
const METHOD_EDGE = 1;
const METHOD_BAKED = 2;
const COLUMN_METHODS = [METHOD_NEAREST, METHOD_EDGE, METHOD_BAKED];
const CENTER = 2000;
const TWO_PI = Math.PI * 2;
const SPEEDS = [
  { factor: 1, name: 'REAL SPEED' },
  { factor: 0.1, name: 'SLOW' },
  { factor: 0, name: 'STOPPED' },
];

export interface SliceScene {
  readonly scene: FrameScene;
  update(nowMs: number, taps: number): void;
  /** What the readout says about the current test. */
  note(): string;
}

export function createSliceScene(): SliceScene {
  const count = ROTATION_ITEMS.length * COLUMNS;
  const atlasRect = new Float32Array(count * 4);
  const position = new Float32Array(count * 3);
  const pivot = new Float32Array(count * 2);
  const transform = new Float32Array(count * 2);
  const tint = new Float32Array(count * 4).fill(1);
  const method = new Float32Array(count);
  const angles = new Float64Array(ROTATION_ITEMS.length);

  ROTATION_ITEMS.forEach((item, row) => {
    const sprite = ATLAS_SPRITES[item.sprite];
    if (!sprite) throw new Error(`no sprite ${item.sprite}`);
    if (!ROTATION_TABLE[item.sprite]) throw new Error(`no baked frames for ${item.sprite}`);
    for (let column = 0; column < COLUMNS; column++) {
      const index = row * COLUMNS + column;
      atlasRect.set(sprite.slice(0, 4), index * 4);
      position[index * 3] = CENTER + (column - 1) * ROTATION_COLUMN_SPACING + item.x;
      position[index * 3 + 1] = CENTER + item.y;
      pivot[index * 2] = sprite[4];
      pivot[index * 2 + 1] = sprite[5];
      transform[index * 2 + 1] = 1;
      method[index] = COLUMN_METHODS[column]!;
    }
  });

  const camera = { x: CENTER, y: CENTER, tilt: 0, zoom: 1 };
  const none = new Float32Array(0);
  const scene: FrameScene = {
    camera,
    environment: {
      sunDirection: [0, 0, 1],
      sunColor: { r: 1, g: 1, b: 1 },
      ambientColor: { r: 0.05, g: 0.06, b: 0.05 },
    },
    sprites: { count, atlasRect, position, pivot, transform, tint, method },
    casters: { count: 0, atlasRect: none, position: none, transform: none },
    lights: { count: 0, position: none, color: none, shape: none },
    particles: { count: 0, position: none, color: none },
    volumes: { width: 0, height: 0, density: none },
    stains: [],
    visibility: { polygon: none, pointCount: 0 },
    worldOverlay: { count: 0, position: none, color: none },
  };

  let speed = 0;
  let lastMs = -1;

  return {
    scene,
    update(nowMs, taps) {
      speed = (speed + taps) % SPEEDS.length;
      const seconds = lastMs < 0 ? 0 : (nowMs - lastMs) / 1000;
      lastMs = nowMs;
      for (let row = 0; row < ROTATION_ITEMS.length; row++) {
        const item = ROTATION_ITEMS[row]!;
        const angle = (angles[row]! + item.turn * seconds * SPEEDS[speed]!.factor + TWO_PI) % TWO_PI;
        angles[row] = angle;
        const frames = ROTATION_TABLE[item.sprite]!;
        const frame = frames[Math.round((angle / TWO_PI) * ROTATION_FRAMES) % ROTATION_FRAMES]!;
        const first = row * COLUMNS;
        transform[(first + 0) * 2] = angle;
        transform[(first + 1) * 2] = angle;
        const baked = first + 2;
        atlasRect[baked * 4] = frame[0];
        atlasRect[baked * 4 + 1] = frame[1];
        atlasRect[baked * 4 + 2] = frame[2];
        atlasRect[baked * 4 + 3] = frame[3];
        pivot[baked * 2] = frame[4];
        pivot[baked * 2 + 1] = frame[5];
      }
    },
    note() {
      return `NEAREST  EDGE  BAKED  ${SPEEDS[speed]!.name}  TAP`;
    },
  };
}
