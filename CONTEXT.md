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
- `atlas_pack.py` — the atlas tool. Repacks atlas.png/json from the current atlas pixel-for-pixel (no resampling), keeping only what the game draws, one row group per family (vehicles, effects, soldiers, weapon icons, sandbags). Soldier bases + shadows come from `art/art3/sheet.png`, MG / dead turret / sandbags from mounts.py. Idempotent.
- `build_atlas.py` — legacy full slice of the original uploads (old format: baked colour variants, classic soldiers, 12 turret frames). A current Pillow changes pixels, so avoid it; if ever needed, run it and then `atlas_pack.py` to convert.
- `harness.js` — Node harness that runs the built game headless with stubbed canvas/pads. Run tests from repo root: `node tests/t5.js` (all maps, bots), `t6` (seats), `t7` (sandbag cover), `t12` (menu→lobby→deploy→death cam flow), `t13` (wreck cover). All should end `errs 0`.
- `tests/net/` — Playwright two-browser tests (Chromium at `/opt/pw-browsers/...`, playwright at `/opt/npm-tools/node_modules/playwright`):
  - (stale since the ntfy switch: `t16.js`/`sigserver.js` still emulate PeerJS) `t16.js` direct WebRTC play from `index.html` via the local signalling stand-in `sigserver.js` (`node tests/net/sigserver.js &` first; uses `ws` from /opt/npm-tools).
  - Pages must be in separate browser contexts (same-context background pages get throttled); messages are relayed through Playwright.

## Online play design (src/5c_net.js)
- Host-authoritative. Host runs the real sim; remote players are `PLAYERS` entries with `dev.type === 'net'`. `LOCALS()` = non-net players (only they get views/HUD/sound/rumble).
- Transport A (default everywhere): WebRTC data channel (unordered, no retransmits). Signalling via ntfy.sh pub/sub (WebSocket subscribe to `mm1-<id>`, HTTP POST to publish; CORS open, no account). Host id `militiamayhem-<code>`; joiner id random. Non-trickle: each side waits up to 2.5 s for ICE gathering and sends one OFFER/ANSWER with candidates embedded; late candidates go as CANDIDATE messages. Host sends ACK on OFFER (no ACK in 8 s = E201 no game). ICE: Google + Cloudflare STUN only, **no TURN**.
- Oct 2026 findings: PeerJS public server (0.peerjs.com) accepts connections but relays nothing; PeerJS TURN (eu-0/us-0.turn.peerjs.com) and openrelay.metered.ca no longer resolve in DNS. A TURN relay now needs a free account (e.g. Metered.ca / ExpressTURN static credentials in `P2P_ICE`).
- Error codes: `NET_E` table in 5c_net.js (1xx matchmaking, 2xx host lookup, 3xx network path/ICE, 4xx data channel, 5xx lobby, 6xx lost host, 7xx WebRTC error). 
etFail(code)` shows a persistent panel with a trace (candidate counts H/S/R per side, mDNS, ICE/gather/link state, relay status, build, browser). Joiners see live step progress in the lobby; the host gets a toast with code + trace for failed joins. `p2pRoom()` mimics the room API (presence/onPeers/leave); state resent every 250 ms, links dropped after 10 s silence. Test overrides: `window.__MM_SIG`, `window.__MM_ICE`.
- Transport B (claude.ai artifact room) was removed in build 63: online play is direct WebRTC only, found through the public game finder.
- Host → clients: presence `{L: lobby info, g: snapshot}` ~20 Hz. Snapshot (`netSnap`) packs soldiers/vehicles/projectiles/items/crates/wrecks/flags/stats as base-64 digit strings, a per-remote-player private block (hp, ammo, cooldowns, messages), and a 0.7 s window of id'd events (explosions, kills, feed, toasts, destroyed statics, whitelisted sounds, smoke pops, per-player pops/sounds). Kept < ~3.9 KB (≈2.2 KB with 22 soldiers).
- Clients: render others 110 ms behind (interpolate), own soldier ~20 ms behind with smoothing and instant local aim; replay events on that timeline; cosmetic tracers from shot counters; local footprints/treads/particles. Input sent as continuous state + edge counters; deploy requests carry loadout + spawn option name.
- Lobby: host's normal lobby; joiners pick colour/team/ready; host starts. No joining mid-match; a leaver's soldier becomes a bot. Max 4 humans total.
- Names: entered before hosting and after typing a code (keypad works with keyboard/pad/touch), saved in localStorage (`store` key `name`), sent in join presence, used as soldier names.

## Status / open issues (as of handover)
- Two-browser tests pass locally (WebRTC from file://, and the mocked room). NOT yet proven between real devices.
- User's real test (PC host, iPhone join, same Wi-Fi) failed because the phone had no working route: iOS Safari won't run a local HTML file; the claude.ai artifact view reported no WebRTC in Safari. Fix in progress: host on GitHub Pages and retest from `https://tazaur.github.io/Militia-Mayhem/` in Safari.
- If it still fails on the same Wi-Fi: ask for the exact message ("NO GAME WITH CODE …" = matchmaking/ID problem; "COULD NOT CONNECT …" = ICE/NAT problem), and test phone on cellular. Likely next step then: a reliable TURN relay (e.g. Metered.ca free tier credentials in `P2P_ICE`) — the "paid relay" was explicitly put on the backburner by the user.
- The "can't play online" screen shows a diagnostic line (WEBRTC / WEBSOCKET).
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
- Shoving: vehicleCollide shares overlap with other vehicles and wrecks by mass (tank 5, jeep 1.4, wreck = 1.6x its vehicle; nests immovable), turns what it hits on off-centre contact (shove()), and slows the pusher by 5% x its share per step. Measured from rest over 3 s: jeep pushes jeep 54 px/s, tank 17, tank wreck 11; tank pushes jeep 53, tank 24, tank wreck 16. Wrecks are kept out of buildings and mark the bot nav dirty every 30 px moved. tests/t18_push.js.
  - Online: a joiner's local shove moves the other thing only on their screen (o.po, shrinks as the host's picture catches up, netPushOff); the host replaying a joiner's driving (vehicleCollide auth) gives the hit thing the whole overlap. Client wrecks are kept between slow updates and glide (netWrecksSync/netWrecksStep). pw/push.js: 0 corrections, no hitches.

## QoL / lobby round (build 50)
- Seats online: leaving the driver's seat eases the vehicle from our own (ahead) copy back to the host's picture (v.vo, decays over ~0.3 s) instead of jumping; joiners glide between seats (seatFrom/seatT set in the netApplySnaps soldier loop; the own seatT counts down locally and only resyncs to pv[19] on a >0.15 s disagreement). pw/flow.js seatswap: back-jump 32.7 px -> 1.7 px.
- Crash damage between vehicles only on a new contact (v.tch map, 0.4 s) and only from the closing speed along the contact normal, so pushing does no damage. Vehicle HP x1.5 (tank 1350, jeep 390).
- Tank doors: driver at the back [-76,0], gunner either side (anchor + `alts`), riders at the rear corners. nearAnchor/seatAnchor pick the nearest door (enter, bot walk-up, seat hint); exits try every door. tests/t19_tank.js.
- Nest bots: inNestArc() filters targets/firing to the nest's arc. tests/t20_nest.js.
- Engineer gadget is a wrench now (id stays 'torch'; ratchet sfx, cranking wrench in hand, few sparks).
- Fullscreen: isFS()/toggleFullscreen() (webkit fallbacks); icon on the main menu and pause screen, settings row. Host pause shows the game code. Touch HUD has a scoreboard toggle (TOUCH.scoreOn). A cached name skips the name step (✎ on the online menu changes it).
- Mid-match join (lobby row JOIN MID-MATCH, CFG.midjoin, default on; L.mj, cfg[9]): netHostSee -> netMidJoin takes over a bot (dead one first, side with fewer humans; appends a soldier if no bot) and the joiner deploys. netRoster() rebuilds NET.roster/names; joiners apply roster changes in netRosterSync (from netSlowApply, now run at the top of netDecode).
- Reconnect: each tab has NET.cid (sessionStorage) sent as j.id. netBotify remembers NET.left[cid] = soldier index; a returning cid gets that soldier back even with mid-join off (and a new link from a known cid retires the old one). netFail sets err.re for joiners who were in; the error panel shows RECONNECT / CLOSE (netReconnect).
- Back to lobby: couldn't reproduce peers dropping (pw/flow.js lobby, lobby2 pass); hardened anyway: NET.doneMatch ignores snapshots of a finished match.
- Server list: hosts POST {c,n,st,md,mp,nm,mj} to topic mm1-list (netListPub: on change at most every 20 s, else every 3 min; {c,gone} on shutdown or when hidden). The online menu subscribes with since=10m (netListWatch while state === 'netmenu'), netAllHosts merges with claude.ai room hosts, entries older than 400 s drop. Lobby row SERVER LIST shown/hidden (CFG.pub, cfg[10]).
- Harness: pw/flow.js <html> lobby|lobby2|midjoin|reconnect|third|list|seatswap (MJ=0 turns mid-join off). mockntfy now replays history on since= and stamps time.

## Feedback round (builds 51-52)
- Soldiers vs vehicles: pushOutVeh() pushes a soldier on foot out of the hull box (T.hl x T.hw; nests: the circle), host (updateVehicle, now for nests too) and joiner (netLocalMove). The old per-circle push stopped at the first overlapping circle and shoved you into the next one: a persistent walk reached the hull centre. tests/t21_phase.js (16 directions, standing/prone, against a wall).
- Art: art/art4/mounts.png → mounts.py cuts mg / mg_f (firing) / mg_dead / tur_dead, plus bagarc0-2 (used by atlas_pack.py).
- drawMG() draws every mounted MG (nest, tank, jeep) over its gunner; wrecks show tur_dead and mg_dead. Nests draw before tanks/jeeps so turrets stay on top.
- Sandbag crescents: the sheet cells are 171 px apart; the old 196 px crop clipped the intact frame to 120 px and squashed it into a square (1.6x too wide). mounts.bag_frames re-cuts all three (aligned on the intact one) and recomputes bagPts in atlas_extra.json.
- VISION (line of sight) is a match option now: lobby row 'fog', L.cfg[11], match header h[10] → M.cfg.fog; fogViews reads M.cfg.fog only. Removed from Settings.
- Hit markers: hurtVehicle sets src.hitV; vehicles/nests draw four inward right-angle chevrons instead of the diagonal ticks. Online: pv[17] = hitT*100 + 100 when hitV.
- Menus: no bottom hint bars. button({key: [action, dev], keyAt}) / iconButton(..., key, keyAt) / keyTag() pin the key or pad button on the control itself (inside its right end, or left/right/below/above). Lobby slots use that player's own device. Pad LB/RB draw as bumper shapes. New binds prev/next (LB/Q, RB/E), go (START/P), del.
- Lobby fix: Esc on a keyboard is both pause and back; the pause branch used to ready up and start the battle. Now pause only starts when it isn't also back (keyboard start = P).
- Equipment HUD: stance icon removed.
- Tests navigate the lobby with G.MATCH_ROWS.length downs (the row count changed).

## Feedback round (build 53)
- destroyVehicle: crew captured before kill, so a crewed jeep/tank/nest scores and never shows "EMPTY … DESTROYED" (tests/t22_vkill.js).
- Audio: AU.sfx → AU.muf (lowpass) → master; audioTick() drops it to 520 Hz in menus/settings/pause/demo. UI sounds (UISFX) go via AU.ui, never muffled.
- Sniper laser end dot is a red radial gradient. Snow: 5 layers with strong parallax (k 1.3–2.3) and fades to 50% while the camera moves (SNOWCAM).
- Net menu: indexes 0 host, 1 join code, 2 REFRESH (X / R), 3+ games; right arrow walks into the list. netListRefresh() runs on open. netAllHosts only hides your own game while hosting (a joiner kept NET.code after leaving, which hid that game).
- Online text is plain language (NET_E, join steps, toasts); error codes + trace lines stay, under "TECHNICAL DETAILS".
- Duplicate names: host-side dupName(p, raw) by join order → "Also X", "X III", "Another X", "X (but cooler)", "X’s 3rd cousin"…
- Settings: SET_TABS (GRAPHICS, DISPLAY, AUDIO, CONTROLS) as a tab row under the title; LB/RB or Q/E cycle.
- (build 54) MGs draw under their gunner and sit 4 px forward along the aim (mgPos). Gunners use the 'sit' pose. The nest gunner orbits the gun pivot (seatLocal) so they turn with it. Inactive vehicles still call engineUpdate (a wreck's engine used to hum at full volume until respawn). bag_frames zeroes rows from the narrowest row after y=180, so the next crescent on the sheet no longer leaks into bagarc0.

## Atlas without baked colours (build 55)
- Atlas ships ONE soldier per pose (`sol_<pose>`: stand nogun rpg sit dead leg0-2; dark green, pure-white armband) + `nsh_<pose>` shadows. At load, buildTeamSprites() (1_core.js) copies each pose per colour below the shipped atlas with white → CHEX_C[colour], into the runtime canvas BASE; ATLAS['sol_<pose>_<colour>'] slots are registered at script start so lookups work before load. Grit atlas is built from BASE. Use BASE (not IMG) to draw atlas sprites outside spr().
- Turret stripe `bar` and jeep emblem `decal` ship white; tinted(name, colour) maps their grey levels to highlight / colour / shade / tinted metal (colour scaled to full brightness), cached per colour + style.
- Tank turret: `tur` (body + mantlet) and `tur_gun` (cannon, pivot left of the sprite); the cannon is drawn under the body, slid back recoil*33 px (was tur0-11 frames).
- Capture ring is drawn in buildRings() (dark band r 42.6-63.3 at 0.59 alpha, 2 px gaps on the axes, tinted per owner).
- Removed: classic soldiers + the SOLDIER ART setting (CFG.soldiers ignored), full-colour / covert sets, all baked colour variants, keyboard / controller sprites, gore / blood / emblem / ring sprites, orphaned old sandbags. Atlas 640x852 (284 KB) → 384x529 (117 KB); index.html 853 KB → 620 KB.
- HUD icons from art/art4/icons.png (32 px cells, now 96x64) → atlas `ic_enter`, `ic_exit`, `ic_wheel`, `ic_horn`, plus shaded `ic_frag` / `ic_smoke` (SHADED_IC: drawn as painted, untinted, k = s/30). icon(kind) draws them when ATLAS['ic_'+kind] exists: outline kept, white fill painted in the requested colour (artIcon cache), scaled s/26. Enter prompts use 'enter'; driver seat chips and swapping to the driver seat use 'wheel'; other seats keep the vector 'seat'.

## Co-op survival, team colours, pause audio (build 59+)
- atlas.png is the source of truth: atlas_pack.py copies every sprite already in atlas.json pixel-for-pixel and only reads source art for sprites the atlas lacks. Hand-edit atlas.png freely, then `python atlas_pack.py` (repack) and `python atlas_pack.py --sync` (writes icon / mg / mg_f / mg_dead / tur_dead edits back to art/art4/icons.png + mounts.png).
- Colours (6_menus.js): p.pc = the player's own pick. syncLobbyColors() runs every host/local lobby frame: team modes → everyone wears lobbyTeamCols()[team] (LOBBY.tcol, default = the team's first player's pc, never equal to the other team; classic = blue/red, arrows hidden); other modes → own pc, deduped by id. cycleColor → nextColor; host applies via applyColor. Clients send a one-shot pick (NET.want.c + counter cn). newMatch / netMidJoin give humans the team colour.
- Nameplates: 8 px at 0.5 alpha.
- Pause: audioTick fades AU.sfx to 0 while a non-demo match is paused (or settings opened from pause); UI sounds stay on AU.ui.
- CO-OP SURVIVAL (MODES[4], coop: true, team: false): humans on team 0 with their own colours, mhp 200. A fixed pool of 24 team-1 bots (respawnT 1e9) is spawned by updateWaves (3_sim.js): 8 s lead-in, waveSize = (5+3n)·(1+0.5·(humans−1)), concurrency 4+2n(+2/extra human), spawns at spots >520 px from players. WAVE_GUNS: pistols → mp/smg → ak/ar → lmg/dmr → hmg/sniper; rpg secondary from wave 5; nades from wave 3; vehicles from wave 6; M.skill sharpens to wave 10. Limit row = WAVES 10/20/ENDLESS; bots row hidden.
- Down instead of dead (goDown): s.down with s.alive still true, immune, not targeted, bullets pass; a teammate within 28 px for 3 s revives at 50 % (downTick); 30 s bleed-out → kill(). No respawn mid-wave (canDeploy() = wave break); waveCleared revives / heals everyone and lets the dead deploy; startWave force-spawns anyone still on the deploy screen. All humans down/dead → endMatch(1) ("WIPED OUT ON WAVE n").
- Net: snapshot g.WV = [wave, left, brk·10], g.D = [[sol index, bleed s, rev %]] for downed soldiers; the client sets s.down / M.wv from them and stops local input while down.
- Tests: tests/t23_surv.js (team colours + survival). Browser flow: scratchpad pw/flow.js has a 'coop' scenario.

## Build 63
- Forced landscape: on a touch device held upright, resize() sets ROT and turns the canvas 90° with CSS (W/H swapped, SAFE remapped); ptXY(e) maps pointer coords. The rotate-your-phone screen is gone.
- Fullscreen: Safari only allows it inside the tap, so fsGesture() runs from pointerdown (mouse) / pointerup (touch) on UIB entries with `fs: true`; FS_FN only toggles for keys/pads. fsOK() false (iPhone): icons hidden, setting reads SHARE › ADD TO HOME SCREEN.
- Touch sprint: button in the right cluster (at(196,182)), only while moving. Tap = lock; the lock keeps running in the last direction after the stick is let go (TOUCH.lockFree); a new stick touch ends it. The stick-rim auto sprint never fires while prone.
- Pause REDEPLOY (not co-op): redeploy(s) kills with deathT/respawnT 0. Joiners bump NET.rd in presence (`rd`); host compares p.rdN.
- Bodies stay 120 s then fade over 60 (pool still bakes at POOL_T); casings live in M.brass and fade over 15 s (BRASS_T).
- Minimap: enemies (incl. players and enemy-crewed vehicles) only when spotted, heard firing, or seen (fog on: LOS + not smoke within 700; fog off: 300).
- Nameplates hidden behind smoke/walls; smoke fog fully opaque in-cloud; no grenade icon in hand; kill feed right-aligned unless split; deploy screen has no name/skull.
- Bots driving with friendly fire on swerve/slow for teammates on foot ahead (4_ai driver block).
- tests/t24_redeploy.js (redeploy, body/casing timing). Browser: pw/phone.js (portrait phone: rotation, deploy, sprint lock), flow.js 'redeploy' scenario.
- Touch: a stick (move/fire/aim) belongs to the finger that grabbed it until it lifts; extra touches on that side become role 'stray' and are ignored. lostpointercapture also releases a touch.

## Build 65: dev mode (src/5d_dev.js)
- Main menu DEV MODE button (focus 3; down from the cards). `startDev` → `newMatch({...CFG, dev:true, mode:1, bots:0, ...})`, `M.dev`. Local only (refused while networked).
- World size is now variable: `WW/WH` are `let`; `setWorld(w,h)` (2_maps) resizes ground/prints/decals and the nav grid (`NGW/NGH/ASG/ASF/ASS` are `let`). newMatch calls it every match (3000x2000 normally, 48x32 tiles of `TILE=24` in dev).
- Tile yard: `MAP.tiled = {cols, rows, own, rubble, secs, blds}`. A building is a list of sections on the grid; each live section's rect `sec.b` sits in `MAP.buildings`, so collision/bullets/LOS/fog/nav need no changes. `explosion()` ends with `devBlast` (structural multiplier by blast radius `STRUCT_K`: rocket ×1.6, shell ×2, frag ×0.35). At 0 HP `devCollapse` removes the rect, paints rubble tiles, redraws that building's roofs, sets `navDirty`, clears `M.fogMem`.
- `paintGround` hands off to `paintDevGround` when `MAP.tiled`; building shadows are skipped there.
- Dummies: `s.dummy` soldiers get `newI()` instead of `botControl`, respawn in place after 1.5 s (`devReviveDummy`), log TTK from the first hit at full HP (`devHit`/`devKill`).
- Panel (right; backquote toggles): spawn dummy/jeep/tank/nest at a range ahead of last aim, god mode, inf ammo, dummy respawn, line of sight, grid, sections, reset map, heal, log. Clicks are taken in pointerdown (`devClick`) so they never fire.
- Test: tests/t25_dev.js. t12 now checks down → DEV MODE.

## Build 69: grayscale fog; dev yard walls
- Fog: the remembered view (FOG_OUT) is desaturated with a `saturation` composite fill plus a light dim (was a dark tint). FOG_OUT gets the skirt and a backdrop first so the blend never paints over transparent pixels. Every map.
- Height-aware sight was tried in build 67 and removed: sight is occlude-or-not.
- Dev yard is now 48x32 tiles of `TILE=32` with a `SUB=16` wall grid (`MAP.tiled.cell`, `sc x sr` cells: C_OUT/C_FLOOR/C_WALL/C_WIN/C_RUB). The old section rects/roofs/materials are gone.
- `genHouse(R, maxW, maxH)`: rectangle or L outline; rooms by guillotine cuts (3-4 rooms, each >= ROOM_MIN 36 cells and >= 5 a side; the L's inner line is the first cut); one 2-cell door per cut (fewest doors that connect everything); front door (south if possible) and back door on the opposite side; 1-2 windows of 2-3 cells per room on outside walls. Openings keep 2 plain wall cells either side so no wall cell is left alone. Then random transpose/flips. Lots in `DEV_LOTS`; `DEV.seed` (NEW HOUSES button rerolls).
- Wall art: art/walls16.png (embedded by build.py as `WALLS_SRC`): corner, straight, window-middle / tee, cross / end. Piece and rotation come from which 4-neighbours are WALL (`WALL_BY_MASK`); windows don't count, so a wall beside a window draws an end; windows always use the middle piece. Painted into the ground canvas (`paintCell`).
- Sections: straight runs of wall/window cells (corners/junctions join their row's run), cut to <= 6 cells; each live one is a rect in `MAP.buildings`. Windows: `b.glass` - block movement, not sight/bullets (`los`, bullet traces, scope laser, net trace skip glass). `MAP.sight` = merged runs of standing wall, used by `visPoly` instead of `MAP.buildings` (dev only; normal maps don't set it).
- Collapse: cells -> rubble, neighbours repainted (walls next to the hole become ends), `devSight()`, `navDirty`, `M.fogMem = null`.

## Build 71: breakable glass, ramming, junction strength, touch AUTO fire
- Tile sheet (art/walls16.png) row 2 now: end, crumbled end (`CRUMB_T`, joins left like `end`), rubble (`RUB_T`). (2,1) is the broken window `WIN_BROKE`.
- Windows: intact (hp == mhp) draws `WIN_T`, anything less draws `WIN_BROKE`. `devGlass(sec)` takes 1 hp, once, from an intact window. It is called by a bullet/rocket/shell crossing it (3_sim updateProjectiles: `gl`/`gt`), a grenade passing it (updateNade no longer bounces off glass), and a soldier vaulting it (soldierCollide skips glass while `jumpT > 0.04`, and the landing extends while over glass).
- Sections: corners, tees and crosses (a wall cell with wall both across and along) are 1-cell sections with `junc` = number of joins, hp `JUNC_HP` 200/260/320. Straight sections: 30 + 20 per cell (max 150).
- Rubble cells draw `RUB_T`, rotated and flipped per cell by hash. A wall with ≤1 wall joins next to rubble draws the crumbled end, with its jagged side away from what still stands.
- `devDamage(sec, v, x, y)` is the single damage path (blasts, rams, glass). Collapse plays `sfx('crumble')` (rumble plus falling bricks), or 'glass', with 3 dust and 5 debris per cell.
- Ramming: `devRams(v)` runs at the top of vehicleCollide (host/offline only, before the push-back, so a fallen section lets the vehicle through). `RAM[type]` gives wall damage, self damage and speed kept, per unit of speed, with a 0.25 s cooldown per section.
  - Jeep at 200: about 90 to the wall, about 200 to itself, stops.
  - Tank at least 50 effective speed × 2.6: one hit drops a straight or a corner, a tee or cross takes two; about 12 to itself, keeps 80% of its speed.
- Touch AUTO (`TOUCH.auto`, saved as `autofire`): a button at the fire stick cycles ON / OFF / RNG. On foot only; vehicles always behave as ON.
  - ON: as before.
  - OFF: the drag only aims.
  - RNG: the drag aims and fires when `autoLined(s, a)` (4_ai) finds an enemy within the gun's reach (≤420 px) inside the cone `atan(r/d) + 0.04`, with los and no smoke.
  - In OFF and RNG, holding without a drag fires after 150 ms, so starting a drag doesn't shoot.

## Build 72-73: dev yard roofs
- Build 73: the roof covers the whole house, walls and windows included, and is drawn above them.
  - Wall cells are held up by their own section; window cells by the nearest wall.
  - Out of sight it is drawn solid from `ROOF_G`, a grey, dimmed copy painted alongside `ROOF_C`; applyFog no longer draws it.
  - The two roof sight polygons use `visPoly(..., pad = SUB)`, so the wall you're looking at shows.
- `devRoof()` (after devSections) gives every house floor cell `TL.roof[k] = 1` and `TL.rsec[k]` = the wall section holding it up.
  - It runs Dijkstra from every non-glass wall cell at once, with a random 1–2.6 cost per floor cell.
  - So each section's patch is connected to that section through its own tiles (no floating roof when a neighbour falls), and the borders are ragged rather than nearest-wall.
- When a wall section collapses, `devRoofFall(sec)` sets its tiles to `roof = 2`. paintCell then draws the rubble tile over that floor, and dust/debris spawn.
  - Soldiers whose cell is under the falling roof take 50–75% of their max hp (kind 'roof', wname 'ROOF'). Vehicles take 120 (jeep) or 40 (tank).
  - Logged as "ROOF n TILES DOWN".
- Drawing:
  - `ROOF_C` is a world-sized canvas of shingle tiles, with a dark edge where the roof meets anything but a wall.
  - applyFog draws it into the remembered view, so out of sight it is opaque and greyed.
  - `devDrawRoof` (drawWorld layer 4) draws it on a temp canvas, then uses destination-out with two sight polygons from the eye:
    - with glass see-through (`MAP.sight`), 0.7: 30% of the roof is left where it is seen through a window;
    - with glass blocking (`MAP.sightD`), a further 2/3: 10% is left where it is seen directly.
  - With vision off the same applies, and the roof is opaque elsewhere.
- `visPoly(ex, ey, R, walls)` now takes an optional wall list.
- Build 74: fog memory (`FOGK`) is full resolution with no smoothing on tiled maps (set when the memory is created), so walls in shadow stay crisp. Other maps keep half resolution.
- Build 75: in-sight roof opacity is by distance from the eye. `roofOp(d)`: 0 within 60 px, rising linearly to 0.35 at 120 px and staying there; +0.1 when seen through glass. It is a radial-gradient destination-out per eye: the glass-see-through polygon first (keep op + 0.1), then the direct polygon (keep op / (op + 0.1)). Out of sight it stays opaque grey.
- Build 79: roofs fall as a cascade.
  - `TL.rdist` is the hop count from the holding wall. `devRoofFall` queues tiles in `DEV.roofQ` at `rdist × ROOF_STEP` (0.07 s), and devTick lands them with `devRoofTile`.
  - Each landing tile spawns a real smoke-grenade cloud, `popSmoke(x, y, { tint: 'brown', op: 0.5, quiet: true })`. It blocks sight like grenade smoke, for 18 s.
  - Each landing tile also throws debris, plays 'crush', and calls `shakeAt(x, y, 2.5, 420)`. `shakeAt` is a new shared helper, which explosions and the tank cannon now use too.
  - Anyone under a landing tile is hurt once per fall.
  - RESET MAP clears smoke.
  - The rubble tile (sheet cell 2,2) was redrawn in the wall palette.
- Build 79: roofs fall as a cascade.
  - `TL.rdist` is the hop count from the holding wall. `devRoofFall` queues tiles in `DEV.roofQ` at `rdist × ROOF_STEP` (0.07 s), and devTick lands them with `devRoofTile`.
  - Each landing tile:
    - spawns a real smoke-grenade cloud, `popSmoke(x, y, { tint: 'brown', op: 0.5, quiet: true })`, which blocks sight like grenade smoke for 18 s;
    - throws debris and plays 'crush';
    - calls `shakeAt(x, y, 2.5, 420)`, a new shared helper that explosions and the tank cannon now use too;
    - hurts anyone under it, once per fall.
  - RESET MAP clears smoke. The rubble tile (sheet cell 2,2) was redrawn in the wall palette.
  - Fog memory covers roofs too. `fogMemory` keeps `m.rc`, a copy of `ROOF_G` that only updates inside the sight polygons; devDrawRoof uses it as the out-of-sight base.
  - devCollapse no longer resets `M.fogMem`, so collapses out of sight stay unseen until looked at.
- Build 80: roof fade constants are `ROOF_CAP = 0.7` (opacity at 120 px and beyond, was 0.35) and `ROOF_GLASS = 0.15` (extra through glass, was 0.1).
- Build 81: roof dust uses `popSmoke` options `T` (seconds; dust uses 6-15 random) and `shade` (0-3; `SPR.puffB` is now an array of [light, dark] puff pairs). Build 82 fix: `devDust(x, y)` is the collapse dust; falling roof tiles spawn it only on even row + even column, collapsing wall cells (devCollapse, not glass) on the (i+j) even checkerboard. `blastReaches(x, y, tx, ty, d)`: explosions skip soldier damage when a non-glass wall blocks the line (start nudged 4 px toward the target); the effects still play. `clearPath` (any building, glass included) gates `enterCandidate` seats by their door anchor. `barrelHits(v, a)` (pivot to `BARREL` = 96 px): the turret won't step into a wall unless it's already in one, and `fireCannon` with the barrel in a wall spawns the shell at the pivot so it hits that wall.

## Cleanup pass (build 84)
- Shared helpers (use these, don't re-inline): `localSols()`, `viewSols(vw)`, `posOf(s)` (1_core); `engineStop(v)` / `engineOff(v)` (classic + exp engine); `turretPivot(v)`; `vehCircles(v, out, pose)`; `toLocal` (wreckLocal removed); `BLAST` table for shell/rocket; `fullW(id)`, `refillRes(s, frac)`; `stepFx` (local + net walking fx); `pullTrigger(s)`; `bodyPose(s)`; `fadeLayers(dt)` (prints + decals); `WEATHERS`, `cfgPack/cfgUnpack`, `readRoster` (net); `rematch()`.
- Fixed: adjacent walls double-pushed vehicles; exiting a vehicle through a wall; shell/rocket splash on a miss now always hits vehicles; laser composite leak (red dot never drew, 'lighter' stayed on); shadow pose ignored handT.
- Lasers use segment tests instead of a 150-step march; A* uses a closed stamp array and caches f in the heap.
- Build 90: roof fade 0 within 100 px, rising to ROOF_CAP 0.7 at 200 px. Smoke clouds are cached: each cloud composites its puffs into a pooled 160 px canvas (`smokeCache`, redrawn every 0.3 s for the drift) and is drawn as one image. Grenade smoke picks a grey shade per puff (`SPR.puffs.grey/brown`). No smoke on the tactical map. Dev panel: drawn over touch controls; tap off closes it; pad View toggles it and, while open, it takes the pad (D-pad/stick move, ‹› adjusts range, A press, B close) — `devInputs`/`devPad`; pad/touch players start with it shut.
- Build 91: smoke grows with an ease-out over SMOKE_GROW = 4 s (r = R(1-(1-t/4)^2)). smokeRays(c): 8 rays (length R) from the centre at birth, every ~2 s and after 12 px of drift; the shortfalls push the centre away from walls (tx/ty, eased at 1.5/s, capped by the free distance that way); smokeCache pulls puffs back from walls (smokeFree interpolates the rays) and shrinks the base haze.
- Build 92: ONE line-of-sight rule (3_sim, above smokeStr): hard = MAP.sight walls (glass see-through; normal maps set MAP.sight = non-glass buildings) + wrecks; soft = smoke rings SMOKE_RINGS [[1,.1],[.83,.35],[.67,.65],[.5,1]] (fraction of c.r -> occlusion) x smokeStr(c) (fade in/out x op, dust = 0.5), clouds add to 1, thinned within SIGHT_NEAR [10,60] px of the eye. `sees()` (>= SIGHT_MIN 0.5) is used by bots (targets, vehicles, auto-fire, aim help), spotting, recon, names, minimap, fog memory. `los()` is now only blasts. drawSmokeFog paints the same rings (disc + tangent cone per ring, additive on the low-res mask) and the same near bubble, so the mask equals smokeOcc. With vision on, units in smoke are faded by the mask (smokeHides only culls at < 2 %); vision off: hidden under SIGHT_MIN. Trees and hay no longer block sight (still stop blasts). Wrecks are in visPoly and drawn into the remembered view (drawWreck).
- visPoly pad now goes straight in through the hit face (was along the ray: slanted cuts on walls/roofs). Setting GRAPHICS > OUT OF SIGHT (CFG.fogLook grey / partial / dark) via fogLook(); ROOF_G is ROOF_C + fogLook.
- Build 96: LoS rebuilt as layers (supersedes the ROOF_G / MAP.sightD / m.rc / ROOF_GLASS / devDrawRoof notes above).
  - Hard layer: `visPoly(ex, ey, box, walls, pad)` is exact: front faces only, rays a hair (VIS_EPS) either side of each corner + the view box corners, the box edges close it; a ray slipping past a corner adds the corner itself. Pad = SUB in the dev yard, 5 elsewhere (wrecks max 5). Live drawing is clipped to it.
  - Soft layers: `softOcc = min(1, smokeOcc + glassOcc)`; glassOcc = GLASS_OCC 0.25 per window (MAP.glass) the line crosses, either way. sees / sightK / smokeHides / fog memory use softOcc. `softMask(g, ex, ey, box)` paints the same on FOG_MASK (1/FOG_MS = 1/10 res): smoke rings, near-eye hole (SIGHT_NEAR [24, 96], smoke only), then each in-box window + its shadow behind. `drawSoftFog` (was drawSmokeFog) multiplies a second eye's mask in (FOG_MASK2) and overlays the remembered view through it.
  - Roofs are part of the remembered world: `roofView(vw, ...)` (5d) makes this frame's faded roof (ROOF_V, world space); applyFog stamps it into the memory with ground + decals; drawWorld draws it in sight (inside the clip, before the soft mask). Memory starts with ROOF_C (unseen houses roofed). fogLook applies at display only, so the setting needs no repaint.
  - Cloud sprites thin to SMOKE_KEEP 0.25 around this view's eyes (drawSmokes(vis, vw), SMOKE_HOLE temp), so the near-eye thinning shows.
- Build 100: no separate junction sections (JUNC_HP gone). Corners / tees / crosses go with the run along their row (wallRuns); a wall section left with one cell joins the smallest wall section next to it, so a section can bend: s.bs = its rects (each in MAP.buildings, b.sec = s), cx..ch = bounding box, s.n = cells, hp 30 + 20 n. secNear(sec, x, y) / secCells(sec, f) replace sec.b. The SECTIONS overlay outlines cell edges.
- Anti-crawl: drawWorld snaps VOX / VOY to whole device pixels; the soft fog mask sits on a world-fixed grid (offset floor + 1, fraction shifted on upscale, mask is 2 px bigger). Frame-to-frame shimmer moving 0.27 px/frame: ~8600 px -> ~190 (only the player sprite).
- visPoly points are ordered by their own angle (corner points by the exact corner angle).
- Build 102: dev panel SIGHT LINES (DEV.sightDbg, devSightDbg): per eye the faces visPoly tests (orange), rays to every vertex, the outline (cyan), hits (white) and exact corners (yellow, [x, y, 1]); visPoly returns P.faces.
- Build 104: visPoly rebuilt on the vertex rules: every corner of each solid shape (sight rects, wrecks) clipped to the view box (clipBox; where a wall crosses the box edge is a corner) + the box's 4 corners gets one ray; dropped if something is hit more than VIS_TOL (1 px) short of it; an outer corner (shape wholly to one side of the ray) extends past it to the next other-shape face or box edge (unless another shape touches it within 1 px); corner + extension are one unit in the angle sort (far point first when the shape lies further round). No pad on points: each outline edge lying on a wall face (geometric, 0.5 px) gets a strip pad px into the wall (P.strips); polyPath draws polygon + strips, all wound positive (pathPos). ~28-64 points per eye (was ~160-260).

## Build 105
- Wall strips go half way into the wall (pad SUB/2); corners where the outline turns between two faces get a square, so corner walls show in sight.
- Out of sight a tiled house is remembered as its whole roof (ROOF_C stamped into memory): no walls under it, no ROOF_NEAR/FAR fade. roofView is only the live, faded roof in sight.

## Build 106
- A strip's very ends (no wall face beyond) are cut at 45 degrees; an edge shorter than the pad gets a shallower strip, still 45.

## Build 107
- Wrecks no longer block sight (sightBlocked, visPoly). They still block movement, bullets and blasts (los), and are still drawn in the remembered view.

## Build 109
- Craters (scorch) burn into the ground canvas: permanent for the match (decals still fade).
- MAP.glass in the dev yard = intact window sections only (devSight reruns when a window cracks).
- raySeg counts a hit at a segment's very end (u slack 1e-6): rays through the seam of two touching sections no longer slip through and extend (bleed probe 3 -> 0 of 25k wedges). VIS_TOL 2.
- Grid smoke (experimental, dev GRID SMOKE): popSmoke(x, y, { grid }) -> gridSmoke: nearest-first fill of open 16 px tiles (8 ways, no diagonal squeeze), GS_N 90 tiles, GS_STEP 0.3 s per tile, density 1 -> GS_EDGE 0.15 by (d/dmax)^2. Sight: thickest tile crossed (gridOcc, DDA) in smokeOcc; fog mask per pixel from gridOcc (gridMask); drawn as 1 px/tile scaled x16 smoothed (8 px blend). Net 'sm' carries the grid flag.

## Build 111
- Grid smoke is one field (M.gsf, 16 px tiles), not per-cloud: emitters (grenade SMK_NADE 70, dust SMK_DUST 5 x op x T/10, brown) put SMK_EMIT 15 % of what's left into their tile per S-tick (10 Hz). Tiles >= SMK_MIN 0.5 bleed ~SMK_BLEED 35 % (random) to their 4 neighbours, a quarter each; walls/intact windows keep it (smokeSolid, by tile centre; dirty on devSight), cracked windows pass SMK_LEAK 25 %. Random ticks: 10 % chance a tick to lose 0.035. Overlaps just add. Grenade: blocks a line ~14 s, ~100-120 tiles, gone ~26 s.
- Sight: fieldOcc = sum of min(1, amount) x tiles crossed x SMK_K 0.5 (two thick tiles block), DDA in the box of smoky tiles; part of smokeOcc. Mask: fieldOcc per tile centre over the view box, a tile a pixel, smoothed (fieldMask). smokeAny() guards.
- Drawn as a tile-a-pixel image x16 smoothed (8 px blend): per-tile grey drifting on two slow waves, brown share mixed in, an offset dark shade under it, thinned near eyes. 40 dusts: 0.03 ms per S-tick, +0.6 ms draw.
- Soft fog now goes after roofs, fire and tree canopies (drawRoofs shared; also drawn into the remembered view), so smoke/windows fade everything in sight alike. In sight the remembered view is the world now + the dev yard's live roof (rv), so smoke in a room never shows the roof.

## Build 116
- Grid smoke spreads only downhill: a tile's neighbours lowest first, a share (~SMK_BLEED/4, random) goes only if it leaves that neighbour no higher than the tile after passing; no minimum, a tile goes when under SMK_DEL 0.01. Random-tick loss 0.01 (wider, thinner field: blocks ~14 s, gone ~20 s, ~280 tiles).
- Grid dust ignores op (full thickness, amount SMK_DUST x T/10).
- Smoke image and field mask clear and upload their whole canvas: smoothing read stale pixels past the drawn part (the line at the field's edge).

## Build 117
- Grid smoke tile alpha follows haze, 1 - e^(-SMK_VIS x amount) with SMK_VIS 3 (0.3: 60%, 0.5: 78%, 1: 95%), instead of linear in amount. LoS sums along the line, so thin-looking tiles used to block sight while the soft fog showed floor and sandbags through them.

## Build 118
- Grid smoke drawn as soft puffs (the clouds' sprites) instead of a tile image: one per checkerboard tile (an off tile gets one when no neighbour has smoke), radius SMK_PUFF 1.5 tiles + SMK_GROW 0.9 per tile of room (f.R, Chebyshev distance to the nearest solid tile less one, capped 3, built in smokeSolid), scaled 0.6-1 by thickness. Walls/intact windows cut out of the puff canvas; the radius rule keeps a puff short of the far side of any wall. Shade = the puff canvas blacked, 0.28 alpha, offset (4, 6). 40 dusts: drawWorld about 1.6 ms (0.5 without).

## Build 119
- Grid smoke: tile look f.V eases to its thickness at SMK_IN 2.5/s (reset to 0 when a tile turns on), so smoke swells in; puff alpha x (SMK_SMALL 0.5 .. 1) by radius / 3 tiles, so small wall-squeezed puffs are fainter.
- The field reaches SMK_OUT 16 tiles past every map edge (tile i covers world x from (i - SMK_OUT) x GS); fieldOcc shifts its inputs, smokeSolid / smokeEmit / drawSmokeField offset indices. fieldMask unchanged (world tiles).

## Build 126
- Grid smoke random tick loses SMK_RT_D 0.008 + SMK_RT_K 0.05 x min(amount, SMK_RT_A 1): one grenade in an 80-tile room lasts about 37 s (was 73), open air about 20 s (was 24, blocking 9 s).
- Stack cap: an emitter only adds while the 13x13 tiles round it (SMK_CAP_R 6) hold under SMK_CAP = 3 grenades (210); the rest is lost. 5 stacked = 3 stacked.
- Cracked windows are open tiles that take SMK_WIN 0.2 instead of SMK_BLEED 0.35 (SMK_LEAK gone, nothing limits flow out of them).

## Build 129
- Dev panel SMOKE VALUES (DEV.smokeDbg, devSmokeDbg): grid smoke tiles in view tinted by amount, the scale moving with the view: thinnest tile in view blue, thickest red, log between; amount printed when a tile is 18+ screen px.

## Build 134
- Grid smoke is the only smoke: the cloud smoke (M.smokes, rings, smokeRays, smokeCache, SMOKE_RINGS) and DEV.gridSmoke are gone. popSmoke(x, y) = grenade (net event 'sm'), popSmoke(x, y, { dust, T, quiet }) = dust. SMK_NADE 120 (open air blocks about 13 s, room about 48 s life); SMK_CAP = 3 x SMK_NADE.
- Dev panel backdrop height comes from last frame's layout (DEV.ph), so rows never hang off. SIGHT LINES + SMOKE VALUES share a row. SMOKE VALUES numbers always drawn, about 11 px on screen.
