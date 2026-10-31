// Guns, shooting, damage, and the effects that go with them (tracers, sparks, muzzle flash).
import * as THREE from 'three';
import { rayBox } from './physics.js';

// Phase 1 guns. Spread in degrees; damage falls off between range[0] and range[1] down to minMul.
export const GUNS = {
  ar_auto:     { name: 'Assault Rifle', dmg: 20, rpm: 600, auto: true,  mag: 30, reload: 2.0, hip: 3.0, ads: 0.5, recoil: 0.85, range: [25, 60], minMul: 0.7,  adsFov: 55 },
  smg_fast:    { name: 'SMG',           dmg: 14, rpm: 900, auto: true,  mag: 25, reload: 1.6, hip: 3.6, ads: 1.0, recoil: 0.55, range: [12, 35], minMul: 0.6,  adsFov: 60 },
  pistol_fast: { name: 'Pistol',        dmg: 25, rpm: 360, auto: false, mag: 12, reload: 1.3, hip: 2.0, ads: 0.4, recoil: 1.3,  range: [15, 40], minMul: 0.65, adsFov: 62 },
};
export const HEADSHOT = 1.75;

export class Loadout {
  constructor(ids) {
    this.guns = ids.map((id) => ({ id, ...GUNS[id], ammo: GUNS[id].mag }));
    this.cur = 0;
    this.cooldown = 0;
    this.reloadT = 0;
    this.bloom = 0;
    this.triggerHeld = false;
  }
  get gun() { return this.guns[this.cur]; }
  refill() { for (const g of this.guns) g.ammo = g.mag; this.reloadT = 0; this.cooldown = 0; this.bloom = 0; }
  swap(i) {
    const n = i ?? (this.cur + 1) % this.guns.length;
    if (n === this.cur) return;
    this.cur = n; this.reloadT = 0; this.cooldown = 0.35; // short draw time
  }
  reload() {
    const g = this.gun;
    if (this.reloadT > 0 || g.ammo === g.mag) return false;
    this.reloadT = g.reload; return true;
  }
  update(dt) {
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.bloom = Math.max(0, this.bloom - dt * 2.5);
    if (this.reloadT > 0) {
      this.reloadT -= dt;
      if (this.reloadT <= 0) { this.reloadT = 0; this.gun.ammo = this.gun.mag; }
    }
  }
}

export class Combat {
  constructor(scene, audio) {
    this.scene = scene;
    this.audio = audio;
    // Tracer pool
    this.tracers = [];
    const tmat = new THREE.LineBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0.9 });
    for (let i = 0; i < 40; i++) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
      const l = new THREE.Line(g, tmat.clone());
      l.visible = false; l.frustumCulled = false; scene.add(l);
      this.tracers.push({ line: l, t: 0 });
    }
    // Impact sparks
    this.sparks = [];
    const sgeo = new THREE.BoxGeometry(0.08, 0.08, 0.08);
    for (let i = 0; i < 40; i++) {
      const m = new THREE.Mesh(sgeo, new THREE.MeshBasicMaterial({ color: 0xffd27a }));
      m.visible = false; scene.add(m);
      this.sparks.push({ mesh: m, t: 0, vel: new THREE.Vector3() });
    }
    // Muzzle flashes
    this.flashes = [];
    const fgeo = new THREE.OctahedronGeometry(0.06);
    for (let i = 0; i < 12; i++) {
      const m = new THREE.Mesh(fgeo, new THREE.MeshBasicMaterial({ color: 0xfff1b0 }));
      m.visible = false; scene.add(m);
      this.flashes.push({ mesh: m, t: 0 });
    }
    this.ti = this.si = this.fi = 0;
  }

  spreadFor(ch, lo, ads) {
    const g = lo.gun;
    let s = ads ? g.ads : g.hip;
    const speed = Math.hypot(ch.vel.x, ch.vel.z);
    if (speed > 1) s *= ads ? 1.3 : 1.6;
    if (!ch.grounded) s *= 2;
    if (ch.mode === 'slide') s *= 1.3;
    if (ch.stance === 'crouch') s *= 0.8;
    if (ch.stance === 'prone') s *= 0.6;
    return s + lo.bloom;
  }

  // Fires if the gun allows it. origin/dir = where the shot comes from and goes.
  // Returns null if it didn't fire, else { hitChar, head, dmg, killed, point }.
  tryFire(shooter, lo, origin, dir, ads, chars, boxes, muzzle, onHit) {
    const g = lo.gun;
    if (lo.cooldown > 0 || lo.reloadT > 0) return null;
    if (!g.auto && lo.triggerHeld) return null;
    if (g.ammo <= 0) { lo.reload(); return null; }
    if (shooter.mode === 'roll' || shooter.mode === 'mantle') return null;
    lo.triggerHeld = true;
    g.ammo--;
    lo.cooldown = 60 / g.rpm;
    shooter.lastFiredT = 0;

    // Apply spread inside a cone
    const spread = this.spreadFor(shooter, lo, ads) * Math.PI / 180;
    const d = _d.copy(dir);
    if (spread > 0) {
      _a.set(1, 0, 0); if (Math.abs(d.x) > 0.9) _a.set(0, 1, 0);
      const u = _u.crossVectors(d, _a).normalize();
      const v = _v.crossVectors(d, u);
      const ang = Math.random() * Math.PI * 2, rad = Math.sqrt(Math.random()) * Math.tan(spread / 2);
      d.addScaledVector(u, Math.cos(ang) * rad).addScaledVector(v, Math.sin(ang) * rad).normalize();
    }
    lo.bloom = Math.min(2.5, lo.bloom + 0.22);

    const maxD = 200;
    let best = maxD, hitChar = null, head = false;
    for (const b of boxes) {
      const t = rayBox(origin.x, origin.y, origin.z, d.x, d.y, d.z, b, best);
      if (t < best) best = t;
    }
    for (const c of chars) {
      if (c === shooter || !c.alive || c.team === shooter.team) continue;
      for (const hb of c.hitboxes()) {
        const t = rayBox(origin.x, origin.y, origin.z, d.x, d.y, d.z, hb, best);
        if (t < best) { best = t; hitChar = c; head = hb.head; }
      }
    }
    const point = _p.copy(origin).addScaledVector(d, best);
    this.tracer(muzzle || origin, point);
    this.flash(muzzle || origin);
    if (best < maxD) this.spark(point, hitChar ? 0xff5a4a : 0xffd27a);
    this.audio?.shot(shooter.isPlayer ? 1 : 0.35, g.id);

    if (!hitChar) return { hitChar: null, point: point.clone() };
    let dmg = g.dmg;
    if (best > g.range[0]) {
      const t = Math.min(1, (best - g.range[0]) / (g.range[1] - g.range[0]));
      dmg *= 1 - t * (1 - g.minMul);
    }
    if (head) dmg *= HEADSHOT;
    dmg = Math.round(dmg);
    const before = hitChar.hp + hitChar.shield;
    const killed = hitChar.takeDamage(dmg);
    const dealt = before - (hitChar.hp + hitChar.shield);
    shooter.damage += dealt;
    const res = { hitChar, head, dmg: dealt, killed, point: point.clone() };
    onHit && onHit(shooter, res);
    return res;
  }

  tracer(a, b) {
    const tr = this.tracers[this.ti++ % this.tracers.length];
    const arr = tr.line.geometry.attributes.position.array;
    arr[0] = a.x; arr[1] = a.y; arr[2] = a.z; arr[3] = b.x; arr[4] = b.y; arr[5] = b.z;
    tr.line.geometry.attributes.position.needsUpdate = true;
    tr.line.visible = true; tr.t = 0.07; tr.line.material.opacity = 0.9;
  }
  flash(p) {
    const f = this.flashes[this.fi++ % this.flashes.length];
    f.mesh.position.copy(p); f.mesh.visible = true; f.t = 0.05;
    f.mesh.rotation.set(Math.random() * 3, Math.random() * 3, 0);
  }
  spark(p, color) {
    for (let k = 0; k < 3; k++) {
      const s = this.sparks[this.si++ % this.sparks.length];
      s.mesh.position.copy(p); s.mesh.visible = true; s.t = 0.25;
      s.mesh.material.color.setHex(color);
      s.vel.set((Math.random() - 0.5) * 4, Math.random() * 3, (Math.random() - 0.5) * 4);
    }
  }

  update(dt) {
    for (const tr of this.tracers) if (tr.t > 0) {
      tr.t -= dt; tr.line.material.opacity = Math.max(0, tr.t / 0.07) * 0.9;
      if (tr.t <= 0) tr.line.visible = false;
    }
    for (const f of this.flashes) if (f.t > 0) { f.t -= dt; if (f.t <= 0) f.mesh.visible = false; }
    for (const s of this.sparks) if (s.t > 0) {
      s.t -= dt; s.vel.y -= 12 * dt; s.mesh.position.addScaledVector(s.vel, dt);
      if (s.t <= 0) s.mesh.visible = false;
    }
  }
}

const _d = new THREE.Vector3(), _a = new THREE.Vector3(), _u = new THREE.Vector3(), _v = new THREE.Vector3(), _p = new THREE.Vector3();
