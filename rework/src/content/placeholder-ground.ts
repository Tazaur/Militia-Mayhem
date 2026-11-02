// Owns: a generated grass-and-dirt tile. The atlas has no ground art yet, and the old game also used placeholders.
// TEMP: see docs/SYSTEMS.md. Colours are the old game's GTEXP grass and dirt.
import { createRng } from '../core/index.ts';

export const PLACEHOLDER_GROUND_SIZE = 256;

const GRASS = [
  [63, 122, 42],
  [52, 106, 34],
  [75, 138, 51],
  [43, 90, 28],
] as const;
const DIRT = [
  [122, 90, 58],
  [106, 76, 48],
  [138, 106, 70],
  [90, 62, 38],
] as const;
// Chances of each colour for one pixel, tuned by eye so single pixels can be seen moving against the grid.
const SPECK_CHANCES = [0.62, 0.84, 0.96];

export function makePlaceholderGround(): Uint8Array {
  const size = PLACEHOLDER_GROUND_SIZE;
  const pixels = new Uint8Array(size * size * 4);
  const rng = createRng(417);
  const wave = (Math.PI * 2) / size;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // Whole-number frequencies, so the patches tile.
      const patch =
        Math.sin(x * wave * 2 + 1) +
        Math.sin(y * wave * 3) +
        0.6 * Math.sin((x + y) * wave * 5) +
        0.4 * Math.sin((x - y) * wave * 9);
      const palette = patch > 1.1 ? DIRT : GRASS;
      const roll = rng.next();
      const shade = SPECK_CHANCES.findIndex((chance) => roll < chance);
      const color = palette[shade < 0 ? 3 : shade]!;
      const offset = (y * size + x) * 4;
      pixels[offset] = color[0];
      pixels[offset + 1] = color[1];
      pixels[offset + 2] = color[2];
      pixels[offset + 3] = 255;
    }
  }
  return pixels;
}
