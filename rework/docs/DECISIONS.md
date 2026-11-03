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

## D16. Tilt 0.25, no vehicle sides, for now (user chose; reopens with real buildings)

Judged on the S23 Ultra in build 423 against 0 and 0.35, with placeholder walls: "25 with no vehicle shadows, for now" (taken to mean the darkened side slices, the only vehicle option in the test). The user asked to re-judge it when there are buildings, out of concern for how much tall buildings hide.

What a building hides is `0.25 x height`, north of its south edge: 36 px wall 9 px; 42 px roof 10.5 px; 96 px 24 px (about a whole soldier, whose sprite is 22 px); 192 px 48 px. Tools if that hides too much: lower buildings, fading a roof near the player (the old game fades roofs), a lower tilt. Art is drawn for one tilt, so re-judge before ordering a lot of wall art. Changing the number is one value, because upright sprites foreshorten by tilt in the shader.

D6's "whether to tilt, and how much" is answered by this entry until then. No frame report came with this verdict.

## D17. First full phone recording (S23 Ultra, Adreno 740, build 423, 20 s, 12 taps)

Interval p50 16.7, p95 16.8, p99 25.0, max 74.9 ms. Of 1215 frames, 1137 were near 16.7 ms and 48 near 8.3 ms. Slowest frames' CPU was at most 0.6 ms; GPU estimate 3.4 to 5.2 ms.

- **The screen changes rate at a touch.** Seconds with a tap show 62 to 63 FPS and EARLY 3 to 7; seconds without show 60 and 0 to 1 (the 1 follows a tap). The 8.3 ms frames are 120 Hz. This also explains the 66 FPS reading in D15. It corrects D14: EARLY is mostly this, not late frames catching up. Stage 2's fixed tick must not depend on the refresh rate. (This entry first said to assume 120 Hz during phone play; D18 replaces that.)
- **Slow frames come in clusters:** page load, 2.9 to 4.8 s, and 19.4 to 19.8 s just before COPY REPORT was pressed, where the intervals run 15.3 ms, then 32.7, then 8.3. From 6 to 19 s no frame was over 17 ms in any second. Our reading: the rate change costs a frame or two, and our CPU and GPU are not the cause, since they stay far under budget. Not proven for the 2.9 to 4.8 s cluster, because the report does not record touches.
- **The canvas was 2573x4641,** about 4.6x the pixels of the 1079x1948 runs. The browser identified as desktop Linux. It was the browser built into the Claude app, opened from a link (this entry first guessed desktop-site mode). So these GPU numbers cover a far larger upscale than a normal run. `platform/browser` now caps the canvas by the page scale; not yet confirmed in that browser.
- GPU estimate rose from 3.4 to 5.2 ms over 20 s with no matching change in settings. One run; could be heat. Watch it in longer recordings.

## D18. Every input is a main way to play (user stated), and a Chrome recording

**The game is played with touch, controller, and keyboard and mouse, on phone and computer. None is the main one or an afterthought.** Do not design, budget or tune for one of them alone. A phone can have a controller, so the input says nothing about the screen rate either. Frame budget: hold up at whatever rate the screen is running, which means 8.3 ms where it runs 120 Hz. Whether a held finger keeps the phone at 120 Hz is unmeasured and no longer a planning assumption.

Recording: S23 Ultra, Chrome (mobile user agent), build 425, 1079x1948, page scale 1, 63.8 s. Interval p50 15.3, p95 28.7, p99 30.6, max 36.3 ms. Of 3872 frames, 3294 were 15 to 18 ms and 254 were 22 to 34 ms. CPU 0.2 to 0.4 ms per frame; GPU estimate 3.0 to 4.3 ms.

- **The frame rate has three states:** a steady 65 FPS (15.3 ms, which is not 60 or 120 Hz; the once-a-second counts agree, so it is not a recorder artefact), a steady 60 FPS (16.7 ms, seen after some taps), and patches lasting seconds with frames of about 31 ms (two 15.3 ms refreshes). Unexplained.
- **36 of 64 seconds held a frame of 29 ms or more,** and four seconds lost 15 to 17 frames (lowest 48 FPS). The 20 s run in the Claude app's browser (D17) had far fewer, though its canvas had about 4.6x the pixels and its GPU estimate was only slightly higher. One run each and different lengths, but pixel count does not look like the driver. (That run also had 12 taps in 20 s, which D19 shows may explain it.)
- **Not proven to be outside the game.** JS time is far under budget, but the GPU estimate samples one frame in 60, so it can miss a slow patch, and it may not scale with real work. To separate the game from the browser and phone, record the same page drawing nothing.
- This run had page scale 1, so it says nothing about the canvas cap.

## D19. Chrome with desktop mode on; the canvas cap works; stutter belongs to the faster state

Recording: S23 Ultra, Chrome with desktop mode, build 426, 77.6 s. Page scale 0.42, canvas 1080x1949. Interval p50 15.3, p95 29.2, p99 30.6 ms. 342 of 4670 frames (7.3%) were 22 to 34 ms; D18 had 6.6%.

- **The canvas cap works in Chrome's desktop mode.** The page is laid out 980 wide: 980 x 2.625 = 2573, the oversized width in D17, and the cap brings it to 1080. The same width in D17 suggests the Claude app's browser does the same; the cap has not run there.
- **Desktop mode makes no difference to the timing,** as expected with the same pixel count.
- **Every 60 FPS second is clean, and they follow a tap or page load.** After a tap the phone can hold exactly 16.7 ms for about 2 to 3 s, then moves to about 15.3 ms, with a few irregular frames in the change. All the missed-frame patches are in that faster state, though it also has long clean stretches (57 to 70 s here). Tilt shows no effect. This may be why D17's run, with 12 taps in 20 s, looked cleaner than D18's: taps may have held it at 60. A guess at the cause, unproven: the phone's adaptive refresh rate.
- **The GPU estimate did not climb over 77 s** (3.5 falling to about 3.0), so D17's rise was not repeated. It shows no link to the missed frames, with the caveat in D18.
- **Test added:** a third tap mode, NO DRAW, keeps the loop and recorder running and sends nothing to the GPU. If the patches continue, they are not caused by our drawing. If they stop, that is not proof either, since a page with no changes may be scheduled differently; the next test would be a clear-only frame.

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
