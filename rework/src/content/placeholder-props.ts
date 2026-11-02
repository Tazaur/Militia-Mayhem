// Owns: generated roof, wall and post art for the tilt test, because the atlas has none. TEMP: see docs/SYSTEMS.md.
import { createRng } from '../core/index.ts';

export const PLACEHOLDER_PROPS_SIZE = 128;

export interface PlaceholderRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export const PLACEHOLDER_RECTS = {
  roof: { x: 0, y: 0, width: 32, height: 32 },
  concrete: { x: 32, y: 0, width: 32, height: 32 },
  brick: { x: 64, y: 0, width: 32, height: 48 },
  post: { x: 96, y: 0, width: 8, height: 70 },
  lampHead: { x: 104, y: 0, width: 12, height: 8 },
} as const;

type Paint = (x: number, y: number) => readonly [number, number, number];

export function makePlaceholderProps(): Uint8Array {
  const size = PLACEHOLDER_PROPS_SIZE;
  const pixels = new Uint8Array(size * size * 4);
  const rng = createRng(421);
  const fill = (rect: PlaceholderRect, paint: Paint) => {
    for (let y = 0; y < rect.height; y++) {
      for (let x = 0; x < rect.width; x++) {
        const color = paint(x, y);
        const noise = 0.92 + rng.next() * 0.16;
        const offset = ((rect.y + y) * size + rect.x + x) * 4;
        for (let k = 0; k < 3; k++) pixels[offset + k] = Math.min(255, color[k]! * noise);
        pixels[offset + 3] = 255;
      }
    }
  };
  // Tile rows, so the top reads as a roof.
  fill(PLACEHOLDER_RECTS.roof, (_, y) => (y % 8 === 0 ? [70, 46, 38] : [122, 74, 56]));
  fill(PLACEHOLDER_RECTS.concrete, (x, y) => (x % 32 === 0 || y % 32 === 0 ? [120, 118, 110] : [168, 164, 150]));
  // Brick courses, darker toward the ground. The face is in shade, so it reads as a side next to the lit top.
  fill(PLACEHOLDER_RECTS.brick, (x, y) => {
    const course = Math.floor(y / 6);
    const joint = y % 6 === 5 || (x + course * 8) % 16 === 0;
    const shade = 0.8 - (y / PLACEHOLDER_RECTS.brick.height) * 0.3;
    return joint ? [58 * shade, 52 * shade, 48 * shade] : [132 * shade, 92 * shade, 74 * shade];
  });
  fill(PLACEHOLDER_RECTS.post, (x) => (x < 3 ? [74, 58, 44] : [52, 40, 30]));
  fill(PLACEHOLDER_RECTS.lampHead, () => [190, 186, 160]);
  return pixels;
}
