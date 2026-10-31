// The on-screen HUD: score, vitals, ammo, killfeed, hit markers, damage direction, minimap.
import { BOUNDS } from './map.js';

const $ = (id) => document.getElementById(id);

export class Hud {
  constructor(boxes) {
    this.el = {
      blue: $('score-blue'), red: $('score-red'), timer: $('timer'), target: $('target-line'),
      hp: $('hp-fill'), sh: $('shield-fill'), hpN: $('hp-num'), shN: $('sh-num'),
      ammo: $('ammo-num'), mag: $('ammo-mag'), gun: $('gun-name'), feed: $('killfeed'),
      hit: $('hitmark'), dmg: $('dmgdir'), toast: $('toast'), center: $('center-msg'),
      cross: $('crosshair'), prog: $('progress'), progFill: $('progress-fill'), progLabel: $('progress-label'),
      fps: $('fps'), cam: $('btn-cam'), heal: $('heal-count'),
    };
    this.cache = {};
    this.hitT = 0; this.dmgT = 0; this.toastT = 0;
    this.mm = $('minimap').getContext('2d');
    this.mmBg = this.drawMinimapBase(boxes);
  }

  set(key, el, value) {
    if (this.cache[key] === value) return;
    this.cache[key] = value;
    el.textContent = value;
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
    if (this.cache.hpv !== h) { this.cache.hpv = h; this.el.hp.style.width = h + '%'; this.el.hpN.textContent = h; }
    if (this.cache.shv !== s) { this.cache.shv = s; this.el.sh.style.width = s + '%'; this.el.shN.textContent = s; }
  }

  ammo(lo) {
    const g = lo.gun;
    this.set('am', this.el.ammo, lo.reloadT > 0 ? '…' : g.ammo);
    this.set('mg', this.el.mag, '/' + g.mag);
    this.set('gn', this.el.gun, lo.reloadT > 0 ? 'Reloading ' + g.name : g.name);
  }

  healCount(med, cells) { this.set('hc', this.el.heal, `${med}·${cells}`); }
  camLabel(mode) { this.set('cm', this.el.cam, { fps: 'FPS', tps: 'TPS', adaptive: 'AUTO' }[mode]); }

  crosshair(spreadDeg, fov, visible) {
    const px = Math.tan((spreadDeg / 2) * Math.PI / 180) / Math.tan((fov / 2) * Math.PI / 180) * (window.innerHeight / 2);
    const gap = Math.round(Math.max(4, Math.min(60, px)));
    if (this.cache.gap !== gap) { this.cache.gap = gap; this.el.cross.style.setProperty('--gap', gap + 'px'); }
    const v = visible ? '1' : '0';
    if (this.cache.cv !== v) { this.cache.cv = v; this.el.cross.style.opacity = v; }
  }

  hitmarker(kind) {
    this.el.hit.className = kind === 'head' ? 'head' : kind === 'kill' ? 'kill' : '';
    this.hitT = kind === 'kill' ? 0.35 : 0.18;
  }

  damageFrom(angle) { // angle relative to where you face, radians
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
    if (frac == null) { this.el.prog.classList.add('hidden'); return; }
    this.el.prog.classList.remove('hidden');
    this.el.progFill.style.width = Math.round(frac * 100) + '%';
    this.set('pl', this.el.progLabel, label);
  }

  showFps(on, fps) {
    this.el.fps.classList.toggle('hidden', !on);
    if (on) this.set('fps', this.el.fps, fps + ' fps');
  }

  update(dt) {
    this.hitT -= dt; this.el.hit.style.opacity = this.hitT > 0 ? '1' : '0';
    this.dmgT -= dt; this.el.dmg.style.opacity = this.dmgT > 0 ? String(Math.min(1, this.dmgT * 1.5)) : '0';
    this.toastT -= dt; this.el.toast.style.opacity = this.toastT > 0 ? '1' : '0';
  }

  // ---- Minimap (north up) ----
  drawMinimapBase(boxes) {
    const c = document.createElement('canvas'); c.width = 150; c.height = 100;
    const g = c.getContext('2d');
    g.fillStyle = '#dfe6ee22'; g.fillRect(0, 0, this.mx(-18), 100);
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
      // Enemies only show briefly after they fire
      if (!ally && c.lastFiredT > 1.5) continue;
      g.fillStyle = ally ? '#4d8eea' : '#e5584b';
      g.beginPath(); g.arc(this.mx(c.pos.x), this.mz(c.pos.z), 2.5, 0, Math.PI * 2); g.fill();
    }
    if (player.alive) {
      const x = this.mx(player.pos.x), y = this.mz(player.pos.z);
      g.save(); g.translate(x, y); g.rotate(-player.yaw);
      g.fillStyle = '#ffd36a';
      g.beginPath(); g.moveTo(0, -5); g.lineTo(3.5, 3.5); g.lineTo(-3.5, 3.5); g.closePath(); g.fill();
      g.restore();
    }
  }
}
