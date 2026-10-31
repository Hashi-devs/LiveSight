// One camera rig that slides between first-person (blend 0) and over-the-shoulder (blend 1).
// Modes: 'fps', 'tps', 'adaptive' (TPS, switching to FPS while aiming or shooting).
import * as THREE from 'three';
import { CAMERA } from './config.js';
import { rayWorld } from './physics.js';
import { makeGun, SIGHTS } from './guns.js';

export class CameraRig {
  constructor(camera) {
    this.camera = camera;
    this.mode = 'adaptive';
    this.blend = 1;
    this.sinceShot = 99;
    this.fov = CAMERA.fov;
    this.dir = new THREE.Vector3();
    this.shake = 0;
    // First-person gun, attached to the camera (swapped per weapon)
    this.viewmodel = new THREE.Group();
    camera.add(this.viewmodel);
    this.ads = 0;          // 0 = hip, 1 = fully aimed down sights
    this.sight = SIGHTS.ar_auto;
    this.recoilKick = 0;
  }

  cycleMode() {
    this.mode = { fps: 'tps', tps: 'adaptive', adaptive: 'fps' }[this.mode];
    return this.mode;
  }

  setGun(id) {
    const vm = this.viewmodel;
    vm.clear();
    const gun = makeGun(id);
    vm.add(gun);
    vm.scale.setScalar(VM_SCALE);
    const sleeve = new THREE.MeshLambertMaterial({ color: 0x3d7bd9 }), glove = new THREE.MeshLambertMaterial({ color: 0x1d2127 });
    const add = (w, h, d, m, x, y, z, rx = 0, ry = 0) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); b.rotation.set(rx, ry, 0); vm.add(b); };
    add(0.06, 0.07, 0.07, glove, 0.0, -0.05, 0.0);                 // trigger hand
    add(0.08, 0.08, 0.32, sleeve, 0.03, -0.1, 0.18, 0.25, 0.1);     // right forearm
    if (id !== 'pistol_fast') {
      add(0.06, 0.06, 0.07, glove, -0.01, 0.0, -0.36);             // support hand
      add(0.08, 0.08, 0.34, sleeve, -0.1, -0.07, -0.18, 0.2, -0.5); // left forearm
    }
    this.sightY = gun.userData.sightY;
    this.muzzleZ = gun.userData.muzzleZ;
    this.sight = SIGHTS[id];
  }

  wantFirstPerson(ads, firing) {
    if (this.mode === 'fps') return true;
    if (this.mode === 'tps') return false;
    return ads || firing || this.sinceShot < CAMERA.adaptiveReturn;
  }

  update(dt, player, boxes, ads, firing, adsFov) {
    if (firing) this.sinceShot = 0; else this.sinceShot += dt;
    const fp = player.alive && this.wantFirstPerson(ads, firing);
    const targetBlend = fp ? 0 : 1;
    const step = dt / CAMERA.blendTime;
    this.blend += Math.max(-step, Math.min(step, targetBlend - this.blend));

    const eye = player.eye(_eye);
    const dir = player.aimDir(this.dir);
    const right = _right.set(Math.cos(player.yaw), 0, -Math.sin(player.yaw));

    // Over-the-shoulder spot, pulled in if a wall is behind you
    const dist = ads ? CAMERA.tpsAdsDistance : CAMERA.tpsDistance;
    const pivot = _pivot.copy(eye).addScaledVector(right, CAMERA.tpsShoulder).add(_up.set(0, 0.25, 0));
    const back = _back.copy(dir).negate();
    const hit = rayWorld(boxes, pivot, back, dist + 0.3);
    const d = Math.max(0.3, Math.min(dist, hit - 0.3));
    const tps = _tps.copy(pivot).addScaledVector(back, d);
    if (!player.alive) tps.y += 2.5;

    const cam = this.camera;
    cam.position.copy(eye).lerp(tps, this.blend);
    if (this.shake > 0) {
      cam.position.x += (Math.random() - 0.5) * this.shake;
      cam.position.y += (Math.random() - 0.5) * this.shake;
      this.shake = Math.max(0, this.shake - dt * 0.5);
    }
    cam.lookAt(_look.copy(cam.position).add(dir));

    const fov = ads ? adsFov : CAMERA.fov;
    this.fov += (fov - this.fov) * Math.min(1, dt * 26);
    if (Math.abs(cam.fov - this.fov) > 0.01) { cam.fov = this.fov; cam.updateProjectionMatrix(); }

    // Viewmodel: hip position <-> sight lined up with the screen centre
    this.ads += ((ads ? 1 : 0) - this.ads) * Math.min(1, dt * 28);
    this.recoilKick = Math.max(0, this.recoilKick - dt * 6);
    const a = this.ads, kick = this.recoilKick;
    const vmOn = this.blend < 0.05 && player.alive;
    // A 2x scope fills the view when fully aimed, so the HUD draws the scope instead
    this.viewmodel.visible = vmOn && !(this.sight.type === 'scope2x' && a > 0.85);
    this.viewmodel.position.set(0.14 * (1 - a), -0.13 * (1 - a) - this.sightY * VM_SCALE * a, -0.3 - 0.02 * a + kick * 0.03);
    this.viewmodel.rotation.set(kick * 0.06, 0, 0);
    this.scoped = vmOn ? a : 0;
    return this.blend < 0.5; // true = first-person: hide own body
  }
}

const VM_SCALE = 0.55;
const _eye = new THREE.Vector3(), _right = new THREE.Vector3(), _pivot = new THREE.Vector3(), _up = new THREE.Vector3();
const _back = new THREE.Vector3(), _tps = new THREE.Vector3(), _look = new THREE.Vector3();
