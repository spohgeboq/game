import * as THREE from 'three';

export const LIGHTING_PRESETS = {
  morning: {
    id: 'morning',
    label: 'Утро',
    sunDir: new THREE.Vector3(-0.64, 0.42, -0.64).normalize(),
    sunColor: new THREE.Color('#fff7ea'),
    sunIntensity: 3.1,
    hemiSky: new THREE.Color('#8ec5fc'),
    hemiGround: new THREE.Color('#5a7da8'),
    hemiIntensity: 1.05,
    fogColor: new THREE.Color('#cde2f6'),
    fogDensity: 0.00145,
    skyTop: new THREE.Color('#134696'),
    skyMid: new THREE.Color('#5a9ee2'),
    skyHorizon: new THREE.Color('#d7e9fa'),
    sunGlowColor: new THREE.Color('#fff5dd'),
    exposure: 1.04,
    starsOpacity: 0.0,
    chaletEmissive: 0.25,
  },
  sunset: {
    id: 'sunset',
    label: 'Закат',
    sunDir: new THREE.Vector3(-0.78, 0.2, -0.59).normalize(),
    sunColor: new THREE.Color('#ffad6b'),
    sunIntensity: 3.25,
    hemiSky: new THREE.Color('#b68bc8'),
    hemiGround: new THREE.Color('#474d7a'),
    hemiIntensity: 0.92,
    fogColor: new THREE.Color('#e6a98a'),
    fogDensity: 0.00155,
    skyTop: new THREE.Color('#1a2452'),
    skyMid: new THREE.Color('#7f588c'),
    skyHorizon: new THREE.Color('#f5ad7c'),
    sunGlowColor: new THREE.Color('#ffd093'),
    exposure: 1.02,
    starsOpacity: 0.15,
    chaletEmissive: 1.4,
  },
  twilight: {
    id: 'twilight',
    label: 'Сумерки',
    sunDir: new THREE.Vector3(0.55, 0.34, -0.76).normalize(),
    sunColor: new THREE.Color('#a8c9ff'),
    sunIntensity: 1.85,
    hemiSky: new THREE.Color('#4266a6'),
    hemiGround: new THREE.Color('#1b2a47'),
    hemiIntensity: 0.85,
    fogColor: new THREE.Color('#1c2d4a'),
    fogDensity: 0.00175,
    skyTop: new THREE.Color('#060d1f'),
    skyMid: new THREE.Color('#122447'),
    skyHorizon: new THREE.Color('#2c456e'),
    sunGlowColor: new THREE.Color('#cce2ff'),
    exposure: 1.15,
    starsOpacity: 0.95,
    chaletEmissive: 2.6,
  },
};

export class AlpineSkySystem {
  constructor(scene, renderer) {
    this.scene = scene;
    this.renderer = renderer;
    this.currentPresetKey = 'morning';

    // 1. Directional Sun Light with crisp texel-snapped PCF shadows
    this.sunLight = new THREE.DirectionalLight('#fff7ea', 3.1);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.set(2048, 2048);

    const frustumSize = 72;
    this.shadowFrustumHalf = frustumSize;
    this.sunLight.shadow.camera.left = -frustumSize;
    this.sunLight.shadow.camera.right = frustumSize;
    this.sunLight.shadow.camera.top = frustumSize;
    this.sunLight.shadow.camera.bottom = -frustumSize;
    this.sunLight.shadow.camera.near = 12;
    this.sunLight.shadow.camera.far = 290;
    this.sunLight.shadow.bias = -0.00035;
    this.sunLight.shadow.normalBias = 0.045;
    this.sunLight.shadow.radius = 2.4;

    scene.add(this.sunLight);
    scene.add(this.sunLight.target);

    // 2. Alpine Hemisphere Bounce Light (gives snow shadows their iconic cool glacier blue!)
    this.hemiLight = new THREE.HemisphereLight('#8ec5fc', '#5a7da8', 1.05);
    scene.add(this.hemiLight);

    // Subtle rim bounce fill from opposite valley side so shadowed trees still show form
    this.fillLight = new THREE.DirectionalLight('#9ac7f5', 0.35);
    this.fillLight.position.set(60, 30, 50);
    scene.add(this.fillLight);

    // 3. Atmospheric Fog
    this.fog = new THREE.FogExp2('#cde2f6', 0.00145);
    scene.fog = this.fog;

    // 4. Sky Dome with procedural alpine Rayleigh/Mie gradient + crisp sun disc + stars
    this.skyUniforms = {
      uTopColor: { value: new THREE.Color('#134696') },
      uMidColor: { value: new THREE.Color('#5a9ee2') },
      uHorizonColor: { value: new THREE.Color('#d7e9fa') },
      uSunDir: { value: new THREE.Vector3(-0.64, 0.42, -0.64).normalize() },
      uSunGlowColor: { value: new THREE.Color('#fff5dd') },
      uStarsOpacity: { value: 0.0 },
    };

    const skyGeo = new THREE.SphereGeometry(1800, 36, 24);
    const skyMat = new THREE.ShaderMaterial({
      uniforms: this.skyUniforms,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      vertexShader: /* glsl */ `
        varying vec3 vWorldDir;
        void main() {
          vec4 worldPos = modelMatrix * vec4(position, 1.0);
          vWorldDir = normalize(position);
          gl_Position = projectionMatrix * viewMatrix * worldPos;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uTopColor;
        uniform vec3 uMidColor;
        uniform vec3 uHorizonColor;
        uniform vec3 uSunDir;
        uniform vec3 uSunGlowColor;
        uniform float uStarsOpacity;
        varying vec3 vWorldDir;

        float hash31(vec3 p) {
          p = fract(p * 0.1031);
          p += dot(p, p.yzx + 33.33);
          return fract((p.x + p.y) * p.z);
        }

        void main() {
          vec3 dir = normalize(vWorldDir);
          float h = clamp(dir.y, -0.15, 1.0);

          // Multi-band alpine atmosphere gradient
          float lowerMix = smoothstep(-0.08, 0.22, h);
          float upperMix = smoothstep(0.18, 0.78, h);
          vec3 sky = mix(uHorizonColor, uMidColor, lowerMix);
          sky = mix(sky, uTopColor, upperMix);

          // Subtle wispy cirrus cloud streaks high in the alpine sky
          if (dir.y > 0.06) {
            vec2 uv = dir.xz / (dir.y + 0.18);
            float c1 = sin(uv.x * 2.1 + uv.y * 0.8) * cos(uv.y * 2.7 - uv.x * 0.6);
            float c2 = sin(uv.x * 5.2 - uv.y * 3.1) * 0.5;
            float cloud = smoothstep(0.32, 0.92, c1 + c2) * smoothstep(0.06, 0.25, dir.y) * (1.0 - smoothstep(0.55, 0.95, dir.y));
            vec3 cloudCol = mix(uHorizonColor, uSunGlowColor, 0.45);
            sky = mix(sky, cloudCol, cloud * 0.22);
          }

          // Solar Mie halo + sharp sun disc
          float sunDot = max(dot(dir, normalize(uSunDir)), 0.0);
          float wideGlow = pow(sunDot, 7.0) * 0.34;
          float tightHalo = pow(sunDot, 72.0) * 0.65;
          float sunDisc = smoothstep(0.9986, 0.99945, sunDot) * 2.2;
          sky += uSunGlowColor * (wideGlow + tightHalo + sunDisc);

          // Crisp twilight alpine stars
          if (uStarsOpacity > 0.01 && dir.y > 0.05) {
            vec3 grid = floor(dir * 260.0);
            float r = hash31(grid);
            if (r > 0.994) {
              float starBright = smoothstep(0.994, 1.0, r) * smoothstep(0.05, 0.35, dir.y);
              sky += vec3(0.86, 0.93, 1.0) * starBright * uStarsOpacity * 1.4;
            }
          }

          gl_FragColor = vec4(sky, 1.0);
        }
      `,
    });

    this.skyDome = new THREE.Mesh(skyGeo, skyMat);
    this.skyDome.frustumCulled = false;
    scene.add(this.skyDome);

    // 5. Distant 360° Towering Snow-Capped Alpine Mountain Ring
    this.mountainRing = this._buildDistantMountainRange();
    scene.add(this.mountainRing);

    this.applyPreset('morning');
  }

  _buildDistantMountainRange() {
    const group = new THREE.Group();
    const radialSegs = 128;
    const rings = 5;
    const innerR = 720;
    const outerR = 1480;

    const geo = new THREE.BufferGeometry();
    const positions = [];
    const colors = [];
    const indices = [];

    const snowCol = new THREE.Color('#edf4fc');
    const glacierCol = new THREE.Color('#9bb7d6');
    const rockCol = new THREE.Color('#3b4759');
    const tmpCol = new THREE.Color();

    for (let r = 0; r < rings; r++) {
      const rt = r / (rings - 1);
      const radius = innerR + (outerR - innerR) * rt;
      // Middle rings rise up into dramatic alpine spires; inner/outer skirt drops below horizon
      const ridgeEnvelope = Math.sin(rt * Math.PI);

      for (let i = 0; i <= radialSegs; i++) {
        const angle = (i / radialSegs) * Math.PI * 2;
        const x = Math.cos(angle) * radius;
        const z = Math.sin(angle) * radius;

        // Sharp ridged multi-frequency alpine summits
        const ridge1 = Math.abs(Math.sin(angle * 7.0 + 0.4 + r * 0.7));
        const ridge2 = Math.abs(Math.cos(angle * 13.0 - 1.2 + r * 1.1));
        const ridge3 = Math.abs(Math.sin(angle * 23.0 + 2.1));
        const spire = Math.pow(1.0 - Math.abs(Math.sin(angle * 5.0 - 0.3)), 2.2) * 185;

        const peakHeight =
          ridgeEnvelope * (190 + ridge1 * 180 + ridge2 * 95 + ridge3 * 45 + spire) -
          (1.0 - ridgeEnvelope) * 260;

        // Slightly lower straight downhill valley opening (-Z, angle ≈ -PI/2) so vista opens into deep valley!
        const valleyDip = Math.exp(-Math.pow(Math.sin((angle + Math.PI * 0.5) * 0.5), 2) * 14) * 145;
        const y = peakHeight - valleyDip - 75;

        positions.push(x, y, z);

        // Snow caps on upper peaks, exposed alpine slate rock on lower steep flanks
        const snowMix = Math.max(0, Math.min(1, (y - 30) / 180 + ridge3 * 0.2));
        if (snowMix > 0.55) {
          tmpCol.copy(glacierCol).lerp(snowCol, (snowMix - 0.55) / 0.45);
        } else {
          tmpCol.copy(rockCol).lerp(glacierCol, snowMix / 0.55);
        }
        colors.push(tmpCol.r, tmpCol.g, tmpCol.b);
      }
    }

    const stride = radialSegs + 1;
    for (let r = 0; r < rings - 1; r++) {
      for (let i = 0; i < radialSegs; i++) {
        const a = r * stride + i;
        const b = a + 1;
        const c = (r + 1) * stride + i;
        const d = c + 1;
        // Upward / inward-facing normals toward the mountain valley center
        indices.push(a, b, c);
        indices.push(b, d, c);
      }
    }

    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();

    const mat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.88,
      metalness: 0.02,
      flatShading: true,
      fog: true,
    });

    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    group.add(mesh);
    return group;
  }

  applyPreset(presetKey) {
    const p = LIGHTING_PRESETS[presetKey] || LIGHTING_PRESETS.morning;
    this.currentPresetKey = p.id;
    this.preset = p;

    this.sunLight.color.copy(p.sunColor);
    this.sunLight.intensity = p.sunIntensity;

    this.hemiLight.color.copy(p.hemiSky);
    this.hemiLight.groundColor.copy(p.hemiGround);
    this.hemiLight.intensity = p.hemiIntensity;

    this.fog.color.copy(p.fogColor);
    this.fog.density = p.fogDensity;

    this.skyUniforms.uTopColor.value.copy(p.skyTop);
    this.skyUniforms.uMidColor.value.copy(p.skyMid);
    this.skyUniforms.uHorizonColor.value.copy(p.skyHorizon);
    this.skyUniforms.uSunDir.value.copy(p.sunDir);
    this.skyUniforms.uSunGlowColor.value.copy(p.sunGlowColor);
    this.skyUniforms.uStarsOpacity.value = p.starsOpacity;

    this.renderer.toneMappingExposure = p.exposure;
    return p;
  }

  /**
   * Move sky dome, mountain vista, and texel-snapped directional shadow frustum to follow skier
   */
  update(skierPos, heading) {
    this.skyDome.position.copy(skierPos);
    // Mountain panorama follows horizontally and slightly vertically for monumental parallax
    this.mountainRing.position.set(skierPos.x, skierPos.y * 0.82 - 40, skierPos.z);

    // Center shadow box slightly ahead of the skier along their downhill direction
    const aheadX = skierPos.x - Math.sin(heading) * 28;
    const aheadZ = skierPos.z - Math.cos(heading) * 28;
    const aheadY = skierPos.y - 6;

    // Snap target to world-space shadow texel grid so shadows never crawl/shimmer!
    const worldUnitsPerTexel = (this.shadowFrustumHalf * 2) / 2048;
    const snapX = Math.round(aheadX / worldUnitsPerTexel) * worldUnitsPerTexel;
    const snapY = Math.round(aheadY / worldUnitsPerTexel) * worldUnitsPerTexel;
    const snapZ = Math.round(aheadZ / worldUnitsPerTexel) * worldUnitsPerTexel;

    this.sunLight.target.position.set(snapX, snapY, snapZ);
    this.sunLight.position
      .copy(this.sunLight.target.position)
      .addScaledVector(this.preset.sunDir, 135);
    this.sunLight.target.updateMatrixWorld();
  }
}
