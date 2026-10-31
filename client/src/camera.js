// One camera rig that slides between first-person (blend 0) and over-the-shoulder (blend 1).
// Modes: 'fps', 'tps', 'adaptive' (TPS, switching to FPS while aiming or shooting).
import * as THREE from 'three';
import { CAMERA } from './config.js';
import { rayWorld } from './physics.js';

export class CameraRig {
  constructor(camera) {
    this.camera = camera;
    this.mode = 'adaptive';
    this.blend = 1;
    this.sinceShot = 99;
    this.fov = CAMERA.fov;
    this.dir = new THREE.Vector3();
    this.shake = 0;
    // First-person gun, attached to the camera
    const vm = new THREE.Group();
    const mat = new THREE.MeshLambertMaterial({ color: 0x2b313b });
    const gun = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.09, 0.46), mat);
    gun.position.set(0, 0, -0.12);
    const mag = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.14, 0.08), mat);
    mag.position.set(0, -0.11, -0.05);
    const sleeve = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.09, 0.3), new THREE.MeshLambertMaterial({ color: 0x3d7bd9 }));
    sleeve.position.set(0.02, -0.06, 0.22);
    vm.add(gun, mag, sleeve);
    vm.position.set(0.26, -0.25, -0.62);
    this.viewmodel = vm;
    camera.add(vm);
    this.recoilKick = 0;
  }

  cycleMode() {
    this.mode = { fps: 'tps', tps: 'adaptive', adaptive: 'fps' }[this.mode];
    return this.mode;
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
    this.fov += (fov - this.fov) * Math.min(1, dt * 12);
    if (Math.abs(cam.fov - this.fov) > 0.01) { cam.fov = this.fov; cam.updateProjectionMatrix(); }

    // Viewmodel only when fully first-person
    this.recoilKick = Math.max(0, this.recoilKick - dt * 6);
    this.viewmodel.visible = this.blend < 0.05 && player.alive;
    this.viewmodel.position.set(ads ? 0.0 : 0.26, ads ? -0.14 : -0.25, -0.62 + this.recoilKick * 0.06);
    return this.blend < 0.5; // true = first-person: hide own body
  }
}

const _eye = new THREE.Vector3(), _right = new THREE.Vector3(), _pivot = new THREE.Vector3(), _up = new THREE.Vector3();
const _back = new THREE.Vector3(), _tps = new THREE.Vector3(), _look = new THREE.Vector3();
