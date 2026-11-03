// Owns: measuring frame rate, late and early frames, the worst frame and CPU time, over about one second.
const WINDOW_MS = 1000;
// A frame taking 1.5x the average missed at least one refresh of the screen.
const DROPPED_FACTOR = 1.5;
// A frame this far under the average. On the S23 Ultra these are mostly the screen jumping to 120 Hz at a touch
// (DECISIONS.md D17), so EARLY does not by itself mean a late frame was caught up.
const EARLY_FACTOR = 0.6;

export interface FrameStats {
  readonly fps: number;
  readonly worstMs: number;
  readonly dropped: number;
  readonly early: number;
  readonly cpuMs: number;
  /** Goes up once per window, when the numbers above change. */
  readonly revision: number;
  record(nowMs: number): void;
  addCpu(ms: number): void;
}

export function createFrameStats(): FrameStats {
  const state = { last: -1, windowStart: 0, frames: 0, worst: 0, dropped: 0, early: 0, cpu: 0, averageMs: 0 };
  const stats = {
    fps: 0,
    worstMs: 0,
    dropped: 0,
    early: 0,
    cpuMs: 0,
    revision: 0,
    addCpu(ms: number) {
      state.cpu += ms;
    },
    record(nowMs: number) {
      if (state.last < 0) {
        state.last = nowMs;
        state.windowStart = nowMs;
        return;
      }
      const interval = nowMs - state.last;
      state.worst = Math.max(state.worst, interval);
      if (state.averageMs > 0 && interval > state.averageMs * DROPPED_FACTOR) state.dropped++;
      if (interval < state.averageMs * EARLY_FACTOR) state.early++;
      state.last = nowMs;
      state.frames++;
      const elapsed = nowMs - state.windowStart;
      if (elapsed >= WINDOW_MS) {
        stats.fps = (state.frames * 1000) / elapsed;
        stats.worstMs = state.worst;
        stats.dropped = state.dropped;
        stats.early = state.early;
        stats.cpuMs = state.cpu / state.frames;
        stats.revision++;
        state.averageMs = elapsed / state.frames;
        state.windowStart = nowMs;
        state.frames = 0;
        state.worst = 0;
        state.dropped = 0;
        state.early = 0;
        state.cpu = 0;
      }
    },
  };
  return stats;
}
