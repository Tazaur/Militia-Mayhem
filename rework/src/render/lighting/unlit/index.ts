// Owns: the null LightingModel (rule A6): full light everywhere, no highlight, no glow, no shadows.
import type { LightMaps, LightingModel, Rgb } from '../../../contracts/index.ts';

const FULL_LIGHT: Rgb = { r: 1, g: 1, b: 1 };
const WHITE = new Uint8Array([255, 255, 255, 255]);
const BLACK = new Uint8Array([0, 0, 0, 255]);

export function createUnlitLighting(): LightingModel {
  let maps: LightMaps | null = null;
  return {
    init(gpu) {
      const shade = gpu.createTexture({ width: 1, height: 1, filter: 'nearest', pixels: WHITE });
      const black = gpu.createTexture({ width: 1, height: 1, filter: 'nearest', pixels: BLACK });
      maps = { shade, highlight: black, glow: black };
    },
    render() {
      if (!maps) throw new Error('lighting used before init');
      return maps;
    },
    query() {
      return FULL_LIGHT;
    },
    dispose() {
      maps = null;
    },
  };
}
