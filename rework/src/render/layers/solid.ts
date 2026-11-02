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
flat out vec4 vRect;
flat out int vMethod;
${WORLD_TO_CLIP_GLSL}
void main() {
  // A whole pivot keeps art 1:1 with the grid at angle 0, whichever way the atlas table rounded.
  vec2 local = (aCorner * aRect.zw - floor(aShape.xy + 0.5)) * aShape.z;
  float c = cos(aPlace.w);
  float s = sin(aPlace.w);
  vec2 turned = vec2(c * local.x - s * local.y, s * local.x + c * local.y);
  gl_Position = targetPixelToClip(worldToTargetPixel(aPlace.xyz) + turned);
  vAtlas = aRect.xy + aCorner * aRect.zw;
  vTint = aTint;
  vRect = aRect;
  vMethod = int(aShape.w);
}`;

// The edge method: where a pixel's two neighbours round one corner match each other and not the pixel, cut that corner
// on the diagonal. Stair-steps become straight lines at any angle, and at angle 0 pixel centres never reach a cut.
const FRAGMENT = `
in vec2 vAtlas;
in vec4 vTint;
flat in vec4 vRect;
flat in int vMethod;
uniform sampler2D uAtlas;
uniform sampler2D uBaked;
out vec4 outColor;
vec4 fetchInside(ivec2 cell) {
  // Outside the rect is another sprite in the atlas.
  ivec2 low = ivec2(vRect.xy);
  ivec2 high = low + ivec2(vRect.zw);
  if (cell.x < low.x || cell.y < low.y || cell.x >= high.x || cell.y >= high.y) return vec4(0.0);
  return texelFetch(uAtlas, cell, 0);
}
bool same(vec4 a, vec4 b) {
  if (a.a < 0.5 || b.a < 0.5) return a.a < 0.5 && b.a < 0.5;
  vec3 difference = abs(a.rgb - b.rgb);
  return difference.r + difference.g + difference.b < 0.118;
}
vec4 edgeSample(vec2 atlas) {
  vec2 whole = floor(atlas);
  vec2 inCell = atlas - whole;
  ivec2 cell = ivec2(whole);
  vec4 center = fetchInside(cell);
  vec4 up = fetchInside(cell + ivec2(0, -1));
  vec4 down = fetchInside(cell + ivec2(0, 1));
  vec4 left = fetchInside(cell + ivec2(-1, 0));
  vec4 right = fetchInside(cell + ivec2(1, 0));
  if (same(up, down) || same(left, right)) return center;
  if (inCell.x + inCell.y < 0.5 && same(left, up)) return left;
  if (1.0 - inCell.x + inCell.y < 0.5 && same(up, right)) return right;
  if (inCell.x + 1.0 - inCell.y < 0.5 && same(left, down)) return left;
  if (2.0 - inCell.x - inCell.y < 0.5 && same(down, right)) return right;
  return center;
}
void main() {
  vec4 color;
  if (vMethod == 1) color = edgeSample(vAtlas);
  else if (vMethod == 2) color = texelFetch(uBaked, ivec2(floor(vAtlas)), 0);
  else color = texelFetch(uAtlas, ivec2(floor(vAtlas)), 0);
  color *= vTint;
  if (color.a < 0.5) discard;
  outColor = vec4(color.rgb, 1.0);
}`;

export interface SolidLayer {
  draw(sprites: SpriteList, camera: Camera, view: GridView): void;
}

export function createSolidLayer(
  gpu: Gpu,
  target: TargetHandle,
  atlas: TextureHandle,
  baked: TextureHandle,
): SolidLayer {
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
    inputs: [
      { sampler: 'uAtlas', texture: atlas },
      { sampler: 'uBaked', texture: baked },
    ],
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
        data[out + 11] = sprites.method[i]!;
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
