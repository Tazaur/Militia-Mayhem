// Owns: world <-> screen and the pixel grid. No other code may do this conversion (rule A7).
const TILE_PIXELS = 32;
const TILES_ACROSS_SHORT_SIDE = 15;
const SHORT_SIDE_PIXELS = TILE_PIXELS * TILES_ACROSS_SHORT_SIDE;
/** Extra game pixels on each side of the target, so the fractional camera shift never shows an edge. */
const TARGET_MARGIN = 1;

export interface GridSize {
  width: number;
  height: number;
}

/**
 * The world target for this screen, in game pixels. The short side is fixed by the grid (DECISIONS.md D7) and the
 * other side follows the screen. Zooming out shows more game pixels (D11). Writes into `out` to avoid allocating.
 */
export function gridSize(screenWidth: number, screenHeight: number, zoom: number, out: GridSize): void {
  const shortSide = Math.round(SHORT_SIDE_PIXELS / zoom);
  const landscape = screenWidth >= screenHeight;
  const aspect = landscape ? screenWidth / screenHeight : screenHeight / screenWidth;
  const longSide = Math.round(shortSide * aspect);
  out.width = landscape ? longSide : shortSide;
  out.height = landscape ? shortSide : longSide;
}

/** The oblique projection (DECISIONS.md D6): height moves things up the screen by `tilt` per unit. */
export function projectY(worldY: number, worldZ: number, tilt: number): number {
  return worldY - tilt * worldZ;
}

export interface GridView extends GridSize {
  /** The target's size: the grid plus the margin on each side. */
  targetWidth: number;
  targetHeight: number;
  /** The world position of the target's top-left pixel. Always whole, so art never swims against the grid. */
  originX: number;
  originY: number;
  /** Where the screen's top-left falls in the target, in game pixels: the margin plus the camera's fraction. */
  offsetX: number;
  offsetY: number;
}

export function createGridView(): GridView {
  return { width: 1, height: 1, targetWidth: 1, targetHeight: 1, originX: 0, originY: 0, offsetX: 0, offsetY: 0 };
}

/** The camera snaps to whole game pixels inside the target; the leftover fraction is applied in the upscale. */
export function updateGridView(
  view: GridView,
  cameraX: number,
  cameraY: number,
  zoom: number,
  screenWidth: number,
  screenHeight: number,
): void {
  gridSize(screenWidth, screenHeight, zoom, view);
  view.targetWidth = view.width + TARGET_MARGIN * 2;
  view.targetHeight = view.height + TARGET_MARGIN * 2;
  const left = cameraX - view.width / 2;
  const top = cameraY - view.height / 2;
  const wholeLeft = Math.floor(left);
  const wholeTop = Math.floor(top);
  view.originX = wholeLeft - TARGET_MARGIN;
  view.originY = wholeTop - TARGET_MARGIN;
  view.offsetX = TARGET_MARGIN + left - wholeLeft;
  view.offsetY = TARGET_MARGIN + top - wholeTop;
}

/** For world passes: `worldToClip(vec3 world)`. Needs uniforms uOrigin (vec2), uTarget (vec2) and uTilt (float). */
export const WORLD_TO_CLIP_GLSL = `
uniform vec2 uOrigin;
uniform vec2 uTarget;
uniform float uTilt;
vec2 worldToTargetPixel(vec3 world) {
  return floor(vec2(world.x, world.y - uTilt * world.z) - uOrigin + 0.5);
}
// At one screen pixel, whatever is higher is nearer the camera, so depth is height alone (DECISIONS.md D9). The 1024
// spans more than any building; 16 bits over it is a 64th of a game pixel.
float heightToClipDepth(float height) {
  return 1.0 - 2.0 * clamp(height / 1024.0, 0.0, 1.0);
}
vec4 targetPixelToClip(vec2 pixel) {
  return vec4(pixel.x / uTarget.x * 2.0 - 1.0, 1.0 - pixel.y / uTarget.y * 2.0, 0.0, 1.0);
}`;

/** For the upscale. Needs uniforms uGrid, uOffset and uTarget (vec2). `screenUv` has its origin at the bottom left. */
export const SCREEN_TO_TARGET_GLSL = `
uniform vec2 uGrid;
uniform vec2 uOffset;
uniform vec2 uTarget;
vec2 screenToTargetPixel(vec2 screenUv) {
  return vec2(screenUv.x, 1.0 - screenUv.y) * uGrid + uOffset;
}
vec2 targetPixelToUv(vec2 pixel) {
  return vec2(pixel.x, uTarget.y - pixel.y) / uTarget;
}`;
