// Owns: seeded random numbers. The only source of randomness: `Math.random` is banned by the lint.
export interface Rng {
  /** A number in [0, 1). */
  next(): number;
  /** The current state, so a replay can check it and a snapshot can restore it. */
  state(): number;
}

/** mulberry32: small, fast, and the same on every device, which replays and networking depend on. */
export function createRng(seed: number): Rng {
  let current = seed | 0;
  return {
    next() {
      current = (current + 0x6d2b79f5) | 0;
      let mixed = Math.imul(current ^ (current >>> 15), 1 | current);
      mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
      return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
    },
    state() {
      return current;
    },
  };
}
