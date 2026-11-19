import * as THREE from 'three';
import { createSkiTexture } from './textures.js';

/**
 * Curved alpine racing ski geometry with prominent upturned front shovel & twin-tip tail kick
 */
function createSkiGeometry() {
  const length = 2.16;
  const width = 0.118;
  const thickness = 0.024;
  const segsZ = 24;

  const geo = new THREE.BoxGeometry(width, thickness, length, 2, 1, segsZ);
  const pos = geo.getAttribute('position');

  for (let i = 0; i < pos.count; i++) {
    let x = pos.getX(i);
    let y = pos.getY(i);
    const z = pos.getZ(i);

    const nz = z / (length * 0.5);
    const sidecut = 1.0 - 0.15 * (1.0 - nz * nz);
    x *= sidecut;

    if (nz < -0.74) {
      const tipT = (-nz - 0.74) / 0.26;
      x *= Math.max(0.2, Math.cos(tipT * Math.PI * 0.47));
      y += Math.pow(tipT, 1.85) * 0.19;
      y *= 1.0 - tipT * 0.15;
    }

    if (nz > 0.84) {
      const tailT = (nz - 0.84) / 0.16;
      x *= Math.max(0.42, Math.cos(tailT * Math.PI * 0.36));
      y += tailT * tailT * 0.075; // Freestyle twin-tip tail kick!
    }

    const camber = Math.max(0, 1.0 - nz * nz * 1.4) * 0.012;
    y += camber;

    pos.setXYZ(i, x, y, z);
  }

  geo.computeVertexNormals();
  return geo;
}

/**
 * Target pose lookup for all 10 distinct 3D aerial grabs/stunts
 */
function getGrabPose(grabId, elapsed) {
  // Returns offsets for leftSki, rightSki, leftArm, rightArm, and skisYaw
  const p = {
    lsPos: [0, 0, 0],
    lsRot: [0, 0, 0],
    rsPos: [0, 0, 0],
    rsRot: [0, 0, 0],
    laPos: [0, 0, 0],
    laRot: [0, 0, 0],
    laPoleX: 0,
    raPos: [0, 0, 0],
    raRot: [0, 0, 0],
    raPoleX: 0,
    skisYaw: 0,
    skisPitch: 0,
    skisRoll: 0,
  };

  switch (grabId) {
    case 'mute':
      // Classic X-cross Mute Grab (left hand crosses to grab ski)
      p.lsPos = [0.05, 0.34, -0.1];
      p.lsRot = [0.46, 0.56, -0.52];
      p.rsPos = [-0.04, 0.2, -0.05];
      p.rsRot = [0.28, -0.42, 0.38];
      p.laPos = [0.18, -0.34, -0.14];
      p.laRot = [-0.95, 0.25, 0.15];
      p.laPoleX = -0.65;
      p.raPos = [0.16, 0.1, 0.06];
      p.raRot = [0.3, -0.2, -0.45];
      break;

    case 'method':
      // Method Air: both skis whip high left & flat sideways!
      p.skisRoll = 0.68;
      p.skisPitch = 0.38;
      p.lsPos = [-0.14, 0.36, -0.08];
      p.rsPos = [-0.1, 0.28, -0.08];
      p.laPos = [-0.04, -0.3, -0.15];
      p.laRot = [-0.82, -0.2, 0.35];
      p.laPoleX = -0.5;
      p.raPos = [0.24, 0.2, -0.04];
      p.raRot = [0.45, -0.3, -0.65];
      break;

    case 'tail':
      // Tail Grab: skis kick forward & upward cleanly while right arm reaches down-back
      p.skisPitch = 0.58;
      p.lsPos = [0, 0.28, -0.22];
      p.rsPos = [0, 0.28, -0.22];
      p.raPos = [-0.06, -0.34, 0.08];
      p.raRot = [-0.7, -0.25, -0.1];
      p.raPoleX = -0.4;
      p.laPos = [-0.18, 0.14, -0.05];
      p.laRot = [0.25, 0.25, 0.45];
      break;

    case 'japan':
      // Tweaked Japan Air: skis fold diagonally high up with dramatic cross-tweak!
      p.skisPitch = 0.52;
      p.skisRoll = -0.72;
      p.skisYaw = 0.45;
      p.lsPos = [0.06, 0.42, -0.15];
      p.lsRot = [0.22, 0.25, -0.3];
      p.rsPos = [-0.06, 0.34, -0.12];
      p.laPos = [0.22, -0.28, -0.18];
      p.laRot = [-1.05, 0.35, -0.2];
      p.laPoleX = -0.7;
      p.raPos = [0.28, 0.22, -0.02];
      p.raRot = [0.55, -0.4, -0.8];
      break;

    case 'nose':
      // Nose / Tip Grab: steep nose-up skis + BOTH gloved hands shoot forward to grab vermilion tips!
      p.skisPitch = 0.72;
      p.lsPos = [0.04, 0.32, 0.06];
      p.rsPos = [-0.04, 0.32, 0.06];
      p.laPos = [0.12, -0.26, -0.32];
      p.laRot = [-0.88, 0.12, 0];
      p.laPoleX = -0.72;
      p.raPos = [-0.12, -0.26, -0.32];
      p.raRot = [-0.88, -0.12, 0];
      p.raPoleX = -0.72;
      break;

    case 'spread':
      // Classic Alpine Spread Eagle: wide V-split skis + arms & poles flung wide open!
      p.skisPitch = 0.22;
      p.lsPos = [-0.34, 0.16, -0.1];
      p.lsRot = [0.15, 0.48, 0.42];
      p.rsPos = [0.34, 0.16, -0.1];
      p.rsRot = [0.15, -0.48, -0.42];
      p.laPos = [-0.28, 0.22, 0.04];
      p.laRot = [0.35, 0.45, 0.85];
      p.raPos = [0.28, 0.22, 0.04];
      p.raRot = [0.35, -0.45, -0.85];
      break;

    case 'daffy': {
      // Animated Freestyle Daffy Scissors!
      const osc = Math.sin(elapsed * 9.5);
      const kick = osc >= 0 ? 1 : -1;
      p.lsPos = [0, 0.24 + kick * 0.12, -0.25 * kick];
      p.lsRot = [0.55 * kick, 0, 0];
      p.rsPos = [0, 0.24 - kick * 0.12, 0.25 * kick];
      p.rsRot = [-0.55 * kick, 0, 0];
      p.laPos = [-0.16, 0.14, -0.14 * kick];
      p.laRot = [0.25 * kick, 0.15, 0.4];
      p.raPos = [0.16, 0.14, 0.14 * kick];
      p.raRot = [-0.25 * kick, -0.15, -0.4];
      break;
    }

    case 'cossack':
      // Cossack Straddle: skis kick high forward & wide out sideways, poles cross triumphantly!
      p.skisPitch = 0.48;
      p.lsPos = [-0.42, 0.36, -0.16];
      p.lsRot = [0.28, 0.78, 0.55];
      p.rsPos = [0.42, 0.36, -0.16];
      p.rsRot = [0.28, -0.78, -0.55];
      p.laPos = [0.14, 0.16, -0.12];
      p.laRot = [0.65, 0.4, -0.5];
      p.raPos = [-0.14, 0.16, -0.12];
      p.raRot = [0.65, -0.4, 0.5];
      break;

    case 'shifty':
      // Aggressive Shifty Counter-Twist!
      p.skisYaw = 1.05;
      p.skisRoll = 0.24;
      p.skisPitch = 0.28;
      p.lsPos = [0, 0.24, 0];
      p.rsPos = [0, 0.24, 0];
      p.laPos = [-0.18, 0.08, -0.12];
      p.laRot = [0.1, -0.35, 0.35];
      p.raPos = [0.18, 0.08, 0.08];
      p.raRot = [0.1, -0.35, -0.35];
      break;

    case 'octo':
      // Signature Octograb: tight crossed skis pulled right up into view + BOTH hands locked!
      p.skisPitch = 0.56;
      p.lsPos = [0.12, 0.44, -0.16];
      p.lsRot = [0.45, 0.68, -0.62];
      p.rsPos = [-0.12, 0.38, -0.12];
      p.rsRot = [0.38, -0.68, 0.62];
      p.laPos = [0.2, -0.3, -0.2];
      p.laRot = [-1.0, 0.3, 0.1];
      p.laPoleX = -0.75;
      p.raPos = [-0.2, -0.3, -0.2];
      p.raRot = [-1.0, -0.3, -0.1];
      p.raPoleX = -0.75;
      break;
  }

  return p;
}

export class FirstPersonSkierRig {
  constructor(scene, camera) {
    this.scene = scene;
    this.camera = camera;

    // 1. Root moves to skier feet world contact point
    this.root = new THREE.Group();
    scene.add(this.root);

    // 2. Body rotates with ski heading + mid-air yaw spin + switch revert whip
    this.body = new THREE.Group();
    this.root.add(this.body);

    // 3. Center-of-mass Air Tumble Pivot (rotates Backflips, Frontflips & Off-Axis Cork/Rodeo around torso!)
    this.airTumble = new THREE.Group();
    this.airTumble.position.set(0, 0.92, 0);
    this.airTumble.rotation.order = 'XYZ';
    this.body.add(this.airTumble);

    this.bodyPivot = new THREE.Group();
    this.bodyPivot.position.set(0, -0.92, 0);
    this.airTumble.add(this.bodyPivot);

    // Skis sub-group (pitches to terrain slope / air grab poses / ground butter 360 spin!)
    this.skisPivot = new THREE.Group();
    this.bodyPivot.add(this.skisPivot);

    // Upper body / shoulders pivot (crouches in tuck, leans into carves!)
    this.upperBody = new THREE.Group();
    this.upperBody.position.set(0, 1.46, 0);
    this.bodyPivot.add(this.upperBody);

    // Camera rig mounted at skier's head inside upperBody
    this.headRig = new THREE.Group();
    this.headRig.position.set(0, 0.08, -0.06);
    this.upperBody.add(this.headRig);
    this.headRig.add(camera);
    this.camera.rotation.order = 'YXZ';

    // Materials
    const skiTexL = createSkiTexture(false);
    const skiTexR = createSkiTexture(true);
    const skiBaseMat = new THREE.MeshStandardMaterial({ color: '#11151d', roughness: 0.35, metalness: 0.25 });
    const skiEdgeMat = new THREE.MeshStandardMaterial({ color: '#cfd9e3', roughness: 0.28, metalness: 0.82 });

    const makeSkiMaterials = (topTex) => [
      skiEdgeMat,
      skiEdgeMat,
      new THREE.MeshStandardMaterial({ map: topTex, roughness: 0.32, metalness: 0.18 }),
      skiBaseMat,
      skiEdgeMat,
      skiEdgeMat,
    ];

    const skiGeo = createSkiGeometry();
    const bindingMat = new THREE.MeshStandardMaterial({ color: '#1b222c', roughness: 0.45, metalness: 0.4 });
    const accentMat = new THREE.MeshStandardMaterial({ color: '#e6482e', roughness: 0.35, metalness: 0.2 });
    const bootMat = new THREE.MeshStandardMaterial({ color: '#242f40', roughness: 0.42, metalness: 0.18 });
    const buckleMat = new THREE.MeshStandardMaterial({ color: '#d7e1ec', roughness: 0.25, metalness: 0.85 });

    const buildSkiAssembly = (isRight) => {
      const group = new THREE.Group();

      const plank = new THREE.Mesh(skiGeo, makeSkiMaterials(isRight ? skiTexR : skiTexL));
      plank.position.set(0, 0.015, -0.34);
      plank.castShadow = true;
      plank.receiveShadow = true;
      group.add(plank);

      const toePiece = new THREE.Mesh(new THREE.BoxGeometry(0.088, 0.048, 0.14), bindingMat);
      toePiece.position.set(0, 0.045, -0.22);
      toePiece.castShadow = true;
      group.add(toePiece);

      const toeAccent = new THREE.Mesh(new THREE.BoxGeometry(0.092, 0.016, 0.04), accentMat);
      toeAccent.position.set(0, 0.068, -0.23);
      group.add(toeAccent);

      const heelPiece = new THREE.Mesh(new THREE.BoxGeometry(0.086, 0.056, 0.16), bindingMat);
      heelPiece.position.set(0, 0.048, 0.18);
      heelPiece.castShadow = true;
      group.add(heelPiece);

      const bootSole = new THREE.Mesh(new THREE.BoxGeometry(0.105, 0.088, 0.32), bootMat);
      bootSole.position.set(0, 0.086, -0.02);
      bootSole.castShadow = true;
      group.add(bootSole);

      const bootCuff = new THREE.Mesh(new THREE.CylinderGeometry(0.064, 0.058, 0.24, 10), bootMat);
      bootCuff.position.set(0, 0.21, 0.05);
      bootCuff.rotation.x = -0.18;
      bootCuff.castShadow = true;
      group.add(bootCuff);

      for (let b = 0; b < 2; b++) {
        const buckle = new THREE.Mesh(new THREE.BoxGeometry(0.114, 0.015, 0.024), buckleMat);
        buckle.position.set(0, 0.11 + b * 0.05, -0.08 + b * 0.06);
        group.add(buckle);
      }

      return group;
    };

    this.leftSki = buildSkiAssembly(false);
    this.rightSki = buildSkiAssembly(true);
    this.leftSki.position.set(-0.21, 0, 0);
    this.rightSki.position.set(0.21, 0, 0);
    this.skisPivot.add(this.leftSki, this.rightSki);

    this.leftArm = this._buildArmAndPole(-1);
    this.rightArm = this._buildArmAndPole(1);
    this.upperBody.add(this.leftArm, this.rightArm);

    this.shadowBody = this._buildShadowSilhouette();
    this.bodyPivot.add(this.shadowBody);

    // Smoothed pose blend state
    this.smoothTuck = 0;
    this.smoothCarve = 0;
    this.smoothBrake = 0;
    this.smoothSlopePitch = 0;
    this.smoothJumpCharge = 0;
    this.smoothNoseButter = 0;
    this.smoothTailManual = 0;
    this.smoothOneSki = 0;

    // Smoothed grab pose interpolation buffer (so switching Mute -> Japan -> Cossack mid-air is buttery smooth!)
    this.curPose = {
      lsPos: [0, 0, 0],
      lsRot: [0, 0, 0],
      rsPos: [0, 0, 0],
      rsRot: [0, 0, 0],
      laPos: [0, 0, 0],
      laRot: [0, 0, 0],
      laPoleX: 0,
      raPos: [0, 0, 0],
      raRot: [0, 0, 0],
      raPoleX: 0,
      skisYaw: 0,
      skisPitch: 0,
      skisRoll: 0,
    };

    this.polePushPhase = 0;
    this.landingDip = 0;
    this.cameraShake = 0;
    this.bobPhase = 0;
  }

  _buildArmAndPole(side) {
    const armGroup = new THREE.Group();
    armGroup.position.set(side * 0.31, -0.19, -0.18);

    const sleeveMat = new THREE.MeshStandardMaterial({ color: '#1f3654', roughness: 0.72, metalness: 0.05 });
    const cuffAccentMat = new THREE.MeshStandardMaterial({ color: '#e6482e', roughness: 0.55 });
    const gloveMat = new THREE.MeshStandardMaterial({ color: '#191d24', roughness: 0.65 });
    const poleShaftMat = new THREE.MeshStandardMaterial({ color: '#222832', roughness: 0.3, metalness: 0.65 });
    const basketMat = new THREE.MeshStandardMaterial({ color: '#e6482e', roughness: 0.45 });

    const forearm = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.068, 0.44, 10), sleeveMat);
    forearm.rotation.x = Math.PI * 0.44;
    forearm.rotation.z = side * 0.14;
    forearm.position.set(side * 0.03, -0.05, -0.16);
    forearm.castShadow = true;
    armGroup.add(forearm);

    const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.056, 0.055, 10), cuffAccentMat);
    cuff.rotation.x = Math.PI * 0.44;
    cuff.position.set(side * 0.005, -0.085, -0.34);
    armGroup.add(cuff);

    const handPivot = new THREE.Group();
    handPivot.position.set(0, -0.1, -0.4);
    armGroup.add(handPivot);

    const glovePalm = new THREE.Mesh(new THREE.BoxGeometry(0.095, 0.088, 0.125), gloveMat);
    glovePalm.castShadow = true;
    handPivot.add(glovePalm);

    const thumb = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.042, 0.07), gloveMat);
    thumb.position.set(-side * 0.052, 0.025, -0.01);
    thumb.rotation.y = side * 0.35;
    handPivot.add(thumb);

    const poleGroup = new THREE.Group();
    poleGroup.position.set(0, -0.01, -0.02);
    poleGroup.rotation.x = 0.52;
    poleGroup.rotation.z = side * 0.12;
    handPivot.add(poleGroup);

    const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.018, 0.14, 8), gloveMat);
    grip.position.y = 0.02;
    poleGroup.add(grip);

    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.0065, 1.24, 8), poleShaftMat);
    shaft.position.y = -0.62;
    shaft.castShadow = true;
    poleGroup.add(shaft);

    const basket = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.042, 0.014, 12), basketMat);
    basket.position.y = -1.16;
    basket.castShadow = true;
    poleGroup.add(basket);

    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.008, 0.075, 6), poleShaftMat);
    tip.rotation.x = Math.PI;
    tip.position.y = -1.26;
    poleGroup.add(tip);

    armGroup.userData.poleGroup = poleGroup;
    armGroup.userData.handPivot = handPivot;
    return armGroup;
  }

  _buildShadowSilhouette() {
    const group = new THREE.Group();
    const shadowOnlyMat = new THREE.MeshBasicMaterial({
      colorWrite: false,
      depthWrite: false,
    });

    const addPart = (geo, x, y, z, rx = 0, rz = 0) => {
      const m = new THREE.Mesh(geo, shadowOnlyMat);
      m.position.set(x, y, z);
      m.rotation.set(rx, 0, rz);
      m.castShadow = true;
      m.frustumCulled = false;
      group.add(m);
      return m;
    };

    addPart(new THREE.CylinderGeometry(0.085, 0.072, 0.52, 8), -0.19, 0.34, 0.04, -0.25);
    addPart(new THREE.CylinderGeometry(0.085, 0.072, 0.52, 8), 0.19, 0.34, 0.04, -0.25);
    addPart(new THREE.CylinderGeometry(0.105, 0.085, 0.5, 8), -0.17, 0.72, 0.06, 0.24);
    addPart(new THREE.CylinderGeometry(0.105, 0.085, 0.5, 8), 0.17, 0.72, 0.06, 0.24);

    this.shadowTorso = new THREE.Group();
    this.shadowTorso.position.set(0, 0.88, 0.06);
    group.add(this.shadowTorso);

    const torsoMesh = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.58, 0.28), shadowOnlyMat);
    torsoMesh.position.set(0, 0.28, -0.04);
    torsoMesh.rotation.x = -0.22;
    torsoMesh.castShadow = true;
    torsoMesh.frustumCulled = false;
    this.shadowTorso.add(torsoMesh);

    const packMesh = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.44, 0.16), shadowOnlyMat);
    packMesh.position.set(0, 0.3, 0.14);
    packMesh.rotation.x = -0.22;
    packMesh.castShadow = true;
    packMesh.frustumCulled = false;
    this.shadowTorso.add(packMesh);

    const headMesh = new THREE.Mesh(new THREE.SphereGeometry(0.145, 10, 8), shadowOnlyMat);
    headMesh.position.set(0, 0.69, -0.12);
    headMesh.castShadow = true;
    headMesh.frustumCulled = false;
    this.shadowTorso.add(headMesh);

    for (const side of [-1, 1]) {
      const upperArm = new THREE.Mesh(new THREE.CylinderGeometry(0.068, 0.058, 0.36, 8), shadowOnlyMat);
      upperArm.position.set(side * 0.28, 0.42, -0.14);
      upperArm.rotation.set(0.65, 0, side * 0.24);
      upperArm.castShadow = true;
      upperArm.frustumCulled = false;
      this.shadowTorso.add(upperArm);
    }

    return group;
  }

  triggerLandingImpact(intensity) {
    this.landingDip = Math.min(0.42, this.landingDip + intensity * 0.34);
    this.cameraShake = Math.min(0.06, this.cameraShake + intensity * 0.042);
  }

  triggerCollisionShake(intensity) {
    this.cameraShake = Math.min(0.11, this.cameraShake + intensity * 0.085);
  }

  triggerPolePush() {
    if (this.polePushPhase <= 0.02) {
      this.polePushPhase = 1.0;
    }
  }

  update(state, dt, elapsed) {
    const lerp = (rate) => 1 - Math.exp(-rate * dt);

    this.smoothTuck += ((state.tucking ? 1 : 0) - this.smoothTuck) * lerp(8);
    this.smoothCarve += (state.carveVisual - this.smoothCarve) * lerp(11);
    this.smoothBrake += ((state.braking ? 1 : 0) - this.smoothBrake) * lerp(10);
    this.smoothJumpCharge += (state.jumpCharge - this.smoothJumpCharge) * lerp(16);

    this.smoothNoseButter += ((state.activeGroundTrick === 'noseButter' ? 1 : 0) - this.smoothNoseButter) * lerp(11);
    this.smoothTailManual += ((state.activeGroundTrick === 'tailManual' ? 1 : 0) - this.smoothTailManual) * lerp(11);
    this.smoothOneSki += ((state.activeGroundTrick === 'oneSki' ? 1 : 0) - this.smoothOneSki) * lerp(11);

    // Smoothly interpolate toward active 3D Aerial Grab Pose!
    const targetPose = getGrabPose(state.grounded ? null : state.activeGrab, elapsed);
    const poseLerp = lerp(13.5);
    const lerpVec3 = (cur, tgt) => {
      cur[0] += (tgt[0] - cur[0]) * poseLerp;
      cur[1] += (tgt[1] - cur[1]) * poseLerp;
      cur[2] += (tgt[2] - cur[2]) * poseLerp;
    };
    lerpVec3(this.curPose.lsPos, targetPose.lsPos);
    lerpVec3(this.curPose.lsRot, targetPose.lsRot);
    lerpVec3(this.curPose.rsPos, targetPose.rsPos);
    lerpVec3(this.curPose.rsRot, targetPose.rsRot);
    lerpVec3(this.curPose.laPos, targetPose.laPos);
    lerpVec3(this.curPose.laRot, targetPose.laRot);
    lerpVec3(this.curPose.raPos, targetPose.raPos);
    lerpVec3(this.curPose.raRot, targetPose.raRot);
    this.curPose.laPoleX += (targetPose.laPoleX - this.curPose.laPoleX) * poseLerp;
    this.curPose.raPoleX += (targetPose.raPoleX - this.curPose.raPoleX) * poseLerp;
    this.curPose.skisYaw += (targetPose.skisYaw - this.curPose.skisYaw) * poseLerp;
    this.curPose.skisPitch += (targetPose.skisPitch - this.curPose.skisPitch) * poseLerp;
    this.curPose.skisRoll += (targetPose.skisRoll - this.curPose.skisRoll) * poseLerp;

    const targetSlopePitch = state.grounded
      ? state.slopePitch
      : Math.max(-0.45, Math.min(0.42, state.vel.y * 0.022));
    this.smoothSlopePitch += (targetSlopePitch - this.smoothSlopePitch) * lerp(state.grounded ? 14 : 6);

    this.landingDip *= Math.exp(-8.5 * dt);
    this.cameraShake *= Math.exp(-11.0 * dt);
    if (this.polePushPhase > 0) {
      this.polePushPhase = Math.max(0, this.polePushPhase - dt * 2.1);
    }

    // 1. Place skier root & rotate 3-axis aerial spins + flips + off-axis corks!
    this.root.position.copy(state.pos);
    this.body.rotation.y = state.heading + state.airSpin + state.switchRevertSpin;
    this.airTumble.rotation.x = state.airFlipPitch;
    this.airTumble.rotation.z = state.airOffAxisRoll;

    // 2. Articulate Skis (Slope + Ground Tricks + 10 Air Grabs!)
    const butterPitch = this.smoothTailManual * 0.44 - this.smoothNoseButter * 0.24;
    this.skisPivot.rotation.set(
      this.smoothSlopePitch + butterPitch + this.curPose.skisPitch,
      state.groundVisualSpin + this.curPose.skisYaw,
      this.curPose.skisRoll
    );

    const leanRoll = this.smoothCarve * 0.26 - this.smoothOneSki * 0.09;
    const brakeSpread = this.smoothBrake * 0.24;
    const airSplay = state.grounded ? 0 : 0.06;

    // Left Ski (also lifts high during One-Ski Ground Trick!)
    this.leftSki.position.set(
      -0.21 - brakeSpread * 0.35 - airSplay * 0.3 - this.smoothOneSki * 0.16 + this.curPose.lsPos[0],
      this.smoothOneSki * 0.34 + this.curPose.lsPos[1],
      this.smoothCarve * 0.09 + this.curPose.lsPos[2]
    );
    this.leftSki.rotation.set(
      this.smoothOneSki * 0.28 + this.curPose.lsRot[0],
      -this.smoothBrake * 0.36 + airSplay + this.smoothOneSki * 0.25 + this.curPose.lsRot[1],
      this.smoothCarve * 0.56 - this.smoothBrake * 0.28 + this.smoothOneSki * 0.35 + this.curPose.lsRot[2]
    );

    // Right Ski
    this.rightSki.position.set(
      0.21 + brakeSpread * 0.35 + airSplay * 0.3 + this.curPose.rsPos[0],
      this.curPose.rsPos[1],
      -this.smoothCarve * 0.09 + this.curPose.rsPos[2]
    );
    this.rightSki.rotation.set(
      this.curPose.rsRot[0],
      this.smoothBrake * 0.36 - airSplay + this.curPose.rsRot[1],
      this.smoothCarve * 0.56 + this.smoothBrake * 0.28 + this.curPose.rsRot[2]
    );

    // 3. Upper Body crouch, butter lean & landing dip
    const speedRatio = Math.min(1.0, state.speed / 35);
    if (state.grounded && state.speed > 1.5) {
      this.bobPhase += dt * (4.2 + speedRatio * 7.5);
    }
    const microTerrainVib = state.grounded
      ? Math.sin(this.bobPhase * 2.1) * 0.011 * speedRatio +
        Math.cos(this.bobPhase * 3.7) * 0.006 * speedRatio
      : 0;

    const crouchDrop =
      this.smoothTuck * 0.38 +
      this.smoothJumpCharge * 0.24 +
      this.smoothNoseButter * 0.16 +
      this.landingDip;
    const eyeBaseY = 1.46 - crouchDrop + this.smoothTailManual * 0.06 + microTerrainVib;

    this.upperBody.position.set(
      -this.smoothCarve * 0.16,
      eyeBaseY,
      -this.smoothTuck * 0.14 - this.smoothNoseButter * 0.18 + this.smoothTailManual * 0.14
    );
    this.upperBody.rotation.z = leanRoll;

    // Update shadow silhouette so your real-time shadow ALSO does grabs, tucks, flips & manuals!
    this.shadowTorso.position.y = 0.88 - crouchDrop * 0.65;
    this.shadowTorso.rotation.x =
      -this.smoothTuck * 0.55 -
      this.smoothJumpCharge * 0.3 -
      this.smoothNoseButter * 0.4 +
      this.smoothTailManual * 0.32;
    this.shadowTorso.rotation.z = leanRoll * 1.1;

    // 4. Animate Left & Right Arms + Carbon Ski Poles across all 10 Grabs & Ground Tricks!
    const pushSwing = Math.sin(this.polePushPhase * Math.PI);
    const breath = Math.sin(elapsed * 2.1) * 0.008;
    const carveArmShift = this.smoothCarve * 0.08;
    const balanceArms = (this.smoothTailManual + this.smoothOneSki + this.smoothNoseButter) * 0.18;

    this.leftArm.position.set(
      -0.31 + this.smoothTuck * 0.11 - balanceArms + this.curPose.laPos[0],
      -0.19 + breath + this.smoothTuck * 0.04 + balanceArms * 0.4 + this.curPose.laPos[1],
      -0.16 - this.smoothTuck * 0.06 - pushSwing * 0.26 + this.curPose.laPos[2]
    );
    this.leftArm.rotation.set(
      -pushSwing * 0.72 + this.smoothTuck * 0.16 + this.curPose.laRot[0],
      this.smoothTuck * 0.24 - carveArmShift + this.curPose.laRot[1],
      -this.smoothCarve * 0.15 + balanceArms * 1.6 + this.curPose.laRot[2]
    );
    this.leftArm.userData.poleGroup.rotation.x =
      0.52 + this.smoothTuck * 0.88 + pushSwing * 0.82 + this.curPose.laPoleX;

    this.rightArm.position.set(
      0.31 - this.smoothTuck * 0.11 + balanceArms + this.curPose.raPos[0],
      -0.19 - breath + this.smoothTuck * 0.04 + balanceArms * 0.4 + this.curPose.raPos[1],
      -0.16 - this.smoothTuck * 0.06 - pushSwing * 0.26 + this.curPose.raPos[2]
    );
    this.rightArm.rotation.set(
      -pushSwing * 0.72 + this.smoothTuck * 0.16 + this.curPose.raRot[0],
      -this.smoothTuck * 0.24 - carveArmShift + this.curPose.raRot[1],
      -this.smoothCarve * 0.15 - balanceArms * 1.6 + this.curPose.raRot[2]
    );
    this.rightArm.userData.poleGroup.rotation.x =
      0.52 + this.smoothTuck * 0.88 + pushSwing * 0.82 + this.curPose.raPoleX;

    // 5. First-Person Head Look & Dynamic FOV Rush!
    const shakeX = (Math.sin(elapsed * 63) + Math.cos(elapsed * 41)) * 0.5 * this.cameraShake;
    const shakeZ = (Math.cos(elapsed * 55) - Math.sin(elapsed * 37)) * 0.5 * this.cameraShake;

    const slopeAssistPitch = this.smoothSlopePitch * 0.42;

    this.camera.rotation.y = state.headYaw;
    this.camera.rotation.x = Math.max(
      -1.22,
      Math.min(1.02, state.headPitch + slopeAssistPitch + shakeX)
    );
    this.camera.rotation.z = shakeZ;

    // Slight adrenaline FOV boost during air tricks & fast tuck!
    const trickFov = !state.grounded && (state.activeGrab || Math.abs(state.airFlipPitch) > 0.4) ? 5.5 : 0;
    const targetFov = 74 + speedRatio * 14 + this.smoothTuck * 5.5 + (state.grounded ? 0 : 3.5) + trickFov;
    if (Math.abs(this.camera.fov - targetFov) > 0.05) {
      this.camera.fov += (targetFov - this.camera.fov) * lerp(7);
      this.camera.updateProjectionMatrix();
    }
  }
}
