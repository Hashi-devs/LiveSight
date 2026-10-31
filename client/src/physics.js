// Box collision for characters and rays. Boxes are axis-aligned: { min:[x,y,z], max:[x,y,z] }.
import { MOVE } from './config.js';

const EPS = 1e-4;

export function overlaps(x0, y0, z0, x1, y1, z1, b) {
  return x0 < b.max[0] && x1 > b.min[0] && y0 < b.max[1] && y1 > b.min[1] && z0 < b.max[2] && z1 > b.min[2];
}

export function spaceFree(boxes, x, y, z, r, h) {
  for (const b of boxes) if (overlaps(x - r, y, z - r, x + r, y + h, z + r, b)) return false;
  return true;
}

// Moves an entity { pos, vel, radius, height, grounded } by (dx, dy, dz), sliding along boxes
// and stepping up small ledges. Returns which horizontal axes were blocked.
export function moveEntity(ent, boxes, dx, dy, dz) {
  const p = ent.pos, r = ent.radius, h = ent.height;
  const wasGrounded = ent.grounded;
  let hitX = false, hitZ = false;

  const horizontal = (axis, d) => {
    if (d === 0) return false;
    p[axis] += d;
    let hit = false;
    for (const b of boxes) {
      if (!overlaps(p.x - r, p.y, p.z - r, p.x + r, p.y + h, p.z + r, b)) continue;
      const rise = b.max[1] - p.y;
      if (wasGrounded && rise > 0 && rise <= MOVE.stepHeight && spaceFree(boxes, p.x, b.max[1] + EPS, p.z, r, h)) {
        p.y = b.max[1] + EPS; // step up
        continue;
      }
      const i = axis === 'x' ? 0 : 2;
      p[axis] = d > 0 ? b.min[i] - r - EPS : b.max[i] + r + EPS;
      hit = true;
    }
    return hit;
  };

  hitX = horizontal('x', dx);
  hitZ = horizontal('z', dz);

  ent.grounded = false;
  p.y += dy;
  for (const b of boxes) {
    if (!overlaps(p.x - r, p.y, p.z - r, p.x + r, p.y + h, p.z + r, b)) continue;
    if (dy <= 0) { p.y = b.max[1]; ent.vel.y = 0; ent.grounded = true; }
    else { p.y = b.min[1] - h - EPS; ent.vel.y = 0; }
  }
  if (p.y <= 0) { p.y = 0; if (ent.vel.y < 0) ent.vel.y = 0; ent.grounded = true; }
  return { hitX, hitZ };
}

// Ray against one box (slab method). Returns distance or Infinity.
export function rayBox(ox, oy, oz, dx, dy, dz, b, maxDist) {
  let tmin = 0, tmax = maxDist;
  const o = [ox, oy, oz], d = [dx, dy, dz];
  for (let i = 0; i < 3; i++) {
    if (Math.abs(d[i]) < 1e-9) {
      if (o[i] < b.min[i] || o[i] > b.max[i]) return Infinity;
    } else {
      let t1 = (b.min[i] - o[i]) / d[i];
      let t2 = (b.max[i] - o[i]) / d[i];
      if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
      if (t1 > tmin) tmin = t1;
      if (t2 < tmax) tmax = t2;
      if (tmin > tmax) return Infinity;
    }
  }
  return tmin;
}

// Nearest wall hit along a ray. Returns distance (maxDist if nothing).
export function rayWorld(boxes, o, d, maxDist) {
  let best = maxDist;
  for (const b of boxes) {
    const t = rayBox(o.x, o.y, o.z, d.x, d.y, d.z, b, best);
    if (t < best) best = t;
  }
  return best;
}

export function lineOfSight(boxes, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
  const len = Math.hypot(dx, dy, dz);
  if (len < 1e-6) return true;
  const d = { x: dx / len, y: dy / len, z: dz / len };
  return rayWorld(boxes, a, d, len) >= len - 0.05;
}
