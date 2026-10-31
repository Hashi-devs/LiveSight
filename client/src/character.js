// A soldier: movement state machine, collision, health, and a blocky model.
// Used by the player and by bots, so both move by exactly the same rules.
import * as THREE from 'three';
import { MOVE, STANCE, RADIUS, HP_MAX, START_SHIELD, GRAVITY } from './config.js';
import { moveEntity, spaceFree } from './physics.js';

const TEAM_COLOR = { blue: 0x3d7bd9, red: 0xd2483c };

export class Character {
  constructor({ name, team, isPlayer = false }) {
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
    this.model = buildSoldier(TEAM_COLOR[team], isPlayer);
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
      if (this.stance === 'prone') this.setStance('crouch', boxes);
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

  // Pose the model from the movement state.
  syncModel(dt, firstPerson) {
    const m = this.model;
    m.root.visible = !firstPerson;
    m.root.position.copy(this.pos);
    m.root.rotation.y = this.yaw;
    const b = m.body, sp = m.spin;
    m.marker.visible = this.markedT > 0 && this.alive;
    m.marker.rotation.y += dt * 3;
    sp.rotation.set(0, 0, 0);
    b.rotation.set(0, 0, 0);
    b.position.set(0, -0.6, 0);
    m.legL.scale.y = m.legR.scale.y = 1;

    if (!this.alive) {
      b.rotation.x = Math.PI / 2; b.position.set(0, -0.35, 0.1);
      return;
    }
    const swing = Math.sin(this.walkPhase) * Math.min(1, Math.hypot(this.vel.x, this.vel.z) / 4) * 0.7;
    m.legL.rotation.x = swing; m.legR.rotation.x = -swing;
    m.armPitch.rotation.x = this.pitch * 0.8;

    if (this.mode === 'roll') {
      sp.rotation.x = -Math.PI * 2 * (1 - this.modeT / MOVE.rollTime);
      b.position.y = -0.85; m.legL.scale.y = m.legR.scale.y = 0.55;
    } else if (this.stance === 'prone') {
      b.rotation.x = -Math.PI / 2; b.position.set(0, -0.35, 0.75);
      m.armPitch.rotation.x = Math.PI / 2 * 0.9;
    } else if (this.stance === 'crouch') {
      b.position.y = -0.98; m.legL.scale.y = m.legR.scale.y = 0.55;
      if (this.mode === 'slide') b.rotation.x = 0.35;
    }
  }
}

const _f = new THREE.Vector3(), _r = new THREE.Vector3(), _d = new THREE.Vector3();
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

function buildSoldier(teamColor, isPlayer) {
  const mat = (c) => new THREE.MeshLambertMaterial({ color: c });
  const team = mat(teamColor), armor = mat(0x2b313b), cloth = mat(0x4a5260), skin = mat(0x6b4a3a);
  const visor = new THREE.MeshBasicMaterial({ color: teamColor === 0xd2483c ? 0xff8a5c : 0x8fd4ff });
  const box = (w, h, d, m) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);

  const root = new THREE.Group();
  const spin = new THREE.Group(); spin.position.y = 0.6; root.add(spin);
  const body = new THREE.Group(); body.position.y = -0.6; spin.add(body);

  const leg = (x) => {
    const g = new THREE.Group(); g.position.set(x, 0.86, 0);
    const l = box(0.2, 0.86, 0.24, cloth); l.position.y = -0.43; g.add(l);
    const boot = box(0.22, 0.14, 0.3, armor); boot.position.set(0, -0.8, -0.03); g.add(boot);
    body.add(g); return g;
  };
  const legL = leg(-0.12), legR = leg(0.12);
  const torso = box(0.52, 0.62, 0.3, team); torso.position.y = 1.16; body.add(torso);
  const vest = box(0.56, 0.36, 0.34, armor); vest.position.y = 1.22; body.add(vest);
  const pack = box(0.36, 0.42, 0.16, armor); pack.position.set(0, 1.2, 0.24); body.add(pack);
  const head = box(0.28, 0.3, 0.28, skin); head.position.y = 1.62; body.add(head);
  const helmet = box(0.33, 0.16, 0.33, team); helmet.position.y = 1.76; body.add(helmet);
  const vis = box(0.26, 0.08, 0.04, visor); vis.position.set(0, 1.65, -0.15); body.add(vis);

  // Arms + gun pitch together with aim
  const armPitch = new THREE.Group(); armPitch.position.set(0, 1.38, 0); body.add(armPitch);
  const armL = box(0.13, 0.13, 0.55, team); armL.position.set(-0.22, -0.08, -0.25); armPitch.add(armL);
  const armR = box(0.13, 0.13, 0.5, team); armR.position.set(0.24, -0.1, -0.2); armPitch.add(armR);
  const gun = box(0.08, 0.14, 0.75, armor); gun.position.set(0.12, -0.06, -0.5); armPitch.add(gun);

  // Hit marker above head (shown for a few seconds after you hit them)
  const marker = new THREE.Mesh(new THREE.OctahedronGeometry(0.16), new THREE.MeshBasicMaterial({ color: 0xff3b3b }));
  marker.position.y = 2.25; marker.visible = false; root.add(marker);

  root.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return { root, spin, body, legL, legR, armPitch, marker, head };
}
