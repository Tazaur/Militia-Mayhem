// Owns: the null AirModel (rule A6): no smoke, fire or weather.
import type { AirModel } from '../../../contracts/index.ts';

export function createNoAir(): AirModel {
  return { init() {}, render() {}, dispose() {} };
}
