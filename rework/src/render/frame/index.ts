// Owns: the pass order and the render resources. Reads only FrameScene (rule A3).
import type {
  AirModel,
  FogModel,
  FrameScene,
  Gpu,
  LightingModel,
  Post,
  Surfaces,
  TargetHandle,
} from '../../contracts/index.ts';
import { gridSize } from '../projection/index.ts';
import type { GridSize } from '../projection/index.ts';

export interface RenderModules {
  readonly lighting: LightingModel;
  readonly fog: FogModel;
  readonly air: AirModel;
  readonly post: Post;
}

export interface Renderer {
  frame(scene: FrameScene, screenWidth: number, screenHeight: number): void;
}

export function createRenderer(gpu: Gpu, modules: RenderModules): Renderer {
  const grid: GridSize = { width: 1, height: 1 };
  const world: TargetHandle = gpu.createTarget({ width: 1, height: 1, filter: 'nearest' });
  const worldTexture = gpu.targetTexture(world);
  const material = gpu.createTexture({ width: 1, height: 1, filter: 'nearest', pixels: new Uint8Array(4) });
  const surfaces: Surfaces = { color: worldTexture, material };
  let targetWidth = 1;
  let targetHeight = 1;

  return {
    frame(scene, screenWidth, screenHeight) {
      gridSize(screenWidth, screenHeight, scene.camera.zoom, grid);
      if (grid.width !== targetWidth || grid.height !== targetHeight) {
        targetWidth = grid.width;
        targetHeight = grid.height;
        gpu.resizeTarget(world, targetWidth, targetHeight);
      }
      const ambient = scene.environment.ambientColor;
      gpu.clear(world, { r: ambient.r, g: ambient.g, b: ambient.b, a: 1 });
      const lightMaps = modules.lighting.render({
        surfaces,
        casters: scene.casters,
        lights: scene.lights,
        environment: scene.environment,
        camera: scene.camera,
      });
      modules.air.render({
        target: world,
        volumes: scene.volumes,
        particles: scene.particles,
        lightMaps,
        camera: scene.camera,
      });
      modules.fog.render({ target: world, visibility: scene.visibility, camera: scene.camera });
      modules.post.render({ world: worldTexture, glow: lightMaps.glow, screenWidth, screenHeight });
    },
  };
}
