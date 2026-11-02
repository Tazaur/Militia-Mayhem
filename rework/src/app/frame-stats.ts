// Owns: measuring the frame rate and the worst frame, over about one second.
const WINDOW_MS = 1000;

export interface FrameStats {
  readonly fps: number;
  readonly worstMs: number;
  record(nowMs: number): void;
}

export function createFrameStats(): FrameStats {
  let lastFrame = -1;
  let windowStart = 0;
  let frames = 0;
  let worstInWindow = 0;
  const stats = {
    fps: 0,
    worstMs: 0,
    record(nowMs: number) {
      if (lastFrame < 0) {
        lastFrame = nowMs;
        windowStart = nowMs;
        return;
      }
      worstInWindow = Math.max(worstInWindow, nowMs - lastFrame);
      lastFrame = nowMs;
      frames++;
      if (nowMs - windowStart >= WINDOW_MS) {
        stats.fps = (frames * 1000) / (nowMs - windowStart);
        stats.worstMs = worstInWindow;
        windowStart = nowMs;
        frames = 0;
        worstInWindow = 0;
      }
    },
  };
  return stats;
}
