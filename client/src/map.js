// Greybox Squad Battle map: snowy district (west), central battle zone, industrial east.
// Three lanes run west to east (north z=-26, mid z=0, south z=26). Blue spawns west, Red east.
import * as THREE from 'three';

export const BOUNDS = { minX: -60, maxX: 60, minZ: -34, maxZ: 34 };
export const LANES = [-26, 0, 26];

const C = {
  wall: 0x59616e,
  snowHouse: 0xe8edf3, snowRoof: 0xc9d3df, snowBank: 0xf4f7fb, ice: 0xb9d4ea,
  concrete: 0x8d95a3, concreteDark: 0x6c7482, crate: 0x9a7b54, platform: 0x7d8696, step: 0x8f98a8,
  contRed: 0x8a4a3c, contBlue: 0x3e5d80, contYellow: 0x9c8a3e, steel: 0x5b6370,
};

export function buildMap(scene, quality) {
  const boxes = [];
  const add = (cx, cz, w, d, h, color, y0 = 0) => {
    boxes.push({ min: [cx - w / 2, y0, cz - d / 2], max: [cx + w / 2, y0 + h, cz + d / 2], color });
  };
  const mirrorZ = (fn) => { fn(1); fn(-1); };

  // Outer walls
  add(0, BOUNDS.minZ - 1, 124, 2, 8, C.wall);
  add(0, BOUNDS.maxZ + 1, 124, 2, 8, C.wall);
  add(BOUNDS.minX - 1, 0, 2, 72, 8, C.wall);
  add(BOUNDS.maxX + 1, 0, 2, 72, 8, C.wall);

  mirrorZ((s) => {
    const row = 13 * s; // building rows sit between the lanes
    // --- Snowy district (west) ---
    add(-48, row, 14, 12, 7, C.snowHouse);
    add(-48, row, 15, 13, 0.6, C.snowRoof, 7);
    add(-29, row, 13, 12, 10.5, C.snowHouse);
    add(-29, row, 14, 13, 0.6, C.snowRoof, 10.5);
    add(-38.2, row + 4 * s, 2.2, 3, 1.1, C.ice);          // ice block in the alley (mantle onto it)
    add(-45, 23 * s, 4, 1.6, 0.8, C.snowBank);            // snowbanks along the outer lane
    add(-33, 30 * s, 5, 1.6, 0.9, C.snowBank);
    add(-24, 22.5 * s, 1.4, 1.4, 1.4, C.crate);
    add(-41, 3.6 * s, 1.4, 1.4, 1.3, C.crate);             // mid lane cover
    add(-30, 4.2 * s, 3, 1, 1.2, C.snowBank);

    // --- Central battle zone ---
    // Raised platform with stairs down toward the mid lane = high ground
    add(0, 12 * s, 8, 6, 3.2, C.platform);
    for (let i = 0; i < 7; i++) {
      const h = 2.8 - 0.4 * i;
      add(0, (9 - 0.25 - 0.5 * i) * s, 3, 0.5, h, C.step);
    }
    add(0, 15.4 * s, 8, 0.8, 1.1, C.concreteDark, 3.2); // parapet on the platform
    add(-10, 13 * s, 6, 4, 3.5, C.concrete);              // ruined blocks either side
    add(10, 14 * s, 5, 6, 2.2, C.concrete);
    add(-12, 29.5 * s, 1, 3, 1.4, C.concreteDark);        // outer-lane walls (kept off the lane centre)
    add(9, 29 * s, 6, 1, 1.4, C.concreteDark);
    add(-3, 22 * s, 1.6, 1.6, 1.5, C.crate);
    add(4, 24.5 * s, 1.4, 1.4, 1.2, C.crate);
    add(-6, 3.6 * s, 1.4, 1.4, 1.3, C.crate);             // mid lane cover near the plaza
    add(6, 3.8 * s, 3, 0.8, 1.2, C.concreteDark);
    add(-15, 4.2 * s, 0.8, 3, 1.4, C.concreteDark);
    add(15, 4.2 * s, 0.8, 3, 1.4, C.concreteDark);

    // --- Industrial east ---
    add(24, row, 13, 12, 5.2, C.contBlue);
    add(24, row, 6, 2.6, 2.6, C.contYellow, 5.2);
    add(45, row, 16, 12, 8, C.steel);
    add(34.5, row + 3 * s, 2.4, 6, 2.6, C.contRed);       // container in the alley
    add(26, 22.8 * s, 6, 2.4, 2.6, C.contRed);
    add(42, 29.5 * s, 6, 2.4, 2.6, C.contYellow);
    add(38, 23 * s, 1.4, 1.4, 1.4, C.crate);
    add(30, 3.8 * s, 1.4, 1.4, 1.3, C.crate);
    add(41, 4.2 * s, 2.4, 1.2, 1.5, C.contBlue);

    // Spawn cover
    add(-52, 8 * s, 1, 4, 1.6, C.wall);
    add(52, 8 * s, 1, 4, 1.6, C.wall);
  });

  // ---- Visuals ----
  const group = new THREE.Group();

  // Ground: snow west, concrete centre, asphalt east
  const ground = (x0, x1, color) => {
    const g = new THREE.Mesh(
      new THREE.PlaneGeometry(x1 - x0, BOUNDS.maxZ - BOUNDS.minZ + 4),
      new THREE.MeshLambertMaterial({ color })
    );
    g.rotation.x = -Math.PI / 2;
    g.position.set((x0 + x1) / 2, 0, 0);
    g.receiveShadow = quality.shadows;
    group.add(g);
  };
  ground(-62, -18, 0xdfe6ee);
  ground(-18, 18, 0x7b8291);
  ground(18, 62, 0x5f6673);

  // Lane lines so players can read the layout
  const lineMat = new THREE.MeshBasicMaterial({ color: 0x9aa3b2 });
  for (const z of [-7, 7]) {
    const l = new THREE.Mesh(new THREE.PlaneGeometry(36, 0.15), lineMat);
    l.rotation.x = -Math.PI / 2; l.position.set(0, 0.01, z); group.add(l);
  }

  // All boxes in one instanced mesh (one draw call)
  const geo = new THREE.BoxGeometry(1, 1, 1);
  const mat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  const inst = new THREE.InstancedMesh(geo, mat, boxes.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), pos = new THREE.Vector3(), scl = new THREE.Vector3();
  const col = new THREE.Color();
  boxes.forEach((b, i) => {
    pos.set((b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, (b.min[2] + b.max[2]) / 2);
    scl.set(b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]);
    m.compose(pos, q, scl);
    inst.setMatrixAt(i, m);
    // slight shade variation so stacked boxes read as separate pieces
    col.setHex(b.color).offsetHSL(0, 0, ((i * 37) % 7 - 3) * 0.006);
    inst.setColorAt(i, col);
  });
  inst.castShadow = quality.shadows;
  inst.receiveShadow = quality.shadows;
  group.add(inst);

  // Decorative pines in the snowy district (trunks collide)
  const pineMat = new THREE.MeshLambertMaterial({ color: 0x3f5e4f });
  const snowCap = new THREE.MeshLambertMaterial({ color: 0xf2f5f9 });
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x5a4636 });
  const pine = (x, z, s = 1) => {
    const t = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 1.2, 6), trunkMat);
    t.position.set(x, 0.6, z);
    const c1 = new THREE.Mesh(new THREE.ConeGeometry(1.3 * s, 2.4 * s, 7), pineMat);
    c1.position.set(x, 1.2 + 1.2 * s, z);
    const c2 = new THREE.Mesh(new THREE.ConeGeometry(0.8 * s, 1.4 * s, 7), snowCap);
    c2.position.set(x, 1.2 + 2.6 * s, z);
    group.add(t, c1, c2);
    boxes.push({ min: [x - 0.25, 0, z - 0.25], max: [x + 0.25, 1.4, z + 0.25], color: 0, hidden: true });
  };
  [[-56, -31], [-50, -32.5], [-38, -32], [-22, -32.5], [-56, 31.5], [-44, 32.5], [-27, 31.5], [-58, -18], [-58, 18]]
    .forEach(([x, z], i) => pine(x, z, 0.85 + (i % 3) * 0.15));

  scene.add(group);

  // Spawn points per team
  const spawns = {
    blue: [[-55, -26], [-55, -3], [-55, 3], [-55, 26], [-57, 0]],
    red: [[55, -26], [55, -3], [55, 3], [55, 26], [57, 0]],
  };

  // Static minimap image data
  return { boxes, group, spawns };
}

// Light snowfall over the west district
export function makeSnow(scene) {
  const n = 600;
  const g = new THREE.BufferGeometry();
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    arr[i * 3] = -60 + Math.random() * 44;
    arr[i * 3 + 1] = Math.random() * 18;
    arr[i * 3 + 2] = -34 + Math.random() * 68;
  }
  g.setAttribute('position', new THREE.BufferAttribute(arr, 3));
  const pts = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xffffff, size: 0.12, transparent: true, opacity: 0.85 }));
  scene.add(pts);
  return (dt) => {
    for (let i = 0; i < n; i++) {
      arr[i * 3 + 1] -= dt * (1.2 + (i % 5) * 0.2);
      arr[i * 3] += Math.sin((arr[i * 3 + 1] + i) * 0.5) * dt * 0.3;
      if (arr[i * 3 + 1] < 0) arr[i * 3 + 1] = 18;
    }
    g.attributes.position.needsUpdate = true;
  };
}
