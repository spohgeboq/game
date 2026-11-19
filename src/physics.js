import * as THREE from 'three';
import {
  COURSE_START_Z,
  COURSE_FINISH_Z,
  COURSE_END_Z,
  getPisteCenterX,
  getPisteHeading,
  getSurfaceInfo,
  getTerrainHeight,
  worldYToAltitude,
} from './terrain.js';
import { TrickComboSystem } from './tricks.js';

const GRAVITY = 19.6;
const MAX_HEAD_YAW = 1.56; // ±89.4 degrees full side-to-side head look!
const MIN_HEAD_PITCH = -1.12;
const MAX_HEAD_PITCH = 0.96;

export class SkiPhysics {
  constructor(features, callbacks) {
    this.features = features;
    this.cb = callbacks || {};

    this.tricks = new TrickComboSystem({
      onGrabTrigger: (grabDef, chainLen) => {
        if (this.cb.onGrabTrigger) this.cb.onGrabTrigger(grabDef, chainLen);
      },
      onGrabTweaked: (entry) => {
        if (this.cb.onGrabTweaked) this.cb.onGrabTweaked(entry);
      },
      onGroundTrickStart: (gt) => {
        if (this.cb.onGroundTrickStart) this.cb.onGroundTrickStart(gt);
      },
      onComboStep: (stepInfo) => {
        if (this.cb.onComboStep) this.cb.onComboStep(stepInfo);
      },
      onComboBanked: (bankInfo) => {
        if (this.cb.onComboBanked) this.cb.onComboBanked(bankInfo);
      },
    });

    // Pre-sort trees & boulders by Z descending (0 -> -3200) for O(1) spatial collision scans
    this.treesSorted = [...features.trees].sort((a, b) => b.z - a.z);
    this.bouldersSorted = [...features.boulders].sort((a, b) => b.z - a.z);

    this.normalTmp = new THREE.Vector3();
    this.state = this._createInitialState();
  }

  _createInitialState() {
    const startZ = COURSE_START_Z;
    const startX = getPisteCenterX(startZ);
    const startY = getTerrainHeight(startX, startZ);
    const startHeading = getPisteHeading(startZ);

    return {
      pos: new THREE.Vector3(startX, startY, startZ),
      vel: new THREE.Vector3(0, 0, -5.2),
      heading: startHeading,
      headYaw: 0,
      headPitch: -0.08,
      slopePitch: -0.18,
      carveVisual: 0,
      speed: 5.2,
      speedKmh: 19,
      altitude: worldYToAltitude(startY),

      grounded: true,
      onRamp: false,
      wasOnRamp: false,
      offPisteRatio: 0,
      tucking: false,
      braking: false,

      jumpCharging: false,
      jumpCharge: 0,
      jumpCooldown: 0,
      polePushCooldown: 0,
      collisionCooldown: 0,

      // Full 3-Axis Aerial & Freestyle Trick State
      airTime: 0,
      airPeakHeight: 0,
      airSpin: 0, // Yaw spin (180..1440+)
      airFlipPitch: 0, // +X = Backflip, -X = Frontflip (360..1080+)
      airOffAxisRoll: 0, // Diagonal cork / rodeo / misty tilt
      airFromRamp: null,
      activeGrab: null, // 'mute' | 'method' | 'tail' | 'japan' | 'nose' | 'spread' | 'daffy' | 'cossack' | 'shifty' | 'octo'
      activeGroundTrick: null, // 'noseButter' | 'tailManual' | 'oneSki' | 'butter360' | 'slashRevert'
      groundVisualSpin: 0, // Smooth ski spin for Butter 360 & Switch Revert whip!
      switchRevertSpin: 0,

      // Scoring & Telemetry
      runTime: 0,
      score: 0,
      combo: 0,
      maxCombo: 0,
      gatesCleared: 0,
      totalGates: this.features.gates.length,
      topSpeedKmh: 0,
      longestAirTime: 0,
      tricksLanded: 0,
      uniqueTricksCount: 0,
      bestComboScore: 0,
      finished: false,
      finishTime: 0,

      // Settings
      lookToSteer: false,
    };
  }

  reset() {
    const lookToSteer = this.state.lookToSteer;
    this.tricks.reset();
    this.state = this._createInitialState();
    this.state.lookToSteer = lookToSteer;
    return this.state;
  }

  applyHeadLook(dx, dy, sensitivity = 0.0022) {
    const s = this.state;
    s.headYaw = Math.max(-MAX_HEAD_YAW, Math.min(MAX_HEAD_YAW, s.headYaw - dx * sensitivity));
    s.headPitch = Math.max(MIN_HEAD_PITCH, Math.min(MAX_HEAD_PITCH, s.headPitch - dy * sensitivity));
  }

  recenterHead() {
    this.state.headYaw = 0;
    this.state.headPitch = -0.08;
  }

  step(input, dt) {
    const s = this.state;
    if (!s.finished) {
      s.runTime += dt;
    }

    if (s.jumpCooldown > 0) s.jumpCooldown -= dt;
    if (s.polePushCooldown > 0) s.polePushCooldown -= dt;
    if (s.collisionCooldown > 0) s.collisionCooldown -= dt;

    // Keyboard Q/E smooth head peek side-to-side
    if (input.peekLeft) {
      s.headYaw = Math.min(MAX_HEAD_YAW, s.headYaw + 2.35 * dt);
    } else if (input.peekRight) {
      s.headYaw = Math.max(-MAX_HEAD_YAW, s.headYaw - 2.35 * dt);
    }

    // Steering / Air Spin input
    let steerInput = (input.left ? 1 : 0) - (input.right ? 1 : 0);
    if (s.lookToSteer && s.grounded && Math.abs(s.headYaw) > 0.06) {
      steerInput += Math.max(-1, Math.min(1, s.headYaw * 0.95));
      steerInput = Math.max(-1, Math.min(1, steerInput));
    }

    s.tucking = input.forward && !input.brake && s.grounded && !s.finished && !s.activeGroundTrick;
    s.braking = input.brake && s.grounded;

    const surf = getSurfaceInfo(s.pos.x, s.pos.z, this.normalTmp);
    s.offPisteRatio = surf.offPisteRatio;
    s.wasOnRamp = s.onRamp;
    s.onRamp = surf.onRamp;

    const fwdX = -Math.sin(s.heading);
    const fwdZ = -Math.cos(s.heading);

    const lookAheadH = getTerrainHeight(s.pos.x + fwdX * 1.4, s.pos.z + fwdZ * 1.4);
    const lookBackH = getTerrainHeight(s.pos.x - fwdX * 1.4, s.pos.z - fwdZ * 1.4);
    s.slopePitch = Math.atan2(lookAheadH - lookBackH, 2.8);

    // --- JUMP CHARGE & RELEASE ---
    if (s.grounded) {
      if (input.jump && s.jumpCooldown <= 0) {
        s.jumpCharging = true;
        s.jumpCharge = Math.min(1.0, s.jumpCharge + dt * 3.4);
      } else if (s.jumpCharging) {
        this._executeJump(s.jumpCharge, surf, false);
      }
    } else {
      s.jumpCharging = false;
      s.jumpCharge = 0;
    }

    // --- GROUNDED ALPINE CARVING + GROUND FREESTYLE TRICKS ---
    if (s.grounded) {
      this.tricks.updateGround(s, input, dt);

      // Visual butter spin & switch revert decay
      if (s.activeGroundTrick === 'butter360') {
        s.groundVisualSpin += 5.4 * dt;
      } else if (s.activeGroundTrick === 'slashRevert') {
        const targetSlash = Math.sin(s.runTime * 7.5) * 1.35;
        s.groundVisualSpin += (targetSlash - s.groundVisualSpin) * Math.min(1, dt * 14);
      } else {
        // Snap groundVisualSpin cleanly back to nearest 360° (0)
        const nearestTurn = Math.round(s.groundVisualSpin / (Math.PI * 2)) * Math.PI * 2;
        s.groundVisualSpin += (nearestTurn - s.groundVisualSpin) * Math.min(1, dt * 11);
        if (Math.abs(s.groundVisualSpin - nearestTurn) < 0.01) s.groundVisualSpin = 0;
      }

      if (Math.abs(s.switchRevertSpin) > 0.005) {
        s.switchRevertSpin *= Math.exp(-9.0 * dt);
      } else {
        s.switchRevertSpin = 0;
      }

      const horizSpeed = Math.hypot(s.vel.x, s.vel.z);
      const speedFactor = Math.min(1.0, horizSpeed / 7.0);
      const turnRate = (1.72 - Math.min(0.42, horizSpeed * 0.011)) * (s.braking ? 1.25 : 1.0);
      const yawDelta = steerInput * turnRate * (0.45 + 0.55 * speedFactor) * dt;
      s.heading += yawDelta;

      const pisteHead = getPisteHeading(s.pos.z);
      const relHead = s.heading - pisteHead;
      const maxRel = 1.38;
      if (relHead > maxRel) s.heading = pisteHead + maxRel;
      if (relHead < -maxRel) s.heading = pisteHead - maxRel;

      s.carveVisual +=
        (steerInput * (0.35 + 0.65 * Math.min(1, horizSpeed / 18)) - s.carveVisual) *
        (1 - Math.exp(-10 * dt));

      const fX = -Math.sin(s.heading);
      const fZ = -Math.cos(s.heading);
      const rX = Math.cos(s.heading);
      const rZ = -Math.sin(s.heading);

      // Gravity projected onto exact 3D slope surface
      const n = surf.normal;
      const gDotN = -GRAVITY * n.y;
      const gx = -gDotN * n.x;
      const gy = -GRAVITY - gDotN * n.y;
      const gz = -gDotN * n.z;

      s.vel.x += gx * dt;
      s.vel.y += gy * dt;
      s.vel.z += gz * dt;

      let vFwd = s.vel.x * fX + s.vel.z * fZ;
      let vLat = s.vel.x * rX + s.vel.z * rZ;

      if (s.tucking && vFwd < 42) {
        vFwd += (4.0 + (1 - Math.min(1, vFwd / 30)) * 2.2) * dt;
      }

      if (input.shift && s.polePushCooldown <= 0 && !s.braking) {
        vFwd += 5.0;
        s.polePushCooldown = 0.6;
        if (this.cb.onPolePush) this.cb.onPolePush();
      }

      if (s.pos.z > -35 && !s.braking && vFwd < 9.2) {
        vFwd += 4.2 * dt;
      }

      const groundTrickDrag = s.activeGroundTrick ? 0.015 : 0;
      const snowMu = s.braking
        ? 0.68
        : 0.023 + groundTrickDrag + s.offPisteRatio * 0.048 + Math.abs(steerInput) * 0.02;
      const airDragCoeff = s.tucking ? 0.0036 : 0.0063;

      if (vFwd > 0) {
        const decel = snowMu * GRAVITY + airDragCoeff * vFwd * vFwd;
        vFwd = Math.max(0, vFwd - decel * dt);
      } else {
        vFwd *= Math.exp(-5.0 * dt);
      }

      if (s.finished) {
        vFwd *= Math.exp(-0.9 * dt);
      }

      const edgeGrip = s.braking ? 3.5 : 8.4 - s.offPisteRatio * 2.4;
      const prevLat = vLat;
      vLat *= Math.exp(-edgeGrip * dt);
      if (!s.braking && Math.abs(steerInput) > 0.1) {
        vFwd += Math.abs(prevLat - vLat) * 0.18;
      }

      s.vel.x = fX * vFwd + rX * vLat;
      s.vel.z = fZ * vFwd + rZ * vLat;

      const prevZ = s.pos.z;
      const prevY = s.pos.y;
      s.pos.x += s.vel.x * dt;
      s.pos.z += s.vel.z * dt;

      const nextSurf = getSurfaceInfo(s.pos.x, s.pos.z, this.normalTmp);
      const nextGroundY = nextSurf.height;

      const slopeRiseY = nextGroundY - prevY;
      const naturalSlopeVy = slopeRiseY / Math.max(0.001, dt);

      // Launch cleanly off sculpted snow kicker lips!
      const leftRampLip =
        s.wasOnRamp &&
        (!nextSurf.onRamp || nextSurf.rampInfo.lipProgress > 1.0) &&
        vFwd > 9.0;

      const ballisticY = prevY + s.vel.y * dt - 0.5 * GRAVITY * dt * dt;
      const crestLaunch =
        !leftRampLip &&
        s.vel.y > 1.2 &&
        ballisticY - nextGroundY > 0.3 &&
        vFwd > 15;

      if (leftRampLip) {
        const chargeBonus = s.jumpCharging ? s.jumpCharge : 0.48;
        s.pos.y = Math.max(prevY, nextGroundY + 0.14);
        this._executeJump(chargeBonus, surf, true, surf.rampInfo.ramp);
      } else if (crestLaunch) {
        s.grounded = false;
        s.pos.y = ballisticY;
        this._initAirState(null);
        this.tricks.onTakeoff(s, false, null, 0.25);
      } else {
        s.pos.y = nextGroundY;
        const clampedSlopeVy = Math.max(-24, Math.min(24, naturalSlopeVy));
        s.vel.y += (clampedSlopeVy - s.vel.y) * Math.min(1, dt * 18);
      }

      this._checkCourseEvents(prevZ, s.pos.z);
    } else {
      // --- FULL 3-AXIS AERIAL ACROBATICS & TRICK CHAINING ---
      s.airTime += dt;
      s.vel.y -= GRAVITY * dt;
      const airDrag = Math.exp(-0.065 * dt);
      s.vel.x *= airDrag;
      s.vel.z *= airDrag;

      // 1. Yaw Spin (A / D) — brisk, super responsive 360°..1440°!
      const flipInput = (input.brake ? 1 : 0) - (input.forward ? 1 : 0); // +1 = S (Backflip), -1 = W (Frontflip)
      const spinRate = 6.2; // 360° in ~1.01s!
      const flipRate = 5.95; // Full Backflip / Frontflip in ~1.05s!

      if (steerInput !== 0 && s.airTime > 0.06) {
        s.airSpin += steerInput * spinRate * dt;
      } else {
        // Silky stomp assist toward nearest clean 180° (Forward or Switch!) when player releases A/D
        const nearestHalf = Math.round(s.airSpin / Math.PI) * Math.PI;
        const diff = nearestHalf - s.airSpin;
        s.airSpin += diff * Math.min(1, dt * 9.5);
      }

      // 2. Pitch Flip (S = Backflip, W = Frontflip) + Diagonal Cork/Rodeo/Misty Off-Axis Roll!
      if (flipInput !== 0 && s.airTime > 0.06) {
        s.airFlipPitch += flipInput * flipRate * dt;

        // Combining Flip + Spin tilts smoothly into true off-axis Cork / Rodeo / Misty roll!
        const targetRoll = steerInput !== 0 ? steerInput * flipInput * 0.52 : 0;
        s.airOffAxisRoll += (targetRoll - s.airOffAxisRoll) * Math.min(1, dt * 8.5);
      } else {
        // Silky upright flip finish when player releases W/S before touchdown
        const nearestFlip = Math.round(s.airFlipPitch / (Math.PI * 2)) * Math.PI * 2;
        const fDiff = nearestFlip - s.airFlipPitch;
        if (Math.abs(fDiff) < 2.1) {
          s.airFlipPitch += fDiff * Math.min(1, dt * 9.8);
        }
        s.airOffAxisRoll *= Math.exp(-9.5 * dt);
      }

      // Update Combinatorial Grab & Live Trick Engine
      this.tricks.updateAir(s, input, dt);

      s.carveVisual *= Math.exp(-5 * dt);
      s.groundVisualSpin *= Math.exp(-8 * dt);

      const prevZ = s.pos.z;
      s.pos.x += s.vel.x * dt;
      s.pos.y += s.vel.y * dt;
      s.pos.z += s.vel.z * dt;

      const landSurf = getSurfaceInfo(s.pos.x, s.pos.z, this.normalTmp);
      const heightAboveSnow = s.pos.y - landSurf.height;
      if (heightAboveSnow > s.airPeakHeight) {
        s.airPeakHeight = heightAboveSnow;
      }

      if (s.pos.y <= landSurf.height) {
        s.pos.y = landSurf.height;
        s.grounded = true;
        this._handleLanding(landSurf);
      }

      this._checkCourseEvents(prevZ, s.pos.z);
    }

    this._resolveObstacleCollisions();
    this._enforceValleyBounds();

    // Update live telemetry
    s.speed = Math.hypot(s.vel.x, s.vel.z);
    s.speedKmh = Math.round(s.speed * 3.6);
    if (s.speedKmh > s.topSpeedKmh) s.topSpeedKmh = s.speedKmh;
    s.altitude = worldYToAltitude(s.pos.y);
    s.uniqueTricksCount = this.tricks.uniqueTricks.size;
    s.bestComboScore = this.tricks.bestComboScore;
    s.tricksLanded = this.tricks.totalTricksLanded;
    s.combo = this.tricks.chainMultiplier;
    if (s.combo > s.maxCombo) s.maxCombo = s.combo;

    return s;
  }

  _initAirState(rampObj) {
    const s = this.state;
    s.airTime = 0;
    s.airPeakHeight = 0;
    s.airSpin = 0;
    s.airFlipPitch = 0;
    s.airOffAxisRoll = 0;
    s.activeGrab = null;
    s.activeGroundTrick = null;
    s.groundVisualSpin = 0;
    s.airFromRamp = rampObj;
  }

  _executeJump(charge, surf, fromRamp, rampObj = null) {
    const s = this.state;
    const horizSpd = Math.hypot(s.vel.x, s.vel.z);
    const butterBonus = s.activeGroundTrick ? 1.22 : 1.0;

    // Generous, exhilarating alpine freestyle pop so flat ollies can nail 360/Backflips and Big-Air ramps soar!
    const popVel = fromRamp
      ? Math.max(8.8, s.vel.y * 0.95 + 6.4 + charge * 4.8 + Math.min(5.2, horizSpd * 0.17))
      : (7.8 + charge * 4.8 + Math.max(0, s.vel.y * 0.35)) * butterBonus;

    s.vel.y = Math.min(21.5, popVel);
    s.grounded = false;
    s.jumpCharging = false;
    s.jumpCharge = 0;
    s.jumpCooldown = 0.24;

    this.tricks.onTakeoff(s, fromRamp, rampObj, charge);
    this._initAirState(rampObj);

    if (this.cb.onJump) {
      this.cb.onJump(fromRamp ? 1.3 : 0.78 + charge * 0.55, rampObj);
    }
  }

  _handleLanding(surf) {
    const s = this.state;
    const impactSpeed = Math.max(0, -s.vel.y);
    const impactIntensity = Math.min(1.4, impactSpeed / 16.0);

    const res = this.tricks.onLanding(s);

    // Smooth visual Switch Revert whip when sticking 180° / 540° / 900°!
    if (res && res.clean && res.isSwitchRevert) {
      s.switchRevertSpin = Math.PI * (s.airSpin >= 0 ? 1 : -1);
    }

    s.airSpin = 0;
    s.airFlipPitch = 0;
    s.airOffAxisRoll = 0;

    // Project velocity cleanly onto landing slope
    const n = surf.normal;
    const vDotN = s.vel.x * n.x + s.vel.y * n.y + s.vel.z * n.z;
    if (vDotN < 0) {
      s.vel.x -= vDotN * n.x;
      s.vel.y -= vDotN * n.y;
      s.vel.z -= vDotN * n.z;
    }

    if (s.airTime > s.longestAirTime) {
      s.longestAirTime = s.airTime;
    }

    if (!res) return;

    if (res.clean) {
      if (res.isTrick) {
        // Stomp adrenaline speed surge!
        s.vel.x *= 1.05;
        s.vel.z *= 1.05;
      }
      if (this.cb.onLanding) {
        this.cb.onLanding({
          intensity: res.label ? impactIntensity : impactIntensity * 0.6,
          clean: true,
          points: res.points,
          label: res.label,
          sublabel: res.sublabel || '',
          isTrick: res.isTrick,
          isNew: !!res.isNew,
        });
      }
    } else {
      // Rough bail landing
      s.vel.x *= 0.65;
      s.vel.z *= 0.65;
      if (this.cb.onLanding) {
        this.cb.onLanding({
          intensity: Math.min(1.5, impactIntensity + 0.45),
          clean: false,
          points: 0,
          label: res.label,
          sublabel: res.sublabel,
          isTrick: false,
          isNew: false,
        });
      }
    }
  }

  _checkCourseEvents(prevZ, curZ) {
    const s = this.state;

    // 1. Slalom Gates link directly into the live Trick Combo Chain!
    for (let i = 0; i < this.features.gates.length; i++) {
      const g = this.features.gates[i];
      if (g.passed || g.missed) continue;
      if (prevZ >= g.z && curZ < g.z) {
        const latDist = Math.abs(s.pos.x - g.x);
        if (latDist <= g.halfSpan + 1.2) {
          g.passed = true;
          s.gatesCleared += 1;
          const baseGatePts = 200;
          this.tricks.addComboStep('Слалом-ворота', baseGatePts, { state: s, isNewCheck: false, silent: true });
          if (this.cb.onGateCleared) {
            this.cb.onGateCleared(g, this.tricks.chainMultiplier, baseGatePts);
          }
        } else {
          g.missed = true;
        }
      }
    }

    // 2. Finish Line Crossing at z = -3000 (automatically banks any active live combo!)
    if (!s.finished && prevZ >= COURSE_FINISH_Z && curZ < COURSE_FINISH_Z) {
      this.tricks.bankCombo(s);
      s.finished = true;
      s.finishTime = s.runTime;
      const timeBonus = Math.max(0, Math.round((140 - s.finishTime) * 35));
      s.score += timeBonus;
      if (this.cb.onFinish) {
        this.cb.onFinish(s, timeBonus);
      }
    }
  }

  _resolveObstacleCollisions() {
    const s = this.state;
    const z = s.pos.z;
    const skierR = 0.58;

    const testList = (list, maxHeight) => {
      let lo = 0;
      let hi = list.length - 1;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (list[mid].z > z + 6.0) lo = mid + 1;
        else hi = mid;
      }

      for (let i = lo; i < list.length; i++) {
        const ob = list[i];
        if (ob.z < z - 6.0) break;
        if (maxHeight > 0 && s.pos.y > ob.y + maxHeight) continue;

        const dx = s.pos.x - ob.x;
        const dz = s.pos.z - ob.z;
        const minDist = ob.radius + skierR;
        const distSq = dx * dx + dz * dz;

        if (distSq < minDist * minDist && distSq > 0.0001) {
          const dist = Math.sqrt(distSq);
          const nx = dx / dist;
          const nz = dz / dist;

          const push = minDist - dist + 0.08;
          s.pos.x += nx * push;
          s.pos.z += nz * push;

          const vDotN = s.vel.x * nx + s.vel.z * nz;
          if (vDotN < 0) {
            const impactSpd = -vDotN;
            s.vel.x -= 1.45 * vDotN * nx;
            s.vel.z -= 1.45 * vDotN * nz;
            s.vel.x *= 0.52;
            s.vel.z *= 0.52;
            this.tricks.cancelCombo();

            if (s.collisionCooldown <= 0 && impactSpd > 3.5) {
              s.collisionCooldown = 0.45;
              if (this.cb.onCollision) {
                this.cb.onCollision(Math.min(1.2, impactSpd / 18));
              }
            }
          }
        }
      }
    };

    testList(this.treesSorted, 9.0);
    testList(this.bouldersSorted, 2.2);
  }

  _enforceValleyBounds() {
    const s = this.state;
    const cx = getPisteCenterX(s.pos.z);
    const maxOffset = 98;
    const dx = s.pos.x - cx;
    if (Math.abs(dx) > maxOffset) {
      const sign = Math.sign(dx);
      s.pos.x = cx + sign * maxOffset;
      if (s.vel.x * sign > 0) s.vel.x *= -0.35;
    }

    if (s.pos.z < COURSE_END_Z + 12) {
      s.pos.z = COURSE_END_Z + 12;
      s.vel.z = Math.max(0, s.vel.z);
      s.vel.x *= 0.9;
    }
    if (s.pos.z > 22) {
      s.pos.z = 22;
      s.vel.z = Math.min(0, s.vel.z);
    }
  }
}
