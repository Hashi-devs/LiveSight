// Gun models and their sights. Each model points down -z with the grip at the origin.
// Used for both the first-person view and the soldiers' hands.
import * as THREE from 'three';

const M = {
  metal: new THREE.MeshLambertMaterial({ color: 0x2a2f37 }),
  dark: new THREE.MeshLambertMaterial({ color: 0x181b20 }),
  grip: new THREE.MeshLambertMaterial({ color: 0x3b3229 }),
  tan: new THREE.MeshLambertMaterial({ color: 0x7c6a4f }),
  glass: new THREE.MeshBasicMaterial({ color: 0x4fa3c9 }),
  red: new THREE.MeshBasicMaterial({ color: 0xff2a2a }),
};

function box(g, w, h, d, x, y, z, mat = M.metal, rx = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z); m.rotation.x = rx; g.add(m); return m;
}
function cyl(g, r, len, x, y, z, mat = M.metal, seg = 10) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, seg), mat);
  m.rotation.x = Math.PI / 2; m.position.set(x, y, z); g.add(m); return m;
}

// sight: { type, y } = height of the sight line above the grip origin (for aiming down sights)
export const SIGHTS = {
  ar_auto:     { type: 'scope2x',  label: '2× scope', adsFov: 38, adsSens: 0.5 },
  smg_fast:    { type: 'reddot',   label: 'Red dot',  adsFov: 58, adsSens: 0.75 },
  pistol_fast: { type: 'iron',     label: 'Iron sights', adsFov: 62, adsSens: 0.8 },
};

export function makeGun(id) {
  const g = new THREE.Group();
  let sightY = 0.1, muzzleZ = -0.6;
  if (id === 'ar_auto') {
    box(g, 0.07, 0.1, 0.42, 0, 0.05, -0.14);              // receiver
    box(g, 0.06, 0.07, 0.2, 0, 0.05, -0.44, M.tan);       // handguard
    cyl(g, 0.016, 0.22, 0, 0.06, -0.64, M.dark);          // barrel
    box(g, 0.05, 0.1, 0.22, 0, 0.03, 0.17, M.tan);        // stock
    box(g, 0.045, 0.16, 0.07, 0, -0.08, -0.17, M.dark, 0.25); // curved mag
    box(g, 0.05, 0.12, 0.05, 0, -0.06, 0.0, M.grip, -0.3);    // pistol grip
    cyl(g, 0.028, 0.18, 0, 0.145, -0.16, M.dark);         // 2x scope tube
    cyl(g, 0.034, 0.03, 0, 0.145, -0.26, M.dark);
    cyl(g, 0.034, 0.03, 0, 0.145, -0.06, M.dark);
    const lens = cyl(g, 0.026, 0.005, 0, 0.145, -0.255, M.glass);
    lens.rotation.x = Math.PI / 2;
    sightY = 0.145; muzzleZ = -0.76;
  } else if (id === 'smg_fast') {
    box(g, 0.07, 0.11, 0.3, 0, 0.05, -0.1);                // compact body
    cyl(g, 0.02, 0.14, 0, 0.06, -0.31, M.dark);            // short barrel + suppressor
    cyl(g, 0.026, 0.12, 0, 0.06, -0.43, M.dark);
    box(g, 0.04, 0.24, 0.05, 0, -0.12, -0.12, M.dark);     // long straight mag
    box(g, 0.05, 0.12, 0.05, 0, -0.06, 0.03, M.grip, -0.3);
    box(g, 0.02, 0.06, 0.18, 0.025, 0.04, 0.14, M.dark);   // folding stock rails
    box(g, 0.02, 0.06, 0.18, -0.025, 0.04, 0.14, M.dark);
    // open red dot frame: base, two posts and a top bar, so you can see through it
    box(g, 0.05, 0.012, 0.06, 0, 0.11, -0.08, M.dark);
    box(g, 0.008, 0.05, 0.02, 0.022, 0.135, -0.1, M.dark);
    box(g, 0.008, 0.05, 0.02, -0.022, 0.135, -0.1, M.dark);
    box(g, 0.052, 0.008, 0.02, 0, 0.162, -0.1, M.dark);
    sightY = 0.135; muzzleZ = -0.5;
  } else {
    box(g, 0.045, 0.06, 0.2, 0, 0.06, -0.07);              // slide
    box(g, 0.04, 0.03, 0.17, 0, 0.02, -0.06, M.dark);      // frame
    box(g, 0.042, 0.13, 0.055, 0, -0.04, 0.01, M.grip, -0.25); // angled grip
    box(g, 0.008, 0.016, 0.01, 0, 0.098, -0.16, M.dark);   // front post
    box(g, 0.03, 0.016, 0.01, 0, 0.098, 0.02, M.dark);     // rear notch
    sightY = 0.1; muzzleZ = -0.18;
  }
  g.userData = { sightY, muzzleZ };
  return g;
}
