# Decisions

Append-only. Each entry: what was decided, why, numbers, what would reopen it. Check here before proposing an idea. Status: LOCKED (the user decided; only the user reopens), RECOMMENDED (the plan until the user decides otherwise), TO PROVE (Stage 1 decides), REJECTED.

## D1. Rebuild in a subfolder, copying only what is needed (LOCKED, user)

`rework/` in this repo. The old game keeps running. Nothing in `rework/` imports old code; logic is rewritten against the new contracts, keeping tuned numbers.

## D2. TypeScript, modules, esbuild (LOCKED, user accepted the recommendation)

The frame is GPU-bound (old GPU stages, recordings), so a faster language would not change the frame rate. Types replace terse structs. Still ships as one HTML file.

## D3. Stay in the browser, with an exit plan (LOCKED, user accepted the recommendation; a trigger below reopens it, and Stage 1 tests the first)

Reasons: instant phone and PC play by link, WebRTC online, phone map editing, fast iteration. At 480 px tall the pixel count is fixed and about a third of the phone's native count. This is not yet proven: the old game still drops below 60 fps on the phone in fights, and the `0.7 / 4.2 ms` on the `start.jpg` counter is CPU update / render time in a quiet moment, not GPU time. Stage 1 measures the real GPU cost of the wanted look.

**What the browser does cost:** no compute shaders in WebGL2, no on-tile G-buffer reads on phones, GC stalls, webview limits.

**Triggers to reconsider:** Stage 1 cannot hit budgets on the phone with the wanted look; or GC stalls cannot be eliminated with preallocation; or the user wants Steam, consoles or app stores in a way a wrapper cannot deliver.

**Exit cost:** a wrapper (Capacitor, Tauri) reuses everything but keeps the same GPU API, so it solves distribution, not performance. A true native port (C#, Rust or an engine) rewrites code but keeps content data, maps, art, documents and architecture. That is why `gpu/`, `platform/` and content are kept apart.

## D4. WebGPU not used now (RECOMMENDED until new measurements)

WGSL ports ran 20 to 35% slower than WebGL2 on the laptop (Intel gen-9) and the user's phone (Adreno 740). `gpu/` hides the API, so re-testing later is cheap.

## D5. Not full 3D meshes (LOCKED, user accepted the recommendation)

Painted pixel art with height and material is the game's look, and the drop-a-PNG pipeline depends on it. Oblique projection gives wall sides and depth for a fraction of the cost. Would reopen if the user wants a camera that rotates or tilts freely.

## D6. Oblique projection, tilt as a parameter (RECOMMENDED; whether to tilt, and how much, TO PROVE)

See `ARCHITECTURE.md`. The user is considering a slight angle to see wall sides, and has not decided between that, art-only sides, or 3D. `reference/goal.png` already shows this: lamp posts stand upright on screen. It keeps the sim 2D and leaves lighting's caster map untouched. `tilt = 0` remains possible until the value is locked.

**Rejected for tilt:** painted sides with a straight-down camera (units would stand on top of the painted faces, and it still needs the occlusion). GTA-style perspective (art swims as the camera moves, at low resolution).

## D7. 32 px grid, 15 tiles tall (LOCKED, user)

480 px target. Tested on `goal.png`: downsampled to 480 tall, it keeps its look (`reference/goal_at_480.png`). Downsampling flatters it compared to rotated sprites, hence Stage 1 question 2.

## D8. Keep height-based light as v1 (TO PROVE in the slice)

Painted height, reflect and glow gives what off-the-shelf 2D lights do not: Godot's docs state that light height does not affect 2D shadows. It stays behind `LightingModel`, so replacing it later touches nothing else.

## D9. Depth buffer for solids instead of sorted draws (TO PROVE)

Oblique is orthographic 3D with a shear, so hardware depth handles long tank vs short wall correctly per pixel, and one instanced draw covers a whole layer. Cost to check: alpha test on phones.

## D10. Old game frozen (LOCKED, user)

The match TIME setting was the last feature. New features go to the rework only. Build 417 and later stay playable at the repo root until Stage 10.

## D11. Vehicle zoom: tween to one set level while in motion (LOCKED, user; the level and details TO PROVE in Stage 1)

The old game's zoom depends on vehicle type (`4_ai.js` `updateCams`: tank 0.82, jeep 0.78, other 0.9) and on speed. Replaced by: a quick tween, not a snap, out to a set zoom level while the vehicle is in motion, and back in when it stops. Same level for every vehicle, so it is a camera setting in data, not per-vehicle code. Our reading of "in motion": the player's vehicle is moving; confirm when it can be felt in Stage 2 or 3.

On the fixed grid, zooming out means a larger world target with smaller pixels. A level of 0.8 shows 600 game pixels (18.75 tiles) top to bottom, 1.56x the pixels, so the GPU budget must hold at the zoomed level, not just at 480. Stage 1 tests how the tween looks and costs.

## D12. TypeScript pinned at 5.9 (tooling)

`tools/lint.mjs` parses source with the TypeScript compiler API. TypeScript 7, the native port, does not ship that API as a stable package entry (checked on 7.0.2). Move up when it does, or when the lint has another parser. Tests run directly on Node 24's built-in type stripping, so `erasableSyntaxOnly` is on and imports use `.ts` extensions.

## D13. Smooth camera: whole-pixel origin, fraction in the upscale (LOCKED, user; Stage 1 question 1)

Judged on the S23 Ultra in build 419: "beautifully smooth". Whole-pixel scrolling was "not actually that bad, but it does produce a noticeable jitter". Pixel evenness at 1.71x the grid: "looks even. Hard to tell", accepted. The comparison switch is deleted.

## D14. Phone measurements (S23 Ultra, Android browser)

Build 419, portrait 1079x1948, 126 sprites: 59 FPS, DROP 6, WORST 31 ms, CPU 0.3 ms. The browser offers no timer queries, so `gpu/webgl2/timers` falls back to a whole-frame estimate: wait for the GPU with a one-pixel read, time one frame, once a second. It has no per-pass numbers. Checked in software rendering with the extension hidden: estimate 37.4 ms at 27 FPS, which is 37 ms a frame.

Six 31 ms frames in a second would mean at most 54 FPS at 60 Hz, yet it read 59, and the user saw smooth motion. So our reading from this one sample: frames arrive late and the next ones catch up, rather than being lost. Not proven; the readout's `EARLY` count tests it. CPU is ruled out at 0.3 ms.

## D15. Rotation: nearest, at runtime (user judged; baked may be reassessed)

Compared on the S23 Ultra in build 420, at 480 px: nearest, an edge-cutting shader (5 texture reads), and RotSprite-style frames baked at 64 angles. The user could not tell nearest from edge, and called shimmer negligible, so nearest stays: it is the cheapest and the simplest. Baked was "the cleanest looking in terms of pixel perfection, but its a style choice": not now, reassess when there is more content. Baked costs: 800 KB of PNG for 6 sprites, before material maps.

All three were built and then deleted. Commit e102718 has the edge shader (`render/layers/solid.ts`) and the bake (`tools/bake-rotations.py`).

Reading on the phone in build 420 (27 sprites, static camera, portrait 1079x1948): 66 FPS, DROP 0, EARLY 0, WORST 15 ms, CPU 0.2 ms, GPU estimate 3.6 ms. 66 FPS is above 60, so this display is not fixed at 60 Hz, and D14's "at most 54 FPS" reasoning assumed it was. Why build 419 showed drops and this reading does not is still unknown: one reading each, with a moving camera only in 419.

## Measured in the old game (do not re-try without a new reason)

| Idea | Result | Source |
|---|---|---|
| Scissoring the lamp pass to lights' boxes | 4.67 ms vs 4.39 ms: no gain; lamps reach 340 px and cover the view | CONTEXT.md, build 394 |
| One pass with six MRT targets | 5.1 ms vs 3.5 ms: slower | CONTEXT.md, build 400 |
| Merged light map pass | 6.3 -> 3.45 ms | CONTEXT.md, build 400 |
| Static shadow cache | ULTRA GPU 24.2 -> 16.5 ms | CONTEXT.md |
| PIXEL LOCK | Phone-size scene 13.2 -> 5.2 ms, 63 -> 152 fps | CONTEXT.md |
| Caching static sun heights | 0.12 ms: not worth it; units are the cost | CONTEXT.md |
| Tile GPUs | Each extra pass costs bandwidth | Arm guidance, not measured here |

## Research rejected

- Polar 1D shadow maps: treat occluders as infinitely tall, so no lamp above a low wall.
- Radiance cascades: flat world, and expensive on phones (not measured).
- Sprite stacking for everything: overdraw; pointless at tilt 0. Limited use possible for vehicle sides.

## Sources

- [Godot 2D lights](https://docs.godotengine.org/en/stable/tutorials/2d/2d_lights_and_shadows.html)
- [Arm: deferred shading on mobile](https://developer.arm.com/community/arm-community-blogs/b/mobile-graphics-and-gaming-blog/posts/deferred-shading-on-mobile)
- [Texel splatting paper](https://arxiv.org/html/2603.14587v1)
- [HD-2D pipeline write-up](https://dev.to/gaurav_de/creating-an-hd-2d-rendering-pipeline-on-dx12-205k)
- [Mozilla: WebGL deferred shading](https://hacks.mozilla.org/2014/01/webgl-deferred-shading/)
