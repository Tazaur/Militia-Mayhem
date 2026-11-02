// Owns: drawing soldiers, vehicles, props and walls as one instanced draw. Order comes from the list for now.
import type { Camera, Gpu, Pass, SpriteList, TargetHandle, TextureHandle } from '../../contracts/index.ts';
import { WORLD_TO_CLIP_GLSL } from '../projection/index.ts';
import type { GridView } from '../projection/index.ts';

const FLOATS_PER_SPRITE = 16;
const MAX_SPRITES = 4096;

const VERTEX = `
in vec4 aRect;
in vec4 aPlace;
in vec4 aShape;
in vec4 aTint;
out vec2 vAtlas;
out vec4 vTint;
${WORLD_TO_CLIP_GLSL}
void main() {
  vec2 local = (aCorner * aRect.zw - aShape.xy) * aShape.z;
  float c = cos(aPlace.w);
  float s = sin(aPlace.w);
  vec2 turned = vec2(c * local.x - s * local.y, s * local.x + c * local.y);
  gl_Position = targetPixelToClip(worldToTargetPixel(aPlace.xyz) + turned);
  vAtlas = aRect.xy + aCorner * aRect.zw;
  vTint = aTint;
}`;

const FRAGMENT = `
in vec2 vAtlas;
in vec4 vTint;
uniform sampler2D uAtlas;
out vec4 outColor;
void main() {
  vec4 color = texture(uAtlas, vAtlas / vec2(textureSize(uAtlas, 0))) * vTint;
  if (color.a < 0.5) discard;
  outColor = vec4(color.rgb, 1.0);
}`;

export interface SolidLayer {
  draw(sprites: SpriteList, camera: Camera, view: GridView): void;
}

export function createSolidLayer(gpu: Gpu, target: TargetHandle, atlas: TextureHandle): SolidLayer {
  const program = gpu.createProgram({
    name: 'solid',
    vertex: VERTEX,
    fragment: FRAGMENT,
    instanceAttributes: [
      { name: 'aRect', size: 4 },
      { name: 'aPlace', size: 4 },
      { name: 'aShape', size: 4 },
      { name: 'aTint', size: 4 },
    ],
  });
  const data = new Float32Array(MAX_SPRITES * FLOATS_PER_SPRITE);
  const instances = { data, count: 0 };
  const origin = new Float32Array(2);
  const size = new Float32Array(2);
  const tilt = new Float32Array(1);
  const pass: Pass = {
    name: 'solid',
    target,
    program,
    inputs: [{ sampler: 'uAtlas', texture: atlas }],
    uniforms: [
      { name: 'uOrigin', value: origin },
      { name: 'uTarget', value: size },
      { name: 'uTilt', value: tilt },
    ],
    blend: 'none',
    instances,
  };

  return {
    draw(sprites, camera, view) {
      const count = Math.min(sprites.count, MAX_SPRITES);
      for (let i = 0; i < count; i++) {
        const out = i * FLOATS_PER_SPRITE;
        for (let k = 0; k < 4; k++) data[out + k] = sprites.atlasRect[i * 4 + k]!;
        data[out + 4] = sprites.position[i * 3]!;
        data[out + 5] = sprites.position[i * 3 + 1]!;
        data[out + 6] = sprites.position[i * 3 + 2]!;
        data[out + 7] = sprites.transform[i * 2]!;
        data[out + 8] = sprites.pivot[i * 2]!;
        data[out + 9] = sprites.pivot[i * 2 + 1]!;
        data[out + 10] = sprites.transform[i * 2 + 1]!;
        data[out + 11] = 0;
        for (let k = 0; k < 4; k++) data[out + 12 + k] = sprites.tint[i * 4 + k]!;
      }
      instances.count = count;
      origin[0] = view.originX;
      origin[1] = view.originY;
      size[0] = view.targetWidth;
      size[1] = view.targetHeight;
      tilt[0] = camera.tilt;
      gpu.draw(pass);
    },
  };
}
