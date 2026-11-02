// Owns: the null AudioOut (rule A6).
import type { AudioOut } from '../../contracts/index.ts';

export function createSilentAudio(): AudioOut {
  return { play() {}, setListener() {}, update() {}, dispose() {} };
}
