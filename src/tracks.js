import * as THREE from 'three';
import { getTerrainHeight } from './terrain.js';

/**
 * Dual dynamic carved ski track ribbons left behind on the snow slope
 */
export class SkiTrackSystem {
  constructor(scene, maxSegments = 220) {
    this.maxSegments = maxSegments;
    this.tracks = [this._createTrackRibbon(scene), this._createTrackRibbon(scene)];
    this.lastEmitPos = new THREE.Vector3(0, 9999, 0);
    this.wasGrounded = false;
  }

  _createTrackRibbon(scene) {
    const vertsPerSeg = 2;
    const totalVerts = (this.maxSegments + 1) * vertsPerSeg;
    const positions = new Float32Array(totalVerts * 3);
    const colors = new Float32Array(totalVerts * 3);
    const indices = [];

    for (let i = 0; i < this.maxSegments; i++) {
      const a = i * 2;
      const b = a + 1;
      const c = a + 2;
      const d = a + 3;
      // Upward-facing winding order along -Z downhill tracks
      indices.push(a, b, c);
      indices.push(b, d, c);
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.setIndex(indices);

    const mat = new THREE.MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.45,
      side: THREE.DoubleSide,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });

    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    scene.add(mesh);

    return {
      mesh,
      geo,
      positions,
      colors,
      points: [], // ring-like list of { lx, ly, lz, rx, ry, rz, breakBefore }
    };
  }

  reset() {
    this.wasGrounded = false;
    this.lastEmitPos.set(0, 9999, 0);
    for (const t of this.tracks) {
      t.points.length = 0;
      t.positions.fill(0);
      t.geo.attributes.position.needsUpdate = true;
      t.geo.setDrawRange(0, 0);
    }
  }

  update(state) {
    if (!state.grounded) {
      this.wasGrounded = false;
      return;
    }

    const dx = state.pos.x - this.lastEmitPos.x;
    const dz = state.pos.z - this.lastEmitPos.z;
    const distSq = dx * dx + dz * dz;

    if (this.wasGrounded && distSq < 0.72) {
      return;
    }

    const rightX = Math.cos(state.heading);
    const rightZ = -Math.sin(state.heading);
    const skiHalfStance = 0.21 + (state.braking ? 0.08 : 0);
    const halfRibbon = 0.075 + Math.abs(state.carveVisual) * 0.045;
    const isBreak = !this.wasGrounded;

    const offsets = [-skiHalfStance, skiHalfStance];
    for (let s = 0; s < 2; s++) {
      const t = this.tracks[s];
      const cx = state.pos.x + rightX * offsets[s];
      const cz = state.pos.z + rightZ * offsets[s];

      const lx = cx - rightX * halfRibbon;
      const lz = cz - rightZ * halfRibbon;
      const rx = cx + rightX * halfRibbon;
      const rz = cz + rightZ * halfRibbon;

      const ly = getTerrainHeight(lx, lz) + 0.04;
      const ry = getTerrainHeight(rx, rz) + 0.04;

      if (isBreak && t.points.length > 0) {
        // Insert degenerate bridge point so airborne jumps don't draw lines through the sky!
        const prev = t.points[t.points.length - 1];
        t.points.push({ ...prev, degenerate: true });
        t.points.push({ lx, ly, lz, rx, ry, rz, degenerate: true });
      }

      t.points.push({ lx, ly, lz, rx, ry, rz, degenerate: false });
      while (t.points.length > this.maxSegments + 1) {
        t.points.shift();
      }

      const len = t.points.length;
      for (let i = 0; i < len; i++) {
        const p = t.points[i];
        const vIdx = i * 6;
        t.positions[vIdx] = p.lx;
        t.positions[vIdx + 1] = p.ly;
        t.positions[vIdx + 2] = p.lz;
        t.positions[vIdx + 3] = p.rx;
        t.positions[vIdx + 4] = p.ry;
        t.positions[vIdx + 5] = p.rz;

        // Soft alpine glacier-blue shadow tint inside carved ski grooves, fading cleanly at tail
        const fade = i / Math.max(1, len - 1);
        const shade = p.degenerate ? 0.95 : 0.7 + (1 - fade) * 0.16;
        t.colors[vIdx] = shade * 0.78;
        t.colors[vIdx + 1] = shade * 0.87;
        t.colors[vIdx + 2] = shade * 0.98;
        t.colors[vIdx + 3] = shade * 0.78;
        t.colors[vIdx + 4] = shade * 0.87;
        t.colors[vIdx + 5] = shade * 0.98;
      }

      t.geo.attributes.position.needsUpdate = true;
      t.geo.attributes.color.needsUpdate = true;
      t.geo.setDrawRange(0, Math.max(0, (len - 1) * 6));
    }

    this.lastEmitPos.copy(state.pos);
    this.wasGrounded = true;
  }
}
