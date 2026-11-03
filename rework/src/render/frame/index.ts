// Owns: the pass order and the render resources. Reads only FrameScene (rule A3).
import type {
  AirInput,
  AirModel,
  FogInput,
  FogModel,
  FrameScene,
  Gpu,
  LightingInput,
  LightingModel,
  Post,
  PostInput,
  Rgba,
  Surfaces,
  TextureHandle,
} from '../../contracts/index.ts';
import { createCombineLayer, createSolidLayer, createTerrainLayer } from '../layers/index.ts';
import { createGridView, updateGridView } from '../projection/index.ts';

export interface RenderModules {
  readonly lighting: LightingModel;
  readonly fog: FogModel;
  readonly air: AirModel;
  readonly post: Post;
}

export interface RenderAssets {
  readonly atlas: TextureHandle;
  readonly ground: TextureHandle;
  readonly placeholderProps: TextureHandle;
}

export interface Renderer {
  frame(scene: FrameScene, screenWidth: number, screenHeight: number): void;
}

type Mutable<T> = { -readonly [K in keyof T]: T[K] };

const BACKGROUND: Rgba = { r: 0, g: 0, b: 0, a: 1 };

export function createRenderer(gpu: Gpu, modules: RenderModules, assets: RenderAssets, first: FrameScene): Renderer {
  const world = gpu.createTarget({ width: 1, height: 1, filter: 'nearest', depth: true });
  const worldTexture = gpu.targetTexture(world);
  // Linear, because the sharp upscale blends across pixel edges.
  const lit = gpu.createTarget({ width: 1, height: 1, filter: 'linear' });
  const litTexture = gpu.targetTexture(lit);
  const material = gpu.createTexture({ width: 1, height: 1, filter: 'nearest', pixels: new Uint8Array(4) });
  const surfaces: Surfaces = { color: worldTexture, material };
  const terrain = createTerrainLayer(gpu, world, assets.ground);
  const solid = createSolidLayer(gpu, world, assets.atlas, assets.placeholderProps);
  const combine = createCombineLayer(gpu, lit, worldTexture);
  const view = createGridView();
  let targetWidth = 1;
  let targetHeight = 1;

  // One object each, refilled per frame, so a frame allocates nothing (rule L5).
  const lightingInput: Mutable<LightingInput> = {
    surfaces,
    casters: first.casters,
    lights: first.lights,
    environment: first.environment,
    camera: first.camera,
    targetWidth: 1,
    targetHeight: 1,
    originX: 0,
    originY: 0,
  };
  const airInput: Mutable<AirInput> = {
    target: lit,
    volumes: first.volumes,
    particles: first.particles,
    lightMaps: { shade: material, highlight: material, glow: material },
    camera: first.camera,
  };
  const fogInput: Mutable<FogInput> = { target: lit, visibility: first.visibility, camera: first.camera };
  const postInput: Mutable<PostInput> = {
    world: litTexture,
    glow: material,
    screenWidth: 1,
    screenHeight: 1,
    gridWidth: 1,
    gridHeight: 1,
    targetWidth: 1,
    targetHeight: 1,
    offsetX: 0,
    offsetY: 0,
  };

  return {
    frame(scene, screenWidth, screenHeight) {
      const camera = scene.camera;
      updateGridView(view, camera.x, camera.y, camera.zoom, screenWidth, screenHeight);
      if (view.targetWidth !== targetWidth || view.targetHeight !== targetHeight) {
        targetWidth = view.targetWidth;
        targetHeight = view.targetHeight;
        gpu.resizeTarget(world, targetWidth, targetHeight);
        gpu.resizeTarget(lit, targetWidth, targetHeight);
      }
      gpu.clear(world, BACKGROUND);
      terrain.draw(view);
      solid.draw(scene.sprites, camera, view);
      gpu.discardDepth(world);

      lightingInput.casters = scene.casters;
      lightingInput.lights = scene.lights;
      lightingInput.environment = scene.environment;
      lightingInput.camera = camera;
      lightingInput.targetWidth = targetWidth;
      lightingInput.targetHeight = targetHeight;
      lightingInput.originX = view.originX;
      lightingInput.originY = view.originY;
      const lightMaps = modules.lighting.render(lightingInput);
      combine.draw(lightMaps.shade);

      airInput.volumes = scene.volumes;
      airInput.particles = scene.particles;
      airInput.lightMaps = lightMaps;
      airInput.camera = camera;
      modules.air.render(airInput);

      fogInput.visibility = scene.visibility;
      fogInput.camera = camera;
      modules.fog.render(fogInput);

      postInput.glow = lightMaps.glow;
      postInput.screenWidth = screenWidth;
      postInput.screenHeight = screenHeight;
      postInput.gridWidth = view.width;
      postInput.gridHeight = view.height;
      postInput.targetWidth = view.targetWidth;
      postInput.targetHeight = view.targetHeight;
      postInput.offsetX = view.offsetX;
      postInput.offsetY = view.offsetY;
      modules.post.render(postInput);
    },
  };
}
