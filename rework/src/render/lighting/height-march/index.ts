// Owns: the real LightingModel (DECISIONS.md D8). So far ambient, sun and lamps on the ground, without shadows.
import type { Gpu, LightMaps, LightingModel, Pass, Rgb, TargetHandle } from '../../../contracts/index.ts';

// The next rounds rank lights against a budget from quality. Until then, more than this are not lit.
const MAX_LIGHTS = 16;

const VERTEX = `
out vec2 vPixel;
uniform vec2 uTarget;
void main() {
  vPixel = vec2(aCorner.x, 1.0 - aCorner.y) * uTarget;
  gl_Position = vec4(aCorner * 2.0 - 1.0, 0.0, 1.0);
}`;

// Each light falls off to nothing at its reach, and a lamp's height spreads its pool: straight below it is brightest.
const FRAGMENT = `
in vec2 vPixel;
uniform vec2 uOrigin;
uniform vec3 uBase;
uniform float uLightCount;
uniform vec3 uLightPosition[${MAX_LIGHTS}];
uniform vec3 uLightColor[${MAX_LIGHTS}];
uniform vec2 uLightReach[${MAX_LIGHTS}];
out vec4 outColor;
void main() {
  vec3 surface = vec3(floor(vPixel) + 0.5 + uOrigin, 0.0);
  vec3 light = uBase;
  int count = int(uLightCount);
  for (int i = 0; i < count; i++) {
    vec3 toLight = uLightPosition[i] - surface;
    float distanceToLight = max(length(toLight), 1.0);
    float falloff = clamp(1.0 - distanceToLight / uLightReach[i].x, 0.0, 1.0);
    light += uLightColor[i] * uLightReach[i].y * falloff * falloff * max(toLight.z / distanceToLight, 0.0);
  }
  outColor = vec4(light, 1.0);
}`;

export function createHeightMarchLighting(): LightingModel {
  let gpu: Gpu | null = null;
  let pass: Pass | null = null;
  let shadeTarget: TargetHandle | null = null;
  let maps: LightMaps | null = null;
  let width = 1;
  let height = 1;
  const ambient = { r: 0, g: 0, b: 0 };
  const target = new Float32Array(2);
  const origin = new Float32Array(2);
  const base = new Float32Array(3);
  const lightCount = new Float32Array(1);
  const lightPosition = new Float32Array(MAX_LIGHTS * 3);
  const lightColor = new Float32Array(MAX_LIGHTS * 3);
  const lightReach = new Float32Array(MAX_LIGHTS * 2);
  return {
    init(owner) {
      gpu = owner;
      shadeTarget = owner.createTarget({ width, height, filter: 'nearest' });
      const black = owner.createTexture({
        width: 1,
        height: 1,
        filter: 'nearest',
        pixels: new Uint8Array([0, 0, 0, 255]),
      });
      maps = { shade: owner.targetTexture(shadeTarget), highlight: black, glow: black };
      pass = {
        name: 'shade',
        target: shadeTarget,
        program: owner.createProgram({ name: 'shade', vertex: VERTEX, fragment: FRAGMENT, instanceAttributes: [] }),
        inputs: [],
        uniforms: [
          { name: 'uTarget', value: target },
          { name: 'uOrigin', value: origin },
          { name: 'uBase', value: base },
          { name: 'uLightCount', value: lightCount },
          { name: 'uLightPosition', value: lightPosition },
          { name: 'uLightColor', value: lightColor },
          { name: 'uLightReach', value: lightReach },
        ],
        blend: 'none',
        instances: null,
      };
    },
    render(input) {
      if (!gpu || !pass || !shadeTarget || !maps) throw new Error('lighting used before init');
      if (input.targetWidth !== width || input.targetHeight !== height) {
        width = input.targetWidth;
        height = input.targetHeight;
        gpu.resizeTarget(shadeTarget, width, height);
      }
      target[0] = width;
      target[1] = height;
      origin[0] = input.originX;
      origin[1] = input.originY;
      const { ambientColor, sunColor, sunDirection } = input.environment;
      const sunOnGround = Math.max(sunDirection[2], 0);
      ambient.r = ambientColor.r;
      ambient.g = ambientColor.g;
      ambient.b = ambientColor.b;
      base[0] = ambientColor.r + sunColor.r * sunOnGround;
      base[1] = ambientColor.g + sunColor.g * sunOnGround;
      base[2] = ambientColor.b + sunColor.b * sunOnGround;
      const { lights } = input;
      const count = Math.min(lights.count, MAX_LIGHTS);
      lightCount[0] = count;
      for (let i = 0; i < count; i++) {
        for (let k = 0; k < 3; k++) {
          lightPosition[i * 3 + k] = lights.position[i * 3 + k]!;
          lightColor[i * 3 + k] = lights.color[i * 3 + k]!;
        }
        lightReach[i * 2] = lights.shape[i * 4]!;
        lightReach[i * 2 + 1] = lights.shape[i * 4 + 1]!;
      }
      gpu.draw(pass);
      return maps;
    },
    // Ambient only until something asks: bots and smoke puffs, Stages 4 and 5.
    query(): Rgb {
      return ambient;
    },
    dispose() {
      gpu = null;
      pass = null;
      shadeTarget = null;
      maps = null;
    },
  };
}
