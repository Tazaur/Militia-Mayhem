# Militia Mayhem — handover notes

Read this first. It is the working context from the previous Claude session (Oct 2026).

## The user
- Tazaur. Values directness; dislikes flattery and filler. Short, concrete replies.
- Wants every round of changes deployed (previously: republish the claude.ai artifact each round; now: push to GitHub Pages each round).
- Not a gun expert; supplies his own pixel art.

## What this is
A revival of the user's old top-down 2D combined-arms game: soldiers, tanks, jeeps, MG nests with seats; 1–4 local players
(split / shared screen) plus bots; controller, keyboard+mouse and touch (CoD-mobile style); conquest / TDM / KotH / FFA;
line-of-sight fog; smoke that blocks vision; wrecks as cover; experimental WebAudio sound; and (newest) online play.

Single self-contained HTML (canvas, no frameworks). Source is `src/*.js`, concatenated in filename order by `build.py`.

## Repo / deploy
- GitHub: https://github.com/Tazaur/Militia-Mayhem (public). Intended site: https://tazaur.github.io/Militia-Mayhem/
- GitHub Pages: Settings → Pages → Deploy from a branch → main → / (root). `index.html` at the repo root is the game.
- `python3 build.py` writes `index.html` and `combined-arms.html` (identical) and auto-bumps `version.json`
  (build number shown in the main menu and settings).
- Old claude.ai artifact: https://claude.ai/artifact/K4Cde2vTv5iTPRtS3VSsLV (declares the `room` capability).
  Optional to keep updating; the GitHub Pages site is now the main target.

## Files
- `src/1_core.js` — data (WPN, KITS, SLOTS, colours), canvas helpers, input (padState/kbState/touchState, TOUCH buttons), audio base, settings (CFG, store key `cfg3`), soldier art sets.
- `src/1b_audio2.js` — experimental sound set (SFX2, ear ringing, rocket loops, tank engine, heartbeat music).
- `src/2_maps.js` — seeded deterministic map builder (`mulberry`), decals/footprints canvases, corpses + blood pools, nav grid.
- `src/3_sim.js` — match, spawning, damage, kill, explosion (+`explosionFx`), weapons (+`shotFx/rocketFx/cannonFx/mgFx`), seats, vehicles (+`vehTrackFx/vehDamageFx`), items, projectiles, objectives, `psfx` (per-player sounds), `toast`.
- `src/4_ai.js` — bots, `humanInput`, deploy screen input, `updateMatch` + `fxTick` (cosmetics), cameras, `layoutViews`.
- `src/5_ui.js` — world render, HUD, deploy screen, touch controls, kill feed, minimap, scoreboard.
- `src/5a_icons.js` — vector icons, button badges/hint rows, tactical map.
- `src/5b_fog.js` — line-of-sight vision polygons, remembered world, smoke masks.
- `src/5c_net.js` — online play (see below).
- `src/6_menus.js` — main menu, network menu (host / join-with-code keypad / name entry), settings, lobby (local + online), pause, end screen, main loop (`update`, `runMatch`, `render`).
- `build_atlas.py` — slices the user's art (`art/orig/*` original uploads, `art/art3/sheet.png` soldier sheet, `art/art4/guns.png` weapon icons) into `atlas.png/atlas.json/atlas_extra.json`. Needs PIL, numpy, scipy. Only rerun when art changes; output is checked in.
- `harness.js` — Node harness that runs the built game headless with stubbed canvas/pads. Run tests from repo root: `node tests/t5.js` (all maps, bots), `t6` (seats), `t7` (sandbag cover), `t12` (menu→lobby→deploy→death cam flow), `t13` (wreck cover). All should end `errs 0`.
- `tests/net/` — Playwright two-browser tests (Chromium at `/opt/pw-browsers/...`, playwright at `/opt/npm-tools/node_modules/playwright`):
  - (stale since the ntfy switch: `t16.js`/`sigserver.js` still emulate PeerJS) `t16.js` direct WebRTC play from `index.html` via the local signalling stand-in `sigserver.js` (`node tests/net/sigserver.js &` first; uses `ws` from /opt/npm-tools).
  - `t14.js`/`t15.js` claude.ai-room mode via `mockroom.js`; they expect `python3 -m http.server 8765` serving the repo root.
  - Pages must be in separate browser contexts (same-context background pages get throttled); messages are relayed through Playwright.

## Online play design (src/5c_net.js)
- Host-authoritative. Host runs the real sim; remote players are `PLAYERS` entries with `dev.type === 'net'`. `LOCALS()` = non-net players (only they get views/HUD/sound/rumble).
- Transport A (default everywhere): WebRTC data channel (unordered, no retransmits). Signalling via ntfy.sh pub/sub (WebSocket subscribe to `mm1-<id>`, HTTP POST to publish; CORS open, no account). Host id `militiamayhem-<code>`; joiner id random. Non-trickle: each side waits up to 2.5 s for ICE gathering and sends one OFFER/ANSWER with candidates embedded; late candidates go as CANDIDATE messages. Host sends ACK on OFFER (no ACK in 8 s = E201 no game). ICE: Google + Cloudflare STUN only, **no TURN**.
- Oct 2026 findings: PeerJS public server (0.peerjs.com) accepts connections but relays nothing; PeerJS TURN (eu-0/us-0.turn.peerjs.com) and openrelay.metered.ca no longer resolve in DNS. A TURN relay now needs a free account (e.g. Metered.ca / ExpressTURN static credentials in `P2P_ICE`).
- Error codes: `NET_E` table in 5c_net.js (1xx matchmaking, 2xx host lookup, 3xx network path/ICE, 4xx data channel, 5xx lobby, 6xx lost host, 7xx WebRTC error). 
etFail(code)` shows a persistent panel with a trace (candidate counts H/S/R per side, mDNS, ICE/gather/link state, relay status, build, browser). Joiners see live step progress in the lobby; the host gets a toast with code + trace for failed joins. `p2pRoom()` mimics the room API (presence/onPeers/leave); state resent every 250 ms, links dropped after 10 s silence. Test overrides: `window.__MM_SIG`, `window.__MM_ICE`.
- Transport B (fallback, only inside a claude.ai artifact if matchmaking is unreachable): artifact `room` capability, named room `mm-<code>`. Games on B show "(CLAUDE.AI ONLY)" in the lobby title; A and B can't see each other.
- Host → clients: presence `{L: lobby info, g: snapshot}` ~20 Hz. Snapshot (`netSnap`) packs soldiers/vehicles/projectiles/items/crates/wrecks/flags/stats as base-64 digit strings, a per-remote-player private block (hp, ammo, cooldowns, messages), and a 0.7 s window of id'd events (explosions, kills, feed, toasts, destroyed statics, whitelisted sounds, smoke pops, per-player pops/sounds). Kept < ~3.9 KB (≈2.2 KB with 22 soldiers).
- Clients: render others 110 ms behind (interpolate), own soldier ~20 ms behind with smoothing and instant local aim; replay events on that timeline; cosmetic tracers from shot counters; local footprints/treads/particles. Input sent as continuous state + edge counters; deploy requests carry loadout + spawn option name.
- Lobby: host's normal lobby; joiners pick colour/team/ready; host starts. No joining mid-match; a leaver's soldier becomes a bot. Max 4 humans total.
- Names: entered before hosting and after typing a code (keypad works with keyboard/pad/touch), saved in localStorage (`store` key `name`), sent in join presence, used as soldier names.

## Status / open issues (as of handover)
- Two-browser tests pass locally (WebRTC from file://, and the mocked room). NOT yet proven between real devices.
- User's real test (PC host, iPhone join, same Wi-Fi) failed because the phone had no working route: iOS Safari won't run a local HTML file; the claude.ai artifact view reported no WebRTC in Safari. Fix in progress: host on GitHub Pages and retest from `https://tazaur.github.io/Militia-Mayhem/` in Safari.
- If it still fails on the same Wi-Fi: ask for the exact message ("NO GAME WITH CODE …" = matchmaking/ID problem; "COULD NOT CONNECT …" = ICE/NAT problem), and test phone on cellular. Likely next step then: a reliable TURN relay (e.g. Metered.ca free tier credentials in `P2P_ICE`) — the "paid relay" was explicitly put on the backburner by the user.
- The "can't play online" screen shows a diagnostic line (WEBRTC / WEBSOCKET / CLAUDE ROOM).
- Host tab must stay open/visible (hidden tabs throttle; a 40 ms interval keeps the sim going when hidden).
- Waiting on the user for more art ("other stuff"), plus weapon icons for shotgun, HMG, DMR.

## First steps for the new session
1. Confirm push access to Tazaur/Militia-Mayhem; commit this project (source + built `index.html`) to `main`.
2. Make sure GitHub Pages is on (main, root) and the site loads.
3. Ask the user to test PC ↔ phone through the Pages URL and report exact messages.

## Round: scaling / QWERTY / bot names / teams / boarding / skirts
- Menus draw on a virtual surface (min 860x480) scaled by UIS via uiScaled(); UIB entries carry draw scale `k`. HUD/touch are unscaled.
- Name/code entry is a QWERTY pad (padLayout/padNav); E.sel is a key string.
- Leaving joiners become `BOT (NAME)` (botSubName, NET.bn synced in snapshots).
- Host can tap a joiner's team chip; client team requests use counter `tn`.
- CFG.board (ENEMY BOARDING): players may board enemy vehicles; colour/team = lowest occupied seat.
- Map skirt: SKIRT=480 px playable ring outside WW x WH; outOfBounds() > OOB_T (5s) kills ('OUT OF BOUNDS'); empty vehicles wrecked after 10s. drawSkirt in 2_maps.js, countdown in drawViewHUD.
- tests/t17_oob.js covers the OOB kill. Lobby START row is now index 8 (tests press down 8x).

## Netcode round (transport + joiner-owned movement)
- p2pRoom messages are patches `{_q, ...changed keys}`; receiver merges per key and ignores older `_q`. Quiet links get a full resend every 240 ms. `presence(patch, per)` adds per-peer keys (each joiner's own `pv`).
- Host sends fast `g` (S, V, P, F, T, o, E) every 33 ms, about 650 B so it fits in one packet, and slow `gs` (h, ro, nm, bn, I, C, W, R, A) plus `L` every 240 ms as a separate message. Each event is sent in 4 snapshots.
- The client starts a match only once `gs` for that match id has arrived (netRecvSlow / netSlowApply).
- Joiner on foot owns its position: netLocalMove on the client; inputs carry `p:[x,y,vx,vy,jumpT]` and `ca` (correction ack).
  - The host (netInputHost → I.netPos → netAuthMove) follows the report unless it jumps more than 110 px or lands in a building, or host collision pushes it more than 6 px. Then netCorrect bumps s.netCorr (also on every spawn), sent as pv[23].
  - The client snaps to the host position when pv[23] changes (netOwnPos).
  - The host replays joiner reports from a timestamped buffer (p.repBuf, stamped `ct` + min clock gap) 60 ms behind (NET_REP_DELAY, netSample), so arrival jitter doesn't show.
- Lobby picks (colour/team/ready) are held locally for up to 2 s until the host echoes them (want.cT/tT/rT).
- Lag harness: scratchpad pw/lag.js, stress.js, tele.js, veh.js, clag.js (wraps RTCDataChannel.send for delay/jitter/loss per 1.1 KB packet).

## Vehicles + lag compensation round
- Joiner driver owns the vehicle like on foot: netLocalDrive runs vehDrive(v, mx, my, dt, local=true) (drive physics shared with the host's updateVehicle). Inputs carry `vp:[x,y,a,vx,vy,spd,av,tRel]` + `vca`.
  - Host: v.repBuf → netDriveRep / netAuthDrive (replay 60 ms behind, then vehicleCollide). Corrects (netCorrect(v), sent as pv[24]) on a jump > 160 px, inside a building, or a collision push > 14 px. Client snaps in netOwnVeh (NET.vauth / vcorr).
  - vehicleCollide local mode: crushables only slow, other vehicles push us, no damage/sfx (the host decides those).
- Passengers draw the vehicle from the smooth pair (110 ms behind) like everything else; the MG gunner's swivel answers locally (NET.mgV / mgRel).
- Lag compensation: the joiner sends `vt` (its view time on the host clock = now + NET.off - NET_DELAY). The host records ~0.6 s of positions (lagRecord, e.lh) each frame. netTagShots stamps a joiner's new projectiles with `rew = netNow() - vt` (max 400 ms) and moves their origin to the joiner's newest report. updateProjectiles tests soldiers/vehicles/exposed seats at lagAt(e, netNow() - rew). Splash from a joiner's rocket/shell is rewound too (EXP_REW set per projectile in updateProjectiles, read by explosion()). Grenades are not rewound.
- Harness: pw/vdrive.js (driver|passenger smoothness), pw/hit.js (hit rate: host vs joiner, leading aim). ntfy.sh caps anonymous use at 250 messages/day per IP (trace err "RATE LIMITED").
- Own-shot prediction: netPredictShot plays a joiner's rifle shot locally (same gates: mag from pv minus pending, reloadT, weapon rate); the host's echo (sh counter) is skipped while NET.pred > 0; unconfirmed predictions expire after 700 ms. Rockets are not predicted.
- Signalling relays: P2P_SIGS = ntfy.sh, ntfy.envs.net, ntfy.adminforge.de. Every browser listens on all; a send goes to the last relay that worked, moves on at once on refusal (429 = ntfy.sh's 250 messages/day/IP quota) and adds the next relay if one hasn't answered in 1.2 s. Messages carry `mid`, so repeats are dropped. window.__MM_SIG (string or array) overrides.
- Harness: pw/mockntfy.js <port> [429] is a local ntfy stand-in; run harness scripts with MMSIG='["http://localhost:8790"]' to avoid burning real quotas.
- Measured (cell profile, leading aim, 220 px): joiner 80% hits, host 85%, old build 11%. First own tracer 6-12 ms (was ~300 ms).
- Wrecks: stay fully solid for their lifetime (180 s), then fade over the last 2 s (alpha = t/2). Clients count w.t down locally between slow updates.
