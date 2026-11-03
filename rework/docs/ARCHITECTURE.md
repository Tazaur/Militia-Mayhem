# Architecture

Current truth. Edit in place when it changes. Items marked **TO PROVE** are the plan until Stage 1 tests them; record the result in `DECISIONS.md` and update this file. `DECISIONS.md` says which choices the user has locked and which are still recommendations.

## Platform

TypeScript (strict), ES modules, esbuild. Output is one HTML file with inlined assets, served at `/rework/` on GitHub Pages. WebGL2.

Browser exit plan, because the game must not be trapped there. Triggers and what they would cost are in `DECISIONS.md` D3.

## Modules

```
rework/src/
  core/       maths, seeded RNG, ids, typed-array pools. Depends on nothing.
  contracts/  the interfaces and data shapes modules meet at. Types only.
  content/    data: archetypes, rigs, lights, emitters, weapons, projectiles, surfaces, feedback rules, quality table.
  sim/        fixed-tick game rules. Pure. Emits events.
  ai/         bots. Produces the same Intent a player does.
  net/        transport (WebRTC, loopback), snapshot schema, prediction.
  input/      keyboard, pad, touch -> Intent.
  scene/      sim state + content -> FrameScene per view. Owns visual-only state.
  feedback/   sim events + rules -> sound, emitters, lights, shake, rumble.
  audio/      voices, mixing, music.
  gpu/        the only code that calls WebGL. Programs, targets, instanced batches, pass runner.
  render/
    frame     pass order, resources.
    projection  world <-> screen.
    layers/   terrain, flat, solid, overhead.
    lighting/ interface + implementations (height-march, unlit).
    fog/      interface + implementations (visibility, none).
    air/      smoke, fire, weather (field, none).
    post/     upscale, grade, bloom (full, none).
  ui/         HUD and menus on the same batcher, full resolution.
  platform/   canvas, resize, storage, fullscreen, wake lock.
  app/        boot, state machine, main loop, wiring. The only place that picks implementations.
tools/  tests/  docs/
```

### Who may import whom

Enforced by dependency lint (rule A4). Everything may import `core` and `contracts`.

| Module | May also import |
|---|---|
| content | nothing else |
| sim | content |
| ai | sim (read-only view), content |
| net | sim (via snapshot schema), content |
| input | nothing else |
| scene | sim (read-only view), content |
| feedback | content, audio contract |
| audio | content |
| gpu | nothing else |
| render/frame | render/layers, render/projection, gpu |
| render/* (others) | render/projection, gpu, and its own sub-module's internals |
| ui | gpu, content |
| platform | nothing else |
| app | everything |

A cross-module import must target that module's `index.ts` (or an implementation's, such as `render/lighting/unlit/index.ts`), never another file inside it. `render` cannot see `sim`. `sim` cannot see `render`, `audio`, `net` or `feedback`.

## Frame flow

```
input -> Intent ─┐
ai    -> Intent ─┼─> sim.tick (fixed 60 Hz, seeded) ─> events ─> feedback ─> audio, emitters, lights
net   -> Intent ─┘        │                              │
                          v                              v
                  scene.build(view, alpha) <─────── transient FX state
                          v
                     FrameScene  ──> render.frame(scene) ──> screen
                                     ui.frame(...)       ──> screen
```

The sim runs at a fixed tick; rendering interpolates. `alpha` is the fraction between two ticks. Local play uses `net/loopback`, so online and local follow one code path.

## The FrameScene contract

The main seam. Plain preallocated data; nothing in it references sim objects.

```ts
interface FrameScene {
  camera: Camera;            // world position (sub-pixel), tilt, zoom
  environment: Environment;  // sun direction, sun and ambient colour, weather, time of day
  sprites: SpriteList;       // SoA typed arrays: atlas rect, x, y, z, angle, scale, flip, layer, tint, flags
  casters: CasterList;       // what blocks light: usually the same parts, or shapes
  lights: LightList;         // resolved Light rows with world positions
  particles: ParticleList;
  volumes: VolumeView;       // smoke field
  stains: StainCommand[];    // decals to bake this frame
  visibility: VisibilityView;// fog polygons, for this view
  worldOverlay: OverlayList; // tags, reticles, lasers
}
```

Render passes read only this. Adding a kind of thing to the game never changes a render pass, because it arrives as sprites, casters and lights.

## Projection (the tilt seam)

**Recommended design, not yet the user's decision: oblique projection with one number** (`DECISIONS.md` D6). World is `(x, y, z)` with `z` height.

```
screenX = x
screenY = y - tilt * z
```

`tilt = 0` is today's straight-down view. `tilt` around 0.25 to 0.35 shows south wall faces, stands lamp posts up, and lifts crowns and roofs. The working value is 0.25, to be judged again with real buildings (`DECISIONS.md` D16); a fixed oblique keeps every world pixel moving by the same amount, so the art does not swim as a perspective camera would.

Consequences:

- **The sim stays 2D plus height.** Collision, bullets, nav and sight are unaffected by tilt.
- **Occlusion is real depth, not sorted closures (TO PROVE).** Solid layers draw with a hardware depth buffer and alpha test, depth computed per vertex from `z` alone (`DECISIONS.md` D9, D20); along an upright sprite, `z` rises with its height. A long tank beside a short wall resolves per pixel. At tilt 0 this reduces to the old "higher covers lower". Things that must fade use dither in solid layers, or live in overhead or air.
- **Walls are geometry.** A wall run emits a top quad and a south-face quad, with art for both. Other sprites stay single quads at their part's height, so the turret parallaxes over the hull.
- **Upright sprites** (`SpriteList.flags`, bit 1) stand on the ground, and tilt foreshortens them in the vertex shader: wall faces, posts, trunks. Nothing outside `render/` computes the foreshortening (rule A7).
- **Rotating vehicles have no painted sides,** and no extrusion for now (`DECISIONS.md` D16).
- **Aiming.** The reticle and hits live on the world plane; screen offsets are small (`tilt * 16` is about 4 px). `scene` lifts visuals to gun height so tracers line up.
- **Your own soldier behind a wall** can be shown as a faint silhouette through depth, if testing shows it is needed.

No code outside `render/projection` knows this formula (rule A7). The GLSL version is a shared snippet.

## Pixel grid

**LOCKED: 32 px tiles, 15 tiles top to bottom in landscape, so the world target is 480 px tall.** Width follows the screen aspect: about 1030 on the user's phone, 853 at 16:9. `docs/reference/goal_at_480.png` shows that the goal picture holds up at this size.

- Camera snaps to whole game pixels inside the target; the target has a 1 px margin. The leftover fraction is applied in the upscale, so scrolling is smooth (**TO PROVE**).
- The target is the grid plus 1 px each side. `render/projection` computes the whole-pixel origin and the fraction, and supplies the GLSL for both sides.
- Upscale is sharp-bilinear, because most screens are not a whole multiple of 480 (the phone is 1.71x).
- HUD and text draw at full device resolution, over the upscaled world.
- Cost is fixed by the grid, not the device: about 34% of the phone's pixels and 20% of 1080p. Old measurement: PIXEL LOCK took a phone-size scene from 13.2 to 5.2 ms of GPU.
- **Zoom (`DECISIONS.md` D11):** `camera.zoom` is 1 on foot. Vehicles tween quickly to one set level while in motion and back when stopped. The target shows `480 / zoom` game pixels, drawn into a viewport of a target allocated once at the largest size. The tween lives in `scene/` (visual-only state); the level lives in `content/`. Budgets must hold at the zoomed level.
- In portrait, the short side is 480.
- Open: rotated sprites at low resolution, split-screen, ultra-wide. See `STATE.md`.

## World layers

| # | Layer | Contents | Technique |
|---|---|---|---|
| 0 | Terrain | Ground, water, stains | Cached pages; no depth |
| 1 | Flat | Bodies, brass, items, zone rings | Instanced, sits just above the ground |
| 2 | Solid | Soldiers, vehicles, walls, props, low particles | Instanced, depth + alpha test; writes colour and material |
| 3 | Overhead | Roofs, tree crowns | Second colour and material surface; fade and holes around units under it |
| L | Light | Shade, highlight, glow maps for layers 0 to 3 | The `LightingModel` |
| C | Combine | Surfaces x light maps | |
| 4 | Air | Smoke, fire, blasts, embers, weather | Soft alpha; samples light maps or `lightQuery` |
| 5 | Fog of war | Remembered world over what is out of sight | Memory comes from the same FrameScene |
| 6 | World overlay | Tags, reticles, lasers | Unlit |
| 7 | Post | Bloom from glow, colour grade, upscale | The `Post` module |
| 8 | UI | HUD, menus, touch | Full resolution |

Pages: terrain, stains and fog memory are split into pages (about 512 px), allocated only when something is drawn on them, replacing the old 42 MB world-sized surfaces.

Each pass adds phone bandwidth, because WebGL2 cannot keep buffers on the tile. Keep the count low and invalidate targets that are not read again.

## Swappable modules

Each has an interface in `contracts/`, a real version and a null version (Stage 0 built the null versions; `app/null-parts.ts` lists them). `app/` picks. Reworking one means writing a new folder beside the old, switching in `app/`, deleting the old one.

### The Gpu contract

`gpu.draw(pass)` takes one `Pass` stating its target, program, inputs, uniforms, blend and instances. The WebGL2 backend binds all of it, draws, and unbinds it. It throws if a program has a sampler or uniform the pass did not declare, or if a pass reads the target it draws to, so no pass can read what an earlier one left. Backends: `gpu/webgl2`, `gpu/headless`.

### LightingModel

```ts
interface LightingModel {
  init(gpu: Gpu, quality: QualityTier): void;
  render(input: LightingInput): LightMaps;
  query(x: number, y: number, z: number): Rgb;   // the ONE CPU light query (bots, smoke puffs)
  dispose(): void;
}
interface LightingInput { surfaces: Surfaces; casters: CasterList; lights: LightList; env: Environment; camera: Camera; }
interface LightMaps { shade: Texture; highlight: Texture; glow: Texture; }
```

Nothing else in the game knows how shadows are made. Everything else sees `LightMaps` and `query`. Spans, channels, sweep and caches are private to `lighting/height-march/`.

**v1 design (ported idea, new code):**

- **Caster map:** a world-aligned top-down height map, independent of the camera. Static casters are cached in pages, dynamic ones stamped each frame. Tilt does not touch it.
- **Surface pixels know where they are:** world position is reconstructed from screen position and the stored height: `y = screenY + tilt * baseZ`. Lighting therefore marches through the caster map in world space, whatever the camera does.
- **Materials:** from the atlas `_m` image: height, reflect, glow. Faces get a facing value, so wall sides respond to the sun and lamps correctly. Exact G-buffer layout is private to surfaces and lighting (**TO PROVE**).
- **Light list:** uniform buffer rather than a 10-entry uniform array. A budget from quality, ranked with stability so ties do not flicker. Own lights pinned.
- **Untested idea for Stage 1:** a small per-light shadow texture, so lamp cost follows the number of lights rather than pixels times lights.

### Others

| Contract | Real | Null | Hides |
|---|---|---|---|
| `FogModel` | visibility polygons + memory pages | none (everything visible) | Masks, memory |
| `AirModel` | smoke field + puffs | none | How smoke draws |
| `Post` | bloom, grade, sharp upscale | plain upscale | Effects chain |
| `AudioOut` | Web Audio | silent | Voices, mixing |
| `Transport` | WebRTC | loopback | Connection, signalling |
| `GpuBackend` | WebGL2 | headless stub for tests | The API, so WebGPU or native can come later |
| `Platform` | browser | Node stub | DOM, storage, input sources |

## Capability classes

Defined as data in `content/`, with typed schemas in `contracts/`. Not a generic ECS framework: plain typed defs and plain sim state.

| Class | Data | Becomes |
|---|---|---|
| Light | point or spot, colour, reach, cone, height, intensity curve, casts shadow, priority, tier | Flashlight, headlight, tail and brake light, street lamp, window, muzzle flash, blast, fire, rocket exhaust |
| Rig | Parts on sockets, angle source, damage frames, recoil, part height | Hull, turret, MG, wheels, tracks, crew, soldier body and legs, tree layers |
| Archetype | Rig + collider + health + seats + mounts + lights + emitters + what it leaves behind | Tank, jeep, nest, tree, hay, crate, fence, street lamp, future helicopter |
| Emitter | Sprite or pixel, rate, curves, drag, layer, light, on-land behaviour | Smoke, dust, blood, brass, sparks, embers, straw, leaves, ripples |
| Stain layer | Sprite, fade time, page policy | Footprints, tyre marks, blood, scorch |
| Field | Grid fluid: diffusion, decay, opacity, colour | Smoke grenades, wreck smoke, possibly gas |
| Projectile | Motion, damage, attached light and emitter | Bullet, shell, rocket, grenade, smoke grenade |
| Weapon | Fire mode, spread, magazine, projectile, feedback | All guns, mounted or carried |
| Occluder | Blocks movement, shots or sight; opacity | Wall, glass, sandbag, smoke |
| Surface | Footstep, dust colour, print, speed | Grass, asphalt, snow, water |
| Zone | Shape, rules | Flag, hill, spawn, bounds |
| Feedback rule | Event + condition -> sound, emitter, light, shake, rumble | All "juice", shared by host and clients |

One sim query answers all line tests: `raycast(from, to, mask)`. One event table drives all effects.

## Budgets

Proposed; adjust with evidence in `DECISIONS.md`.

| | Phone (Adreno 740) | Laptop (Intel gen-9) |
|---|---|---|
| Frame rate | 60 | 60 |
| GPU per frame, busy fight | 10 ms | 12 ms |
| CPU per frame (sim + scene + submit) | 4 ms | 4 ms |
| Worst frame | 25 ms | 25 ms |
| Download | 3 MB | 3 MB |

Every pass reports its time through `gpu/`. Benches run named scenes (day, night with all lamps, smoke fight) on both devices. Lower tiers exist for weaker phones; those devices are not yet identified.

## Assets

Atlas pair: colour plus material (height, reflect, glow), one table. `tools/` bakes them; `drop.py`'s no-questions workflow carries over. Wall faces need new art for tilt.
