// LiveSight Phase 1: solo Squad Battle vs bots, plus a Shooting Range.
import * as THREE from 'three';
import { MATCH, QUALITY, detectQuality, HP_MAX, SHIELD_MAX, IS_IOS } from './config.js';
import { buildMap, makeSnow } from './map.js';
import { Character } from './character.js';
import { Input } from './input.js';
import { CameraRig } from './camera.js';
import { Combat, Loadout } from './combat.js';
import { BotBrain } from './bots.js';
import { Hud } from './hud.js';
import { lineOfSight } from './physics.js';
import { Audio } from './audio.js';
import { Layout } from './layout.js';
import { SIGHTS } from './guns.js';

const $ = (id) => document.getElementById(id);

// ---------- Settings (saved per phone) ----------
const settings = Object.assign(
  { sensitivity: 1, camera: 'adaptive', graphics: 'auto', autoSprint: false, showFps: false, holdProne: false },
  load('ls-settings')
);
function load(k) { try { return JSON.parse(localStorage.getItem(k)) || {}; } catch { return {}; } }
function save() { try { localStorage.setItem('ls-settings', JSON.stringify(settings)); } catch {} }

// ---------- Renderer & scene ----------
const canvas = $('view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xa9bccf);
scene.fog = new THREE.Fog(0xa9bccf, 30, 140);
const camera = new THREE.PerspectiveCamera(75, 1, 0.08, 400);
scene.add(camera);

const hemi = new THREE.HemisphereLight(0xdfeaff, 0x4a4f58, 1.6);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffffff, 1.5);
sun.position.set(-30, 50, 20);
sun.target.position.set(0, 0, 0);
scene.add(sun, sun.target);

let qualityName = settings.graphics === 'auto' ? detectQuality() : settings.graphics;
let quality = QUALITY[qualityName];

function applyQuality() {
  quality = QUALITY[qualityName];
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, quality.pixelRatio));
  renderer.shadowMap.enabled = quality.shadows;
  sun.castShadow = quality.shadows;
  if (quality.shadows) {
    sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, { left: -70, right: 70, top: 45, bottom: -45, near: 1, far: 140 });
    sun.shadow.camera.updateProjectionMatrix();
  }
  scene.fog.far = quality.drawDist;
  camera.far = quality.drawDist + 20;
  camera.updateProjectionMatrix();
  resize();
}

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);

// ---------- World ----------
const map = buildMap(scene, QUALITY.high);
const boxes = map.boxes;
let snowUpdate = null;
const audio = new Audio();
const combat = new Combat(scene, audio);
const rig = new CameraRig(camera);
rig.mode = settings.camera;
const hud = new Hud(boxes);
const input = new Input($('app'), settings);
const layout = new Layout(input, () => openSettings(game.running));

const BLUE_NAMES = ['Ada', 'Tunde', 'Kemi', 'Chidi'];
const RED_NAMES = ['Bayo', 'Ngozi', 'Femi', 'Zainab', 'Emeka'];

const player = new Character({ name: 'You', team: 'blue', isPlayer: true });
scene.add(player.model.root);
const playerLo = new Loadout(['ar_auto', 'smg_fast', 'pistol_fast']);

const game = {
  chars: [player],
  bots: [],
  boxes,
  mode: null,
  running: false,
  paused: false,
  score: { blue: 0, red: 0 },
  timeLeft: MATCH.timeLimit,
  heal: null,
  medkits: 2, cells: 2,
  botFire(bot, lo, eye, dir) {
    combat.tryFire(bot, lo, eye, dir, false, game.chars, boxes, gunMuzzle(bot.model.gun), onHit);
  },
};

function clearBots() {
  for (const b of game.bots) scene.remove(b.c.model.root);
  game.bots = [];
  game.chars = [player];
}

function addBot(name, team, opts) {
  const c = new Character({ name, team });
  scene.add(c.model.root);
  const lo = new Loadout([Math.random() < 0.5 ? 'ar_auto' : 'smg_fast']);
  const brain = new BotBrain(c, lo, opts);
  c.setGun(lo.gun.id);
  game.bots.push(brain);
  game.chars.push(c);
  return brain;
}

function spawn(c, idx) {
  const list = map.spawns[c.team];
  const [x, z] = list[(idx ?? Math.floor(Math.random() * list.length)) % list.length];
  c.spawnAt(x + (Math.random() - 0.5) * 2, z + (Math.random() - 0.5) * 2, c.team === 'blue' ? -Math.PI / 2 : Math.PI / 2, MATCH.spawnProtect);
}

// ---------- Matches ----------
function startMatch(mode) {
  game.mode = mode;
  clearBots();
  game.score = { blue: 0, red: 0 };
  game.timeLeft = MATCH.timeLimit;
  game.medkits = 2; game.cells = 2; game.heal = null;
  player.kills = player.deaths = player.damage = 0;
  game.firstBlood = false;
  game.chars.forEach((c) => { c.streak = 0; });
  killState.multi = 0; killState.lastT = -99;
  recoil.pending = recoil.yaw = recoil.applied = 0;
  if (mode === 'tdm') {
    BLUE_NAMES.forEach((n) => addBot(n, 'blue', { skill: 0.45 }));
    RED_NAMES.forEach((n) => addBot(n, 'red', { skill: 0.4 }));
    game.chars.forEach((c, i) => spawn(c, i));
  } else {
    // Shooting range: dummies standing, crouching and lying at different distances
    const spots = [[-40, -2, 'stand'], [-36, 2, 'crouch'], [-30, -1, 'stand'], [-22, 3, 'prone'], [-12, 0, 'stand'], [0, -2, 'crouch'], [8, 2, 'stand']];
    spots.forEach(([x, z, st], i) => {
      const b = addBot('Dummy ' + (i + 1), 'red', { dummy: true });
      b.c.spawnAt(x, z, Math.PI / 2, 0);
      b.c.setStance(st, boxes);
      b.home = { x, z, st };
    });
    player.spawnAt(-55, 0, -Math.PI / 2, 0);
  }
  playerLo.refill(); playerLo.cur = 0;
  equip();
  hud.clearNumbers();
  input.reset();
  input.enabled = true;
  game.running = true; game.paused = false;
  $('menu').classList.add('hidden'); $('end').classList.add('hidden'); $('settings').classList.add('hidden');
  $('hud').classList.remove('hidden');
  $('rotate').classList.add('active');
  hud.toast(mode === 'range' ? 'Shooting Range: dummies respawn, nothing shoots back' : 'Team Deathmatch: first to ' + MATCH.killTarget, 3);
}

function endMatch() {
  game.running = false;
  input.enabled = false;
  document.exitPointerLock?.();
  const won = game.score.blue > game.score.red, draw = game.score.blue === game.score.red;
  $('end-title').textContent = draw ? 'DRAW' : won ? 'VICTORY' : 'DEFEAT';
  $('end-score').textContent = `Blue ${game.score.blue} — ${game.score.red} Red`;
  const rows = [...game.chars].sort((a, b) => b.kills - a.kills || a.deaths - b.deaths);
  const mvp = rows[0];
  $('end-table').innerHTML = '<tr><th>Player</th><th>Kills</th><th>Deaths</th><th>Damage</th></tr>' +
    rows.map((c) => `<tr class="${c.team} ${c.isPlayer ? 'me' : ''}"><td>${c.name}${c === mvp ? ' ★ MVP' : ''}</td><td>${c.kills}</td><td>${c.deaths}</td><td>${Math.round(c.damage)}</td></tr>`).join('');
  $('hud').classList.add('hidden');
  $('end').classList.remove('hidden');
}

function onHit(shooter, res) {
  const t = res.hitChar;
  if (shooter === player) {
    t.markedT = MATCH.hitMarkTime;
    hud.hitmarker(res.killed ? 'kill' : res.head ? 'head' : 'body');
    hud.damageNumber(t, res.dmg, res.head);
    res.killed ? audio.kill() : audio.hit(res.head);
  }
  if (t === player) {
    audio.hurt();
    rig.shake = 0.06;
    const dx = shooter.pos.x - player.pos.x, dz = shooter.pos.z - player.pos.z;
    const ang = Math.atan2(-dx, -dz) - player.yaw;
    hud.damageFrom(-ang);
    game.heal = null; // getting hit cancels healing
  }
  const brain = game.bots.find((b) => b.c === t);
  if (brain) brain.onShot(shooter);
  if (res.killed) onKill(shooter, t, res.head);
}

const MULTI = ['', '', 'DOUBLE KILL', 'TRIPLE KILL', 'QUAD KILL', 'PENTA KILL'];
const SPREE = { 3: 'KILLING SPREE', 5: 'RAMPAGE', 7: 'UNSTOPPABLE', 10: 'LEGENDARY' };
const killState = { multi: 0, lastT: -99 };
const ordinal = (n) => n + (n % 100 >= 11 && n % 100 <= 13 ? 'TH' : ['TH', 'ST', 'ND', 'RD'][n % 10] || 'TH');

function onKill(killer, victim, head) {
  killer.kills++; victim.deaths++;
  victim.respawnT = game.mode === 'range' ? 1.5 : MATCH.respawn;
  const ended = victim.streak || 0;
  killer.streak = (killer.streak || 0) + 1;
  victim.streak = 0;
  const first = !game.firstBlood && game.mode === 'tdm';
  game.firstBlood = true;
  if (game.mode === 'tdm') {
    game.score[killer.team]++;
    if (game.score[killer.team] >= MATCH.killTarget) setTimeout(endMatch, 1200);
  }
  const cls = (c) => (c.isPlayer ? 'me' : c.team === 'blue' ? 'b' : 'r');
  hud.feed(`<span class="${cls(killer)}">${killer.name.toUpperCase()}</span><i>${head ? '◆' : '✕'}</i><span class="${cls(victim)}">${victim.name.toUpperCase()}</span>${first ? '<i>FIRST BLOOD</i>' : ''}`);

  if (killer === player) {
    const now = performance.now() / 1000;
    killState.multi = now - killState.lastT < 5 ? killState.multi + 1 : 1;
    killState.lastT = now;
    // Biggest event wins: multi-kill > first blood > shutdown > spree > plain elimination
    let title = 'ELIMINATED', tier = 1;
    if (killState.multi >= 2) { title = MULTI[Math.min(5, killState.multi)]; tier = killState.multi >= 3 ? 3 : 2; }
    else if (first) { title = 'FIRST BLOOD'; tier = 3; }
    else if (ended >= 3) { title = 'SHUTDOWN'; tier = 2; }
    else if (SPREE[player.streak]) { title = SPREE[player.streak]; tier = 2; }
    const sub = `${victim.name.toUpperCase()}${head ? ' · HEADSHOT' : ''} · ${ordinal(player.kills)} KILL`;
    hud.banner(title, sub, tier);
    audio.announce(tier);
  } else if (first) {
    hud.toast(`${killer.name} drew first blood`, 2);
  }
}

// ---------- Player actions ----------
const recoil = { pending: 0, yaw: 0, applied: 0 };
function playerUpdate(dt, inp) {
  const lo = playerLo;
  if (!player.alive) {
    player.respawnT -= dt;
    hud.center(`Respawning in ${Math.ceil(player.respawnT)}`);
    if (player.respawnT <= 0) { spawn(player); playerLo.refill(); hud.center(''); }
    player.syncModel(dt, false);
    return;
  }
  hud.center('');

  // Look
  const adsSens = inp.ads ? SIGHTS[lo.gun.id].adsSens : 1;
  player.yaw -= inp.lookX * adsSens;
  player.pitch -= inp.lookY * adsSens;
  // Ease queued recoil in, then pull part of it back down once you stop shooting
  const kick = recoil.pending * Math.min(1, dt * 30), kickYaw = recoil.yaw * Math.min(1, dt * 30);
  player.pitch += kick; recoil.pending -= kick; recoil.applied += kick;
  player.yaw += kickYaw; recoil.yaw -= kickYaw;
  if (!inp.fire) {
    const back = recoil.applied * Math.min(1, dt * 7) * 0.6;
    player.pitch -= back; recoil.applied -= back / 0.6;
  }
  player.pitch = Math.max(-1.45, Math.min(1.45, player.pitch));

  // Weapons
  const before = lo.cur;
  if (inp.swap) lo.swap();
  if (inp.w0) lo.swap(0);
  if (inp.w1) lo.swap(1);
  if (inp.w2) lo.swap(2);
  if (lo.cur !== before) equip();
  if (inp.reload && lo.reload()) audio.reload();
  if (inp.heal) startHeal();
  if (inp.ping) ping();

  const busy = game.heal !== null;
  const firing = inp.fire && !busy;
  if (!inp.fire) lo.triggerHeld = false;
  if (firing && inp.fire) game.heal = null;

  player.update(dt, {
    mx: inp.mx, my: inp.my, sprint: inp.sprint && !busy, jump: inp.jump, crouch: inp.crouch, prone: inp.prone,
    roll: inp.roll, ads: inp.ads, firing,
  }, boxes);
  lo.update(dt);

  // Crosshair turns red while it sits on an enemy
  hud.crosshairOn(aimedEnemy());

  if (firing && player.alive) {
    // Aim along the camera centre, then shoot from the eye toward that point
    const camDir = rig.dir;
    const origin = camera.position.clone();
    let aimDist = 200;
    // nearest wall along the crosshair
    for (const b of boxes) {
      const t = rayBoxQuick(origin, camDir, b, aimDist);
      if (t < aimDist) aimDist = t;
    }
    const aimPoint = origin.clone().addScaledVector(camDir, Math.max(aimDist, 2));
    const eye = player.eye();
    const dir = aimPoint.sub(eye).normalize();
    const muzzle = muzzlePos();
    const fired = combat.tryFire(player, lo, eye, dir, inp.ads, game.chars, boxes, muzzle, onHit);
    if (fired) {
      const g = lo.gun;
      // Recoil is queued and eased in over a few frames instead of snapping the view
      recoil.pending += g.recoil * (inp.ads ? 0.6 : 1) * Math.PI / 180;
      recoil.yaw += (Math.random() - 0.5) * g.recoil * 0.45 * Math.PI / 180;
      rig.recoilKick = 1;
    }
  }

  // Healing
  if (game.heal) {
    game.heal.t += dt;
    hud.progress(game.heal.t / game.heal.dur, game.heal.label);
    if (game.heal.t >= game.heal.dur) {
      if (game.heal.kind === 'med') player.hp = Math.min(HP_MAX, player.hp + 50);
      else player.shield = Math.min(SHIELD_MAX, player.shield + 25);
      game.heal = null;
    }
  } else hud.progress(null);

  hud.weapons(lo, SIGHTS[lo.gun.id].label);
  hud.healCount(game.medkits, game.cells);
  hud.stance(player, inp.ads);
  hud.sights(combat.spreadFor(player, lo, inp.ads), camera.fov, rig.scoped || 0, SIGHTS[lo.gun.id].type);
}

// Ping: marks the nearest enemy close to your crosshair (within 30 m, in view) for your team
let pingCd = 0;
function ping() {
  const now = performance.now();
  if (now < pingCd) return;
  pingCd = now + 1000;
  const eye = player.eye(), dir = rig.dir;
  let best = null, bestAng = 0.45; // about 25 degrees
  for (const c of game.chars) {
    if (!c.alive || c.team === player.team) continue;
    const chest = new THREE.Vector3(c.pos.x, c.pos.y + c.height * 0.6, c.pos.z);
    const to = chest.clone().sub(eye);
    const d = to.length();
    if (d > 30) continue;
    const ang = to.normalize().angleTo(dir);
    if (ang < bestAng && lineOfSight(boxes, eye, chest)) { best = c; bestAng = ang; }
  }
  if (best) { best.markedT = MATCH.hitMarkTime; hud.toast('Enemy spotted · ' + Math.round(best.pos.distanceTo(player.pos)) + ' m'); audio.tone(980, 0.09, 'triangle', 0.15); }
  else hud.toast('No enemy nearby', 1);
}

function startHeal() {
  if (game.heal) return;
  if (player.hp < HP_MAX && game.medkits > 0) { game.medkits--; game.heal = { kind: 'med', t: 0, dur: 3, label: 'Med kit +50 HP' }; }
  else if (player.shield < SHIELD_MAX && game.cells > 0) { game.cells--; game.heal = { kind: 'cell', t: 0, dur: 2, label: 'Shield cell +25' }; }
  else hud.toast(game.medkits + game.cells === 0 ? 'No heals left' : 'Already full');
}

const _m = new THREE.Vector3();
function gunMuzzle(gun) {
  if (!gun) return null;
  return gun.localToWorld(_m.set(0, 0.05, gun.userData.muzzleZ)).clone();
}
function muzzlePos() {
  if (rig.blend < 0.5) {
    const g = rig.viewmodel.children[0];
    camera.updateMatrixWorld();
    return g ? gunMuzzle(g) : camera.position.clone();
  }
  return gunMuzzle(player.model.gun);
}

function equip() {
  const id = playerLo.gun.id;
  rig.setGun(id);
  player.setGun(id);
}

function aimedEnemy() {
  const o = camera.position, d = rig.dir;
  let wall = 200;
  for (const b of boxes) { const t = rayBoxQuick(o, d, b, wall); if (t < wall) wall = t; }
  for (const c of game.chars) {
    if (!c.alive || c.team === player.team) continue;
    for (const hb of c.hitboxes()) if (rayBoxQuick(o, d, hb, wall) < wall) return true;
  }
  return false;
}

function rayBoxQuick(o, d, b, max) {
  let tmin = 0, tmax = max;
  for (const [oi, di, lo, hi] of [[o.x, d.x, b.min[0], b.max[0]], [o.y, d.y, b.min[1], b.max[1]], [o.z, d.z, b.min[2], b.max[2]]]) {
    if (Math.abs(di) < 1e-9) { if (oi < lo || oi > hi) return Infinity; continue; }
    let t1 = (lo - oi) / di, t2 = (hi - oi) / di;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
    if (tmin > tmax) return Infinity;
  }
  return tmin;
}

// ---------- Bots ----------
function botsUpdate(dt) {
  for (const b of game.bots) {
    const c = b.c;
    if (!c.alive) {
      c.respawnT -= dt;
      if (c.respawnT <= 0) {
        if (b.home) { c.spawnAt(b.home.x, b.home.z, Math.PI / 2, 0); c.setStance(b.home.st, boxes); }
        else { spawn(c); b.lo.refill(); b.pickLane(); b.target = null; }
      }
      c.update(dt, {}, boxes);
      continue;
    }
    const it = b.think(dt, game);
    if (!it.firing) b.lo.triggerHeld = false;
    c.update(dt, it, boxes);
    b.lo.update(dt);
  }
}

// ---------- Loop ----------
let last = performance.now();
let fpsAcc = 0, fpsFrames = 0, fpsShown = 60, lowFpsStreak = 0;

function frame(now) {
  requestAnimationFrame(frame);
  let dt = Math.min(0.05, (now - last) / 1000);
  last = now;

  if (game.running && !game.paused) {
    const inp = input.read();
    if (inp.camera) { settings.camera = rig.cycleMode(); save(); hud.toast('Camera: ' + { fps: 'First person', tps: 'Third person', adaptive: 'Adaptive' }[rig.mode]); }
    playerUpdate(dt, inp);
    botsUpdate(dt);
    combat.update(dt);
    const fp = rig.update(dt, player, boxes, inp.ads && player.alive, inp.fire && player.alive, playerLo.gun.adsFov);
    player.syncModel(dt, fp);
    for (const b of game.bots) b.c.syncModel(dt, false);
    if (snowUpdate) snowUpdate(dt);

    if (game.mode === 'tdm') {
      game.timeLeft -= dt;
      if (game.timeLeft <= 0) endMatch();
    }
    const alive = game.chars.filter((c) => c.alive).length;
    hud.score(game.score.blue, game.score.red, game.timeLeft, game.mode === 'tdm' ? `FIRST TO ${MATCH.killTarget}` : 'SHOOTING RANGE', game.timeLeft / MATCH.timeLimit, alive);
    hud.compass(player.yaw);
    hud.squad(game.chars.filter((c) => c.team === player.team && !c.isPlayer));
    hud.vitals(player.hp, player.shield);
    hud.camLabel(rig.mode);
    hud.minimap(player, game.chars);
    hud.updateNumbers(dt, camera);
    hud.update(dt);
  } else {
    // Slow orbit behind the menus
    const t = now / 1000;
    camera.position.set(Math.sin(t * 0.05) * 40, 22, Math.cos(t * 0.05) * 40);
    camera.lookAt(0, 2, 0);
  }

  renderer.render(scene, camera);

  // Frame rate watch: lower graphics automatically if the phone struggles
  fpsAcc += dt; fpsFrames++;
  if (fpsAcc >= 2) {
    fpsShown = Math.round(fpsFrames / fpsAcc);
    fpsAcc = 0; fpsFrames = 0;
    if (game.running && settings.graphics === 'auto' && fpsShown < 32) {
      if (++lowFpsStreak >= 2 && qualityName !== 'low') {
        qualityName = qualityName === 'high' ? 'medium' : 'low';
        applyQuality(); setSnow();
        hud.toast('Graphics lowered for smoother play');
        lowFpsStreak = 0;
      }
    } else lowFpsStreak = 0;
  }
  hud.showFps(settings.showFps, fpsShown);
}

function setSnow() {
  if (quality.snow && !snowUpdate) snowUpdate = makeSnow(scene);
  if (!quality.snow && snowUpdate) { scene.remove(scene.children.find((o) => o.isPoints)); snowUpdate = null; }
}

// ---------- Menus & settings ----------
async function goFullscreen() {
  try { await document.documentElement.requestFullscreen?.({ navigationUI: 'hide' }); } catch {}
  try { await screen.orientation?.lock?.('landscape'); } catch {}
}

document.querySelectorAll('[data-mode]').forEach((b) => b.addEventListener('click', () => {
  audio.start();
  if (matchMedia('(pointer: coarse)').matches && !IS_IOS) goFullscreen();
  startMatch(b.dataset.mode);
}));

function openSettings(inMatch) {
  game.paused = inMatch;
  $('set-sens').value = settings.sensitivity;
  $('set-sens-v').textContent = settings.sensitivity.toFixed(2) + '×';
  $('set-cam').value = rig.mode;
  $('set-gfx').value = settings.graphics;
  $('set-autosprint').checked = settings.autoSprint;
  $('set-fps').checked = settings.showFps;
  $('set-holdprone').checked = settings.holdProne;
  $('set-quit').classList.toggle('hidden', !inMatch);
  $('settings').classList.remove('hidden');
  input.reset();
}
$('menu-settings').addEventListener('click', () => openSettings(false));
$('btn-gear').addEventListener('click', () => openSettings(true));
$('btn-gear').addEventListener('touchstart', (e) => { e.preventDefault(); e.stopPropagation(); openSettings(true); }, { passive: false });
$('set-sens').addEventListener('input', (e) => { settings.sensitivity = +e.target.value; $('set-sens-v').textContent = settings.sensitivity.toFixed(2) + '×'; });
$('set-cam').addEventListener('change', (e) => { rig.mode = settings.camera = e.target.value; });
$('set-gfx').addEventListener('change', (e) => {
  settings.graphics = e.target.value;
  qualityName = settings.graphics === 'auto' ? detectQuality() : settings.graphics;
  applyQuality(); setSnow();
});
$('set-autosprint').addEventListener('change', (e) => (settings.autoSprint = e.target.checked));
$('set-fps').addEventListener('change', (e) => (settings.showFps = e.target.checked));
$('set-holdprone').addEventListener('change', (e) => (settings.holdProne = e.target.checked));
$('set-layout').addEventListener('click', () => {
  save();
  $('settings').classList.add('hidden');
  if (!game.running) { $('hud').classList.remove('hidden'); $('menu').classList.add('hidden'); }
  layout.open();
});
$('set-close').addEventListener('click', () => {
  save(); $('settings').classList.add('hidden'); game.paused = false; last = performance.now();
  if (!game.running) { $('hud').classList.add('hidden'); $('menu').classList.remove('hidden'); }
});
$('set-quit').addEventListener('click', () => { save(); $('settings').classList.add('hidden'); endMatch(); });
$('end-again').addEventListener('click', () => startMatch(game.mode));
$('end-menu').addEventListener('click', () => { $('end').classList.add('hidden'); $('menu').classList.remove('hidden'); });

// ---------- Phone setup (Android + iOS) ----------
// Block pinch-zoom / double-tap zoom on iOS Safari, which ignores user-scalable=no
document.addEventListener('gesturestart', (e) => e.preventDefault());
document.addEventListener('dblclick', (e) => e.preventDefault(), { passive: false });
const standalone = matchMedia('(display-mode: standalone), (display-mode: fullscreen)').matches || navigator.standalone;
if (IS_IOS && !standalone) document.querySelector('.hint.ios').classList.remove('hidden');

// ---------- Go ----------
applyQuality();
setSnow();
$('loading').classList.add('hidden');
requestAnimationFrame(frame);

// Exposed for automated tests
window.__ls = { game, player, playerLo, rig, input, startMatch, settings, layout, hud };
equip();
