# Vision

**Goal: cinematic, performant, fun.** Judge visual work against these images:

- `reference/goal.png`: the target.
- `reference/start.jpg`: where the old game was on the user's phone. The shot is rotated: the phone was in landscape. Its `0.7 / 4.2 MS` is CPU update / render time, not GPU; `WORST 30.6 MS` is the worst frame.
- `reference/goal_at_480.png`: the target at the 480 px grid, proving the grid is big enough.

**Played every way:** touch, controller, and keyboard and mouse, on phone and computer. Each is a main way to play (`DECISIONS.md` D18).

## What makes the goal look cinematic

One reading of the picture, to be corrected by the user. Each item needs an owner, and its tier on lower presets.

| Quality | In the goal | In the start shot | Owner |
|---|---|---|---|
| Colour contrast | Warm amber lamps against cool dark ambient | Flat grey-olive, midtones only | `post` grade, environment colours |
| Light has shape | Pools, cones, shafts through doors, falloff into darkness | Mostly even daylight | `lighting`, Light rows, time of day |
| Contact and depth | Dark grounding at wall bases and under props | Hard drop shadow only | Baked AO in terrain and surfaces; lighting |
| Lit air | Smoke glows where lamps hit it; soft body | | `air` with `LightMaps` / `query` |
| Rim highlights | Bright edges on wall tops and sidewalks catching light | | Materials, highlight map |
| Sparks and embers | Drifting embers, bright tracers | | Emitter rows with Lights |
| Upright things | Lamp posts stand on screen: a slight tilt | Straight down | `projection`, art |
| Dense ground art | Cracks, moss, paint wear, litter, rubble | Sparse, tiled | New art, stamps, stain layers |
| Quiet HUD | Slim, crisp, nothing over the action | Busy, chunky, grainy | `ui` at full resolution |
| Clean image | No film grain | Visible grain | Remove |

Not everything in the goal is literal: the light wedges falling across the roof from the doorway may be an accident of the concept art. Confirm with the user before reproducing them.

## Rules for the look

- Real lights only. Bloom reads the glow buffer.
- The world is drawn on the grid: one game pixel, no mixed pixel sizes. Soft things (light, smoke) can be smooth, as in the goal.
- HUD is crisp at full resolution.

## Art needs (fill in once tilt is locked)

- Wall faces, door and window faces.
- Lamp posts and other tall props as upright art.
- Ground textures: the atlas has none, so the old game and the slice both use coded placeholders. This is the biggest gap to `goal.png`.
- Ground detail stamps.
- Sizes: 32 px tile. Soldier about 1 tile (about 34 px in the goal at 480). A house about 13 tiles wide.

## Art sizes from the tilt

Working tilt 0.25, not final (`DECISIONS.md` D16). A wall face is `0.25 x height` tall on screen: a 36 px wall shows a 9 px face, a 96 px building 24 px. Vehicles keep their painted tops, with no side art. Re-judge the tilt before ordering a lot of wall art.
