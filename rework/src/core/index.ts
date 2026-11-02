// Owns: pure helpers every module may use (maths, seeded random). Depends on nothing.
export { clamp } from './math.ts';
export { createRng } from './rng.ts';
export type { Rng } from './rng.ts';
