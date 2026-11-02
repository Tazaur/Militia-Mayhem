// Owns: building FrameScene from game state, and visual-only state. Stage 0 has no game state, so the scene is empty.
import type { FrameScene } from '../contracts/index.ts';

export function createEmptyFrameScene(): FrameScene {
  const none = new Float32Array(0);
  return {
    camera: { x: 0, y: 0, tilt: 0, zoom: 1 },
    environment: {
      sunDirection: [0, 0, 1],
      sunColor: { r: 1, g: 1, b: 1 },
      ambientColor: { r: 0.05, g: 0.06, b: 0.05 },
    },
    sprites: { count: 0, atlasRect: none, position: none, transform: none, tint: none },
    casters: { count: 0, atlasRect: none, position: none, transform: none },
    lights: { count: 0, position: none, color: none, shape: none },
    particles: { count: 0, position: none, color: none },
    volumes: { width: 0, height: 0, density: none },
    stains: [],
    visibility: { polygon: none, pointCount: 0 },
    worldOverlay: { count: 0, position: none, color: none },
  };
}
