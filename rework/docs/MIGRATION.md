# Migration

What comes from the old game (`../src`, `../CONTEXT.md`). Rewrite the logic against the new contracts; carry the tuned numbers and the lessons. Never copy old code as is (rule S3, Q1). Read each old file fully when its stage starts, then update this list: it is an incomplete first pass.

`CONTEXT.md` is a history log and useful for finding why a number is what it is. Search it; do not imitate it.

## Bring

| What | From | Stage | Notes |
|---|---|---|---|
| Atlas PNG pair and table | `atlas.png`, `atlas_m.png`, `atlas_table.py`, `drop.py`, `atlas_pack.py` | 1 | Atlas owns its own config. Keep the drop workflow |
| Wall sheet | `art/walls16.png` | 1 | Needs faces for tilt |
| Height, reflect, glow idea | `5e_light.js` | 1 | The idea, new code |
| Sun colours by time of day | `sunTone`, match TIME setting | 1 | |
| Light tuning: lamp reach, flash sizes | `LAMP`, `POOL`, `SPLASH`, CONTEXT build notes | 1 | As Light rows |
| Vehicle numbers and seats | `VT` in `3_sim.js` | 3 | Already nearly data |
| Weapons, kits, modes, skill | `WPN`, `KITS`, `MODES`, `SKILL` in `1_core.js` | 3 | |
| Collision and push | `3_sim.js` | 2 | Tests t18, t21 show expected behaviour |
| Hit-circle numbers, stance rules | `3_sim.js` | 2 | |
| Smoke field behaviour | `updateSmokeField` | 4 | |
| Houses: generator, sections, breach, roof fall | `2d_house.js`, `5d_dev.js` | 4 | Currently hidden in the dev file |
| Visibility polygons | `5b_fog.js` | 4 | Also gameplay rules: sight must match the sim |
| Stamped ground | `2b_ground.js`, `maps/` | 4, 9 | The map format's base |
| Bot behaviour | `4_ai.js` | 5 | |
| Nav | `2_maps.js` | 5 | Fix: A* allocates per call |
| Event rules and Sound Lab | `1d_sev.js`, `1c_sfx.js`, `sound/` | 6 | Best-designed part of the old code. Generalise to feedback |
| Touch control layout | `5_ui.js`, `1_core.js` | 7 | Tuned on the phone |
| Recorder, FPS + GPU stages | `5f_rec.js`, `gpubench.js`, `perf/` | 1 onward | Stage 1 needs measurement from day one |
| Scene tester | `tools/scene.mjs`, `5g_test.js` | 1 | Same idea: scenes as data, screenshots, bench |
| Test ideas | `tests/`, `harness.js` | 2 | Scenarios carry over; new harness |
| Signalling, game finder, WebRTC transport | `5c_net.js` | 8 | Works; hard-won |
| Lag compensation | `lagRecord`, `lagAt` | 8 | Old measured: joiner 80% hits, host 85% at 220 px |
| Map editor | `mapedit/` | 9 | Phone-first |
| Height painter, field manual | `heightmap/`, `guide/` | later | Update references |

## Never bring

| What | Why |
|---|---|
| `0_gx.js` Canvas2D emulator | Replaced by `gpu/` |
| `?2d` path, WebGL1 path, non-MRT path | One renderer |
| Classic audio `sfx1` | One audio system |
| `paintGround`, PALS, `buildMap` branches | One map format |
| `CFG.style === 'grit'` | Superseded by the grade, unless the user says otherwise |
| Drop shadow layer, `!SUNNOW` fakes | Lighting tiers replace them |
| `drawLight`, `lightAir`, `litAt` | One `query` |
| `flashAt`, additive glow sprites | Real lights only |
| Three fade implementations | Stain layer |
| PIXEL LOCK | The grid replaces it |
| Vehicle zoom by type and speed (`updateCams`) | One tweened set level, `DECISIONS.md` D11 |
| `CFG` migration hacks | Fresh settings |
| Base-64 string snapshots | Binary schema |
| Probable bug at `2_maps.js:55`: reads `road.style`, roads set `rt` | Do not port |

## Parity list

The user walks this in Stage 10. Add to it whenever an old feature is noticed.

**Modes:** conquest, TDM, FFA, KOTH, co-op waves (downed, revive). **Options:** skill, friendly fire, weather, match time of day, team colours, bots, limits.

**Soldiers:** stances, jump, melee, swim, ADS, spot, kits and variants, secondary, grenades, smoke, mines, medkit, repair, ammo crates, pouches, flashlight.

**Vehicles:** tank (driver, gunner, riders, recoil, tracks), jeep (steering, wheels, seats), MG nest, overheating, lights, brake lights, wrecks, burning, ramming, roadkill.

**World:** destructible walls, roof collapse and fade, glass, felled trees, tree fade and sway, sandbags, hay, fences, crates, water, snow, rain, footprints, tyre marks, blood, scorch, bodies.

**Sight:** fog of war with memory, smoke blocks sight, glass softens sight, near-sight thinning, sniper laser.

**Multiplayer:** host and join, game finder, join by code and link, mid-join, reconnect, kick, background-tab host, local split-screen, shared-screen, pads, keyboard, touch, rumble.

**Camera:** look-ahead in the aim direction, scope and ADS zoom (`updateCams`), vehicle zoom as redesigned in D11, shake.

**UI:** deploy screen and spawn choice, death cam, kill feed, toasts, minimap, map overlay, scoreboard, end screen, settings, quality presets, FPS and GPU stages, dev mode.

**Tools:** map editor, Sound Lab, height painter, field manual, perf viewer, pipeline viewer, recorder.
