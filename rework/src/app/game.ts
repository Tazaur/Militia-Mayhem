// Owns: the main loop and the wiring of whichever implementations it is handed.
import { DEFAULT_QUALITY } from '../content/index.ts';
import type { AudioOut, Gpu, Platform, Transport } from '../contracts/index.ts';
import { createRenderer } from '../render/frame/index.ts';
import type { RenderModules } from '../render/frame/index.ts';
import { createEmptyFrameScene } from '../scene/index.ts';
import { createUi } from '../ui/index.ts';
import { createFrameStats } from './frame-stats.ts';

export interface GameParts extends RenderModules {
  readonly platform: Platform;
  readonly gpu: Gpu;
  readonly audio: AudioOut;
  readonly transport: Transport;
  readonly build: number;
}

function ignoreMessage(): void {}

export function startGame(parts: GameParts): void {
  const { platform, gpu, audio, transport } = parts;
  parts.lighting.init(gpu, DEFAULT_QUALITY);
  parts.fog.init(gpu, DEFAULT_QUALITY);
  parts.air.init(gpu, DEFAULT_QUALITY);
  parts.post.init(gpu, DEFAULT_QUALITY);

  const renderer = createRenderer(gpu, parts);
  const ui = createUi(gpu, parts.build);
  const stats = createFrameStats();
  const scene = createEmptyFrameScene();

  platform.startLoop((nowMs) => {
    stats.record(nowMs);
    transport.receive(ignoreMessage);
    audio.update();
    const screen = platform.screenSize();
    renderer.frame(scene, screen.width, screen.height);
    ui.frame(stats, screen.width, screen.height);
  });
}
