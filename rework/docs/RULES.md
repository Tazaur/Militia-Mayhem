# Rules

Each rule exists because the old game broke it. "Enforced by" says what catches a violation: a tool where possible, because a rule nothing checks gets forgotten after a context summary.

Changing a rule is allowed, but only by the user or with their OK, recorded in `DECISIONS.md` with the reason.

## How the old game ended up here

| What happened | Evidence in the old code | Rule |
|---|---|---|
| A migration shim became permanent | `0_gx.js` emulates Canvas2D on WebGL. `GL_PLAN.md` planned to "drop dead 2D paths"; it never happened | S2, S3 |
| Each pass re-walked entities with per-type code | Draw, sun heights, fog memory and drop shadows all differ | A3, C2 |
| Specific things were coded instead of classes | `.type === 'tank'` 50 times; lamps hard-coded per vehicle | C1, C2 |
| Drawing changed game state and emitted lights | `treeFade`, `jeepSteer`, `tracks`; `light()` inside `drawVehicle` | A1, A2 |
| Hand-managed GPU state leaked | Sprite sheet left on texture unit 11 read as tree crowns | A5 |
| The same bug class was patched over and over | Light ranking, shadow phantoms, texture unit bugs | P1 |
| A 170 KB log stood in for design documents | `CONTEXT.md` | P3, P4 |
| Unreadable code | Lines up to 744 characters; 75 globals of 1 to 3 letters | Q1, Q2 |
| Feature decisions outlived their use | `CFG.style === 'grit'` in 22 places; two audio systems | S2, S4 |

## Architecture

**A1. The sim knows nothing about presentation.** `sim/` never touches the DOM, GL, audio, canvas, the clock or `Math.random`. It emits events; other modules react.
*Enforced by: dependency lint; sim tests run in Node with no DOM.*

**A2. Rendering never changes game state.** The renderer gets read-only data and returns nothing to the sim. Visual-only state (track roll, sway, steering angle) lives in `scene/` or in the owning render module, and must not depend on how many views are drawn.
*Enforced by: `FrameScene` and sim views typed `readonly`; split-screen test frame hash.*

**A3. One frame list.** `scene/` turns game state into one `FrameScene` per view. Every pass reads it. No render pass may loop over entities.
*Enforced by: dependency lint (`render/` cannot import `sim/`).*

**A4. Modules talk only through contracts.** Contracts live in `contracts/`. A module may import `core/`, `contracts/`, and what the table in `ARCHITECTURE.md` allows. Never another module's internals.
*Enforced by: dependency lint.*

**A5. Only `gpu/` calls WebGL.** Passes declare their inputs and outputs by name. `gpu/` assigns texture units and rebinds them for each pass, so no state can leak between passes.
*Enforced by: lint bans `gl.` and `WebGL` outside `gpu/`.*

**A6. Every swappable module has a null version.** Lighting, fog, air, post, audio and transport each ship a trivial implementation (`lighting/unlit`, `audio/silent`, `net/loopback`). The game must run with any of them selected. This proves the seam is real.
*Enforced by: a test that boots a frame with every null version.*

**A7. Everything goes through `projection`.** No code other than `render/projection` may convert between world and screen, or assume the camera is straight down.
*Enforced by: review; the slice scene is tested at tilt 0 and at the chosen tilt until tilt is locked.*

**A8. The game does not know it is in a browser.** Everything browser-specific lives in `platform/` and `gpu/`.
*Enforced by: lint bans `window`, `document`, `navigator` and `localStorage` elsewhere.*

## Classes and content

**C1. Build the capability, then write the thing as data.** Before coding something specific, name the class it belongs to. If a class fits, add a data row. If one almost fits, add a capability to it. A new class needs an entry in `SYSTEMS.md`.

**C2. No type branching outside `content/`.** No `if (v.type === 'tank')`. Behaviour comes from data fields: `def.turret`, `def.seats`, `light.cone`.
*Enforced by: lint bans comparing `.type`, `.kind` or `.id` to string literals outside `content/`.*

**C3. One source per fact.** Each number lives in one place. A sprite's height comes from its painted art, or from one table for shapes without art.

**C4. Adding a new vehicle must not change engine code.** This is the test of the classes. If a helicopter needs engine code, that code must add a general capability that others can also use.

**C5. Everything has art or is a declared shape.** No hand-drawn `fillRect` game objects hidden in code.

## One system

**S1. Check `SYSTEMS.md` first.** If the job has an owner, extend it. If not, add the row before writing code.

**S2. Replace means delete.** A new system replacing an old one removes the old one by the end of the same stage. No "keep it just in case": git has it.

**S3. No compatibility layers.** Never write code that makes old code run unchanged. Migrate by rewriting against the new contract. A temporary path needs a row in `SYSTEMS.md` marked `TEMP` with its removal stage. An expired TEMP blocks the next stage.

**S4. No settings that fork the game.** Settings pick quality tiers of one system, not alternate systems. A look that nobody plays gets deleted.

## Lights and quality

**L1. Lights are real.** Glow comes from real lights and the glow channel, never from drawn gradients or additive blobs. Bloom may read the glow buffer because it comes from real light. Standing rule from the user.

**L2. Every feature has tiers.** Its best look on ULTRA and cheaper versions below, declared in one table by the module that owns it.

**L3. Budgets are written down and measured.** See `ARCHITECTURE.md`. A change that goes over budget is not finished. Design for phone and computer together: test both, never one with the other assumed.

**L4. User performance ideas are hypotheses.** Measure them. Skip or modify what does not help and say so with numbers. Cuts are options, not removals.

**L5. No per-frame allocation in hot paths.** `scene/` and `render/` use preallocated typed arrays. No closures per drawn thing. The old game's phone counter (`reference/start.jpg`) shows a 30.6 ms worst frame even at 60 fps.

## Process

**P1. A bug class seen twice gets redesigned.** First occurrence: fix it and name the class in the ledger in `STATE.md`. Second occurrence: stop patching and make that class impossible (a type, a contract, a lint rule). Big rewrites are allowed.

**P2. Find the root cause before fixing.** State it in the commit message. "Fixed flicker" is not a root cause. If you added a condition to make a symptom go away, you have not fixed it.

**P3. Documents are part of the work.** See the end-of-round list in `CLAUDE.md`. If code and document disagree, fix one of them in the same round.

**P4. Documents hold current truth, not history.** `ARCHITECTURE.md` and `SYSTEMS.md` describe now, and are edited in place. History goes in `DECISIONS.md`, as short entries, never in a build-by-build log.

**P5. Never rely on what you remember from the conversation.** After a summary, re-read. If a document does not say it, treat it as unknown and check the code or ask.

**P6. Tried and rejected ideas get recorded with numbers,** so they are not tried again by a session that forgot.

**P7. Small rounds for visual changes.** One visual change per round, compared against the last build. Show a screenshot and get an OK before deploying a visual redo. Standing rule from the user.

**P8. Deploy each round.** Build, test, push to main, so the user can play on the phone. Standing rule from the user. One build-number sequence that never restarts (old game was at 417 when this started).

**P9. Stay in scope, but fix what you find.** Standing authority: improve uniformity, optimization and looks without asking, and fix gaps. Anything that changes the design or a LOCKED decision goes to the user first.

## Code quality

**Q1. Lines fit in 120 columns.** One statement per line. Enforced by the formatter.
*Do not imitate the old code's style, even in copied logic.*

**Q2. Names say what they are.** `headlight`, not `hl`. Short names only for local maths (`x`, `dx`, `i`). Typed structures, not `{a,u,w,t,m}`.

**Q3. Files stay small and single-purpose.** Over about 400 lines means split it. A file's first comment says what it owns.

**Q4. Comments say why.** Tuned numbers say what they were tuned for.

**Q5. TypeScript strict mode. No `any` across a module boundary.**

**Q6. Tests prove behaviour at the seams.** Sim: replay hash tests. Render: `scene` screenshots and GPU benches. Architecture: the lint rules and the null-version boot test. Run only the tests that the change affects.
