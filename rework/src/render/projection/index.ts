// Owns: world <-> screen and the pixel grid. No other code may do this conversion (rule A7).
const TILE_PIXELS = 32;
const TILES_ACROSS_SHORT_SIDE = 15;
const SHORT_SIDE_PIXELS = TILE_PIXELS * TILES_ACROSS_SHORT_SIDE;

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
