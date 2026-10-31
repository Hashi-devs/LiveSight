// Touch controls on Pointer Events (each finger stays captured by the control it started on),
// plus keyboard/mouse for desktop testing.
//  - Left side: floating joystick (push past the ring to sprint)
//  - Right side: drag to look
//  - Fire buttons: hold to shoot AND drag to aim; the button follows your thumb, like Blood Strike

const JOY_RADIUS = 60;
const SPRINT_PUSH = 1.35;
const FIRE_FOLLOW = 110; // the fire button follows your thumb up to this far (px)

export class Input {
  constructor(root, settings) {
    this.root = root;
    this.settings = settings;
    this.mx = 0; this.my = 0; this.sprintTouch = false;
    this.lookDX = 0; this.lookDY = 0;
    this.fireCount = 0; // fingers currently on fire buttons
    this.held = { fire: false, ads: false };
    this.edges = {};
    this.keys = new Set();
    this.joy = null;              // { id, ox, oy }
    this.looks = new Map();       // pointerId -> { x, y }
    this.adsToggled = false;
    this.enabled = false;
    this.editing = false;         // HUD layout editor active

    this.joyBase = root.querySelector('#joy');
    this.joyKnob = root.querySelector('#joy-knob');
    this.bindArea();
    this.bindButtons();
    this.bindKeys();
  }

  edge(name) { this.edges[name] = true; }

  // ---------- Open screen area: joystick + look ----------
  bindArea() {
    const area = this.root.querySelector('#touch-area');
    area.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' || this.editing) return;
      e.preventDefault();
      area.setPointerCapture(e.pointerId);
      if (!this.joy && e.clientX < window.innerWidth * 0.42) {
        this.joy = { id: e.pointerId, ox: e.clientX, oy: e.clientY };
        Object.assign(this.joyBase.style, { display: 'block', left: e.clientX + 'px', top: e.clientY + 'px' });
        document.body.classList.add('joy-active');
        this.joyKnob.style.transform = 'translate(-50%,-50%)';
      } else {
        this.looks.set(e.pointerId, { x: e.clientX, y: e.clientY });
      }
    });
    area.addEventListener('pointermove', (e) => {
      if (this.joy && e.pointerId === this.joy.id) {
        let dx = e.clientX - this.joy.ox, dy = e.clientY - this.joy.oy;
        const d = Math.hypot(dx, dy);
        this.sprintTouch = d > JOY_RADIUS * SPRINT_PUSH && dy < -JOY_RADIUS * 0.6;
        const k = d > JOY_RADIUS ? JOY_RADIUS / d : 1;
        dx *= k; dy *= k;
        this.mx = dx / JOY_RADIUS; this.my = -dy / JOY_RADIUS;
        this.joyKnob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
        this.joyKnob.classList.toggle('sprint', this.sprintTouch);
      } else this.trackLook(e);
    });
    const end = (e) => {
      if (this.joy && e.pointerId === this.joy.id) {
        this.joy = null; this.mx = this.my = 0; this.sprintTouch = false;
        this.joyBase.style.display = 'none';
        document.body.classList.remove('joy-active');
      }
      this.looks.delete(e.pointerId);
    };
    area.addEventListener('pointerup', end);
    area.addEventListener('pointercancel', end);
  }

  trackLook(e) {
    const p = this.looks.get(e.pointerId);
    if (!p) return;
    this.lookDX += e.clientX - p.x; this.lookDY += e.clientY - p.y;
    p.x = e.clientX; p.y = e.clientY;
  }

  // ---------- Buttons ----------
  bindButtons() {
    const btn = (id, down, up, opts = {}) => {
      const el = this.root.querySelector(id);
      if (!el) return;
      el.addEventListener('pointerdown', (e) => {
        if (this.editing) return;
        e.preventDefault(); e.stopPropagation();
        if (e.pointerType !== 'mouse') el.setPointerCapture(e.pointerId);
        el.classList.add('down');
        if (opts.aim) {
          this.looks.set(e.pointerId, { x: e.clientX, y: e.clientY, ox: e.clientX, oy: e.clientY });
        }
        down && down(e);
      });
      el.addEventListener('pointermove', (e) => {
        if (!opts.aim || !this.looks.has(e.pointerId)) return;
        const p = this.looks.get(e.pointerId);
        this.trackLook(e);
        // the fire button drifts with the thumb, up to a limit
        let fx = e.clientX - p.ox, fy = e.clientY - p.oy;
        const d = Math.hypot(fx, fy);
        if (d > FIRE_FOLLOW) { fx *= FIRE_FOLLOW / d; fy *= FIRE_FOLLOW / d; }
        el.style.translate = `${fx}px ${fy}px`;
      });
      const release = (e) => {
        if (!el.classList.contains('down')) return;
        el.classList.remove('down');
        el.style.translate = '';
        this.looks.delete(e.pointerId);
        up && up(e);
      };
      el.addEventListener('pointerup', release);
      el.addEventListener('pointercancel', release);
      el.addEventListener('lostpointercapture', release);
    };
    const fireDown = () => { this.fireCount++; this.held.fire = true; };
    const fireUp = () => { this.fireCount = Math.max(0, this.fireCount - 1); if (!this.fireCount) this.held.fire = false; };
    btn('#btn-fire', fireDown, fireUp, { aim: true });
    btn('#btn-fire-l', fireDown, fireUp, { aim: true });
    btn('#btn-ads', () => (this.adsToggled = !this.adsToggled));
    btn('#btn-jump', () => this.edge('jump'));
    btn('#btn-reload', () => this.edge('reload'));
    btn('#btn-heal', () => this.edge('heal'));
    btn('#btn-cam', () => this.edge('camera'));
    btn('#btn-prone', () => this.edge('prone'));
    btn('#btn-ping', () => this.edge('ping'));
    this.root.querySelectorAll('.slot').forEach((el, i) => btn('#' + el.id, () => this.edge('w' + i)));

    // Crouch: tap = crouch/stand · double-tap while moving = dive roll · hold = prone (only if turned on)
    const c = { consumed: false, lastTap: 0, timer: 0 };
    btn('#btn-crouch', () => {
      c.consumed = false;
      clearTimeout(c.timer);
      if (this.settings.holdProne) c.timer = setTimeout(() => { c.consumed = true; this.edge('prone'); }, 350);
    }, () => {
      clearTimeout(c.timer);
      if (c.consumed) return;
      const now = performance.now();
      if (now - c.lastTap < 300 && Math.hypot(this.mx, this.my) > 0.2) { this.edge('roll'); c.lastTap = 0; }
      else { this.edge('crouch'); c.lastTap = now; }
    });
  }

  bindKeys() {
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      const map = { Space: 'jump', KeyC: 'crouch', KeyZ: 'prone', KeyQ: 'roll', KeyR: 'reload', KeyE: 'swap',
        KeyH: 'heal', KeyV: 'camera', KeyF: 'ping', Digit1: 'w0', Digit2: 'w1', Digit3: 'w2' };
      if (map[e.code]) this.edge(map[e.code]);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    const canvas = this.root.querySelector('canvas');
    window.addEventListener('mousedown', (e) => {
      if (!this.enabled || this.editing || e.target.closest('.btn, .screen, .slot, button, #editor')) return;
      if (document.pointerLockElement !== canvas) { canvas.requestPointerLock?.(); return; }
      if (e.button === 0) this.held.fire = true;
      if (e.button === 2) this.held.ads = true;
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0 && !this.fireCount) this.held.fire = false;
      if (e.button === 2) this.held.ads = false;
    });
    window.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('mousemove', (e) => {
      if (document.pointerLockElement === canvas) { this.lookDX += e.movementX; this.lookDY += e.movementY; }
    });
  }

  read() {
    const k = this.keys;
    let mx = this.mx, my = this.my;
    if (k.size) {
      const kx = (k.has('KeyD') ? 1 : 0) - (k.has('KeyA') ? 1 : 0);
      const ky = (k.has('KeyW') ? 1 : 0) - (k.has('KeyS') ? 1 : 0);
      if (kx || ky) { mx = kx; my = ky; const l = Math.hypot(mx, my); mx /= l; my /= l; }
    }
    const sprint = this.sprintTouch || k.has('ShiftLeft') || (this.settings.autoSprint && my > 0.9);
    // Sensitivity adapts to screen size: one screen-width drag turns about 160 degrees
    const radPerPx = (Math.PI * 0.9) / Math.max(320, window.innerWidth) * this.settings.sensitivity;
    const mouseScale = document.pointerLockElement ? 0.35 : 1;
    // Touch look acceleration: slow drags stay precise, quick flicks turn further
    const mag = Math.hypot(this.lookDX, this.lookDY);
    const accel = document.pointerLockElement ? 1 : 1 + Math.min(1.2, Math.max(0, mag - 6) / 30);
    const out = {
      mx, my, sprint,
      lookX: this.lookDX * radPerPx * mouseScale * accel,
      lookY: this.lookDY * radPerPx * mouseScale * accel,
      fire: this.held.fire,
      ads: this.held.ads || this.adsToggled,
      ...this.edges,
    };
    this.lookDX = this.lookDY = 0;
    this.edges = {};
    return out;
  }

  reset() {
    this.held.fire = false; this.held.ads = false; this.adsToggled = false; this.fireCount = 0;
    this.mx = this.my = 0; this.joy = null; this.looks.clear(); this.sprintTouch = false;
    this.joyBase.style.display = 'none';
    document.body.classList.remove('joy-active');
    this.root.querySelectorAll('.btn').forEach((b) => { b.classList.remove('down'); b.style.translate = ''; });
  }
}
