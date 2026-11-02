// Owns: the null FogModel (rule A6): everything is visible.
import type { FogModel } from '../../../contracts/index.ts';

export function createNoFog(): FogModel {
  return { init() {}, render() {}, dispose() {} };
}
