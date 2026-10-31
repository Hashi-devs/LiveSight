// HUD layout: where each control sits, how big and how see-through. Players can drag, resize
// and fade every control in the editor; the result is saved on the phone.
// x, y = centre as a fraction of screen width/height. s = size in px (diameter). o = opacity.

export const DEFAULT_LAYOUT = {
  // Apex Legends Mobile-style defaults
  'btn-fire':   { x: 0.826, y: 0.70, s: 92, o: 0.9 },
  'btn-fire-l': { x: 0.08,  y: 0.46, s: 64, o: 0.85 },
  'btn-ads':    { x: 0.925, y: 0.58, s: 56, o: 0.85 },
  'btn-jump':   { x: 0.94,  y: 0.82, s: 60, o: 0.85 },
  'btn-crouch': { x: 0.81,  y: 0.91, s: 56, o: 0.85 },
  'btn-prone':  { x: 0.738, y: 0.93, s: 48, o: 0.8 },
  'btn-reload': { x: 0.72,  y: 0.66, s: 48, o: 0.8 },
  'btn-heal':   { x: 0.255, y: 0.9,  s: 46, o: 0.85 },
  'btn-ping':   { x: 0.75,  y: 0.32, s: 48, o: 0.8 },
  'btn-cam':    { x: 0.66,  y: 0.17, s: 40, o: 0.75 },
  'joy-idle':   { x: 0.15,  y: 0.70, s: 130, o: 0.9 },
  'weapons':    { x: 0.5,   y: 0.815, s: 100, o: 0.95 }, // s = scale %
};

const NAMES = {
  'btn-fire': 'Fire (right)', 'btn-fire-l': 'Fire (left)', 'btn-ads': 'Aim', 'btn-jump': 'Jump', 'btn-crouch': 'Crouch',
  'btn-prone': 'Prone', 'btn-reload': 'Reload', 'btn-heal': 'Heal', 'btn-cam': 'Camera', 'weapons': 'Weapon cards',
  'btn-ping': 'Ping', 'joy-idle': 'Joystick',
};

export class Layout {
  constructor(input, onDone) {
    this.input = input;
    this.onDone = onDone;
    this.data = this.load();
    this.sel = null;
    this.editor = document.getElementById('editor');
    this.size = document.getElementById('ed-size');
    this.opac = document.getElementById('ed-opacity');
    this.label = document.getElementById('ed-name');
    this.size.addEventListener('input', () => this.tweak('s', +this.size.value));
    this.opac.addEventListener('input', () => this.tweak('o', +this.opac.value));
    document.getElementById('ed-reset').addEventListener('click', () => {
      this.data = structuredClone(DEFAULT_LAYOUT); this.apply(); this.select(this.sel);
    });
    document.getElementById('ed-done').addEventListener('click', () => this.close());
    this.bindDrag();
    window.addEventListener('resize', () => this.apply());
    this.apply();
  }

  load() {
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem('ls-layout-v2')) || {}; } catch {}
    const d = structuredClone(DEFAULT_LAYOUT);
    for (const k in d) if (saved[k]) Object.assign(d[k], saved[k]);
    return d;
  }
  save() { try { localStorage.setItem('ls-layout-v2', JSON.stringify(this.data)); } catch {} }

  apply() {
    const W = window.innerWidth, H = window.innerHeight;
    for (const [id, v] of Object.entries(this.data)) {
      const el = document.getElementById(id);
      if (!el) continue;
      el.style.left = (v.x * W) + 'px';
      el.style.top = (v.y * H) + 'px';
      el.style.opacity = v.o;
      if (id === 'weapons') el.style.scale = v.s / 100;
      else { el.style.width = el.style.height = v.s + 'px'; }
    }
  }

  open() {
    this.input.editing = true;
    this.input.reset();
    document.body.classList.add('editing');
    this.editor.classList.remove('hidden');
    this.select('btn-fire');
  }
  close() {
    this.input.editing = false;
    document.body.classList.remove('editing');
    this.editor.classList.add('hidden');
    document.querySelectorAll('.selected').forEach((e) => e.classList.remove('selected'));
    this.save();
    this.onDone && this.onDone();
  }

  select(id) {
    if (!id) return;
    this.sel = id;
    document.querySelectorAll('.selected').forEach((e) => e.classList.remove('selected'));
    document.getElementById(id)?.classList.add('selected');
    const v = this.data[id];
    this.label.textContent = NAMES[id];
    if (id === 'weapons') { this.size.min = 60; this.size.max = 140; } else { this.size.min = 36; this.size.max = 140; }
    this.size.value = v.s; this.opac.value = v.o;
  }
  tweak(key, val) { if (this.sel) { this.data[this.sel][key] = val; this.apply(); } }

  bindDrag() {
    let drag = null;
    document.addEventListener('pointerdown', (e) => {
      if (!this.input.editing) return;
      const el = e.target.closest('[data-layout]');
      if (!el) return;
      e.preventDefault(); e.stopPropagation();
      this.select(el.id);
      const v = this.data[el.id];
      drag = { id: el.id, sx: e.clientX, sy: e.clientY, x: v.x, y: v.y };
      el.setPointerCapture?.(e.pointerId);
    }, true);
    document.addEventListener('pointermove', (e) => {
      if (!drag) return;
      const v = this.data[drag.id];
      v.x = Math.min(0.98, Math.max(0.02, drag.x + (e.clientX - drag.sx) / window.innerWidth));
      v.y = Math.min(0.98, Math.max(0.02, drag.y + (e.clientY - drag.sy) / window.innerHeight));
      this.apply();
    }, true);
    document.addEventListener('pointerup', () => { drag = null; }, true);
  }
}
