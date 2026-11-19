import * as THREE from 'three';
import {
  COURSE_START_Z,
  COURSE_FINISH_Z,
  COURSE_END_Z,
  RAMPS,
  getPisteCenterX,
  getPisteHalfWidth,
  getPisteHeading,
  getTerrainHeight,
  getTerrainNormal,
  getRampInfo,
  generateCourseFeatures,
} from './terrain.js';
import {
  createSnowNormalTexture,
  createSnowAlbedoTexture,
  createWoodTexture,
  createGantryBannerTexture,
  createSafetyNetTexture,
} from './textures.js';

/**
 * Utility: merge multiple non-indexed or indexed BufferGeometries into one BufferGeometry
 */
function mergeGeometries(geometries) {
  let totalVerts = 0;
  let totalIndices = 0;
  const prepared = [];

  for (const g of geometries) {
    const geom = g.index ? g : g.clone();
    const pos = geom.getAttribute('position');
    if (!geom.getAttribute('normal')) geom.computeVertexNormals();
    const count = pos.count;
    const idx = geom.getIndex();
    totalVerts += count;
    totalIndices += idx ? idx.count : count;
    prepared.push({ geom, count, idx });
  }

  const positions = new Float32Array(totalVerts * 3);
  const normals = new Float32Array(totalVerts * 3);
  const indices = new Uint32Array(totalIndices);

  let vOffset = 0;
  let iOffset = 0;
  for (const { geom, count, idx } of prepared) {
    positions.set(geom.getAttribute('position').array, vOffset * 3);
    normals.set(geom.getAttribute('normal').array, vOffset * 3);

    if (idx) {
      const arr = idx.array;
      for (let i = 0; i < arr.length; i++) {
        indices[iOffset + i] = arr[i] + vOffset;
      }
      iOffset += arr.length;
    } else {
      for (let i = 0; i < count; i++) {
        indices[iOffset + i] = vOffset + i;
      }
      iOffset += count;
    }
    vOffset += count;
  }

  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  merged.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  merged.setIndex(new THREE.BufferAttribute(indices, 1));
  return merged;
}

/**
 * Create fluted, organic pine bough cone tier (much richer silhouette than plain smooth cone)
 */
function createPineTierGeometry(radius, height, yCenter, radialSegs = 12, flutes = 6) {
  const geo = new THREE.ConeGeometry(radius, height, radialSegs, 2, false);
  const pos = geo.getAttribute('position');
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const r = Math.hypot(x, z);
    if (r > 0.01) {
      const ang = Math.atan2(z, x);
      const flute = 1.0 + Math.sin(ang * flutes) * 0.16;
      // Droop lower bough tips slightly for snow weight feel
      const droop = y < 0 ? -0.18 * (r / radius) : 0;
      pos.setXYZ(i, x * flute, y + yCenter + droop, z * flute);
    } else {
      pos.setY(i, y + yCenter);
    }
  }
  geo.computeVertexNormals();
  return geo;
}

export class AlpineWorld {
  constructor(scene) {
    this.scene = scene;
    this.root = new THREE.Group();
    scene.add(this.root);

    this.features = generateCourseFeatures();
    this.terrainChunks = [];
    this.animatedFlags = [];
    this.gateVisuals = [];
    this.liftChairs = [];
    this.chaletWindowMats = [];
    this.beaconLights = [];
    this.snowSparkleUniforms = {
      uSunDir: { value: new THREE.Vector3(-0.64, 0.42, -0.64).normalize() },
      uSparkleStrength: { value: 0.42 },
    };

    // Build shared procedural textures
    this.snowAlbedo = createSnowAlbedoTexture();
    this.snowNormal = createSnowNormalTexture();
    this.woodTex = createWoodTexture();
    this.safetyNetTex = createSafetyNetTexture();

    this._buildTerrainChunks();
    this._buildPineForest();
    this._buildBoulders();
    this._buildSlalomGates();
    this._buildRampMarkers();
    this._buildSafetyFences();
    this._buildChairlift();
    this._buildStartPavilion();
    this._buildFinishVillage();
  }

  /**
   * Build high-resolution chunked alpine terrain with sunlit snow sparkle & corduroy normal detail
   */
  _buildTerrainChunks() {
    this.snowAlbedo.repeat.set(1, 1);
    this.snowNormal.repeat.set(1, 1);

    const snowMat = new THREE.MeshStandardMaterial({
      color: '#ffffff',
      vertexColors: true,
      map: this.snowAlbedo,
      normalMap: this.snowNormal,
      normalScale: new THREE.Vector2(0.55, 0.55),
      roughness: 0.72,
      metalness: 0.04,
    });

    // Inject subtle real-time sunlit snow crystal sparkle glints while preserving full Three.js PBR + PCF shadows!
    snowMat.onBeforeCompile = (shader) => {
      shader.uniforms.uSunDir = this.snowSparkleUniforms.uSunDir;
      shader.uniforms.uSparkleStrength = this.snowSparkleUniforms.uSparkleStrength;

      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          `#include <common>
           varying vec3 vSnowWorldPos;
           varying vec3 vSnowWorldNormal;`
        )
        .replace(
          '#include <worldpos_vertex>',
          `#include <worldpos_vertex>
           vSnowWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
           vSnowWorldNormal = normalize(mat3(modelMatrix) * objectNormal);`
        );

      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
           uniform vec3 uSunDir;
           uniform float uSparkleStrength;
           varying vec3 vSnowWorldPos;
           varying vec3 vSnowWorldNormal;
           float snowHash(vec2 p) {
             p = fract(p * vec2(123.34, 456.21));
             p += dot(p, p + 45.32);
             return fract(p.x * p.y);
           }`
        )
        .replace(
          '#include <dithering_fragment>',
          `
           // Fine alpine snow crystal glints in sunlight
           vec3 viewDirW = normalize(cameraPosition - vSnowWorldPos);
           float distCam = length(cameraPosition - vSnowWorldPos);
           if (distCam < 95.0 && vSnowWorldNormal.y > 0.78) {
             vec2 cell = floor(vSnowWorldPos.xz * 7.5 + viewDirW.xz * 1.4);
             float h1 = snowHash(cell);
             float h2 = snowHash(cell + 17.3);
             float glint = smoothstep(0.982, 0.999, h1) * smoothstep(0.35, 0.95, h2);
             float sunFacing = max(dot(vSnowWorldNormal, normalize(uSunDir)), 0.0);
             float fade = 1.0 - smoothstep(20.0, 95.0, distCam);
             gl_FragColor.rgb += vec3(0.95, 0.98, 1.0) * glint * sunFacing * fade * uSparkleStrength;
           }
           #include <dithering_fragment>`
        );
    };

    const chunkLen = 200;
    const zStart = 80;
    const zEnd = COURSE_END_Z - 60;
    const segsZ = 84; // ~2.38m along slope (crisp kicker curves!)
    const segsX = 68; // dense near piste center, wider on mountain flanks

    const normalTmp = new THREE.Vector3();
    const cPiste = new THREE.Color('#f7fbff');
    const cPowder = new THREE.Color('#ddebf8');
    const cEdgeTrough = new THREE.Color('#cadff4');
    const cRock = new THREE.Color('#4d5866');
    const cRampLip = new THREE.Color('#f68854');
    const cTmp = new THREE.Color();

    for (let z0 = zStart; z0 > zEnd; z0 -= chunkLen) {
      const z1 = Math.max(zEnd, z0 - chunkLen);
      const vCount = (segsX + 1) * (segsZ + 1);
      const positions = new Float32Array(vCount * 3);
      const colors = new Float32Array(vCount * 3);
      const uvs = new Float32Array(vCount * 2);
      const indices = [];

      let ptr = 0;
      let uvPtr = 0;

      for (let iz = 0; iz <= segsZ; iz++) {
        const tz = iz / segsZ;
        const z = z0 + (z1 - z0) * tz;
        const cx = getPisteCenterX(z);
        const hw = getPisteHalfWidth(z);

        for (let ix = 0; ix <= segsX; ix++) {
          // Non-linear distribution u in [-1, 1]: concentrated inside piste, stretching out to +-185m
          const s = (ix / segsX) * 2 - 1;
          const sign = s < 0 ? -1 : 1;
          const a = Math.abs(s);
          const lateral = sign * (a * 48 + Math.pow(a, 2.35) * 140);
          const x = cx + lateral;
          const y = getTerrainHeight(x, z);

          positions[ptr] = x;
          positions[ptr + 1] = y;
          positions[ptr + 2] = z;

          // World-anchored UV tiling (every 10 meters) so corduroy tracks stay seamless across chunks!
          uvs[uvPtr] = (x - cx) * 0.12;
          uvs[uvPtr + 1] = z * 0.1;

          getTerrainNormal(x, z, normalTmp);
          const absLat = Math.abs(lateral);
          const pisteRatio = absLat / hw;

          if (pisteRatio < 0.92) {
            cTmp.copy(cPiste);
          } else if (pisteRatio < 1.15) {
            const blend = (pisteRatio - 0.92) / 0.23;
            cTmp.copy(cPiste).lerp(cEdgeTrough, blend * 0.45);
          } else {
            const blend = Math.min(1, (pisteRatio - 1.15) / 0.65);
            cTmp.copy(cEdgeTrough).lerp(cPowder, blend);
          }

          // Paint subtle warm alpine visibility tint right along ramp takeoff lips!
          const ramp = getRampInfo(x, z);
          if (ramp.lift > 0.25 && ramp.lipProgress > 0.86 && ramp.lipProgress < 1.03) {
            const lipBand = 1.0 - Math.abs(ramp.lipProgress - 0.96) / 0.1;
            cTmp.lerp(cRampLip, Math.max(0, lipBand) * 0.52);
          }

          // Expose rugged alpine granite cliffs on steep canyon walls
          if (normalTmp.y < 0.82 && absLat > hw + 4) {
            const rockBlend = Math.min(1, (0.82 - normalTmp.y) / 0.24);
            cTmp.lerp(cRock, rockBlend * 0.88);
          }

          colors[ptr] = cTmp.r;
          colors[ptr + 1] = cTmp.g;
          colors[ptr + 2] = cTmp.b;

          ptr += 3;
          uvPtr += 2;
        }
      }

      const stride = segsX + 1;
      for (let iz = 0; iz < segsZ; iz++) {
        for (let ix = 0; ix < segsX; ix++) {
          const a = iz * stride + ix;
          const b = a + 1;
          const c = (iz + 1) * stride + ix;
          const d = c + 1;
          // Winding order for +Y upward normals (z decreases as iz increases)
          indices.push(a, b, c);
          indices.push(b, d, c);
        }
      }

      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
      geo.setIndex(indices);
      geo.computeVertexNormals();
      geo.computeBoundingSphere();

      const mesh = new THREE.Mesh(geo, snowMat);
      mesh.receiveShadow = true;
      mesh.castShadow = true;
      this.root.add(mesh);

      this.terrainChunks.push({
        mesh,
        zMin: z1,
        zMax: z0,
      });
    }
  }

  /**
   * Instanced multi-tiered alpine spruce forest with bark trunks, fluted foliage & sunlit snow crowns
   */
  _buildPineForest() {
    const trees = this.features.trees;
    const count = trees.length;
    if (count === 0) return;

    // 1. Tapered bark trunk
    const trunkGeo = new THREE.CylinderGeometry(0.18, 0.42, 3.6, 7);
    trunkGeo.translate(0, 1.8, 0);
    const trunkMat = new THREE.MeshStandardMaterial({
      color: '#4e3524',
      roughness: 0.94,
    });

    // 2. 4-tier evergreen spruce foliage merged
    const foliageGeo = mergeGeometries([
      createPineTierGeometry(2.65, 3.4, 3.4, 12, 6),
      createPineTierGeometry(2.15, 3.1, 5.4, 12, 6),
      createPineTierGeometry(1.55, 2.7, 7.2, 10, 5),
      createPineTierGeometry(0.95, 2.3, 8.85, 10, 5),
    ]);
    const foliageMat = new THREE.MeshStandardMaterial({
      color: '#1f4232',
      roughness: 0.88,
      flatShading: true,
    });

    // 3. Snow caps nestled on top of each pine bough tier
    const snowCapGeo = mergeGeometries([
      createPineTierGeometry(2.25, 1.35, 4.45, 12, 6),
      createPineTierGeometry(1.82, 1.2, 6.35, 12, 6),
      createPineTierGeometry(1.28, 1.05, 8.05, 10, 5),
      createPineTierGeometry(0.75, 1.1, 9.55, 10, 5),
    ]);
    const snowCapMat = new THREE.MeshStandardMaterial({
      color: '#eef6ff',
      roughness: 0.68,
      flatShading: true,
    });

    const trunkInst = new THREE.InstancedMesh(trunkGeo, trunkMat, count);
    const foliageInst = new THREE.InstancedMesh(foliageGeo, foliageMat, count);
    const snowInst = new THREE.InstancedMesh(snowCapGeo, snowCapMat, count);

    trunkInst.castShadow = true;
    trunkInst.receiveShadow = true;
    foliageInst.castShadow = true;
    foliageInst.receiveShadow = true;
    snowInst.castShadow = true;
    snowInst.receiveShadow = true;

    const dummy = new THREE.Object3D();
    const cFoliage = new THREE.Color();

    for (let i = 0; i < count; i++) {
      const t = trees[i];
      dummy.position.set(t.x, t.y, t.z);
      dummy.rotation.set(t.leanX, t.rotY, t.leanZ);
      dummy.scale.set(t.scale, t.scale * (0.95 + (i % 5) * 0.05), t.scale);
      dummy.updateMatrix();

      trunkInst.setMatrixAt(i, dummy.matrix);
      foliageInst.setMatrixAt(i, dummy.matrix);
      snowInst.setMatrixAt(i, dummy.matrix);

      // Subtle organic evergreen hue variation per tree
      const hueShift = ((i * 37) % 100) / 100;
      cFoliage.setHSL(0.39 + hueShift * 0.04, 0.36 + hueShift * 0.1, 0.14 + hueShift * 0.07);
      foliageInst.setColorAt(i, cFoliage);
    }

    trunkInst.instanceMatrix.needsUpdate = true;
    foliageInst.instanceMatrix.needsUpdate = true;
    snowInst.instanceMatrix.needsUpdate = true;
    if (foliageInst.instanceColor) foliageInst.instanceColor.needsUpdate = true;

    this.root.add(trunkInst, foliageInst, snowInst);
  }

  /**
   * Sculpted snow-topped alpine granite boulders (InstancedMesh)
   */
  _buildBoulders() {
    const boulders = this.features.boulders;
    const count = boulders.length;
    if (count === 0) return;

    const baseGeo = new THREE.IcosahedronGeometry(1.0, 1);
    const pos = baseGeo.getAttribute('position');
    const colors = new Float32Array(pos.count * 3);
    const cRock = new THREE.Color('#5a6472');
    const cRockDark = new THREE.Color('#39414d');
    const cSnow = new THREE.Color('#f0f6fd');
    const cOut = new THREE.Color();

    for (let i = 0; i < pos.count; i++) {
      const vx = pos.getX(i);
      const vy = pos.getY(i);
      const vz = pos.getZ(i);
      const disp = 0.84 + Math.sin(vx * 4.3 + vz * 3.1) * 0.14 + Math.cos(vy * 5.2 - vx * 2.4) * 0.1;
      pos.setXYZ(i, vx * disp, vy * disp, vz * disp);
    }
    baseGeo.computeVertexNormals();

    const norm = baseGeo.getAttribute('normal');
    for (let i = 0; i < pos.count; i++) {
      const ny = norm.getY(i);
      if (ny > 0.45) {
        cOut.copy(cRock).lerp(cSnow, Math.min(1, (ny - 0.45) / 0.25));
      } else {
        cOut.copy(cRockDark).lerp(cRock, Math.max(0, (ny + 0.5) / 0.95));
      }
      colors[i * 3] = cOut.r;
      colors[i * 3 + 1] = cOut.g;
      colors[i * 3 + 2] = cOut.b;
    }
    baseGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const mat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.9,
      metalness: 0.05,
      flatShading: true,
    });

    const inst = new THREE.InstancedMesh(baseGeo, mat, count);
    inst.castShadow = true;
    inst.receiveShadow = true;

    const dummy = new THREE.Object3D();
    for (let i = 0; i < count; i++) {
      const b = boulders[i];
      dummy.position.set(b.x, b.y, b.z);
      dummy.rotation.set(b.rotX, b.rotY, b.rotZ);
      dummy.scale.set(b.sx, b.sy, b.sz);
      dummy.updateMatrix();
      inst.setMatrixAt(i, dummy.matrix);
    }
    inst.instanceMatrix.needsUpdate = true;
    this.root.add(inst);
  }

  /**
   * World Cup Giant Slalom Gates (double flex-poles + animated cloth panels)
   */
  _buildSlalomGates() {
    const poleGeo = new THREE.CylinderGeometry(0.055, 0.065, 3.1, 8);
    poleGeo.translate(0, 1.55, 0);

    const flagGeo = new THREE.PlaneGeometry(1.15, 0.72, 4, 2);

    const redPoleMat = new THREE.MeshStandardMaterial({
      color: '#e6422c',
      roughness: 0.35,
      metalness: 0.1,
    });
    const bluePoleMat = new THREE.MeshStandardMaterial({
      color: '#1b6fd8',
      roughness: 0.35,
      metalness: 0.1,
    });
    const redFlagMat = new THREE.MeshStandardMaterial({
      color: '#e8452e',
      emissive: '#591208',
      emissiveIntensity: 0.15,
      roughness: 0.6,
      side: THREE.DoubleSide,
    });
    const blueFlagMat = new THREE.MeshStandardMaterial({
      color: '#1e7be8',
      emissive: '#082552',
      emissiveIntensity: 0.15,
      roughness: 0.6,
      side: THREE.DoubleSide,
    });

    const beaconGeo = new THREE.SphereGeometry(0.11, 8, 8);

    for (const g of this.features.gates) {
      const group = new THREE.Group();
      const rightX = Math.cos(g.heading);
      const rightZ = -Math.sin(g.heading);

      const pMat = g.color === 'red' ? redPoleMat : bluePoleMat;
      const fMat = (g.color === 'red' ? redFlagMat : blueFlagMat).clone();

      // Left & Right pairs of GS gate poles defining the pass-through corridor
      const leftX = g.x - rightX * g.halfSpan;
      const leftZ = g.z - rightZ * g.halfSpan;
      const leftY = getTerrainHeight(leftX, leftZ);

      const rightPx = g.x + rightX * g.halfSpan;
      const rightPz = g.z + rightZ * g.halfSpan;
      const rightPy = getTerrainHeight(rightPx, rightPz);

      const makeGatePost = (px, py, pz, outerDir) => {
        const postGroup = new THREE.Group();
        postGroup.position.set(px, py - 0.15, pz);
        postGroup.rotation.y = g.heading;

        const innerPole = new THREE.Mesh(poleGeo, pMat);
        innerPole.castShadow = true;
        postGroup.add(innerPole);

        const outerPole = new THREE.Mesh(poleGeo, pMat);
        outerPole.position.x = outerDir * 1.12;
        outerPole.castShadow = true;
        postGroup.add(outerPole);

        const panel = new THREE.Mesh(flagGeo, fMat);
        panel.position.set(outerDir * 0.56, 2.35, 0);
        panel.castShadow = true;
        postGroup.add(panel);

        // Glowing top cap for twilight visibility
        const capMat = new THREE.MeshStandardMaterial({
          color: g.color === 'red' ? '#ff7c66' : '#7ec5ff',
          emissive: g.color === 'red' ? '#ff4628' : '#2c94ff',
          emissiveIntensity: 0.35,
          roughness: 0.3,
        });
        const cap = new THREE.Mesh(beaconGeo, capMat);
        cap.position.set(0, 3.12, 0);
        postGroup.add(cap);
        this.beaconLights.push(capMat);

        this.animatedFlags.push({
          mesh: panel,
          phase: g.id * 1.13 + outerDir,
        });

        return postGroup;
      };

      group.add(makeGatePost(leftX, leftY, leftZ, -1));
      group.add(makeGatePost(rightPx, rightPy, rightPz, 1));

      this.root.add(group);
      this.gateVisuals.push({
        gate: g,
        group,
        flagMat: fMat,
        pulse: 0,
      });
    }
  }

  /**
   * Bright striped bamboo launch markers flanking every snow kicker ramp
   */
  _buildRampMarkers() {
    const poleGeo = new THREE.CylinderGeometry(0.06, 0.075, 2.9, 8);
    poleGeo.translate(0, 1.45, 0);
    const orangeMat = new THREE.MeshStandardMaterial({
      color: '#ff6a1a',
      emissive: '#6e2300',
      emissiveIntensity: 0.25,
      roughness: 0.4,
    });
    const darkMat = new THREE.MeshStandardMaterial({ color: '#1b2029', roughness: 0.6 });
    const bandGeo = new THREE.CylinderGeometry(0.068, 0.068, 0.38, 8);
    const pennantGeo = new THREE.ConeGeometry(0.32, 0.85, 3);
    pennantGeo.rotateZ(-Math.PI / 2);

    for (const r of RAMPS) {
      const rightX = r.cosH;
      const rightZ = -r.sinH;
      const halfW = r.width * 0.5 + 0.35;

      for (const side of [-1, 1]) {
        // Place launch markers at the ramp takeoff lip (localFwd = 0) and midway up
        for (const along of [0, -r.length * 0.52]) {
          const mx = r.x + rightX * side * halfW - r.sinH * along;
          const mz = r.z + rightZ * side * halfW - r.cosH * along;
          const my = getTerrainHeight(mx, mz);

          const g = new THREE.Group();
          g.position.set(mx, my - 0.15, mz);
          g.rotation.y = r.heading;

          const pole = new THREE.Mesh(poleGeo, orangeMat);
          pole.castShadow = true;
          g.add(pole);

          const band1 = new THREE.Mesh(bandGeo, darkMat);
          band1.position.y = 1.45;
          const band2 = new THREE.Mesh(bandGeo, darkMat);
          band2.position.y = 2.25;
          g.add(band1, band2);

          if (along === 0) {
            const flag = new THREE.Mesh(pennantGeo, orangeMat);
            flag.position.set(side * 0.42, 2.68, 0);
            flag.scale.x = side;
            flag.castShadow = true;
            g.add(flag);
            this.animatedFlags.push({ mesh: flag, phase: r.id * 2.1 + side });
          }

          this.root.add(g);
        }
      }
    }
  }

  /**
   * Timber alpine safety fences & red catch-nets along sweeping outer bends
   */
  _buildSafetyFences() {
    const postGeo = new THREE.CylinderGeometry(0.09, 0.11, 2.0, 6);
    postGeo.translate(0, 0.9, 0);
    const postMat = new THREE.MeshStandardMaterial({
      map: this.woodTex,
      roughness: 0.9,
    });
    const netMat = new THREE.MeshStandardMaterial({
      map: this.safetyNetTex,
      transparent: true,
      alphaTest: 0.08,
      side: THREE.DoubleSide,
      roughness: 0.7,
    });

    for (const run of this.features.fenceRuns) {
      const pts = run.points;
      for (let i = 0; i < pts.length; i++) {
        const p = pts[i];
        const post = new THREE.Mesh(postGeo, postMat);
        post.position.set(p.x, p.y - 0.15, p.z);
        post.rotation.z = -run.side * 0.12;
        post.castShadow = true;
        this.root.add(post);

        if (i < pts.length - 1) {
          const n = pts[i + 1];
          const dx = n.x - p.x;
          const dy = n.y - p.y;
          const dz = n.z - p.z;
          const len = Math.hypot(dx, dz);

          const segGeo = new THREE.PlaneGeometry(len, 1.35);
          const seg = new THREE.Mesh(segGeo, netMat);
          seg.position.set((p.x + n.x) * 0.5, (p.y + n.y) * 0.5 + 0.9, (p.z + n.z) * 0.5);
          seg.rotation.y = Math.atan2(-dz, dx);
          // Match slope tilt along fence span
          seg.rotation.z = Math.atan2(dy, len);
          seg.castShadow = true;
          this.root.add(seg);
        }
      }
    }
  }

  /**
   * Animated overhead alpine chairlift marching down the right mountain flank
   */
  _buildChairlift() {
    const pylons = this.features.liftPylons;
    if (pylons.length < 2) return;

    const steelMat = new THREE.MeshStandardMaterial({
      color: '#495462',
      roughness: 0.45,
      metalness: 0.65,
    });
    const darkCableMat = new THREE.MeshBasicMaterial({ color: '#1b2028' });
    const seatMat = new THREE.MeshStandardMaterial({
      color: '#d9452e',
      roughness: 0.4,
      metalness: 0.2,
    });
    const frameMat = new THREE.MeshStandardMaterial({
      color: '#232933',
      roughness: 0.45,
      metalness: 0.6,
    });

    const mastGeo = new THREE.CylinderGeometry(0.28, 0.52, 16.5, 8);
    mastGeo.translate(0, 8.0, 0);
    const crossArmGeo = new THREE.BoxGeometry(6.8, 0.45, 0.45);
    const sheaveGeo = new THREE.CylinderGeometry(0.32, 0.32, 0.2, 10);
    sheaveGeo.rotateZ(Math.PI / 2);

    const leftLinePts = [];
    const rightLinePts = [];

    for (let i = 0; i < pylons.length; i++) {
      const p = pylons[i];
      const g = new THREE.Group();
      g.position.set(p.x, p.y - 0.6, p.z);

      const mast = new THREE.Mesh(mastGeo, steelMat);
      mast.castShadow = true;
      g.add(mast);

      const arm = new THREE.Mesh(crossArmGeo, steelMat);
      arm.position.y = 15.8;
      arm.castShadow = true;
      g.add(arm);

      for (const s of [-2.9, 2.9]) {
        const wheel = new THREE.Mesh(sheaveGeo, frameMat);
        wheel.position.set(s, 15.5, 0);
        g.add(wheel);
      }

      this.root.add(g);

      leftLinePts.push(new THREE.Vector3(p.x - 2.9, p.cableY, p.z));
      rightLinePts.push(new THREE.Vector3(p.x + 2.9, p.cableY, p.z));
    }

    // Overhead twin steel cables
    this.cableCurveUp = new THREE.CatmullRomCurve3(leftLinePts);
    this.cableCurveDown = new THREE.CatmullRomCurve3(rightLinePts);

    const lineGeo1 = new THREE.BufferGeometry().setFromPoints(this.cableCurveUp.getPoints(160));
    const lineGeo2 = new THREE.BufferGeometry().setFromPoints(this.cableCurveDown.getPoints(160));
    this.root.add(new THREE.Line(lineGeo1, darkCableMat));
    this.root.add(new THREE.Line(lineGeo2, darkCableMat));

    // Build 24 moving 4-seater alpine chairs gliding continuously along both cables
    const hangerGeo = new THREE.CylinderGeometry(0.05, 0.05, 2.6, 6);
    const benchGeo = new THREE.BoxGeometry(2.1, 0.16, 0.65);
    const backGeo = new THREE.BoxGeometry(2.1, 0.72, 0.12);

    const chairCount = 24;
    for (let i = 0; i < chairCount; i++) {
      const isUp = i % 2 === 0;
      const chair = new THREE.Group();

      const hanger = new THREE.Mesh(hangerGeo, frameMat);
      hanger.position.y = -1.3;
      chair.add(hanger);

      const bench = new THREE.Mesh(benchGeo, seatMat);
      bench.position.set(0, -2.6, 0);
      bench.castShadow = true;
      chair.add(bench);

      const back = new THREE.Mesh(backGeo, seatMat);
      back.position.set(0, -2.28, isUp ? -0.28 : 0.28);
      back.castShadow = true;
      chair.add(back);

      this.root.add(chair);
      this.liftChairs.push({
        mesh: chair,
        curve: isUp ? this.cableCurveUp : this.cableCurveDown,
        t: (i / chairCount),
        speed: isUp ? -0.0022 : 0.0022,
      });
    }
  }

  /**
   * Summit Start Pavilion & Launch Arch at z = 0 (3400m)
   */
  _buildStartPavilion() {
    const startZ = -18;
    const cx = getPisteCenterX(startZ);
    const y = getTerrainHeight(cx, startZ);

    const woodMat = new THREE.MeshStandardMaterial({ map: this.woodTex, roughness: 0.85 });
    const darkMetalMat = new THREE.MeshStandardMaterial({ color: '#1b2432', roughness: 0.45, metalness: 0.55 });
    const snowRoofMat = new THREE.MeshStandardMaterial({ color: '#f3f8ff', roughness: 0.72 });

    // Start gantry arch spanning ahead of starting line
    const archGroup = new THREE.Group();
    archGroup.position.set(cx, y - 0.3, startZ);
    archGroup.rotation.y = getPisteHeading(startZ);

    const colGeo = new THREE.BoxGeometry(0.65, 7.6, 0.65);
    for (const s of [-10.5, 10.5]) {
      const col = new THREE.Mesh(colGeo, darkMetalMat);
      col.position.set(s, 3.8, 0);
      col.castShadow = true;
      archGroup.add(col);
    }

    const bannerTex = createGantryBannerTexture('ВЫСОТА 3400', 'СТАРТ · ГОРНОЛЫЖНЫЙ СПУСК', '#e6482e');
    const bannerMat = new THREE.MeshStandardMaterial({ map: bannerTex, roughness: 0.45 });
    const beam = new THREE.Mesh(new THREE.BoxGeometry(22.2, 2.5, 0.72), [
      darkMetalMat,
      darkMetalMat,
      snowRoofMat,
      darkMetalMat,
      bannerMat,
      bannerMat,
    ]);
    beam.position.set(0, 6.9, 0);
    beam.castShadow = true;
    archGroup.add(beam);

    this.root.add(archGroup);

    // Cozy timber Summit Start Hut slightly behind & to the left of the start point
    const hutX = getPisteCenterX(6) - 16;
    const hutZ = 4;
    const hutY = getTerrainHeight(hutX, hutZ);
    const hut = this._createAlpineChalet(10, 5.2, 7.5, woodMat, snowRoofMat, darkMetalMat);
    hut.position.set(hutX, hutY - 0.6, hutZ);
    hut.rotation.y = 0.32;
    this.root.add(hut);
  }

  /**
   * Grand Finish Arch & Cozy Timber Alpine Village at z = -3000 (1850m)
   */
  _buildFinishVillage() {
    const fz = COURSE_FINISH_Z;
    const cx = getPisteCenterX(fz);
    const fy = getTerrainHeight(cx, fz);

    const woodMat = new THREE.MeshStandardMaterial({ map: this.woodTex, roughness: 0.85 });
    const darkMetalMat = new THREE.MeshStandardMaterial({ color: '#1b2432', roughness: 0.45, metalness: 0.55 });
    const snowRoofMat = new THREE.MeshStandardMaterial({ color: '#f3f8ff', roughness: 0.72 });

    // Grand Finish Timing Arch
    const arch = new THREE.Group();
    arch.position.set(cx, fy - 0.3, fz);
    arch.rotation.y = getPisteHeading(fz);

    const pillarGeo = new THREE.BoxGeometry(0.95, 9.5, 0.95);
    for (const s of [-16, 16]) {
      const p = new THREE.Mesh(pillarGeo, darkMetalMat);
      p.position.set(s, 4.75, 0);
      p.castShadow = true;
      arch.add(p);
    }

    const finTex = createGantryBannerTexture('ФИНИШ', 'ДОЛИНА · 1850 М', '#f2b84b');
    const finMat = new THREE.MeshStandardMaterial({ map: finTex, roughness: 0.4 });
    const header = new THREE.Mesh(new THREE.BoxGeometry(33.6, 3.2, 1.0), [
      darkMetalMat,
      darkMetalMat,
      snowRoofMat,
      darkMetalMat,
      finMat,
      finMat,
    ]);
    header.position.set(0, 8.6, 0);
    header.castShadow = true;
    arch.add(header);

    this.root.add(arch);

    // 6 Alpine Chalets framing the Finish Plaza with warm glowing windows
    const chaletSpots = [
      { dx: -32, dz: -25, rot: 0.45, w: 12, h: 6.2, d: 9 },
      { dx: -36, dz: -58, rot: 0.25, w: 14, h: 7.0, d: 10 },
      { dx: 33, dz: -22, rot: -0.42, w: 13, h: 6.5, d: 9.5 },
      { dx: 37, dz: -62, rot: -0.28, w: 12, h: 6.0, d: 8.5 },
      { dx: -22, dz: -102, rot: 0.14, w: 15, h: 7.2, d: 10 },
      { dx: 24, dz: -108, rot: -0.18, w: 16, h: 7.5, d: 10.5 },
    ];

    for (const spot of chaletSpots) {
      const x = cx + spot.dx;
      const z = fz + spot.dz;
      const y = getTerrainHeight(x, z);
      const chalet = this._createAlpineChalet(spot.w, spot.h, spot.d, woodMat, snowRoofMat, darkMetalMat);
      chalet.position.set(x, y - 0.8, z);
      chalet.rotation.y = spot.rot;
      this.root.add(chalet);
    }
  }

  _createAlpineChalet(w, h, d, woodMat, snowRoofMat, trimMat) {
    const group = new THREE.Group();

    // Stone foundation
    const stoneMat = new THREE.MeshStandardMaterial({ color: '#616a75', roughness: 0.92 });
    const base = new THREE.Mesh(new THREE.BoxGeometry(w, 1.8, d), stoneMat);
    base.position.y = 0.9;
    base.castShadow = true;
    base.receiveShadow = true;
    group.add(base);

    // Timber walls
    const body = new THREE.Mesh(new THREE.BoxGeometry(w * 0.96, h - 1.5, d * 0.96), woodMat);
    body.position.y = 1.8 + (h - 1.5) * 0.5;
    body.castShadow = true;
    body.receiveShadow = true;
    group.add(body);

    // Steep pitched snow-blanketed alpine gable roof (2 angled roof slabs)
    const roofSlopeW = Math.hypot(w * 0.62, 2.8);
    const roofAngle = Math.atan2(2.8, w * 0.62);
    const roofSlabGeo = new THREE.BoxGeometry(roofSlopeW, 0.42, d * 1.18);

    const roofL = new THREE.Mesh(roofSlabGeo, snowRoofMat);
    roofL.position.set(-w * 0.28, h + 1.45, 0);
    roofL.rotation.z = roofAngle;
    roofL.castShadow = true;
    roofL.receiveShadow = true;

    const roofR = new THREE.Mesh(roofSlabGeo, snowRoofMat);
    roofR.position.set(w * 0.28, h + 1.45, 0);
    roofR.rotation.z = -roofAngle;
    roofR.castShadow = true;
    roofR.receiveShadow = true;

    group.add(roofL, roofR);

    // Chimney
    const chimney = new THREE.Mesh(new THREE.BoxGeometry(1.1, 3.2, 1.1), stoneMat);
    chimney.position.set(w * 0.2, h + 2.4, -d * 0.18);
    chimney.castShadow = true;
    group.add(chimney);

    // Warm sunlit / glowing cozy alpine chalet windows
    const winMat = new THREE.MeshStandardMaterial({
      color: '#ffdd99',
      emissive: '#ffaa3b',
      emissiveIntensity: 0.3,
      roughness: 0.2,
    });
    this.chaletWindowMats.push(winMat);

    const winGeo = new THREE.PlaneGeometry(1.6, 1.4);
    for (const wx of [-w * 0.25, 0, w * 0.25]) {
      const winF = new THREE.Mesh(winGeo, winMat);
      winF.position.set(wx, h * 0.62, d * 0.49);
      group.add(winF);

      const winB = new THREE.Mesh(winGeo, winMat);
      winB.position.set(wx, h * 0.62, -d * 0.49);
      winB.rotation.y = Math.PI;
      group.add(winB);
    }

    // Timber balcony beam
    const balcony = new THREE.Mesh(new THREE.BoxGeometry(w * 0.88, 0.35, 1.1), trimMat);
    balcony.position.set(0, h * 0.44, d * 0.52);
    balcony.castShadow = true;
    group.add(balcony);

    return group;
  }

  /**
   * Sync snow sparkle lighting & chalet/beacon glow with active time-of-day preset
   */
  applyLightingPreset(preset) {
    this.snowSparkleUniforms.uSunDir.value.copy(preset.sunDir);
    this.snowSparkleUniforms.uSparkleStrength.value =
      preset.id === 'morning' ? 0.55 : preset.id === 'sunset' ? 0.42 : 0.25;

    for (const m of this.chaletWindowMats) {
      m.emissiveIntensity = preset.chaletEmissive;
    }
    const beaconBoost = preset.id === 'twilight' ? 1.8 : preset.id === 'sunset' ? 0.85 : 0.35;
    for (const m of this.beaconLights) {
      m.emissiveIntensity = beaconBoost;
    }
  }

  /**
   * Mark a slalom gate as cleared with a celebratory bright visual pulse
   */
  pulseGateCleared(gateId) {
    const entry = this.gateVisuals[gateId];
    if (!entry) return;
    entry.pulse = 1.0;
  }

  /**
   * Reset gate visual states on run restart
   */
  resetRunState() {
    for (const entry of this.gateVisuals) {
      entry.gate.passed = false;
      entry.gate.missed = false;
      entry.pulse = 0;
      entry.flagMat.emissiveIntensity = 0.15;
    }
  }

  /**
   * Per-frame world updates: terrain chunk culling, animated chairlift, fluttering flags
   */
  update(dt, elapsed, skierZ) {
    // 1. Distance-cull terrain chunks outside visible alpine fog horizon for crisp 60-120fps
    for (let i = 0; i < this.terrainChunks.length; i++) {
      const ch = this.terrainChunks[i];
      ch.mesh.visible = ch.zMin <= skierZ + 220 && ch.zMax >= skierZ - 640;
    }

    // 2. Flutter slalom & ramp flags organically in alpine wind
    for (let i = 0; i < this.animatedFlags.length; i++) {
      const f = this.animatedFlags[i];
      f.mesh.rotation.y = Math.sin(elapsed * 5.2 + f.phase) * 0.16;
    }

    // 3. Decay cleared gate glow pulse
    for (let i = 0; i < this.gateVisuals.length; i++) {
      const gv = this.gateVisuals[i];
      if (gv.pulse > 0) {
        gv.pulse = Math.max(0, gv.pulse - dt * 1.8);
        gv.flagMat.emissiveIntensity = 0.15 + gv.pulse * 1.4;
      }
    }

    // 4. Advance moving chairlift chairs smoothly along overhead cables
    for (let i = 0; i < this.liftChairs.length; i++) {
      const ch = this.liftChairs[i];
      ch.t += ch.speed * dt;
      if (ch.t > 1) ch.t -= 1;
      if (ch.t < 0) ch.t += 1;

      const pos = ch.curve.getPointAt(ch.t);
      // Only sway & orient chairs near skier
      ch.mesh.position.copy(pos);
      if (Math.abs(pos.z - skierZ) < 420) {
        ch.mesh.visible = true;
        ch.mesh.rotation.z = Math.sin(elapsed * 1.7 + i) * 0.045;
      } else {
        ch.mesh.visible = false;
      }
    }
  }
}
