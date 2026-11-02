# Plan

Rebuild in `rework/`. The old game stays playable at the repo root until Stage 10. Each stage ends with something playable or viewable on the phone at `/rework/`, deployed each round.

A stage is not done until its exit criteria pass, no expired `TEMP` remains in `SYSTEMS.md`, and the documents are current.

## Stage 0: Skeleton

Tooling and the walls between modules, before any game code.

- TypeScript, esbuild, formatter, one-file output at `rework/index.html`.
- All modules from `ARCHITECTURE.md` as folders; contracts written; null versions.
- Lint rules from `RULES.md` running: dependency table, GL ban, DOM ban, type-branch ban, line length.
- Build number continues the shared sequence.

**Exit:** a blank canvas with an FPS counter on the phone. A deliberately illegal import fails the lint.

## Stage 1: Vertical slice of the look (the proving ground)

A hand-written `FrameScene` with no sim: one street block using current art. Ground, one house with walls and a south face, a street lamp, a tree, a soldier, a tank, smoke. This answers the expensive questions while they are cheap to change.

Must answer, one small round each, with screenshots and phone numbers:

1. **Pixel grid and smooth camera:** does scrolling look smooth with whole-pixel snapping and sharp upscale?
2. **Rotation at 480:** how to rotate soldiers and tanks without shimmer? Compare nearest, an edge-aware shader, and pre-rotated frames baked in the atlas.
3. **Tilt:** compare 0, 0.25 and 0.35. Includes the wall face, what's hidden behind walls, and whether vehicles need the side extrusion.
4. **Depth buffer vs sort** for solids, including cost on the phone.
5. **Lighting v1** through the `LightingModel` seam: sun, lamps, wall faces. How many lights fit the budget? Test the per-light shadow texture idea.
6. **Vehicle zoom tween** (`DECISIONS.md` D11): how it looks on the grid, what level, and the cost at that level.
7. **Cinematic pass:** grade, bloom, baked contact shadow, lit smoke. Measured against `VISION.md`.

**Exit:** the user approves the look next to `reference/goal.png`, as far as current art allows. Budgets met on phone and laptop. Tilt, rotation and depth decisions LOCKED in `DECISIONS.md`. If budgets cannot be met here, this is where `DECISIONS.md` D3 (browser exit) is reconsidered.

## Stage 2: Sim core

Port with new structure, keeping tuned numbers from the old code (see `MIGRATION.md`).

- Fixed 60 Hz tick, seeded RNG, event output, `Intent` input, `raycast`.
- Soldiers: movement, stances, collision. Input module for keyboard, pad and touch (behaviour only).
- `scene/` draws the sim through the slice's renderer.

**Exit:** walk around a test map on the phone. Replay test passes: same inputs give the same state hash. Sim tests run in Node with no DOM.

## Stage 3: Content classes

Rig, Archetype, Light, Emitter, Projectile, Weapon, Occluder, Surface, Stain layer, as data.

- Weapons, vehicles with seats, damage, wrecks.
- Tank, jeep, nest, tree and props written purely as data.
- Feedback rule table (events -> emitter, light, shake; sound comes in Stage 6).

**Exit:** a test archetype is added with **zero engine code changes**. Lint shows no type branches outside `content/`.

## Stage 4: Full world

Terrain pages, stains, overhead layer with fades, fog of war with memory, smoke field and air, weather, destructible walls and roofs.

**Exit:** all named bench scenes run in budget on phone and laptop. The null-version boot test passes.

## Stage 5: Bots and modes

Bots through `Intent`, nav, modes (conquest, TDM, FFA, KOTH, co-op waves), tickets, objectives, spawn logic.

**Exit:** a bot match runs start to finish; the behaviour is judged against the old game by the user.

## Stage 6: Audio

Audio module, Sound Lab pointed at the new rule table. Events drive everything.

**Exit:** no effect plays except through a feedback rule.

## Stage 7: UI

HUD, menus, touch controls and settings on the batcher at full resolution. Quality table wired up. Minimap from map data, with no readback.

**Exit:** the old `#c` canvas has no equivalent. A full session is playable on phone and PC with no dev tools.

## Stage 8: Network

Snapshot schema drives encode and decode, binary over WebRTC, prediction calling sim movement, events via the same feedback table. Old signalling and game finder carried over.

**Exit:** play a phone vs PC match at parity with the old game's measured hit rates (see `MIGRATION.md`).

## Stage 9: Map creator

One map format. Convert the old maps once. Editor imports the same modules as the game, including buildings, objectives and spawns. Works on the phone.

**Exit:** a map made on the phone plays in the game. No generator code remains.

## Stage 10: Switch

Walk the parity list in `MIGRATION.md` with the user. Move the build to the root URL. Archive the old `src/` in git history only.

**Exit:** the user says so.

## Art

New assets can arrive at any point after Stage 1 approves the sizes. Art needs from tilt (wall faces, lamp posts) are listed in `VISION.md` once the tilt is locked.
