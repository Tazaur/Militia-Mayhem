// Owns: remembering the last two minutes of frame timing, and writing it as a report short enough to paste into chat.
import type { FrameStats } from './frame-stats.ts';

// Two minutes at the S23 Ultra's 120 Hz top rate.
const MAX_FRAMES = 14400;
const MAX_SECONDS = 120;
const SLOWEST_SHOWN = 12;
const RAW_FRAMES_SHOWN = 180;
const BIN_EDGES = [6, 9, 12, 15, 18, 22, 28, 34, 50, 100];

interface SecondRow {
  atMs: number;
  fps: number;
  dropped: number;
  early: number;
  worstMs: number;
  cpuMs: number;
  gpuMs: number;
  note: string;
}

export interface Recorder {
  frame(nowMs: number, cpuMs: number): void;
  second(nowMs: number, stats: FrameStats, gpuMs: number, note: string): void;
  report(header: string): string;
}

export function createRecorder(): Recorder {
  const atMs = new Float64Array(MAX_FRAMES);
  const intervals = new Float32Array(MAX_FRAMES);
  const cpu = new Float32Array(MAX_FRAMES);
  const seconds: SecondRow[] = [];
  let frames = 0;
  let secondCount = 0;
  let last = -1;

  /** The oldest kept frame first. */
  const frameIndexes = () => {
    const kept = Math.min(frames, MAX_FRAMES);
    return Array.from({ length: kept }, (_, i) => (frames - kept + i) % MAX_FRAMES);
  };

  return {
    frame(nowMs, cpuMs) {
      if (last >= 0) {
        const index = frames % MAX_FRAMES;
        atMs[index] = nowMs;
        intervals[index] = nowMs - last;
        cpu[index] = cpuMs;
        frames++;
      }
      last = nowMs;
    },
    second(nowMs, stats, gpuMs, note) {
      // Filled once, then reused, so recording never allocates a row during play.
      let row = seconds[secondCount % MAX_SECONDS];
      if (!row) {
        row = { atMs: 0, fps: 0, dropped: 0, early: 0, worstMs: 0, cpuMs: 0, gpuMs: 0, note };
        seconds[secondCount % MAX_SECONDS] = row;
      }
      row.atMs = nowMs;
      row.fps = stats.fps;
      row.dropped = stats.dropped;
      row.early = stats.early;
      row.worstMs = stats.worstMs;
      row.cpuMs = stats.cpuMs;
      row.gpuMs = gpuMs;
      row.note = note;
      secondCount++;
    },
    report(header) {
      const indexes = frameIndexes();
      const lines = [`MM REPORT  ${header}`];
      if (indexes.length === 0) return lines.concat('no frames yet').join('\n');

      const start = atMs[indexes[0]!]!;
      const relative = (ms: number) => ((ms - start) / 1000).toFixed(1);
      const sorted = indexes.map((i) => intervals[i]!).sort((a, b) => a - b);
      const percentile = (share: number) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * share))]!;
      const total = sorted.reduce((sum, value) => sum + value, 0);
      lines.push(`frames ${indexes.length} over ${(total / 1000).toFixed(1)} s`);
      lines.push(
        `interval ms: p50 ${percentile(0.5).toFixed(1)}  p95 ${percentile(0.95).toFixed(1)}  ` +
          `p99 ${percentile(0.99).toFixed(1)}  max ${sorted[sorted.length - 1]!.toFixed(1)}`,
      );

      const bins = new Array<number>(BIN_EDGES.length + 1).fill(0);
      for (const value of sorted) {
        const bin = BIN_EDGES.findIndex((edge) => value < edge);
        bins[bin < 0 ? BIN_EDGES.length : bin]!++;
      }
      const binText = bins.map((count, i) => `${i < BIN_EDGES.length ? `<${BIN_EDGES[i]}` : 'more'}:${count}`);
      lines.push(`bins: ${binText.join(' ')}`);

      lines.push('slowest: at s, ms, ms before, ms after, cpu ms');
      const positions = indexes.map((_, position) => position);
      positions.sort((a, b) => intervals[indexes[b]!]! - intervals[indexes[a]!]!);
      for (const position of positions.slice(0, SLOWEST_SHOWN)) {
        const index = indexes[position]!;
        const before = position > 0 ? intervals[indexes[position - 1]!]!.toFixed(1) : '-';
        const after = position < indexes.length - 1 ? intervals[indexes[position + 1]!]!.toFixed(1) : '-';
        lines.push(
          `${relative(atMs[index]!)} ${intervals[index]!.toFixed(1)} ${before} ${after} ${cpu[index]!.toFixed(1)}`,
        );
      }

      lines.push('seconds: at s, fps, drop, early, worst, cpu, gpu');
      const keptSeconds = Math.min(secondCount, MAX_SECONDS);
      let shownNote = '';
      for (let i = 0; i < keptSeconds; i++) {
        const row = seconds[(secondCount - keptSeconds + i) % MAX_SECONDS]!;
        if (row.note !== shownNote) {
          shownNote = row.note;
          lines.push(`# ${shownNote}`);
        }
        lines.push(
          [
            relative(row.atMs),
            Math.round(row.fps),
            row.dropped,
            row.early,
            Math.round(row.worstMs),
            row.cpuMs.toFixed(1),
            row.gpuMs.toFixed(1),
          ].join(' '),
        );
      }

      const raw = indexes.slice(-RAW_FRAMES_SHOWN).map((i) => intervals[i]!.toFixed(1));
      lines.push(`last ${raw.length} intervals: ${raw.join(' ')}`);
      return lines.join('\n');
    },
  };
}
