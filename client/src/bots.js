// Bot brains: push along a lane, spot enemies with line of sight, strafe and shoot with human-ish aim.
import * as THREE from 'three';
import { LANES } from './map.js';
import { lineOfSight } from './physics.js';

const VIEW_RANGE = 55;

export class BotBrain {
  constructor(char, loadout, { dummy = false, skill = 0.5 } = {}) {
    this.c = char;
    this.lo = loadout;
    this.dummy = dummy;
    this.skill = skill;        // 0 = sloppy, 1 = sharp
    this.pickLane();
    this.target = null;
    this.scanT = Math.random() * 0.3;
    this.reactT = 0;
    this.strafe = Math.random() < 0.5 ? -1 : 1;
    this.strafeT = 0;
    this.stuckT = 0;
    this.lastPos = new THREE.Vector3();
    this.crouchWish = false;
    this.burstT = 0;
  }

  pickLane() {
    this.laneZ = LANES[Math.floor(Math.random() * LANES.length)] + (Math.random() - 0.5) * 2;
    this.dirX = this.c.team === 'blue' ? 1 : -1;
  }

  // Returns a movement intent; fires through game.botFire when it has a shot.
  think(dt, game) {
    const c = this.c;
    const it = { mx: 0, my: 0, sprint: false, jump: false, crouch: false, prone: false, roll: false, ads: false, firing: false };
    if (!c.alive) return it;
    if (this.dummy) { return it; }

    // Look for the nearest visible enemy a few times a second
    this.scanT -= dt;
    if (this.scanT <= 0) {
      this.scanT = 0.25;
      const eye = c.eye(_e);
      let best = null, bestD = VIEW_RANGE;
      for (const o of game.chars) {
        if (!o.alive || o.team === c.team) continue;
        const d = o.pos.distanceTo(c.pos);
        if (d > bestD) continue;
        // Bots see roughly ahead (wide 240° cone) unless they were just shot at
        const toward = _t.subVectors(o.pos, c.pos).setY(0).normalize();
        const facing = c.forward(_f).dot(toward);
        if (facing < -0.5 && this.alertT === undefined) continue;
        const chest = _ch.set(o.pos.x, o.pos.y + o.height * 0.6, o.pos.z);
        if (!lineOfSight(game.boxes, eye, chest)) continue;
        best = o; bestD = d;
      }
      if (best !== this.target) { this.target = best; this.reactT = 0.55 - this.skill * 0.3; }
    }

    const t = this.target;
    if (t && t.alive) {
      // Turn toward the target with a limited turn speed
      const eye = c.eye(_e);
      const aimY = t.pos.y + t.height * (Math.random() < 0.15 * this.skill ? 0.92 : 0.6);
      const dx = t.pos.x - eye.x, dy = aimY - eye.y, dz = t.pos.z - eye.z;
      const wantYaw = Math.atan2(-dx, -dz);
      const wantPitch = Math.atan2(dy, Math.hypot(dx, dz));
      const turn = (3 + this.skill * 4) * dt;
      c.yaw += clampAng(wantYaw - c.yaw, turn);
      c.pitch += Math.max(-turn, Math.min(turn, wantPitch - c.pitch));
      const aimErr = Math.abs(angDiff(wantYaw, c.yaw)) + Math.abs(wantPitch - c.pitch);

      // Strafe while fighting, swap direction now and then
      this.strafeT -= dt;
      if (this.strafeT <= 0) { this.strafe *= -1; this.strafeT = 0.6 + Math.random() * 1.2; this.crouchWish = Math.random() < 0.35; }
      it.mx = this.strafe * 0.8;
      it.my = t.pos.distanceTo(c.pos) > 25 ? 0.4 : 0;
      if (this.crouchWish && c.stance === 'stand') it.crouch = true;
      if (!this.crouchWish && c.stance === 'crouch') it.crouch = true;

      this.reactT -= dt;
      // Fire in short bursts once reaction time has passed and aim is close
      this.burstT -= dt;
      if (this.reactT <= 0 && aimErr < 0.12) {
        if (this.burstT > -0.35) {
          it.firing = true;
          const dist = Math.hypot(dx, dz);
          const err = (0.06 + dist * 0.0028) * (1.4 - this.skill);
          const dir = _dir.set(dx, dy, dz).normalize();
          dir.x += (Math.random() - 0.5) * err; dir.y += (Math.random() - 0.5) * err * 0.7; dir.z += (Math.random() - 0.5) * err;
          game.botFire(c, this.lo, eye, dir.normalize());
        } else if (this.burstT < -0.35 - 0.3) {
          this.burstT = 0.4 + Math.random() * 0.5;
        }
      }
      if (this.lo.gun.ammo === 0) this.lo.reload();
      return it;
    }

    // No target: advance along the lane
    this.target = null;
    if (c.stance !== 'stand') it.jump = true; // stand up
    const lookAhead = c.pos.x + this.dirX * 6;
    const dz = this.laneZ - c.pos.z;
    const wantYaw = Math.atan2(-(lookAhead - c.pos.x), -dz * 0.8);
    c.yaw += clampAng(wantYaw - c.yaw, 4 * dt);
    c.pitch *= 0.9;
    it.my = 1;
    it.sprint = Math.random() < 0.02 ? !this.sprinting : this.sprinting;
    this.sprinting = it.sprint;
    if ((this.dirX > 0 && c.pos.x > 50) || (this.dirX < 0 && c.pos.x < -50)) { this.dirX *= -1; this.pickLane(); }

    // Unstick: jump, then try another lane
    this.stuckT += dt;
    if (this.stuckT > 1.2) {
      const moved = this.lastPos.distanceTo(c.pos);
      this.lastPos.copy(c.pos);
      this.stuckT = 0;
      if (moved < 1) { it.jump = true; if (Math.random() < 0.5) this.pickLane(); }
    }
    if (this.lo.gun.ammo < this.lo.gun.mag * 0.5) this.lo.reload();
    return it;
  }

  onShot(from) {
    // Getting shot makes a bot turn and fight back
    if (!this.target || !this.target.alive) {
      this.target = from; this.reactT = 0.4;
      this.c.yaw = Math.atan2(-(from.pos.x - this.c.pos.x), -(from.pos.z - this.c.pos.z)) + (Math.random() - 0.5) * 0.4;
    }
  }
}

function angDiff(a, b) { let d = a - b; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; }
function clampAng(d, max) { d = angDiff(d, 0); return Math.max(-max, Math.min(max, d)); }

const _e = new THREE.Vector3(), _t = new THREE.Vector3(), _f = new THREE.Vector3(), _ch = new THREE.Vector3(), _dir = new THREE.Vector3();
