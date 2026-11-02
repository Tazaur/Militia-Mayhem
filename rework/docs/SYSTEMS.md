# Systems: one owner per job

Check here before writing anything (rule S1). If a job has an owner, extend it. If not, add a row first. `TEMP` rows name their removal stage; an expired TEMP blocks the next stage (rule S3).

Status: `planned`, `built`, `TEMP (remove by stage N)`.

| Job | Owner | Replaces in old game | Status |
|---|---|---|---|
| All GPU calls and state | `gpu/` | `0_gx.js`, manual units in `5e_light.js` | built: draw, targets, programs, timers |
| Drawing sprites | `gpu/` instanced draw via `render/layers/solid` | `spr`, `sprC`, `img`, `uiSpr`, `uiSprR`, GX | built: one list, list order. Depth comes with Stage 1 question 4 |
| Upscale | `render/post` with `render/projection` GLSL | PIXEL LOCK | built: sharp bilinear with the camera fraction |
| GPU time | `gpu/webgl2/timers`, shown by `app/readout` | `gpuOpen`, `gpuClose` | built: per pass with timer queries, else a whole-frame estimate |
| Atlas table | `assets/atlas.json` -> generated `content/atlas-table.ts` | `atlas.json` in the bundle | built |
| Placeholder ground | `content/placeholder-ground`, drawn by `render/layers/terrain` | `GTEXP` | TEMP (remove by Stage 4) |
| Slice scene | `scene/slice`, `content/slice-props`, `platform.takeTaps` | Nothing | TEMP (remove by Stage 2) |
| Rotation comparison | `SpriteList.method`, the methods in `render/layers/solid`, `tools/bake-rotations.py`, `assets/rotations.png`, `content/rotation-frames` | Nothing | TEMP (keep the winner, delete the rest when Stage 1 question 2 is decided) |
| What's in the frame | `scene/` -> `FrameScene` | `drawWorld` closures, `sunHeights`, fog redraw, `drawShadowLayer` | built for the slice |
| World <-> screen, pixel grid | `render/projection` | `VZ`, `VOX`, `VOY`, `worldT` | built: grid size and the formula. Stage 1 extends |
| Light and shadow | `render/lighting` (`LightingModel`) | `drawLight`, `drawLights`, sun passes, drop shadows, `!SUNNOW` fakes | planned |
| CPU light query | `LightingModel.query` | `lightAir`, `litAt`, `spotK` | planned |
| Light emitters | Light rows on archetypes and feedback rules | `lampsOn`, `tailLights`, `light()` in draw code, `flashAt` | planned |
| Heights | Atlas material, plus one shape table | `SUNH`, `LH`, `ZH`, `SUNB`, `SUNP`, `ROOF_Z` | planned |
| Parts of a thing | Rig | `partsOf`, `vehParts`, `treeParts`, `drawVehicle`, `drawWreck` | planned |
| Particles | Emitter | `part()`, `drawParts` switch, `M.brass`, `M.flings` | planned |
| Decals | Stain layer | `dgx`, `prints`, `fadeLayers`, `FADE_F` | planned |
| Ground | `render/layers/terrain` + map stamps | `paintGround`, PALS, `paintStamped` | planned |
| Maps | Editor JSON, one format | `buildMap` branches, `gmap` | planned |
| Fog of war | `render/fog` (`FogModel`) | `5b_fog.js` | planned |
| Smoke | `Field` in sim, `render/air` for looks | `gsf`, `drawSmokeField`, `SMK_*` | planned |
| Line tests | `sim.raycast(mask)` | `los`, `clearPath`, `aimRay`, `sees`, `barrelHits`, laser ray | planned |
| Effects on events | `feedback/` rule table | `shotFx`, `cannonFx`, `mgFx`, `netShotFx`, ... | planned |
| Sound | `audio/`, driven by `feedback/` | `sfx1`, `sfx2`, `engineUpdate`, `music` pairs | planned |
| Player and bot control | `Intent` | `newI`, per-device state objects | planned |
| Network sync | `net/` snapshot schema | `netSnap`, `netDecode` hand-packed pairs | planned |
| Prediction | Sim movement code, called by `net/` | `netLocalMove`, `netLocalDrive` | planned |
| Randomness | `core/rng`, separate streams for sim and cosmetics | `Math.random`, `rnd` | built |
| HUD, menus, touch | `ui/` on the batcher | `5_ui.js` HUD, `6_menus.js`, `#c` canvas, `surf2D` readback | planned |
| Settings and quality | `content/quality` + `platform` storage | `CFG` with migration hacks, `QUALITY` | planned |
| Frame rate and worst-frame measure | `app/frame-stats`, shown by `ui/` | `5f_rec.js` counters | built |
| Build number | `tools/build.mjs`, in the root `version.json` shared with `build.py` | `build.py` stamp | built |
| Rule checks | `tools/lint.mjs`, proven by `tests/lint.test.mjs` | Nothing | built |
| Null versions | One folder per seam, listed in `app/null-parts.ts` | Nothing | built |
| Dev and test scenes | `tools/` + `tests/`, data-driven scenes | `5d_dev.js`, `5g_test.js` | planned |
| Teams, houses | Houses are archetypes + map data | House code inside `5d_dev.js` | planned |

## Documents

| Job | Owner |
|---|---|
| Current status, next step, open questions, bug classes | `STATE.md` |
| Rules | `RULES.md` |
| Design as it is now | `ARCHITECTURE.md` |
| What was decided or rejected, and why | `DECISIONS.md` |
| Stages | `PLAN.md` |
| Old game inventory and parity | `MIGRATION.md` |
| The look | `VISION.md` |
