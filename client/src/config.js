// Tunable numbers for Phase 1. Distances in metres, times in seconds.

export const GRAVITY = 22;

export const MOVE = {
  walk: 4.6,
  sprint: 7.0,
  crouch: 2.4,
  prone: 1.0,
  adsMul: 0.65,       // move slower while aiming
  jump: 7.2,
  groundAccel: 45,
  airAccel: 8,
  slideSpeed: 10.5,
  slideTime: 0.9,
  rollSpeed: 6.8,
  rollTime: 0.45,
  rollCooldown: 4,
  proneGetUp: 0.5,
  stepHeight: 0.45,
  mantleMin: 0.5,
  mantleMax: 2.3,
  mantleTime: 0.38,
};

export const STANCE = {
  stand:  { h: 1.8, eye: 1.62 },
  crouch: { h: 1.2, eye: 1.05 },
  prone:  { h: 0.5, eye: 0.38 },
};

export const RADIUS = 0.35;
export const HP_MAX = 100;
export const SHIELD_MAX = 100;
export const START_SHIELD = 75; // blue tier in Squad Battle

export const MATCH = {
  killTarget: 25,
  timeLimit: 480,
  respawn: 5,
  spawnProtect: 2,
  hitMarkTime: 5, // enemy stays marked this long after your shots land
};

export const CAMERA = {
  fov: 75,
  tpsDistance: 3.0,
  tpsShoulder: 0.85,
  tpsAdsDistance: 1.6,
  blendTime: 0.2,
  adaptiveReturn: 0.6, // seconds after shooting before adaptive returns to TPS
};

// Picks Low / Medium / High from what the phone reports.
export const IS_IOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

export function detectQuality() {
  // iPhones don't report memory; most run Medium smoothly, and the frame-rate watch lowers it if not
  if (IS_IOS) return 'medium';
  const mem = navigator.deviceMemory || 4; // GB, Chrome only, rounded
  const cores = navigator.hardwareConcurrency || 4;
  if (mem < 2 || cores <= 2) return 'low';
  if (mem < 4 || cores <= 4) return 'medium';
  return 'high';
}

export const QUALITY = {
  low:    { pixelRatio: 0.75, shadows: false, snow: false, drawDist: 90 },
  medium: { pixelRatio: 1.0,  shadows: false, snow: true,  drawDist: 140 },
  high:   { pixelRatio: 1.5,  shadows: true,  snow: true,  drawDist: 180 },
};
