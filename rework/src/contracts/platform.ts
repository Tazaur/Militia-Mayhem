// Owns: everything the game needs from what it runs on (rule A8). The browser is one implementation.
export type RenderSurface = { readonly __surface: true };

export interface ScreenSize {
  /** Device pixels. */
  readonly width: number;
  readonly height: number;
}

export interface Platform {
  /** Opaque to everything but the matching gpu/ backend. */
  readonly surface: RenderSurface;
  /** The same object every call, updated in place. */
  screenSize(): ScreenSize;
  /** Milliseconds; only differences mean anything. */
  now(): number;
  startLoop(frame: (nowMs: number) => void): void;
  storageGet(key: string): string | null;
  storageSet(key: string, value: string): void;
  /** Tells the player the game cannot continue. */
  fatal(message: string): void;
}
