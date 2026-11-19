import * as THREE from 'three';

export const COURSE_START_Z = 0;
export const COURSE_FINISH_Z = -3000;
export const COURSE_END_Z = -3260;
export const SUMMIT_ALTITUDE_M = 3400;
export const BASE_ALTITUDE_M = 1850;
export const START_ELEVATION_Y = 820;

// Deterministic fast hash & 2D value noise for organic alpine terrain
function hash2(ix, iz) {
  let n = Math.imul(ix, 374761393) + Math.imul(iz, 668265263);
  n = (n ^ (n >>> 13)) >>> 0;
  n = Math.imul(n, 1274126177) >>> 0;
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
}

export function noise2D(x, z) {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx);
  const uz = fz * fz * (3 - 2 * fz);

  const a = hash2(ix, iz);
  const b = hash2(ix + 1, iz);
  const c = hash2(ix, iz + 1);
  const d = hash2(ix + 1, iz + 1);

  return a + (b - a) * ux + (c - a) * uz + (a - b - c + d) * ux * uz;
}

export function fbm2D(x, z, octaves = 3) {
  let sum = 0;
  let amp = 0.5;
  let freq = 1.0;
  for (let i = 0; i < octaves; i++) {
    sum += amp * (noise2D(x * freq, z * freq) * 2 - 1);
    freq *= 2.03;
    amp *= 0.5;
  }
  return sum;
}

export function seededRandom(seed) {
  let s = seed >>> 0;
  return function () {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function smoothstep(edge0, edge1, x) {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/**
 * Winding alpine trail centerline X as a function of Z (0 down to -3260)
 */
export function getPisteCenterX(z) {
  const d = Math.max(0, -z);
  const startFade = smoothstep(0, 140, d);
  const finishFade = 1 - smoothstep(2820, 3040, d);
  const envelope = startFade * finishFade;

  const curve =
    Math.sin(d * 0.0029) * 58 +
    Math.sin(d * 0.0067 + 0.8) * 26 +
    Math.cos(d * 0.0014 - 0.5) * 32 -
    Math.cos(-0.5) * 32;

  return curve * envelope;
}

/**
 * Approximate tangent angle (heading yaw) of the piste centerline at Z
 */
export function getPisteHeading(z) {
  const dz = 4.0;
  const dx = getPisteCenterX(z - dz) - getPisteCenterX(z + dz);
  // Forward is (-sin(yaw), -cos(yaw)), so dx / (2*dz) = -sin(yaw)/cos(yaw) = -tan(yaw)
  return Math.atan2(-dx, 2 * dz);
}

/**
 * Half-width of the groomed alpine ski run at Z
 */
export function getPisteHalfWidth(z) {
  const d = Math.max(0, -z);
  // Wide summit start & wide finish valley, narrower dramatic canyon mid-run
  const canyon = smoothstep(950, 1250, d) * (1 - smoothstep(1680, 1950, d));
  const finishOpen = smoothstep(2750, 3020, d);
  const startOpen = 1 - smoothstep(0, 120, d);
  const wave = Math.sin(d * 0.0045) * 3.5;

  return 29 - canyon * 7.5 + finishOpen * 16 + startOpen * 8 + wave;
}

/**
 * Smooth base downhill elevation profile Y(z)
 * Starts at START_ELEVATION_Y at z=0, descends dynamically down to ~18 at finish
 */
export function getBaseSlopeY(z) {
  const d = -z; // distance downhill (positive as z goes negative)
  if (d <= 0) {
    // Behind start house: gentle summit crest
    return START_ELEVATION_Y + Math.min(28, -d * 0.16);
  }

  // Average descent rate ~0.273 over 3000m = ~820m drop
  // Modulated with smooth macro pitch sections (gentle start, steep mid-mountain, flat finish runout)
  const clampedD = Math.min(d, 3000);
  let y = START_ELEVATION_Y - clampedD * 0.272;

  // Macro vertical profile waves (keeps thrilling rollers & steep drop sections)
  // Zero-anchored at d=0
  y += Math.sin(clampedD * 0.0021) * 26;
  y += (Math.cos(clampedD * 0.0052) - 1) * 9.5;

  // Gentle start plateau easing
  const startFlat = 1 - smoothstep(0, 110, clampedD);
  y += startFlat * clampedD * 0.12;

  // Smooth runout leveling after z = -2860
  if (d > 2860) {
    const extra = d - 2860;
    const t = smoothstep(2860, 3060, d);
    // Cancel downward slope smoothly after 3000m
    const post3000 = Math.max(0, d - 3000);
    y =
      START_ELEVATION_Y -
      Math.min(d, 3000) * 0.272 +
      Math.sin(Math.min(d, 3000) * 0.0021) * 26 +
      (Math.cos(Math.min(d, 3000) * 0.0052) - 1) * 9.5;
    // Softly lift into flat valley bowl at finish
    y += t * Math.min(extra, 140) * 0.13 - post3000 * 0.03;
  }

  return y;
}

/**
 * Convert world Y height to alpine display altitude in meters (3400m -> 1850m)
 */
export function worldYToAltitude(y) {
  const finishY = getBaseSlopeY(COURSE_FINISH_Z);
  const ratio = Math.max(0, Math.min(1.05, (y - finishY) / (START_ELEVATION_Y - finishY)));
  return Math.round(BASE_ALTITUDE_M + ratio * (SUMMIT_ALTITUDE_M - BASE_ALTITUDE_M));
}

/**
 * Sculpted snow kicker ramps & Big-Air mega-jumps integrated directly into the terrain heightfield
 */
export const RAMPS = [
  { z: -105, offsetRatio: 0.0, width: 11.5, length: 19, height: 3.4, name: 'Стартовый кикер' },
  { z: -225, offsetRatio: -0.22, width: 10.5, length: 20, height: 3.7, name: 'Гребень-1' },
  { z: -345, offsetRatio: 0.24, width: 11.0, length: 21, height: 4.1, name: 'Правый трамплин' },
  { z: -475, offsetRatio: -0.24, width: 10.5, length: 21, height: 4.2, name: 'Левый трамплин' },
  { z: -600, offsetRatio: 0.0, width: 13.0, length: 24, height: 4.9, name: 'Солнечный Биг-Эйр' },
  { z: -735, offsetRatio: 0.25, width: 10.5, length: 21, height: 4.0, name: 'Фристайл-вылет' },
  { z: -865, offsetRatio: -0.2, width: 11.0, length: 22, height: 4.4, name: 'Гребень каньона' },
  { z: -990, offsetRatio: 0.0, width: 13.0, length: 25, height: 5.2, name: 'Вход в каньон' },
  { z: -1125, offsetRatio: -0.22, width: 10.5, length: 21, height: 4.3, name: 'Еловый трамплин' },
  { z: -1255, offsetRatio: 0.2, width: 10.5, length: 22, height: 4.5, name: 'Лесной кикер' },
  { z: -1385, offsetRatio: 0.0, width: 12.0, length: 24, height: 5.0, name: 'Хвойный Биг-Эйр' },
  { z: -1515, offsetRatio: -0.2, width: 11.0, length: 23, height: 4.7, name: 'Каньон-роллер' },
  { z: -1640, offsetRatio: 0.0, width: 13.5, length: 26, height: 5.6, name: 'Мега-трамплин I' },
  { z: -1780, offsetRatio: 0.2, width: 12.0, length: 25, height: 5.3, name: 'Альпийский полёт' },
  { z: -1915, offsetRatio: -0.18, width: 12.5, length: 26, height: 5.8, name: 'Мега-трамплин II' },
  { z: -2055, offsetRatio: 0.14, width: 13.0, length: 27, height: 6.1, name: 'Супер Биг-Эйр' },
  { z: -2195, offsetRatio: 0.0, width: 14.0, length: 28, height: 6.4, name: 'Орлиный полёт' },
  { z: -2330, offsetRatio: -0.24, width: 11.0, length: 22, height: 4.4, name: 'Долинный кикер' },
  { z: -2460, offsetRatio: 0.22, width: 11.5, length: 23, height: 4.6, name: 'Нижний Биг-Эйр' },
  { z: -2590, offsetRatio: -0.16, width: 11.5, length: 23, height: 4.7, name: 'Скоростной стол' },
  { z: -2720, offsetRatio: 0.18, width: 11.5, length: 23, height: 4.5, name: 'Последний гребень' },
  { z: -2855, offsetRatio: 0.0, width: 13.5, length: 25, height: 5.0, name: 'Финишный Биг-Эйр' },
].map((r, idx) => {
  const cx = getPisteCenterX(r.z);
  const hw = getPisteHalfWidth(r.z);
  const heading = getPisteHeading(r.z);
  return {
    ...r,
    id: idx,
    x: cx + r.offsetRatio * hw,
    heading,
    cosH: Math.cos(heading),
    sinH: Math.sin(heading),
  };
});

/**
 * Evaluate analytical snow kicker ramp height contribution at world (x, z)
 */
export function getRampInfo(x, z) {
  let maxLift = 0;
  let activeRamp = null;
  let lipProgress = 0;

  for (let i = 0; i < RAMPS.length; i++) {
    const r = RAMPS[i];
    // Fast Z/X bounding rejection (generous for angled ramps)
    const dz = z - r.z;
    if (dz > r.length + 14 || dz < -16) continue;
    const dx = x - r.x;
    if (Math.abs(dx) > r.length + r.width) continue;

    // Transform into ramp local frame:
    // forward downhill = (-sinH, -cosH), right = (cosH, -sinH)
    // Ramp starts at localFwd = -r.length and ends (takeoff lip) at localFwd = 0
    const localFwd = -dx * r.sinH - dz * r.cosH;
    const localSide = dx * r.cosH - dz * r.sinH;

    const halfW = r.width * 0.5;
    if (Math.abs(localSide) > halfW + 2.4) continue;
    if (localFwd < -r.length || localFwd > 5.2) continue;

    // Cross-width smooth shoulder
    const absU = Math.abs(localSide);
    let sideFactor = 1.0;
    if (absU > halfW * 0.72) {
      sideFactor = 1.0 - smoothstep(halfW * 0.72, halfW + 2.2, absU);
    }

    // Longitudinal profile: concave ski-jump launch ramp + crisp back dropoff
    let longFactor = 0;
    let prog = 0;
    if (localFwd <= 0) {
      const t = (localFwd + r.length) / r.length; // 0 at base -> 1 at lip
      // Smooth concave transition
      longFactor = Math.pow(t, 1.85);
      prog = t;
    } else {
      // Dropoff behind lip
      const bt = localFwd / 5.2;
      longFactor = Math.pow(Math.cos(bt * Math.PI * 0.5), 2.2);
      prog = 1.0 + bt;
    }

    const lift = r.height * longFactor * sideFactor;
    if (lift > maxLift) {
      maxLift = lift;
      activeRamp = r;
      lipProgress = prog;
    }
  }

  return { lift: maxLift, ramp: activeRamp, lipProgress };
}

/**
 * Exact continuous terrain elevation Y at any world (x, z)
 */
export function getTerrainHeight(x, z) {
  const baseY = getBaseSlopeY(z);
  const cx = getPisteCenterX(z);
  const hw = getPisteHalfWidth(z);
  const dist = Math.abs(x - cx);

  // Subtle natural snow undulations inside the groomed piste
  const roller = Math.sin(z * 0.032 + x * 0.015) * 0.55 + Math.cos(z * 0.075) * 0.22;
  const microSnow = fbm2D(x * 0.025, z * 0.025, 2) * 0.65;

  // Natural shallow half-pipe banking on the piste itself (helps keep flow exciting!)
  const normPiste = Math.min(1, dist / hw);
  const pisteCamber = normPiste * normPiste * 1.15;

  // Outside the piste: rising dramatic alpine valley walls & sculpted snow ridges
  let mountainWall = 0;
  if (dist > hw) {
    const excess = dist - hw;
    // Smooth quadratic rise into alpine slopes + ridged rock/snow flanks
    const slopeRise = Math.pow(excess, 1.48) * 0.24 + excess * 0.16;
    const ridgeNoise =
      (Math.abs(fbm2D(x * 0.014 + 3.1, z * 0.014 - 1.7, 3)) * 18 +
        fbm2D(x * 0.04, z * 0.04, 2) * 3.8) *
      smoothstep(0, 26, excess);
    mountainWall = slopeRise + ridgeNoise;
  }

  // Slight flatten around start platform & finish village
  const startFlatMask = 1 - smoothstep(10, 55, -z);
  const finishFlatMask = smoothstep(2930, 3040, -z);
  const detailScale = 1 - Math.max(startFlatMask, finishFlatMask) * 0.85;

  const rampInfo = getRampInfo(x, z);

  return baseY + (roller + microSnow) * detailScale + pisteCamber + mountainWall + rampInfo.lift;
}

/**
 * Compute surface unit normal via finite differences
 */
export function getTerrainNormal(x, z, out = new THREE.Vector3()) {
  const eps = 0.55;
  const hL = getTerrainHeight(x - eps, z);
  const hR = getTerrainHeight(x + eps, z);
  const hD = getTerrainHeight(x, z - eps);
  const hU = getTerrainHeight(x, z + eps);

  out.set(hL - hR, 2 * eps, hD - hU).normalize();
  return out;
}

/**
 * Rich surface query for physics, sound, and particles
 */
export function getSurfaceInfo(x, z, normalOut = new THREE.Vector3()) {
  const height = getTerrainHeight(x, z);
  const normal = getTerrainNormal(x, z, normalOut);
  const cx = getPisteCenterX(z);
  const hw = getPisteHalfWidth(z);
  const signedDist = x - cx;
  const distFromCenter = Math.abs(signedDist);
  const isPiste = distFromCenter <= hw;
  const offPisteRatio = smoothstep(hw - 2, hw + 10, distFromCenter);
  const rampInfo = getRampInfo(x, z);

  return {
    height,
    normal,
    centerX: cx,
    halfWidth: hw,
    signedDist,
    distFromCenter,
    isPiste,
    offPisteRatio,
    onRamp: rampInfo.lift > 0.12 && rampInfo.lipProgress <= 1.04,
    rampInfo,
  };
}

/**
 * Check if a world (x, z) point is too close to any kicker ramp footprint
 */
export function isNearRamp(x, z, padding = 10) {
  for (let i = 0; i < RAMPS.length; i++) {
    const r = RAMPS[i];
    if (Math.abs(z - r.z) < r.length + padding + 14 && Math.abs(x - r.x) < r.width * 0.5 + padding) {
      return true;
    }
  }
  return false;
}

/**
 * Generate deterministic course layout: slalom gates, trees, rocks, fences, lift pylons
 */
export function generateCourseFeatures() {
  const rng = seededRandom(34002026);

  // 1. Slalom Gates (alternating Red & Blue World Cup gates along the piste)
  const gates = [];
  let sideToggle = 1;
  let gateIndex = 0;
  for (let z = -125; z >= -2890; z -= 82) {
    // Avoid placing a gate directly on top of a ramp takeoff
    const cx = getPisteCenterX(z);
    const hw = getPisteHalfWidth(z);
    let offset = sideToggle * Math.min(hw * 0.42, 11.5);
    if (isNearRamp(cx + offset, z, 8)) {
      offset = -offset * 0.85;
      if (isNearRamp(cx + offset, z, 6)) {
        continue;
      }
    }

    const gx = cx + offset;
    const heading = getPisteHeading(z);
    const gateHalfSpan = 5.4; // generous 10.8m wide alpine GS gate!
    const color = gateIndex % 2 === 0 ? 'red' : 'blue';

    gates.push({
      id: gateIndex++,
      x: gx,
      z,
      y: getTerrainHeight(gx, z),
      heading,
      halfSpan: gateHalfSpan,
      color,
      passed: false,
      missed: false,
    });
    sideToggle *= -1;
  }

  // 2. Alpine Spruce Trees (dense scenic forests lining both sides + sparse thrilling off-piste glades)
  const trees = [];
  // Inner forest border & off-piste woods
  for (let z = 30; z >= -3120; z -= 4.2) {
    const cx = getPisteCenterX(z);
    const hw = getPisteHalfWidth(z);

    // Keep finish village plaza & start deck clear
    const inStartPlaza = z > -55;
    const inFinishPlaza = z < -2945 && z > -3130;

    for (let side = -1; side <= 1; side += 2) {
      const treesPerRow = inFinishPlaza ? 2 : 3;
      for (let k = 0; k < treesPerRow; k++) {
        const minOffset = inStartPlaza ? hw + 8 : inFinishPlaza ? hw + 18 : hw + 1.8;
        const spread = k === 0 ? rng() * 11 : 8 + Math.pow(rng(), 1.25) * 78;
        const tx = cx + side * (minOffset + spread);
        const tz = z + (rng() - 0.5) * 4.5;

        if (isNearRamp(tx, tz, 9)) continue;

        const ty = getTerrainHeight(tx, tz);
        // Allow alpine spruces on steep mountain flanks (only skip sheer vertical cliffs)
        const n = getTerrainNormal(tx, tz);
        if (n.y < 0.44) continue;

        const scale = 0.78 + rng() * 0.95;
        trees.push({
          x: tx,
          y: ty - 0.55,
          z: tz,
          scale,
          rotY: rng() * Math.PI * 2,
          leanX: (rng() - 0.5) * 0.06,
          leanZ: (rng() - 0.5) * 0.06,
          radius: 0.65 * scale, // forgiving trunk collision radius
        });
      }
    }

    // Occasional scenic lone island pine right at the piste margin or mid-bowl split
    if (z < -300 && z > -2780 && rng() < 0.14) {
      const side = rng() < 0.5 ? -1 : 1;
      const tx = cx + side * (hw * (0.76 + rng() * 0.22));
      const tz = z + (rng() - 0.5) * 3;
      if (!isNearRamp(tx, tz, 12)) {
        let nearGate = false;
        for (let g = 0; g < gates.length; g++) {
          if (Math.hypot(gates[g].x - tx, gates[g].z - tz) < 12) {
            nearGate = true;
            break;
          }
        }
        if (!nearGate) {
          const scale = 0.88 + rng() * 0.65;
          trees.push({
            x: tx,
            y: getTerrainHeight(tx, tz) - 0.3,
            z: tz,
            scale,
            rotY: rng() * Math.PI * 2,
            leanX: (rng() - 0.5) * 0.05,
            leanZ: (rng() - 0.5) * 0.05,
            radius: 0.65 * scale,
          });
        }
      }
    }
  }

  // 3. Snow-Dusted Alpine Granite Boulders
  const boulders = [];
  for (let z = -80; z >= -2930; z -= 16) {
    const cx = getPisteCenterX(z);
    const hw = getPisteHalfWidth(z);

    for (let b = 0; b < 3; b++) {
      const side = rng() < 0.5 ? -1 : 1;
      // Mostly along flanks & rocky ridges, occasionally near outer piste edge
      const onMargin = b === 0 && rng() < 0.22;
      const dist = onMargin ? hw * (0.82 + rng() * 0.28) : hw + 4 + rng() * 68;
      const bx = cx + side * dist;
      const bz = z + (rng() - 0.5) * 14;
      if (isNearRamp(bx, bz, 11)) continue;

      let nearGate = false;
      for (let g = 0; g < gates.length; g++) {
        if (Math.hypot(gates[g].x - bx, gates[g].z - bz) < 10) {
          nearGate = true;
          break;
        }
      }
      if (nearGate) continue;

      const sx = 1.2 + rng() * 2.8;
      const sy = 0.9 + rng() * 2.1;
      const sz = 1.2 + rng() * 2.6;
      const by = getTerrainHeight(bx, bz);

      boulders.push({
        x: bx,
        y: by - sy * 0.22,
        z: bz,
        sx,
        sy,
        sz,
        rotX: (rng() - 0.5) * 0.5,
        rotY: rng() * Math.PI * 2,
        rotZ: (rng() - 0.5) * 0.5,
        radius: Math.max(sx, sz) * 0.72,
      });
    }
  }

  // 4. Overhead Alpine Chairlift Pylons marching along the right-hand ridge
  const liftPylons = [];
  for (let z = -30; z >= -2950; z -= 115) {
    const cx = getPisteCenterX(z);
    const hw = getPisteHalfWidth(z);
    const px = cx + hw + 13;
    const py = getTerrainHeight(px, z);
    liftPylons.push({
      x: px,
      y: py,
      z,
      cableY: py + 15.5,
    });
  }

  // 5. Timber Safety Fences along high-speed outer turns
  const fenceRuns = [];
  for (let z = -180; z >= -2760; z -= 190) {
    const cx0 = getPisteCenterX(z);
    const cx1 = getPisteCenterX(z - 40);
    const cx2 = getPisteCenterX(z - 80);
    // Curvature sign tells us which side is the outer edge of the turn
    const curvature = cx2 - 2 * cx1 + cx0;
    const outerSide = curvature >= 0 ? -1 : 1;

    const points = [];
    for (let s = 0; s < 9; s++) {
      const fz = z - s * 7.2;
      const fcx = getPisteCenterX(fz);
      const fhw = getPisteHalfWidth(fz);
      const fx = fcx + outerSide * (fhw + 1.2);
      const fy = getTerrainHeight(fx, fz);
      points.push({ x: fx, y: fy, z: fz });
    }
    fenceRuns.push({ side: outerSide, points });
  }

  return {
    gates,
    trees,
    boulders,
    liftPylons,
    fenceRuns,
  };
}
