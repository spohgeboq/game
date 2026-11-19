import * as THREE from 'three';
import { createSnowParticleTexture } from './textures.js';

export class SnowParticleSystem {
  constructor(scene) {
    this.scene = scene;
    this.tex = createSnowParticleTexture();

    // 1. Dynamic Carving / Braking / Landing Snow Spray Plumes
    this.maxSpray = 460;
    this.sprayPos = new Float32Array(this.maxSpray * 3);
    this.sprayVel = new Float32Array(this.maxSpray * 3);
    this.sprayLife = new Float32Array(this.maxSpray);
    this.sprayMaxLife = new Float32Array(this.maxSpray);
    this.sprayCursor = 0;

    // Initialize offscreen
    for (let i = 0; i < this.maxSpray; i++) {
      this.sprayPos[i * 3 + 1] = -9999;
      this.sprayLife[i] = 0;
    }

    const sprayGeo = new THREE.BufferGeometry();
    sprayGeo.setAttribute('position', new THREE.BufferAttribute(this.sprayPos, 3));

    const sprayMat = new THREE.PointsMaterial({
      color: '#f4f9ff',
      map: this.tex,
      size: 0.68,
      transparent: true,
      opacity: 0.82,
      depthWrite: false,
      sizeAttenuation: true,
    });

    this.sprayPoints = new THREE.Points(sprayGeo, sprayMat);
    this.sprayPoints.frustumCulled = false;
    scene.add(this.sprayPoints);

    // 2. Ambient Drifting Alpine Snowflakes surrounding the skier in a wrapping 3D volume
    this.flakeCount = 720;
    this.flakeBox = { x: 46, y: 24, z: 54 };
    this.flakePos = new Float32Array(this.flakeCount * 3);
    this.flakeDrift = new Float32Array(this.flakeCount * 3);

    for (let i = 0; i < this.flakeCount; i++) {
      this.flakePos[i * 3] = (Math.random() - 0.5) * this.flakeBox.x;
      this.flakePos[i * 3 + 1] = (Math.random() - 0.5) * this.flakeBox.y;
      this.flakePos[i * 3 + 2] = (Math.random() - 0.5) * this.flakeBox.z;
      this.flakeDrift[i * 3] = (Math.random() - 0.5) * 1.6;
      this.flakeDrift[i * 3 + 1] = -1.2 - Math.random() * 1.8;
      this.flakeDrift[i * 3 + 2] = (Math.random() - 0.5) * 1.4;
    }

    const flakeGeo = new THREE.BufferGeometry();
    flakeGeo.setAttribute('position', new THREE.BufferAttribute(this.flakePos, 3));

    const flakeMat = new THREE.PointsMaterial({
      color: '#ffffff',
      map: this.tex,
      size: 0.22,
      transparent: true,
      opacity: 0.72,
      depthWrite: false,
      sizeAttenuation: true,
    });

    this.flakePoints = new THREE.Points(flakeGeo, flakeMat);
    this.flakePoints.frustumCulled = false;
    scene.add(this.flakePoints);

    this.sprayMat = sprayMat;
    this.flakeMat = flakeMat;
    this.emitAccum = 0;
  }

  applyLightingPreset(preset) {
    if (preset.id === 'sunset') {
      this.sprayMat.color.set('#ffe4d0');
      this.flakeMat.color.set('#ffebd9');
    } else if (preset.id === 'twilight') {
      this.sprayMat.color.set('#a8c5e8');
      this.flakeMat.color.set('#cfe2ff');
    } else {
      this.sprayMat.color.set('#f4f9ff');
      this.flakeMat.color.set('#ffffff');
    }
  }

  _spawnSpray(x, y, z, vx, vy, vz, life) {
    const i = this.sprayCursor;
    this.sprayCursor = (this.sprayCursor + 1) % this.maxSpray;

    const i3 = i * 3;
    this.sprayPos[i3] = x;
    this.sprayPos[i3 + 1] = y;
    this.sprayPos[i3 + 2] = z;

    this.sprayVel[i3] = vx;
    this.sprayVel[i3 + 1] = vy;
    this.sprayVel[i3 + 2] = vz;

    this.sprayLife[i] = life;
    this.sprayMaxLife[i] = life;
  }

  /**
   * Radial powder explosion when stomping a landing or brushing an obstacle
   */
  emitLandingBurst(pos, vel, intensity = 1.0) {
    const count = Math.round(28 + intensity * 36);
    for (let k = 0; k < count; k++) {
      const ang = Math.random() * Math.PI * 2;
      const spd = (2.4 + Math.random() * 5.2) * intensity;
      this._spawnSpray(
        pos.x + (Math.random() - 0.5) * 0.9,
        pos.y + 0.12 + Math.random() * 0.25,
        pos.z + (Math.random() - 0.5) * 0.9,
        vel.x * 0.45 + Math.cos(ang) * spd,
        1.8 + Math.random() * 4.2 * intensity,
        vel.z * 0.45 + Math.sin(ang) * spd,
        0.55 + Math.random() * 0.5
      );
    }
  }

  update(state, dt, elapsed) {
    // 1. Emit carving / braking / ground-butter / powder snow spray from ski edges
    if (state.grounded && state.speed > 4.0) {
      const carveMag = Math.abs(state.carveVisual);
      const brakeBoost = state.braking ? 2.4 : 0;
      const butterBoost = state.activeGroundTrick ? 1.85 : 0;
      const powderBoost = state.offPisteRatio * 1.4;
      const rate =
        (carveMag * 95 + brakeBoost * 55 + butterBoost * 65 + powderBoost * 45 + 14) *
        Math.min(1.5, state.speed / 22);

      this.emitAccum += rate * dt;
      const emitCount = Math.min(18, Math.floor(this.emitAccum));
      this.emitAccum -= emitCount;

      const rightX = Math.cos(state.heading);
      const rightZ = -Math.sin(state.heading);
      const fwdX = -Math.sin(state.heading);
      const fwdZ = -Math.cos(state.heading);

      // Spray kicks outward away from the turn direction!
      const sprayDir = state.carveVisual >= 0 ? 1 : -1;

      for (let k = 0; k < emitCount; k++) {
        const skiSide = k % 2 === 0 ? -0.22 : 0.22;
        const alongSki = (Math.random() - 0.3) * 0.9;
        const px = state.pos.x + rightX * skiSide + fwdX * alongSki;
        const py = state.pos.y + 0.08 + Math.random() * 0.15;
        const pz = state.pos.z + rightZ * skiSide + fwdZ * alongSki;

        const outSpd = (1.5 + carveMag * 5.2 + (state.braking ? 3.5 : 0)) * (0.6 + Math.random() * 0.7);
        const dirSign = state.braking ? (k % 2 === 0 ? -1 : 1) : sprayDir;

        const vx = state.vel.x * 0.35 + rightX * dirSign * outSpd + (Math.random() - 0.5) * 1.4;
        const vy = 0.8 + (carveMag * 2.4 + (state.braking ? 2.2 : 0)) * Math.random() + 0.6;
        const vz = state.vel.z * 0.35 + rightZ * dirSign * outSpd + (Math.random() - 0.5) * 1.4;

        this._spawnSpray(px, py, pz, vx, vy, vz, 0.38 + Math.random() * 0.45);
      }
    }

    // 2. Integrate active snow spray particles
    const drag = Math.exp(-2.4 * dt);
    for (let i = 0; i < this.maxSpray; i++) {
      if (this.sprayLife[i] <= 0) continue;
      this.sprayLife[i] -= dt;
      const i3 = i * 3;
      if (this.sprayLife[i] <= 0) {
        this.sprayPos[i3 + 1] = -9999;
        continue;
      }
      this.sprayVel[i3] *= drag;
      this.sprayVel[i3 + 1] -= 9.5 * dt;
      this.sprayVel[i3 + 2] *= drag;

      this.sprayPos[i3] += this.sprayVel[i3] * dt;
      this.sprayPos[i3 + 1] += this.sprayVel[i3 + 1] * dt;
      this.sprayPos[i3 + 2] += this.sprayVel[i3 + 2] * dt;
    }
    this.sprayPoints.geometry.attributes.position.needsUpdate = true;

    // 3. Wrap ambient drifting alpine snowflakes around skier position seamlessly
    const bx = this.flakeBox.x;
    const by = this.flakeBox.y;
    const bz = this.flakeBox.z;
    const halfX = bx * 0.5;
    const halfY = by * 0.5;
    const halfZ = bz * 0.5;

    const windX = Math.sin(elapsed * 0.45) * 1.8;
    const cx = state.pos.x;
    const cy = state.pos.y + 5.0;
    const cz = state.pos.z - 12.0;

    for (let i = 0; i < this.flakeCount; i++) {
      const i3 = i * 3;
      let x = this.flakePos[i3] + (this.flakeDrift[i3] + windX) * dt;
      let y = this.flakePos[i3 + 1] + this.flakeDrift[i3 + 1] * dt;
      let z = this.flakePos[i3 + 2] + this.flakeDrift[i3 + 2] * dt;

      // Wrap relative to skier center volume
      if (x - cx > halfX) x -= bx;
      else if (x - cx < -halfX) x += bx;

      if (y - cy > halfY) y -= by;
      else if (y - cy < -halfY) y += by;

      if (z - cz > halfZ) z -= bz;
      else if (z - cz < -halfZ) z += bz;

      this.flakePos[i3] = x;
      this.flakePos[i3 + 1] = y;
      this.flakePos[i3 + 2] = z;
    }
    this.flakePoints.geometry.attributes.position.needsUpdate = true;
  }
}
