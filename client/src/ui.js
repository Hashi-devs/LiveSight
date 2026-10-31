// Menus outside the match: splash, lobby and every lobby page.
// Most pages are deliberately blank placeholders, so the whole structure can be walked through
// now and filled in as sketches, stories and 3D models arrive.

const $ = (id) => document.getElementById(id);
const ICON = {
  shop: '<path d="M4 8h16l-1.5 11h-13z"/><path d="M8.5 8V6a3.5 3.5 0 0 1 7 0v2"/>',
  chars: '<circle cx="12" cy="7.5" r="3.5"/><path d="M5 20c.8-4.5 3.6-6.5 7-6.5s6.2 2 7 6.5"/>',
  vault: '<rect x="4" y="5" width="16" height="14" rx="2"/><circle cx="12" cy="12" r="3"/><path d="M12 9v-1M12 16v-1M15 12h1M8 12h1"/>',
  stories: '<path d="M4 5.5C6 4.5 9 4.5 12 6c3-1.5 6-1.5 8-.5V19c-2-1-5-1-8 .5-3-1.5-6-1.5-8-.5z"/><path d="M12 6v13.5"/>',
  mail: '<rect x="3.5" y="6" width="17" height="12" rx="1.5"/><path d="M4 7l8 6 8-6"/>',
  gear: '<circle cx="12" cy="12" r="3.2"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1"/>',
  back: '<path d="M15 5l-7 7 7 7"/>',
  lock: '<rect x="5" y="11" width="14" height="9" rx="1.5"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  play: '<path d="M8 5l11 7-11 7z" class="fill"/>',
};
const svg = (k) => `<svg viewBox="0 0 24 24">${ICON[k]}</svg>`;

const MODES = [
  { id: 'tdm', name: 'Team Deathmatch', sub: 'You + 4 bots vs 5 bots · first to 25', ready: true },
  { id: 'range', name: 'Shooting Range', sub: 'Practice on dummies', ready: true },
  { id: 'capture', name: 'Capture Posts', sub: 'Hold posts and flags', ready: false },
  { id: 'hotspot', name: 'Hotspot Match', sub: 'Play friends over WiFi hotspot', ready: false },
  { id: 'br', name: 'Battle Royale', sub: 'Up to 50 players', ready: false },
];

const PAGES = { chars: 'Characters', stories: 'Stories', profile: 'Profile', shop: 'Shop', vault: 'Vault', mail: 'Mail', modes: 'Modes', loadouts: 'Loadouts', squad: 'Squad' };

export class UI {
  constructor({ onPlay, onSettings, toast }) {
    this.onPlay = onPlay;
    this.onSettings = onSettings;
    this.toast = toast;
    this.heroes = [];
    this.weapons = [];
    this.profile = Object.assign(
      { name: 'PLAYER', xp: 0, matches: 0, wins: 0, kills: 0, deaths: 0, damage: 0, hero: 'xavier', mode: 'tdm', mailRead: false },
      load('ls-profile')
    );
    this.screen = 'splash';
    this.page = null;
    this.showcase = null; // hero id shown in 3D behind the menus, or null
    this.showcaseShift = 0; // move the hero left/right to make room for panels
    this.build();
    fetch('../shared/heroes.json').then((r) => r.json()).then((d) => { this.heroes = d.heroes; this.refresh(); }).catch(() => {});
    fetch('../shared/weapons.json').then((r) => r.json()).then((d) => { this.weapons = d.weapons; }).catch(() => {});
  }

  save() { try { localStorage.setItem('ls-profile', JSON.stringify(this.profile)); } catch {} }
  get level() { return Math.floor(this.profile.xp / 1000) + 1; }
  get hero() { return this.heroes.find((h) => h.id === this.profile.hero) || this.heroes[0]; }

  // ---------- Markup ----------
  build() {
    const root = document.createElement('div');
    root.id = 'ui';
    root.innerHTML = `
    <section id="scr-splash" class="scr">
      <div class="splash-mid"><h1>LIVESIGHT</h1><p class="sub">SQUAD BATTLE · PROTOTYPE 1.3</p></div>
      <button id="tap-start" class="tap">TAP TO START</button>
      <p class="hint ios hidden">iPhone: tap Share → Add to Home Screen, then open LiveSight from there to play full screen.</p>
    </section>

    <section id="scr-lobby" class="scr hidden">
      <button id="lob-profile" class="profile-chip">
        <div class="hx" id="lp-badge"><b>P</b></div>
        <div class="pc-txt"><b id="lp-name">PLAYER</b><span>LEVEL <i id="lp-level">1</i></span><div class="xpbar"><i id="lp-xp"></i></div></div>
      </button>
      <div class="lob-sys">
        <span id="lob-net" class="net">SOLO · OFFLINE</span>
        <button class="ic" data-go="mail" title="Mail">${svg('mail')}<em id="mail-badge">1</em></button>
        <button class="ic" data-act="settings" title="Settings">${svg('gear')}</button>
      </div>
      <nav class="lob-left">
        <button data-go="shop">${svg('shop')}<span>SHOP</span></button>
        <button data-go="chars">${svg('chars')}<span>CHARACTERS</span></button>
        <button data-go="vault">${svg('vault')}<span>VAULT</span></button>
        <button data-go="stories">${svg('stories')}<span>STORIES</span></button>
      </nav>
      <div class="lob-hero">
        <b id="lh-name">XAVIER</b><span id="lh-role">TANK / SUPPORT</span>
        <button data-go="chars" class="mini">CHANGE HERO</button>
      </div>
      <button id="lob-play" class="play">${svg('play')}<b>PLAY</b><small id="lob-mode">TEAM DEATHMATCH</small></button>
      <div class="lob-bar">
        <button data-go="modes"><b>MODES</b><small>Choose what to play</small></button>
        <button data-go="loadouts"><b>LOADOUTS</b><small>Your guns</small></button>
        <button data-go="squad"><b>SQUAD</b><small>Friends on hotspot</small></button>
      </div>
    </section>

    <section id="scr-page" class="scr hidden">
      <header class="pg-head"><button class="ic back" data-act="back">${svg('back')}</button><h2 id="pg-title">PAGE</h2><span id="pg-sub"></span></header>
      <div id="pg-body"></div>
    </section>

    <div id="modal" class="hidden"><div class="modal-card"><button class="ic close" data-act="close">✕</button><div id="modal-body"></div></div></div>`;
    document.getElementById('app').appendChild(root);
    this.root = root;

    root.addEventListener('click', (e) => {
      const go = e.target.closest('[data-go]');
      const act = e.target.closest('[data-act]');
      if (go) this.openPage(go.dataset.go, go.dataset.arg);
      else if (act) this.action(act.dataset.act, act.dataset.arg);
    });
    $('tap-start').addEventListener('click', () => this.show('lobby'));
    $('lob-profile').addEventListener('click', () => this.openPage('profile'));
    $('lob-play').addEventListener('click', () => {
      const m = MODES.find((x) => x.id === this.profile.mode);
      if (!m || !m.ready) { this.toast('That mode is coming soon'); return; }
      this.onPlay(m.id);
    });
  }

  action(act, arg) {
    if (act === 'back') this.show('lobby');
    else if (act === 'settings') this.onSettings();
    else if (act === 'close') $('modal').classList.add('hidden');
    else if (act === 'pick-hero') { this.profile.hero = arg; this.save(); this.renderChars(); this.refresh(); this.toast(this.hero.name + ' selected'); }
    else if (act === 'view-hero') { this.viewHero = arg; this.renderChars(); }
    else if (act === 'preview') this.skillPreview(arg);
    else if (act === 'pick-mode') {
      const m = MODES.find((x) => x.id === arg);
      if (!m.ready) { this.toast(m.name + ' is coming soon'); return; }
      this.profile.mode = arg; this.save(); this.renderModes(); this.refresh();
    } else if (act === 'story') this.storyModal(arg);
    else if (act === 'soon') this.toast('Coming soon');
    else if (act === 'mail-open') { this.profile.mailRead = true; this.save(); this.refresh(); this.renderMail(true); }
  }

  // ---------- Navigation ----------
  show(name) {
    this.screen = name;
    for (const s of ['splash', 'lobby', 'page']) $('scr-' + s).classList.toggle('hidden', s !== name);
    this.root.classList.toggle('hidden', name === 'none');
    this.showcase = name === 'lobby' ? this.profile.hero : null;
    this.showcaseShift = 0;
    if (name === 'lobby') this.refresh();
  }

  openPage(page, arg) {
    this.page = page;
    this.show('page');
    $('pg-title').textContent = PAGES[page].toUpperCase();
    $('pg-sub').textContent = '';
    const body = $('pg-body');
    body.className = 'pg-' + page;
    if (page === 'chars') { this.viewHero = arg || this.profile.hero; this.renderChars(); }
    else if (page === 'stories') this.renderStories();
    else if (page === 'profile') this.renderProfile();
    else if (page === 'shop') this.renderGrid('shop', ['FEATURED', 'HERO SKINS', 'WEAPON SKINS', 'BUNDLES'], 8, 'Coming soon');
    else if (page === 'vault') this.renderVault();
    else if (page === 'mail') this.renderMail(false);
    else if (page === 'modes') this.renderModes();
    else if (page === 'loadouts') this.renderLoadouts();
    else if (page === 'squad') this.renderSquad();
  }

  refresh() {
    const p = this.profile, h = this.hero;
    $('lp-name').textContent = p.name;
    $('lp-badge').firstElementChild.textContent = p.name[0] || 'P';
    $('lp-level').textContent = this.level;
    $('lp-xp').style.width = (p.xp % 1000) / 10 + '%';
    $('mail-badge').classList.toggle('hidden', p.mailRead);
    const m = MODES.find((x) => x.id === p.mode) || MODES[0];
    $('lob-mode').textContent = m.name.toUpperCase();
    if (h) {
      $('lh-name').textContent = h.name.toUpperCase();
      $('lh-role').textContent = h.role.toUpperCase();
    }
    if (this.screen === 'lobby') this.showcase = p.hero;
  }

  // ---------- Pages ----------
  renderChars() {
    const hs = this.heroes;
    const v = hs.find((h) => h.id === this.viewHero) || hs[0];
    if (!v) { $('pg-body').innerHTML = '<p class="empty">Loading heroes…</p>'; return; }
    this.showcase = v.id;
    this.showcaseShift = -0.55;
    const skill = (s, label) => `
      <div class="skill">
        <div class="sk-icon" style="--c:${v.color}"><span>${label === 'MAIN' ? 'M' : 'S'}</span></div>
        <div><small>${label} SKILL</small><b>${s.name.toUpperCase()}</b><p>${s.desc}</p>
        <span class="sk-stats">${statLine(s)}</span></div>
      </div>`;
    $('pg-body').innerHTML = `
      <div class="hero-list">${hs.map((h) => `
        <button class="hero-tile ${h.id === v.id ? 'on' : ''}" data-act="view-hero" data-arg="${h.id}" style="--c:${h.color}">
          <div class="hx"><b>${h.name[0]}</b></div><span><b>${h.name.toUpperCase()}</b><small>${h.role}</small></span>
          ${h.id === this.profile.hero ? '<em>SELECTED</em>' : ''}
        </button>`).join('')}
      </div>
      <div class="hero-detail">
        <small class="kicker" style="color:${v.color}">${v.role.toUpperCase()} · ${v.gender === 'Robot' ? 'ROBOT' : v.gender === 'F' ? 'FEMALE' : 'MALE'}</small>
        <h3>${v.name.toUpperCase()}</h3>
        <p class="lore">Backstory coming soon.</p>
        ${skill(v.main, 'MAIN')}${skill(v.sub, 'SUB')}
        <div class="row-btns">
          <button class="menu-btn ghost" data-act="preview" data-arg="${v.id}">PREVIEW SKILLS</button>
          <button class="menu-btn ghost" data-act="story" data-arg="${v.id}">READ STORY</button>
          <button class="menu-btn primary" data-act="pick-hero" data-arg="${v.id}" ${v.id === this.profile.hero ? 'disabled' : ''}>${v.id === this.profile.hero ? 'SELECTED' : 'SELECT'}</button>
        </div>
      </div>`;
    $('pg-sub').textContent = `${hs.length} HEROES`;
  }

  skillPreview(id) {
    const h = this.heroes.find((x) => x.id === id);
    $('modal-body').innerHTML = `
      <small class="kicker" style="color:${h.color}">SKILL PREVIEW</small><h3>${h.name.toUpperCase()}</h3>
      <div class="preview-stage"><span>Skill preview videos arrive with 3D development</span></div>
      <div class="preview-tabs"><button class="on">${h.main.name.toUpperCase()}</button><button>${h.sub.name.toUpperCase()}</button></div>`;
    $('modal').classList.remove('hidden');
  }

  storyModal(id) {
    const h = this.heroes.find((x) => x.id === id);
    $('modal-body').innerHTML = `
      <small class="kicker" style="color:${h.color}">STORY</small><h3>${h.name.toUpperCase()}</h3>
      <div class="story-page"><span>Chapter 1</span><p>This chapter is waiting for its words and art.</p></div>`;
    $('modal').classList.remove('hidden');
  }

  renderStories() {
    const hs = this.heroes;
    $('pg-body').innerHTML = `
      <div class="story-main"><small class="kicker">MAIN STORY</small><h3>PROLOGUE</h3><p>The story of LiveSight starts here. Coming soon.</p>
        <button class="menu-btn ghost" data-act="soon">READ</button></div>
      <div class="story-grid">${hs.map((h) => `
        <button class="story-card" data-act="story" data-arg="${h.id}" style="--c:${h.color}">
          <div class="art"><b>${h.name[0]}</b></div><b>${h.name.toUpperCase()}</b><small>3 chapters · coming soon</small>
        </button>`).join('')}</div>`;
    $('pg-sub').textContent = 'MAIN STORY + HERO STORIES';
  }

  renderProfile() {
    const p = this.profile;
    const kd = p.deaths ? (p.kills / p.deaths).toFixed(2) : p.kills.toFixed(2);
    const stat = (label, val) => `<div class="stat"><b>${val}</b><small>${label}</small></div>`;
    $('pg-body').innerHTML = `
      <div class="prof-card">
        <div class="hx big"><b>${p.name[0] || 'P'}</b></div>
        <div><input id="prof-name" maxlength="14" value="${escapeHtml(p.name)}"><small>LEVEL ${this.level} · ${p.xp % 1000} / 1000 XP</small>
        <div class="xpbar"><i style="width:${(p.xp % 1000) / 10}%"></i></div></div>
      </div>
      <div class="stats">${stat('MATCHES', p.matches)}${stat('WINS', p.wins)}${stat('KILLS', p.kills)}${stat('DEATHS', p.deaths)}${stat('K/D', kd)}${stat('DAMAGE', Math.round(p.damage))}</div>
      <small class="kicker">BADGES</small><div class="badges">${'<div class="badge"></div>'.repeat(6)}</div>`;
    $('prof-name').addEventListener('change', (e) => {
      p.name = (e.target.value.trim() || 'PLAYER').toUpperCase().slice(0, 14);
      this.save(); this.refresh();
    });
  }

  renderGrid(kind, tabs, n, label) {
    $('pg-body').innerHTML = `
      <div class="tabs">${tabs.map((t, i) => `<button class="${i ? '' : 'on'}" data-act="soon">${t}</button>`).join('')}</div>
      <div class="grid">${Array.from({ length: n }, () => `<div class="slot-card"><span>${label}</span></div>`).join('')}</div>`;
  }

  renderVault() {
    $('pg-body').innerHTML = `
      <div class="tabs"><button class="on">HEROES</button><button data-act="soon">SKINS</button><button data-act="soon">BANNERS</button><button data-act="soon">EMOTES</button></div>
      <div class="grid">${this.heroes.map((h) => `<div class="slot-card owned" style="--c:${h.color}"><b>${h.name.toUpperCase()}</b><span>OWNED</span></div>`).join('')}
        ${Array.from({ length: 3 }, () => '<div class="slot-card"><span>Empty</span></div>').join('')}</div>`;
  }

  renderMail(open) {
    $('pg-body').innerHTML = `
      <div class="mail-list"><button class="mail-item ${this.profile.mailRead ? '' : 'unread'}" data-act="mail-open"><b>Welcome to LiveSight</b><small>From the LiveSight team</small></button></div>
      <div class="mail-view">${open ? '<h3>WELCOME TO LIVESIGHT</h3><p>This is an early prototype. Match rewards, events and news will arrive here.</p>' : '<p class="empty">Select a message</p>'}</div>`;
  }

  renderModes() {
    $('pg-body').innerHTML = `<div class="mode-grid">${MODES.map((m) => `
      <button class="mode-card ${m.id === this.profile.mode ? 'on' : ''} ${m.ready ? '' : 'locked'}" data-act="pick-mode" data-arg="${m.id}">
        <div class="art">${m.ready ? '' : svg('lock')}</div><b>${m.name.toUpperCase()}</b><small>${m.ready ? m.sub : 'Coming soon · ' + m.sub}</small>
      </button>`).join('')}</div>`;
  }

  renderLoadouts() {
    const ws = this.weapons;
    const slot = (label, name) => `<div class="lo-slot"><small>${label}</small><b>${name}</b></div>`;
    $('pg-body').innerHTML = `
      <div class="lo-slots">${slot('PRIMARY', 'ASSAULT RIFLE · 2× SCOPE')}${slot('SECONDARY', 'SMG · RED DOT')}${slot('SIDEARM', 'PISTOL · IRON SIGHTS')}</div>
      <small class="kicker">ARMOURY · ${ws.length} GUNS</small>
      <div class="grid guns">${ws.map((w) => `<div class="slot-card ${w.inV1 ? 'owned' : ''}"><b>${w.style.toUpperCase()}</b><span>${w.category.toUpperCase()} · ${w.inV1 ? 'AVAILABLE' : 'LOCKED'}</span></div>`).join('')}</div>`;
  }

  renderSquad() {
    $('pg-body').innerHTML = `
      <div class="squad-row">${['YOU', '', '', '', ''].map((n) => `<div class="sq-slot ${n ? 'me' : ''}"><div class="hx"><b>${n ? (this.profile.name[0] || 'P') : '+'}</b></div><span>${n ? this.profile.name : 'Empty'}</span></div>`).join('')}</div>
      <p class="empty">Hosting and joining friends over WiFi hotspot arrives in Phase 2.</p>
      <div class="row-btns"><button class="menu-btn ghost" data-act="soon">HOST ON HOTSPOT</button><button class="menu-btn ghost" data-act="soon">JOIN A HOST</button></div>`;
  }

  // Called by the game when a match ends
  recordMatch({ kills, deaths, damage, won }) {
    const p = this.profile;
    p.matches++; p.kills += kills; p.deaths += deaths; p.damage += damage;
    if (won) p.wins++;
    const xp = 100 + kills * 50 + (won ? 200 : 0);
    const before = this.level;
    p.xp += xp;
    this.save();
    return { xp, levelUp: this.level > before };
  }
}

function statLine(s) {
  const parts = [];
  if (s.duration) parts.push(s.duration + ' s');
  if (s.range) parts.push(s.range + ' m range');
  if (s.radius) parts.push(s.radius + ' m radius');
  if (s.damage) parts.push(s.damage + ' damage');
  if (s.dps) parts.push(s.dps + ' dmg/s');
  if (s.amount) parts.push('+' + s.amount + ' HP');
  if (s.shieldHp) parts.push(s.shieldHp + ' HP barrier');
  if (s.charges) parts.push(s.charges + ' charges');
  if (s.fuel) parts.push(s.fuel + ' s flight');
  if (s.cooldown) parts.push('cooldown ' + s.cooldown + ' s');
  return parts.join(' · ');
}
function escapeHtml(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
function load(k) { try { return JSON.parse(localStorage.getItem(k)) || {}; } catch { return {}; } }
