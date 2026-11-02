// Owns: what stands in Stage 1's rotation test, as data. Later rows draw over earlier ones.
export const ROTATION_COLUMN_SPACING = 160;

export interface RotationItem {
  readonly sprite: string;
  /** From the middle of its column. */
  readonly x: number;
  readonly y: number;
  /** Radians per second. Hull 1.3 and jeep 2.6 are the old game's numbers; the rest are guesses to compare by eye. */
  readonly turn: number;
}

// Laid out so the tank clears the readout in landscape, and all three columns fit 480 px wide in portrait.
export const ROTATION_ITEMS: readonly RotationItem[] = [
  { sprite: 'hull0', x: 0, y: -72, turn: 1.3 },
  // The gun goes under the turret, at the same spot: its pivot already holds the offset.
  { sprite: 'tur_gun', x: 0, y: -72, turn: -0.8 },
  { sprite: 'tur', x: 0, y: -72, turn: -0.8 },
  { sprite: 'jeep0', x: 0, y: 66, turn: 2.6 },
  { sprite: 'sol_stand', x: -40, y: 146, turn: 4 },
  { sprite: 'sol_rpg', x: 0, y: 146, turn: -2.5 },
  { sprite: 'sol_stand', x: 40, y: 146, turn: 1.2 },
  { sprite: 'sol_rpg', x: -20, y: 192, turn: 6 },
  { sprite: 'sol_stand', x: 20, y: 192, turn: -0.5 },
];
