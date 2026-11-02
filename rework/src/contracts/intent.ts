// Owns: what a controller asks a soldier to do. Players, bots and the network all produce this.
// First version: Stage 2 fills it in after reading the old input code.
export interface Intent {
  /** -1 to 1. */
  readonly moveX: number;
  readonly moveY: number;
  /** World angle, in radians. */
  readonly aim: number;
  /** One bit per action. */
  readonly buttons: number;
}
