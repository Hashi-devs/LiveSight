// Touch controls (floating left joystick, right-side look, buttons) plus keyboard/mouse for testing.
// Each frame, read() returns movement, look deltas and one-shot button presses.

const JOY_RADIUS = 60;
const SPRINT_PUSH = 1.35; // drag past the ring to sprint

export class Input {
  constructor(root, settings) {
    this.root = root;
    this.settings = settings;
    this.mx = 0; this.my = 0; this.sprintTouch = false;
    this.lookDX = 0; this.lookDY = 0;
    this.held = { fire: false, ads: false };
    this.edges = {};
    this.keys = new Set();
    this.joy = null;   // { id, ox, oy }
    this.looks = new Map(); // touch id -> {x, y}
    this.crouchBtn = { down: 0, consumed: false, lastTap: 0 };
    this.adsToggled = false;
    this.enabled = false;

    this.joyBase = root.querySelector('#joy');
    this.joyKnob = root.querySelector('#joy-knob');
    this.bindTouch();
    this.bindButtons();
    this.bindKeys();
  }

  edge(name) { this.edges[name] = true; }

  bindTouch() {
    const area = this.root.querySelector('#touch-area');
    area.addEventListener('touchstart', (e) => {
      e.preventDefault();
      for (const t of e.changedTouches) {
        if (!this.joy && t.clientX < window.innerWidth * 0.42) {
          this.joy = { id: t.identifier, ox: t.clientX, oy: t.clientY };
          this.joyBase.style.display = 'block';
          this.joyBase.style.left = t.clientX + 'px';
          this.joyBase.style.top = t.clientY + 'px';
          this.joyKnob.style.transform = 'translate(-50%,-50%)';
        } else {
          this.looks.set(t.identifier, { x: t.clientX, y: t.clientY });
        }
      }
    }, { passive: false });
    const move = (e) => {
      e.preventDefault();
      for (const t of e.changedTouches) {
        if (this.joy && t.identifier === this.joy.id) {
          let dx = t.clientX - this.joy.ox, dy = t.clientY - this.joy.oy;
          const d = Math.hypot(dx, dy);
          this.sprintTouch = d > JOY_RADIUS * SPRINT_PUSH && dy < -JOY_RADIUS * 0.6;
          const k = d > JOY_RADIUS ? JOY_RADIUS / d : 1;
          dx *= k; dy *= k;
          this.mx = dx / JOY_RADIUS; this.my = -dy / JOY_RADIUS;
          this.joyKnob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
          this.joyKnob.classList.toggle('sprint', this.sprintTouch);
        } else if (this.looks.has(t.identifier)) {
          const p = this.looks.get(t.identifier);
          this.lookDX += t.clientX - p.x; this.lookDY += t.clientY - p.y;
          p.x = t.clientX; p.y = t.clientY;
        }
      }
    };
    const end = (e) => {
      for (const t of e.changedTouches) {
        if (this.joy && t.identifier === this.joy.id) {
          this.joy = null; this.mx = this.my = 0; this.sprintTouch = false;
          this.joyBase.style.display = 'none';
        }
        this.looks.delete(t.identifier);
      }
    };
    window.addEventListener('touchmove', move, { passive: false });
    window.addEventListener('touchend', end);
    window.addEventListener('touchcancel', end);
  }

  bindButtons() {
    const btn = (id, onDown, onUp) => {
      const el = this.root.querySelector(id);
      if (!el) return;
      el.addEventListener('touchstart', (e) => {
        e.preventDefault(); e.stopPropagation();
        for (const t of e.changedTouches) {
          // Fire buttons also steer the aim while held, like most mobile shooters
          if (el.dataset.look) this.looks.set(t.identifier, { x: t.clientX, y: t.clientY });
        }
        el.classList.add('down'); onDown && onDown();
      }, { passive: false });
      el.addEventListener('touchend', (e) => { e.preventDefault(); el.classList.remove('down'); onUp && onUp(); }, { passive: false });
      el.addEventListener('mousedown', (e) => { e.stopPropagation(); onDown && onDown(); });
      el.addEventListener('mouseup', () => onUp && onUp());
    };
    btn('#btn-fire', () => (this.held.fire = true), () => (this.held.fire = false));
    btn('#btn-fire-l', () => (this.held.fire = true), () => (this.held.fire = false));
    btn('#btn-ads', () => (this.adsToggled = !this.adsToggled));
    btn('#btn-jump', () => this.edge('jump'));
    btn('#btn-reload', () => this.edge('reload'));
    btn('#btn-swap', () => this.edge('swap'));
    btn('#btn-heal', () => this.edge('heal'));
    btn('#btn-cam', () => this.edge('camera'));

    // Crouch: tap = crouch/stand, hold = prone, double-tap while moving = dive roll
    const c = this.crouchBtn;
    btn('#btn-crouch', () => {
      c.down = performance.now(); c.consumed = false;
      clearTimeout(c.timer);
      c.timer = setTimeout(() => { c.consumed = true; this.edge('prone'); }, 350);
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
        KeyH: 'heal', KeyV: 'camera', Digit1: 'w0', Digit2: 'w1', Digit3: 'w2', ControlLeft: 'crouch' };
      if (map[e.code]) this.edge(map[e.code]);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    const canvas = this.root.querySelector('canvas');
    window.addEventListener('mousedown', (e) => {
      if (!this.enabled || e.target.closest('.btn, .panel, button')) return;
      if (document.pointerLockElement !== canvas) { canvas.requestPointerLock?.(); return; }
      if (e.button === 0) this.held.fire = true;
      if (e.button === 2) this.held.ads = true;
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.held.fire = false;
      if (e.button === 2) this.held.ads = false;
    });
    window.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('mousemove', (e) => {
      if (document.pointerLockElement === canvas) { this.lookDX += e.movementX; this.lookDY += e.movementY; }
    });
  }

  // Returns this frame's input and clears one-shot presses.
  read() {
    const k = this.keys;
    let mx = this.mx, my = this.my;
    if (k.size) {
      const kx = (k.has('KeyD') ? 1 : 0) - (k.has('KeyA') ? 1 : 0);
      const ky = (k.has('KeyW') ? 1 : 0) - (k.has('KeyS') ? 1 : 0);
      if (kx || ky) { mx = kx; my = ky; const l = Math.hypot(mx, my); mx /= l; my /= l; }
    }
    const sprint = this.sprintTouch || k.has('ShiftLeft') || (this.settings.autoSprint && my > 0.9);
    // Look sensitivity adapts to screen size: one screen-width drag turns about 160 degrees
    const radPerPx = (Math.PI * 0.9) / Math.max(320, window.innerWidth) * this.settings.sensitivity;
    const mouseScale = document.pointerLockElement ? 0.35 : 1;
    const out = {
      mx, my, sprint,
      lookX: this.lookDX * radPerPx * mouseScale,
      lookY: this.lookDY * radPerPx * mouseScale,
      fire: this.held.fire,
      ads: this.held.ads || this.adsToggled,
      ...this.edges,
    };
    this.lookDX = this.lookDY = 0;
    this.edges = {};
    return out;
  }

  reset() {
    this.held.fire = false; this.held.ads = false; this.adsToggled = false;
    this.mx = this.my = 0; this.joy = null; this.looks.clear();
    this.joyBase.style.display = 'none';
  }
}
