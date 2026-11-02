// Owns: turning the measurements into the readout's lines of text.
import type { PassTiming } from '../contracts/index.ts';
import type { FrameStats } from './frame-stats.ts';

export function totalGpuMs(timings: readonly PassTiming[]): number {
  let total = 0;
  for (const timing of timings) total += timing.ms;
  return total;
}

export function readoutLines(
  stats: FrameStats,
  timings: readonly PassTiming[],
  build: number,
  sceneNote: string,
  width: number,
  height: number,
): string[] {
  const frames = `DROP ${stats.dropped}  EARLY ${stats.early}  WORST ${Math.round(stats.worstMs)} MS`;
  const fps = `${Math.round(stats.fps)} FPS  ${frames}`;
  let passes = '';
  for (const timing of timings) {
    passes += `${timing.name.toUpperCase()} ${timing.ms.toFixed(1)}  `;
  }
  const gpu = timings.length > 0 ? `GPU ${totalGpuMs(timings).toFixed(1)} MS` : 'GPU NO TIMERS';
  return [
    `${fps}  B${build}`,
    `CPU ${stats.cpuMs.toFixed(1)} MS  ${gpu}  SCREEN ${width}X${height}`,
    passes.trim() || '-',
    sceneNote,
  ];
}
