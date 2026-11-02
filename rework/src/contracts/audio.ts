// Owns: the audio seam. feedback/ plays through it and never sees voices or mixing.
export interface AudioOut {
  play(soundId: string, x: number, y: number, gain: number): void;
  setListener(x: number, y: number): void;
  update(): void;
  dispose(): void;
}
