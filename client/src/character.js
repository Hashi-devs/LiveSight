// A soldier: movement state machine, collision, health, and a blocky model.
// Used by the player and by bots, so both move by exactly the same rules.
import * as THREE from 'three';
import { MOVE, STANCE, RADIUS, HP_MAX, START_SHIELD, GRAVITY } from './config.js';
import { moveEntity, spaceFree } from './physics.js';
import { makeGun } from './guns.js';

const TEAM_COLOR = { blue: 0x3d7bd9, red: 0xd2483c };

export class Character {
  constructor({ name, team, isPlayer = false, color = null }) {
    this.name = name;
    this.team = team;
    this.isPlayer = isPlayer;
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.yaw = 0;
    this.pitch = 0;
    this.radius = RADIUS;
    this.stance = 'stand';
    this.height = STANCE.stand.h;
    this.grounded = true;
    this.mode = 'normal'; // normal | slide | roll | mantle
    this.modeT = 0;
    this.rollCd = 0;
    this.getUpT = 0;
    this.sprinting = false;
    this.alive = true;
    this.hp = HP_MAX;
    this.shield = START_SHIELD;
    this.kills = 0; this.deaths = 0; this.damage = 0;
    this.respawnT = 0;
    this.protectT = 0;
    this.markedT = 0;      // hit marker above this character (seen by the player)
    this.lastFiredT = 99;  // seconds since last shot (minimap blips)
    this.walkPhase = 0;
    this.model = buildSoldier(color ?? TEAM_COLOR[team]);
    this.setGun('ar_auto');
  }

  get eyeHeight() { return STANCE[this.stance].eye; }
  eye(out = new THREE.Vector3()) { return out.set(this.pos.x, this.pos.y + this.eyeHeight, this.pos.z); }
  forward(out = new THREE.Vector3()) { return out.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)); }
  aimDir(out = new THREE.Vector3()) {
    const cp = Math.cos(this.pitch);
    return out.set(-Math.sin(this.yaw) * cp, Math.sin(this.pitch), -Math.cos(this.yaw) * cp);
  }

  setStance(s, boxes) {
    if (s === this.stance) return true;
    const h = STANCE[s].h;
    if (h > this.height && !spaceFree(boxes, this.pos.x, this.pos.y + 0.01, this.pos.z, this.radius, h)) return false;
    if (this.stance === 'prone' && s !== 'prone') this.getUpT = MOVE.proneGetUp;
    this.stance = s;
    this.height = h;
    return true;
  }

  // Hitboxes for bullets: body and head, shaped by stance.
  hitboxes() {
    const p = this.pos;
    if (this.stance === 'prone' && this.mode !== 'roll') {
      const f = this.forward();
      const hx = p.x + f.x * 0.75, hz = p.z + f.z * 0.75;
      return [
        { min: [p.x - 0.55, p.y, p.z - 0.55], max: [p.x + 0.55, p.y + 0.45, p.z + 0.55], head: false },
        { min: [hx - 0.17, p.y, hz - 0.17], max: [hx + 0.17, p.y + 0.4, hz + 0.17], head: true },
      ];
    }
    const h = this.height, headH = this.stance === 'stand' ? 0.34 : 0.3;
    const r = 0.32;
    return [
      { min: [p.x - r, p.y, p.z - r], max: [p.x + r, p.y + h - headH, p.z + r], head: false },
      { min: [p.x - 0.17, p.y + h - headH, p.z - 0.17], max: [p.x + 0.17, p.y + h, p.z + 0.17], head: true },
    ];
  }

  // intent: { mx, my (-1..1 local), sprint, jump, crouch, prone, roll, ads, firing }
  update(dt, it, boxes) {
    this.lastFiredT += dt;
    this.protectT = Math.max(0, this.protectT - dt);
    this.markedT = Math.max(0, this.markedT - dt);
    if (!this.alive) return;
    this.rollCd = Math.max(0, this.rollCd - dt);
    this.getUpT = Math.max(0, this.getUpT - dt);

    if (this.mode === 'mantle') return this.updateMantle(dt);

    const f = this.forward(_f);
    const right = _r.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const moveLen = Math.min(1, Math.hypot(it.mx, it.my));

    // --- Actions ---
    if (it.jump) {
      if (this.stance !== 'stand' && this.mode === 'normal') this.setStance('stand', boxes);
      else if (!this.tryMantle(boxes) && this.grounded && this.mode !== 'roll') {
        if (this.mode === 'slide') { this.mode = 'normal'; this.setStance('stand', boxes); }
        this.vel.y = MOVE.jump;
        this.grounded = false;
      }
    } else if (!this.grounded && it.my > 0.5 && this.mode === 'normal') {
      this.tryMantle(boxes, true); // grab ledges when jumping forward into them
    }

    if (it.crouch && this.mode === 'normal') {
      if (this.sprinting && this.grounded && this.stance === 'stand') {
        this.setStance('crouch', boxes);
        this.mode = 'slide'; this.modeT = MOVE.slideTime;
        const sdir = moveLen > 0.1 ? _d.copy(f).multiplyScalar(it.my).addScaledVector(right, it.mx).normalize() : _d.copy(f);
        this.vel.x = sdir.x * MOVE.slideSpeed; this.vel.z = sdir.z * MOVE.slideSpeed;
      } else if (this.stance === 'crouch') this.setStance('stand', boxes);
      else if (this.stance === 'prone') this.setStance('crouch', boxes);
      else this.setStance('crouch', boxes);
    }
    if (it.prone && this.mode === 'normal' && this.grounded) {
      if (this.stance === 'prone') { if (!this.setStance('stand', boxes)) this.setStance('crouch', boxes); }
      else this.setStance('prone', boxes);
    }
    if (it.roll && this.grounded && this.rollCd === 0 && this.mode !== 'roll' && this.mode !== 'mantle') {
      const rdir = moveLen > 0.1 ? _d.copy(f).multiplyScalar(it.my).addScaledVector(right, it.mx).normalize() : _d.copy(f);
      this.rollDir = rdir.clone();
      this.mode = 'roll'; this.modeT = MOVE.rollTime; this.rollCd = MOVE.rollCooldown;
      this.stance = 'crouch'; this.height = STANCE.crouch.h;
    }

    // --- Velocity ---
    let target = 0;
    this.sprinting = false;
    if (this.mode === 'roll') {
      this.vel.x = this.rollDir.x * MOVE.rollSpeed;
      this.vel.z = this.rollDir.z * MOVE.rollSpeed;
      this.modeT -= dt;
      if (this.modeT <= 0) { this.mode = 'normal'; if (!this.setStance('stand', boxes)) this.stance = 'crouch'; }
    } else if (this.mode === 'slide') {
      this.modeT -= dt;
      const sp = Math.hypot(this.vel.x, this.vel.z);
      const ns = Math.max(0, sp - dt * (MOVE.slideSpeed - MOVE.crouch) / MOVE.slideTime);
      if (sp > 0) { this.vel.x *= ns / sp; this.vel.z *= ns / sp; }
      if (this.modeT <= 0 || ns <= MOVE.crouch) this.mode = 'normal';
    } else {
      if (this.stance === 'stand') target = MOVE.walk;
      else if (this.stance === 'crouch') target = MOVE.crouch;
      else target = MOVE.prone;
      if (this.getUpT > 0) target *= 0.3;
      if (it.sprint && this.stance === 'stand' && it.my > 0.5 && !it.ads && !it.firing) {
        target = MOVE.sprint; this.sprinting = true;
      }
      if (it.ads) target *= MOVE.adsMul;
      const wish = _d.copy(f).multiplyScalar(it.my).addScaledVector(right, it.mx);
      if (wish.lengthSq() > 1) wish.normalize();
      const accel = this.grounded ? MOVE.groundAccel : MOVE.airAccel;
      const tx = wish.x * target, tz = wish.z * target;
      this.vel.x += clamp(tx - this.vel.x, -accel * dt, accel * dt);
      this.vel.z += clamp(tz - this.vel.z, -accel * dt, accel * dt);
    }

    this.vel.y -= GRAVITY * dt;
    moveEntity(this, boxes, this.vel.x * dt, this.vel.y * dt, this.vel.z * dt);
    if (this.grounded && this.vel.y < 0) this.vel.y = 0;

    const speed = Math.hypot(this.vel.x, this.vel.z);
    this.walkPhase += dt * speed * 1.6;
  }

  tryMantle(boxes, airborne = false) {
    if (this.stance === 'prone') return false;
    const f = this.forward(_f);
    // Probe ahead at a few distances; the first ledge found within reach is climbed
    let px = 0, pz = 0, top = -Infinity;
    for (const ahead of [0.2, 0.45, 0.7, 0.95]) {
      const sx = this.pos.x + f.x * (this.radius + ahead), sz = this.pos.z + f.z * (this.radius + ahead);
      for (const b of boxes) {
        if (sx < b.min[0] || sx > b.max[0] || sz < b.min[2] || sz > b.max[2]) continue;
        if (b.min[1] > this.pos.y + MOVE.mantleMax) continue;
        if (b.max[1] > top) top = b.max[1];
      }
      if (top > -Infinity) {
        // land a little past the edge, on top of it (or over it, for thin walls)
        px = sx + f.x * 0.45; pz = sz + f.z * 0.45;
        break;
      }
    }
    if (top === -Infinity) return false;
    const rise = top - this.pos.y;
    if (rise < (airborne ? 0.3 : MOVE.mantleMin) || rise > MOVE.mantleMax) return false;
    if (!spaceFree(boxes, px, top + 0.02, pz, this.radius, STANCE.stand.h)) return false;
    this.mode = 'mantle';
    this.modeT = 0;
    this.mantleFrom = this.pos.clone();
    this.mantleTo = new THREE.Vector3(px, top + 0.01, pz);
    this.vel.set(0, 0, 0);
    this.setStance('stand', boxes);
    return true;
  }

  updateMantle(dt) {
    this.modeT += dt / MOVE.mantleTime;
    const t = Math.min(1, this.modeT);
    const a = this.mantleFrom, b = this.mantleTo;
    // rise first, then move forward over the edge
    const up = Math.min(1, t / 0.6), fwd = Math.max(0, (t - 0.4) / 0.6);
    this.pos.set(a.x + (b.x - a.x) * fwd, a.y + (b.y - a.y) * up, a.z + (b.z - a.z) * fwd);
    if (t >= 1) { this.mode = 'normal'; this.grounded = true; }
  }

  // Returns true if this hit killed.
  takeDamage(amount, ignoreShield = false) {
    if (!this.alive || this.protectT > 0) return false;
    let rest = amount;
    if (!ignoreShield && this.shield > 0) {
      const s = Math.min(this.shield, rest);
      this.shield -= s; rest -= s;
    }
    this.hp -= rest;
    if (this.hp <= 0) { this.hp = 0; this.alive = false; return true; }
    return false;
  }

  spawnAt(x, z, yaw, protect) {
    this.pos.set(x, 0, z);
    this.vel.set(0, 0, 0);
    this.yaw = yaw; this.pitch = 0;
    this.alive = true; this.hp = HP_MAX; this.shield = START_SHIELD;
    this.stance = 'stand'; this.height = STANCE.stand.h; this.mode = 'normal';
    this.protectT = protect; this.markedT = 0;
  }

  setGun(id) {
    const m = this.model;
    if (m.gun) m.hand.remove(m.gun);
    m.gun = makeGun(id);
    m.gun.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    m.hand.add(m.gun);
  }

  // Pose the jointed model from the movement state.
  syncModel(dt, firstPerson) {
    const m = this.model;
    m.root.visible = !firstPerson;
    if (firstPerson) return;
    m.root.position.copy(this.pos);
    m.root.rotation.y = this.yaw;
    m.marker.visible = this.markedT > 0 && this.alive;
    m.marker.rotation.y += dt * 3;

    // Defaults: standing, aiming
    const P = { hipY: 0.92, lean: 0, thL: 0, thR: 0, shL: 0, shR: 0, aim: this.pitch * 0.85, twist: 0, bodyX: 0, bodyY: 0, bodyZ: 0, spin: 0, lift: 0 };
    const speed = Math.hypot(this.vel.x, this.vel.z);
    const k = Math.min(1, speed / 4.6);
    const ph = this.walkPhase;

    if (!this.alive) {
      Object.assign(P, { bodyX: Math.PI / 2, bodyY: 0.2, bodyZ: 0.1, aim: 0.6 });
    } else if (this.mode === 'roll') {
      Object.assign(P, { hipY: 0.55, thL: 1.5, thR: 1.5, shL: -2.2, shR: -2.2, lean: 0.9, aim: -0.4 });
      P.spin = -Math.PI * 2 * (1 - this.modeT / MOVE.rollTime);
    } else if (this.mode === 'slide') {
      Object.assign(P, { hipY: 0.42, thL: 1.35, shL: -0.25, thR: 0.25, shR: -1.9, lean: -0.35 });
    } else if (this.mode === 'mantle') {
      Object.assign(P, { thL: 1.2, shL: -1.6, thR: 0.4, shR: -0.8, lean: 0.4, aim: -0.6 });
    } else if (this.stance === 'prone') {
      // lying flat, legs alternate a little while crawling
      const c = Math.sin(ph * 2.2) * 0.35 * k;
      Object.assign(P, { bodyX: -Math.PI / 2, bodyY: 0.2, bodyZ: 0.95, headUp: 1.2, thL: c, thR: -c, shL: -Math.max(0, c), shR: -Math.max(0, -c), aim: Math.PI / 2 * 0.95 + this.pitch * 0.5 });
    } else if (!this.grounded) {
      Object.assign(P, { thL: 0.75, shL: -1.1, thR: 0.35, shR: -0.7 });
    } else if (this.stance === 'crouch') {
      const s = Math.sin(ph) * 0.35 * k;
      Object.assign(P, { hipY: 0.55 - Math.abs(Math.sin(ph)) * 0.02 * k, thL: 1.1 + s, thR: 1.1 - s, shL: -1.75 - Math.max(0, s), shR: -1.75 - Math.max(0, -s), lean: 0.32 });
    } else {
      // walk / run cycle with knee bend, bob, lean and counter-twist
      const run = this.sprinting ? 1 : 0;
      const stride = 0.55 + run * 0.25;
      const sw = Math.sin(ph) * stride * k;
      P.thL = sw; P.thR = -sw;
      P.shL = -(0.1 + 0.85 * Math.max(0, Math.sin(ph - 1.2))) * k;
      P.shR = -(0.1 + 0.85 * Math.max(0, Math.sin(ph + Math.PI - 1.2))) * k;
      P.hipY = 0.92 - Math.abs(Math.cos(ph)) * 0.05 * k;
      P.lean = 0.06 * k + run * 0.14;
      P.twist = Math.sin(ph) * 0.12 * k;
      if (run) P.aim = -0.75; // gun lowered while sprinting
    }

    m.spin.rotation.x = P.spin;
    if (P.spin) { m.spin.position.y = 0.6; m.body.position.set(0, -0.6, 0); }
    else { m.spin.position.y = 0; m.body.position.set(0, P.bodyY, P.bodyZ); }
    m.body.rotation.x = P.bodyX;
    m.hips.position.y = P.hipY;
    m.thighL.rotation.x = P.thL; m.thighR.rotation.x = P.thR;
    m.shinL.rotation.x = P.shL; m.shinR.rotation.x = P.shR;
    m.torso.rotation.set(-P.lean, P.twist, 0);
    m.arms.rotation.x = P.aim + P.lean;
    m.head.rotation.x = Math.max(-0.5, Math.min(0.5, this.pitch * 0.5)) + P.lean * 0.6 + (P.headUp || 0);
  }
}

const _f = new THREE.Vector3(), _r = new THREE.Vector3(), _d = new THREE.Vector3();
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

function buildSoldier(teamColor) {
  const mat = (c) => new THREE.MeshLambertMaterial({ color: c });
  const team = mat(teamColor), armor = mat(0x2b313b), cloth = mat(0x454d5a), skin = mat(0x6b4a3a), boots = mat(0x1d2127);
  const visor = new THREE.MeshBasicMaterial({ color: teamColor === 0xd2483c ? 0xff8a5c : 0x8fd4ff });
  const box = (parent, w, h, d, m, x, y, z) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); parent.add(b); return b; };
  const group = (parent, x, y, z) => { const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g); return g; };

  const root = new THREE.Group();
  const spin = group(root, 0, 0, 0);
  const body = group(spin, 0, 0, 0);
  const hips = group(body, 0, 0.92, 0);
  box(hips, 0.36, 0.16, 0.24, cloth, 0, 0, 0);

  // Legs: thigh -> knee -> shin
  const leg = (x) => {
    const thigh = group(hips, x, -0.04, 0);
    box(thigh, 0.17, 0.44, 0.2, cloth, 0, -0.22, 0);
    box(thigh, 0.18, 0.12, 0.08, armor, 0, -0.2, -0.1); // knee pad
    const shin = group(thigh, 0, -0.44, 0);
    box(shin, 0.15, 0.42, 0.17, cloth, 0, -0.21, 0);
    box(shin, 0.18, 0.1, 0.27, boots, 0, -0.43, -0.04);
    return { thigh, shin };
  };
  const L = leg(-0.1), R = leg(0.1);

  // Torso -> chest, head, arms
  const torso = group(hips, 0, 0.06, 0);
  box(torso, 0.46, 0.56, 0.26, team, 0, 0.3, 0);
  box(torso, 0.5, 0.34, 0.31, armor, 0, 0.36, 0);        // plate carrier
  box(torso, 0.12, 0.1, 0.06, armor, -0.14, 0.24, -0.17); // pouches
  box(torso, 0.12, 0.1, 0.06, armor, 0.0, 0.24, -0.17);
  box(torso, 0.34, 0.4, 0.15, armor, 0, 0.32, 0.21);     // backpack
  box(torso, 0.13, 0.08, 0.3, team, -0.29, 0.54, 0);    // shoulder pads
  box(torso, 0.13, 0.08, 0.3, team, 0.29, 0.54, 0);
  const head = group(torso, 0, 0.62, 0);
  box(head, 0.12, 0.08, 0.12, skin, 0, 0.02, 0);         // neck
  box(head, 0.26, 0.28, 0.27, skin, 0, 0.18, 0);
  box(head, 0.31, 0.15, 0.31, team, 0, 0.32, 0.01);      // helmet
  box(head, 0.32, 0.04, 0.34, armor, 0, 0.25, 0.0);      // helmet rim
  box(head, 0.24, 0.07, 0.03, visor, 0, 0.2, -0.14);     // visor

  // Arms holding the gun: pitch together with aim
  const arms = group(torso, 0, 0.5, 0);
  const upper = (x, ry) => { const a = group(arms, x, 0, 0); a.rotation.y = ry; box(a, 0.12, 0.12, 0.3, team, 0, -0.06, -0.12); return a; };
  const uaL = upper(-0.27, -0.45), uaR = upper(0.27, 0.25);
  box(uaL, 0.1, 0.1, 0.3, cloth, 0.06, -0.08, -0.38);     // forearms reaching to the gun
  box(uaR, 0.1, 0.1, 0.24, cloth, -0.03, -0.1, -0.34);
  const hand = group(arms, 0.1, -0.12, -0.42);

  const marker = new THREE.Mesh(new THREE.OctahedronGeometry(0.16), new THREE.MeshBasicMaterial({ color: 0xff3b3b }));
  marker.position.y = 2.3; marker.visible = false; root.add(marker);

  root.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return { root, spin, body, hips, torso, head, arms, hand, thighL: L.thigh, shinL: L.shin, thighR: R.thigh, shinR: R.shin, marker, gun: null };
}
