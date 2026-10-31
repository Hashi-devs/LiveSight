// On-screen HUD: score, status, weapon bar, killfeed, crosshair/sights, hit markers,
// floating damage numbers, damage direction and minimap.
import * as THREE from 'three';
import { BOUNDS } from './map.js';

const $ = (id) => document.getElementById(id);
const SHORT = { ar_auto: 'AR', smg_fast: 'SMG', pistol_fast: 'PISTOL' };

export class Hud {
  constructor(boxes) {
    this.el = {
      blue: $('score-blue'), red: $('score-red'), timer: $('timer'), target: $('target-line'),
      hp: $('hp-fill'), hpN: $('hp-num'), segs: [...document.querySelectorAll('#shield-segs i')], sight: $('st-sight'),
      slots: [0, 1, 2].map((i) => $('slot-' + i)), feed: $('killfeed'),
      hit: $('hitmark'), dmg: $('dmgdir'), toast: $('toast'), center: $('center-msg'),
      cross: $('crosshair'), scope: $('scope'), reddot: $('reddot'),
      prog: $('progress'), progFill: $('progress-fill'), progLabel: $('progress-label'),
      fps: $('fps'), cam: $('cam-label'), heal: $('heal-count'), nums: $('dmgnums'),
      ads: $('btn-ads'), crouch: $('btn-crouch'), prone: $('btn-prone'),
    };
    this.cache = {};
    this.hitT = 0; this.dmgT = 0; this.toastT = 0;
    this.mm = $('minimap').getContext('2d');
    this.mmBg = this.drawMinimapBase(boxes);
    this.numbers = new Map(); // character -> { el, total, t, head }
  }

  set(key, el, value) {
    if (this.cache[key] === value) return;
    this.cache[key] = value;
    el.textContent = value;
  }
  cls(key, el, name, on) {
    const k = key + name;
    if (this.cache[k] === on) return;
    this.cache[k] = on;
    el.classList.toggle(name, on);
  }

  score(blue, red, timeLeft, target) {
    this.set('b', this.el.blue, blue);
    this.set('r', this.el.red, red);
    const t = Math.max(0, Math.ceil(timeLeft));
    this.set('t', this.el.timer, `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`);
    this.set('tg', this.el.target, target);
  }

  vitals(hp, shield) {
    const h = Math.ceil(hp), s = Math.ceil(shield);
    if (this.cache.hpv !== h) {
      this.cache.hpv = h; this.el.hp.style.width = h + '%'; this.el.hpN.textContent = h;
      this.el.hp.classList.toggle('low', h <= 30);
    }
    if (this.cache.shv !== s) {
      this.cache.shv = s;
      this.el.segs.forEach((seg, i) => seg.style.setProperty('--f', Math.max(0, Math.min(25, s - i * 25)) * 4 + '%'));
    }
  }

  weapons(lo, sightLabel) {
    lo.guns.forEach((g, i) => {
      const el = this.el.slots[i];
      if (!el) return;
      this.cls('s' + i, el, 'active', i === lo.cur);
      this.cls('s' + i, el, 'low', g.ammo <= g.mag * 0.25);
      this.set('sn' + i, el.firstElementChild, SHORT[g.id] || g.name);
      const ammo = i === lo.cur && lo.reloadT > 0 ? 'RELOAD' : String(g.ammo);
      this.set('sa' + i, el.lastElementChild, ammo);
    });
    this.set('sight', this.el.sight, sightLabel);
  }

  stance(ch, adsOn) {
    this.cls('ads', this.el.ads, 'on', adsOn);
    this.cls('cr', this.el.crouch, 'on', ch.stance === 'crouch');
    this.cls('pr', this.el.prone, 'on', ch.stance === 'prone');
  }

  healCount(med, cells) { this.set('hc', this.el.heal, `${med}·${cells}`); }
  camLabel(mode) { this.set('cm', this.el.cam, { fps: 'FPS', tps: 'TPS', adaptive: 'AUTO' }[mode]); }

  // spread in degrees -> crosshair gap; sight overlays fade in as you aim
  sights(spreadDeg, fov, scoped, sightType) {
    const px = Math.tan((spreadDeg / 2) * Math.PI / 180) / Math.tan((fov / 2) * Math.PI / 180) * (window.innerHeight / 2);
    const gap = Math.round(Math.max(4, Math.min(60, px)));
    if (this.cache.gap !== gap) { this.cache.gap = gap; this.el.cross.style.setProperty('--gap', gap + 'px'); }
    const s = Math.round(scoped * 20) / 20;
    if (this.cache.sc !== s + sightType) {
      this.cache.sc = s + sightType;
      this.el.cross.style.opacity = s > 0.6 ? '0' : '1';
      this.el.scope.style.opacity = sightType === 'scope2x' && s > 0.85 ? '1' : '0';
      this.el.reddot.style.opacity = sightType === 'reddot' && s > 0.7 ? '1' : '0';
    }
  }

  hitmarker(kind) {
    this.el.hit.className = kind === 'head' ? 'head' : kind === 'kill' ? 'kill' : '';
    this.hitT = kind === 'kill' ? 0.35 : 0.18;
  }

  // Damage stacks on the same enemy while you keep hitting them: white, yellow 30+, red 70+
  damageNumber(target, dmg, head) {
    let n = this.numbers.get(target);
    if (!n) {
      const el = document.createElement('div');
      el.className = 'dmgnum';
      this.el.nums.appendChild(el);
      n = { el, total: 0, t: 0, head: false };
      this.numbers.set(target, n);
    }
    n.total += dmg; n.t = 1.1; n.pop = 0.15; n.head = head;
    n.el.textContent = Math.round(n.total);
    n.el.className = 'dmgnum' + (n.total >= 70 ? ' high' : n.total >= 30 ? ' mid' : '') + (head ? ' head' : '');
  }

  updateNumbers(dt, camera) {
    const W = window.innerWidth, H = window.innerHeight;
    for (const [c, n] of this.numbers) {
      n.t -= dt; n.pop = Math.max(0, (n.pop || 0) - dt);
      if (n.t <= 0) { n.el.remove(); this.numbers.delete(c); continue; }
      _v.set(c.pos.x, c.pos.y + c.height + 0.5, c.pos.z).project(camera);
      if (_v.z > 1) { n.el.style.opacity = '0'; continue; }
      const x = (_v.x * 0.5 + 0.5) * W, y = (-_v.y * 0.5 + 0.5) * H - (1.1 - n.t) * 18;
      const scale = 1 + n.pop * 3;
      n.el.style.opacity = String(Math.min(1, n.t * 3));
      n.el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -100%) scale(${scale})`;
    }
  }

  damageFrom(angle) {
    this.el.dmg.style.transform = `rotate(${angle}rad)`;
    this.dmgT = 1;
  }

  feed(html) {
    const d = document.createElement('div');
    d.innerHTML = html;
    this.el.feed.prepend(d);
    while (this.el.feed.children.length > 5) this.el.feed.lastChild.remove();
    setTimeout(() => d.remove(), 4000);
  }

  toast(msg, t = 2) { this.el.toast.textContent = msg; this.toastT = t; }
  center(msg) { this.set('ctr', this.el.center, msg); }

  progress(frac, label) {
    if (frac == null) { if (!this.cache.ph) { this.el.prog.classList.add('hidden'); this.cache.ph = true; } return; }
    this.cache.ph = false;
    this.el.prog.classList.remove('hidden');
    this.el.progFill.style.width = Math.round(frac * 100) + '%';
    this.set('pl', this.el.progLabel, label);
  }

  showFps(on, fps) {
    this.cls('fps', this.el.fps, 'hidden', !on);
    if (on) this.set('fps', this.el.fps, fps + ' FPS');
  }

  update(dt) {
    this.hitT -= dt; this.el.hit.style.opacity = this.hitT > 0 ? '1' : '0';
    this.dmgT -= dt; this.el.dmg.style.opacity = this.dmgT > 0 ? String(Math.min(1, this.dmgT * 1.5)) : '0';
    this.toastT -= dt; this.el.toast.style.opacity = this.toastT > 0 ? '1' : '0';
  }

  clearNumbers() { for (const n of this.numbers.values()) n.el.remove(); this.numbers.clear(); }

  // ---- Minimap (north up) ----
  drawMinimapBase(boxes) {
    const c = document.createElement('canvas'); c.width = 150; c.height = 100;
    const g = c.getContext('2d');
    g.fillStyle = 'rgba(223,230,238,0.12)'; g.fillRect(0, 0, this.mx(-18), 100);
    for (const b of boxes) {
      if (b.hidden || b.max[0] - b.min[0] > 100 || b.max[2] - b.min[2] > 60) continue;
      g.fillStyle = b.max[1] > 2.4 ? 'rgba(200,210,225,0.55)' : 'rgba(200,210,225,0.25)';
      const x = this.mx(b.min[0]), y = this.mz(b.min[2]);
      g.fillRect(x, y, this.mx(b.max[0]) - x, this.mz(b.max[2]) - y);
    }
    return c;
  }
  mx(x) { return (x - BOUNDS.minX) / (BOUNDS.maxX - BOUNDS.minX) * 150; }
  mz(z) { return (z - BOUNDS.minZ) / (BOUNDS.maxZ - BOUNDS.minZ) * 100; }

  minimap(player, chars) {
    const g = this.mm;
    g.clearRect(0, 0, 150, 100);
    g.drawImage(this.mmBg, 0, 0);
    for (const c of chars) {
      if (c === player || !c.alive) continue;
      const ally = c.team === player.team;
      if (!ally && c.lastFiredT > 1.5) continue; // enemies show only right after they fire
      g.fillStyle = ally ? '#3f8cff' : '#ff4d3d';
      g.beginPath(); g.arc(this.mx(c.pos.x), this.mz(c.pos.z), 2.5, 0, Math.PI * 2); g.fill();
    }
    if (player.alive) {
      const x = this.mx(player.pos.x), y = this.mz(player.pos.z);
      g.save(); g.translate(x, y); g.rotate(-player.yaw);
      g.fillStyle = 'rgba(255,201,53,0.18)';
      g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, 22, -Math.PI / 2 - 0.5, -Math.PI / 2 + 0.5); g.closePath(); g.fill();
      g.fillStyle = '#ffc935';
      g.beginPath(); g.moveTo(0, -5); g.lineTo(3.5, 3.5); g.lineTo(-3.5, 3.5); g.closePath(); g.fill();
      g.restore();
    }
  }
}

const _v = new THREE.Vector3();
