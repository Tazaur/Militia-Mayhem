// Owns: the main loop and the wiring of whichever implementations it is handed.
import {
  DEFAULT_QUALITY,
  makePlaceholderGround,
  makePlaceholderProps,
  PLACEHOLDER_GROUND_SIZE,
  PLACEHOLDER_PROPS_SIZE,
} from '../content/index.ts';
import type { AudioOut, Gpu, ImageHandle, Platform, Transport } from '../contracts/index.ts';
import { createRenderer } from '../render/frame/index.ts';
import type { RenderModules } from '../render/frame/index.ts';
import { createSliceScene } from '../scene/index.ts';
import { createUi } from '../ui/index.ts';
import { createFrameStats } from './frame-stats.ts';
import { readoutLines, totalGpuMs } from './readout.ts';
import { createRecorder } from './recorder.ts';

export interface GameParts extends RenderModules {
  readonly platform: Platform;
  readonly gpu: Gpu;
  readonly audio: AudioOut;
  readonly transport: Transport;
  readonly build: number;
  readonly atlasImage: ImageHandle;
}

function ignoreMessage(): void {}

export function startGame(parts: GameParts): void {
  const { platform, gpu, audio, transport } = parts;
  parts.lighting.init(gpu, DEFAULT_QUALITY);
  parts.fog.init(gpu, DEFAULT_QUALITY);
  parts.air.init(gpu, DEFAULT_QUALITY);
  parts.post.init(gpu, DEFAULT_QUALITY);

  const slice = createSliceScene();
  const assets = {
    atlas: gpu.createImageTexture(parts.atlasImage, 'nearest'),
    ground: gpu.createTexture({
      width: PLACEHOLDER_GROUND_SIZE,
      height: PLACEHOLDER_GROUND_SIZE,
      filter: 'nearest',
      pixels: makePlaceholderGround(),
    }),
    placeholderProps: gpu.createTexture({
      width: PLACEHOLDER_PROPS_SIZE,
      height: PLACEHOLDER_PROPS_SIZE,
      filter: 'nearest',
      pixels: makePlaceholderProps(),
    }),
  };
  const renderer = createRenderer(gpu, parts, assets, slice.scene);
  const ui = createUi(gpu);
  const stats = createFrameStats();
  const recorder = createRecorder();
  platform.offerReport(() => {
    const screen = platform.screenSize();
    return recorder.report(
      `B${parts.build}  ${screen.width}X${screen.height}\n${platform.deviceInfo()}\n${gpu.deviceName()}`,
    );
  });
  let lines: readonly string[] = [`B${parts.build}`];
  let shownRevision = 0;

  platform.startLoop((nowMs) => {
    const started = platform.now();
    stats.record(nowMs);
    transport.receive(ignoreMessage);
    audio.update();
    slice.update(nowMs, platform.takeTaps());
    const screen = platform.screenSize();
    renderer.frame(slice.scene, screen.width, screen.height);
    if (stats.revision !== shownRevision) {
      shownRevision = stats.revision;
      const note = slice.note();
      lines = readoutLines(stats, gpu.passTimings(), parts.build, note, screen.width, screen.height);
      recorder.second(nowMs, stats, totalGpuMs(gpu.passTimings()), note);
    }
    ui.frame(lines, screen.width, screen.height);
    gpu.endFrame();
    const cpuMs = platform.now() - started;
    stats.addCpu(cpuMs);
    recorder.frame(nowMs, cpuMs);
  });
}
