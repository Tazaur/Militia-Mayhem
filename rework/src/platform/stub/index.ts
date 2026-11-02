// Owns: the null Platform (rule A6): no browser, frames run when a test asks for them.
import type { Platform } from '../../contracts/index.ts';

export interface StubPlatform extends Platform {
  runFrames(count: number, frameMs: number): void;
  tap(): void;
  readonly fatalMessages: readonly string[];
}

export function createStubPlatform(width: number, height: number): StubPlatform {
  const size = { width, height };
  const storage = new Map<string, string>();
  const fatalMessages: string[] = [];
  let frame: ((nowMs: number) => void) | null = null;
  let now = 0;
  let taps = 0;
  return {
    surface: { __surface: true },
    screenSize: () => size,
    now: () => now,
    startLoop(callback) {
      frame = callback;
    },
    takeTaps() {
      const taken = taps;
      taps = 0;
      return taken;
    },
    tap() {
      taps++;
    },
    decodeImage: () => Promise.resolve({ __image: true }),
    storageGet: (key) => storage.get(key) ?? null,
    storageSet(key, value) {
      storage.set(key, value);
    },
    fatal(message) {
      fatalMessages.push(message);
    },
    fatalMessages,
    runFrames(count, frameMs) {
      for (let i = 0; i < count; i++) {
        now += frameMs;
        frame?.(now);
      }
    },
  };
}
