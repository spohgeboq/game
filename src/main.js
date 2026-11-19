import * as THREE from 'three';
import { AlpineSkySystem, LIGHTING_PRESETS } from './sky.js';
import { AlpineWorld } from './world.js';
import { FirstPersonSkierRig } from './skierRig.js';
import { SkiTrackSystem } from './tracks.js';
import { SnowParticleSystem } from './particles.js';
import { AlpineAudio } from './audio.js';
import { SkiPhysics } from './physics.js';
import { AlpineHUD } from './hud.js';
import { getPisteCenterX, getTerrainHeight } from './terrain.js';

const PRESET_ORDER = ['morning', 'sunset', 'twilight'];

class Vysota3400Game {
  constructor() {
    this.canvas = document.getElementById('game-canvas');

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.04;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.sunGlareEl = document.getElementById('sun-glare');
    this._camDirTmp = new THREE.Vector3();

    this.scene = new THREE.Scene();

    this.fpCamera = new THREE.PerspectiveCamera(
      75,
      window.innerWidth / window.innerHeight,
      0.06,
      2400
    );
    this.titleCamera = new THREE.PerspectiveCamera(
      58,
      window.innerWidth / window.innerHeight,
      0.2,
      2400
    );

    this.sky = new AlpineSkySystem(this.scene, this.renderer);
    this.world = new AlpineWorld(this.scene);
    this.skierRig = new FirstPersonSkierRig(this.scene, this.fpCamera);
    this.tracks = new SkiTrackSystem(this.scene);
    this.particles = new SnowParticleSystem(this.scene);
    this.audio = new AlpineAudio();
    this.hud = new AlpineHUD();

    this.physics = new SkiPhysics(this.world.features, {
      onJump: (strength, ramp) => {
        this.audio.playJump(strength);
        if (ramp) {
          this.hud.showCallout(ramp.name, 'W/S сальто · A/D спин · F/G/Z/X/V/B/T грэбы', 'default', 1300);
        }
      },
      onGrabTrigger: (grabDef, chainLen) => {
        this.audio.playGrabSnap(chainLen);
      },
      onGrabTweaked: () => {
        this.audio.playGrabSnap(4);
      },
      onGroundTrickStart: () => {
        this.audio.playGrabSnap(1);
      },
      onLanding: (info) => {
        this.skierRig.triggerLandingImpact(info.intensity);
        this.particles.emitLandingBurst(this.physics.state.pos, this.physics.state.vel, info.intensity);
        this.audio.playLanding(info.intensity, info.clean);

        if (info.clean && info.isNew) {
          this.audio.playNewTrickDiscovery();
        } else if (info.clean && info.isTrick) {
          this.audio.playTrickComplete();
        }

        if (info.label) {
          const ptsText = info.points > 0 ? `+${info.points.toLocaleString('ru-RU')}` : '';
          const sub = [info.sublabel, ptsText].filter(Boolean).join(' · ');
          this.hud.showCallout(
            info.label,
            sub,
            info.clean ? (info.isNew || info.isTrick ? 'gold' : 'default') : 'warn',
            1850
          );
        }
      },
      onComboStep: (stepInfo) => {
        if (stepInfo.isNew) {
          this.audio.playNewTrickDiscovery();
        }
      },
      onComboBanked: (bankInfo) => {
        if (bankInfo.bonus >= 300) {
          this.audio.playComboBank(bankInfo.multiplier);
          this.hud.showCallout(
            `КОМБО ×${bankInfo.multiplier} ЗАЧТЕНО!`,
            `+${bankInfo.bonus.toLocaleString('ru-RU')} бонус · всего ${bankInfo.total.toLocaleString('ru-RU')}`,
            'gold',
            1800
          );
        }
      },
      onGateCleared: (gate, combo, pts) => {
        this.world.pulseGateCleared(gate.id);
        this.audio.playGateChime(combo);
        const comboText = combo >= 2 ? `Ворота · Комбо ×${combo}` : 'Ворота пройдены';
        this.hud.showCallout(comboText, `+${pts} в комбо`, combo >= 3 ? 'gold' : 'default', 1100);
      },
      onCollision: (intensity) => {
        this.skierRig.triggerCollisionShake(intensity);
        this.particles.emitLandingBurst(this.physics.state.pos, this.physics.state.vel, intensity * 1.1);
        this.audio.playCollision(intensity);
        this.hud.flashImpact(intensity);
        this.hud.showCallout('Удар о препятствие', 'Текущее комбо потеряно', 'warn', 1150);
      },
      onPolePush: () => {
        this.skierRig.triggerPolePush();
      },
      onFinish: (state, timeBonus) => {
        this.audio.playFinishFanfare();
        this.hud.showCallout('ФИНИШ!', `Бонус за скорость +${timeBonus.toLocaleString('ru-RU')}`, 'gold', 2400);
        clearTimeout(this._finishTimer);
        this._finishTimer = setTimeout(() => {
          this._showFinishScreen();
        }, 1650);
      },
    });

    this.mode = 'title';
    this.input = {
      forward: false,
      brake: false,
      left: false,
      right: false,
      jump: false,
      shift: false,
      grab: false,
      leftClick: false,
      peekLeft: false,
      peekRight: false,
      trickF: false,
      trickG: false,
      trickZ: false,
      trickX: false,
      trickV: false,
      trickB: false,
      trickT: false,
    };
    this.pointerLocked = false;
    this.isDraggingLook = false;
    this.lastMouseX = 0;
    this.lastMouseY = 0;

    this.applyLighting('morning');
    this.hud.setScreen('title');
    this.skierRig.update(this.physics.state, 0.016, 0);

    this._bindEvents();
    this._startLoop();
  }

  applyLighting(presetId) {
    const preset = this.sky.applyPreset(presetId);
    this.world.applyLightingPreset(preset);
    this.particles.applyLightingPreset(preset);
    this.hud.syncLightingUI(preset.id, preset.label);
  }

  cycleLighting() {
    const idx = PRESET_ORDER.indexOf(this.sky.currentPresetKey);
    const next = PRESET_ORDER[(idx + 1) % PRESET_ORDER.length];
    this.applyLighting(next);
    if (this.mode === 'playing') {
      this.hud.showCallout(`Освещение: ${LIGHTING_PRESETS[next].label}`, '', 'default', 1100);
    }
  }

  setLookMode(lookToSteer) {
    this.physics.state.lookToSteer = lookToSteer;
    this.hud.syncLookModeUI(lookToSteer);
  }

  startNewRun() {
    clearTimeout(this._finishTimer);
    this.audio.init();
    this.world.resetRunState();
    this.tracks.reset();
    this.physics.reset();
    this.skierRig.update(this.physics.state, 0.016, 0);

    this.mode = 'playing';
    this.hud.setScreen('playing');
    this._requestPointerLock();

    this.hud.showCallout(
      'СТАРТ · ФРИСТАЙЛ 3400',
      'Tab — книга 1 000+ трюков · F/Z/X/V/B на снегу и в воздухе!',
      'default',
      2900
    );
  }

  resumeRun() {
    if (this.mode !== 'paused') return;
    this.audio.init();
    this.mode = 'playing';
    this.hud.setScreen('playing');
    this._requestPointerLock();
  }

  pauseRun() {
    if (this.mode !== 'playing') return;
    this.mode = 'paused';
    this._clearInput();
    this.hud.setScreen('paused');
    if (document.pointerLockElement === this.canvas) {
      document.exitPointerLock();
    }
  }

  returnToMenu() {
    clearTimeout(this._finishTimer);
    this.mode = 'title';
    this._clearInput();
    this.world.resetRunState();
    this.tracks.reset();
    this.physics.reset();
    this.hud.setScreen('title');
    if (document.pointerLockElement === this.canvas) {
      document.exitPointerLock();
    }
  }

  _showFinishScreen() {
    if (this.mode !== 'playing') return;
    this.mode = 'finished';
    this._clearInput();
    this.hud.showFinishSummary(this.physics.state);
    this.hud.setScreen('finished');
    if (document.pointerLockElement === this.canvas) {
      document.exitPointerLock();
    }
  }

  _requestPointerLock() {
    try {
      if (this.canvas.requestPointerLock) {
        const res = this.canvas.requestPointerLock();
        if (res && typeof res.catch === 'function') {
          res.catch(() => {});
        }
      }
    } catch {
      // Fallback drag-look & Q/E always work
    }
  }

  _clearInput() {
    for (const k of Object.keys(this.input)) {
      this.input[k] = false;
    }
    this.isDraggingLook = false;
  }

  _bindEvents() {
    window.addEventListener('resize', () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      this.renderer.setSize(w, h);
      this.fpCamera.aspect = w / h;
      this.fpCamera.updateProjectionMatrix();
      this.titleCamera.aspect = w / h;
      this.titleCamera.updateProjectionMatrix();
    });

    document.addEventListener('pointerlockchange', () => {
      this.pointerLocked = document.pointerLockElement === this.canvas;
      this.hud.setPointerLocked(this.pointerLocked);
    });

    this.canvas.addEventListener('mousedown', (e) => {
      if (this.mode !== 'playing') return;
      this.audio.init();
      if (e.button === 2) {
        this.input.grab = true;
        return;
      }
      if (e.button === 0) {
        if (this.pointerLocked) {
          this.input.leftClick = true;
        } else {
          this._requestPointerLock();
          this.isDraggingLook = true;
          this.lastMouseX = e.clientX;
          this.lastMouseY = e.clientY;
        }
      }
    });

    window.addEventListener('mouseup', (e) => {
      if (e.button === 2) this.input.grab = false;
      if (e.button === 0) this.input.leftClick = false;
      this.isDraggingLook = false;
    });

    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    window.addEventListener('mousemove', (e) => {
      if (this.mode !== 'playing') return;
      if (this.pointerLocked) {
        const dx = Math.max(-140, Math.min(140, e.movementX));
        const dy = Math.max(-140, Math.min(140, e.movementY));
        this.physics.applyHeadLook(dx, dy, 0.0022);
      } else if (this.isDraggingLook) {
        const dx = e.clientX - this.lastMouseX;
        const dy = e.clientY - this.lastMouseY;
        this.lastMouseX = e.clientX;
        this.lastMouseY = e.clientY;
        this.physics.applyHeadLook(dx, dy, 0.0038);
      }
    });

    // Keyboard controls using physical e.code so Russian & English layouts work identically!
    window.addEventListener('keydown', (e) => {
      const code = e.code;

      if (code === 'Escape' || code === 'KeyP') {
        if (this.mode === 'playing') {
          e.preventDefault();
          this.pauseRun();
        } else if (this.mode === 'paused') {
          e.preventDefault();
          this.resumeRun();
        }
        return;
      }

      if (code === 'Digit1') {
        this.applyLighting('morning');
        return;
      }
      if (code === 'Digit2') {
        this.applyLighting('sunset');
        return;
      }
      if (code === 'Digit3') {
        this.applyLighting('twilight');
        return;
      }
      if (code === 'KeyM') {
        const muted = this.audio.toggleMute();
        this.hud.setMuteUI(muted);
        return;
      }

      if (this.mode !== 'playing') return;

      switch (code) {
        case 'Tab':
          e.preventDefault();
          this.hud.toggleTrickBook();
          break;
        case 'KeyW':
        case 'ArrowUp':
          this.input.forward = true;
          break;
        case 'KeyS':
        case 'ArrowDown':
          this.input.brake = true;
          break;
        case 'KeyA':
        case 'ArrowLeft':
          this.input.left = true;
          break;
        case 'KeyD':
        case 'ArrowRight':
          this.input.right = true;
          break;
        case 'Space':
          e.preventDefault();
          this.input.jump = true;
          break;
        case 'ShiftLeft':
        case 'ShiftRight':
          this.input.shift = true;
          break;
        case 'KeyQ':
          this.input.peekLeft = true;
          break;
        case 'KeyE':
          this.input.peekRight = true;
          break;
        case 'KeyF':
          this.input.trickF = true;
          break;
        case 'KeyG':
          this.input.trickG = true;
          break;
        case 'KeyZ':
          this.input.trickZ = true;
          break;
        case 'KeyX':
          this.input.trickX = true;
          break;
        case 'KeyV':
          this.input.trickV = true;
          break;
        case 'KeyB':
          this.input.trickB = true;
          break;
        case 'KeyT':
          this.input.trickT = true;
          break;
        case 'KeyC':
          this.physics.recenterHead();
          break;
        case 'KeyR':
          this.startNewRun();
          break;
        case 'KeyH':
          this.hud.toggleKeyHints();
          break;
        case 'KeyL': {
          const next = !this.physics.state.lookToSteer;
          this.setLookMode(next);
          this.hud.showCallout(
            next ? 'Мышь: поворот за взглядом' : 'Мышь: свободный обзор',
            '',
            'default',
            1300
          );
          break;
        }
      }
    });

    window.addEventListener('keyup', (e) => {
      switch (e.code) {
        case 'KeyW':
        case 'ArrowUp':
          this.input.forward = false;
          break;
        case 'KeyS':
        case 'ArrowDown':
          this.input.brake = false;
          break;
        case 'KeyA':
        case 'ArrowLeft':
          this.input.left = false;
          break;
        case 'KeyD':
        case 'ArrowRight':
          this.input.right = false;
          break;
        case 'Space':
          this.input.jump = false;
          break;
        case 'ShiftLeft':
        case 'ShiftRight':
          this.input.shift = false;
          break;
        case 'KeyQ':
          this.input.peekLeft = false;
          break;
        case 'KeyE':
          this.input.peekRight = false;
          break;
        case 'KeyF':
          this.input.trickF = false;
          break;
        case 'KeyG':
          this.input.trickG = false;
          break;
        case 'KeyZ':
          this.input.trickZ = false;
          break;
        case 'KeyX':
          this.input.trickX = false;
          break;
        case 'KeyV':
          this.input.trickV = false;
          break;
        case 'KeyB':
          this.input.trickB = false;
          break;
        case 'KeyT':
          this.input.trickT = false;
          break;
      }
    });

    window.addEventListener('blur', () => {
      this._clearInput();
    });

    // UI Buttons
    document.getElementById('btn-start').addEventListener('click', () => this.startNewRun());
    document.getElementById('btn-resume').addEventListener('click', () => this.resumeRun());
    document.getElementById('btn-pause-restart').addEventListener('click', () => this.startNewRun());
    document.getElementById('btn-pause-menu').addEventListener('click', () => this.returnToMenu());
    document.getElementById('btn-finish-restart').addEventListener('click', () => this.startNewRun());
    document.getElementById('btn-finish-menu').addEventListener('click', () => this.returnToMenu());

    document.getElementById('btn-hud-tricks').addEventListener('click', () => this.hud.toggleTrickBook());
    document.getElementById('btn-hud-weather').addEventListener('click', () => this.cycleLighting());
    document.getElementById('btn-hud-mute').addEventListener('click', () => {
      const muted = this.audio.toggleMute();
      this.hud.setMuteUI(muted);
    });
    document.getElementById('btn-hud-pause').addEventListener('click', () => this.pauseRun());

    document.querySelectorAll('[data-preset]').forEach((btn) => {
      btn.addEventListener('click', () => this.applyLighting(btn.dataset.preset));
    });
    document.querySelectorAll('[data-look]').forEach((btn) => {
      btn.addEventListener('click', () => this.setLookMode(btn.dataset.look === 'steer'));
    });
  }

  _updateTitleCamera(elapsed) {
    const zBase = -38 + Math.sin(elapsed * 0.14) * 14;
    const cx = getPisteCenterX(zBase);
    const camX = cx + 16 + Math.sin(elapsed * 0.22) * 7;
    const groundY = getTerrainHeight(camX, zBase);
    const camY = groundY + 7.2 + Math.cos(elapsed * 0.28) * 1.1;

    this.titleCamera.position.set(camX, camY, zBase);

    const lookZ = zBase - 85;
    const lookX = getPisteCenterX(lookZ) - 6;
    const lookY = getTerrainHeight(lookX, lookZ) + 2.5;
    this.titleCamera.lookAt(lookX, lookY, lookZ);

    this.sky.update(this.titleCamera.position, 0);
    this.world.update(0.016, elapsed, zBase);
    this.particles.update(
      {
        pos: this.titleCamera.position,
        vel: new THREE.Vector3(),
        grounded: false,
        speed: 0,
        carveVisual: 0,
        braking: false,
        offPisteRatio: 0,
        heading: 0,
        activeGroundTrick: null,
      },
      0.016,
      elapsed
    );
  }

  _startLoop() {
    const clock = new THREE.Clock();
    let elapsed = 0;

    const tick = () => {
      requestAnimationFrame(tick);

      const rawDt = clock.getDelta();
      const dt = Math.min(0.045, Math.max(0.001, rawDt));
      elapsed += dt;

      if (this.mode === 'title') {
        this._updateTitleCamera(elapsed);
        this.audio.updateContinuous(this.physics.state, false);
        this._updateSunGlare(this.titleCamera);
        this.renderer.render(this.scene, this.titleCamera);
        return;
      }

      if (this.mode === 'playing') {
        const steps = dt > 0.022 ? 2 : 1;
        const subDt = dt / steps;
        for (let i = 0; i < steps; i++) {
          this.physics.step(this.input, subDt);
        }

        const state = this.physics.state;
        this.skierRig.update(state, dt, elapsed);
        this.tracks.update(state);
        this.particles.update(state, dt, elapsed);
        this.sky.update(state.pos, state.heading);
        this.world.update(dt, elapsed, state.pos.z);
        this.audio.updateContinuous(state, true);
        this.hud.update(state, this.physics.tricks.getLiveHUDState(state));
      } else {
        this.world.update(dt * 0.25, elapsed, this.physics.state.pos.z);
        this.audio.updateContinuous(this.physics.state, false);
      }

      this._updateSunGlare(this.fpCamera);
      this.renderer.render(this.scene, this.fpCamera);
    };

    tick();
  }

  _updateSunGlare(camera) {
    if (!this.sunGlareEl || !this.sky.preset) return;
    camera.getWorldDirection(this._camDirTmp);
    const dot = this._camDirTmp.dot(this.sky.preset.sunDir);
    const strength = this.sky.preset.id === 'twilight' ? 0.22 : this.sky.preset.id === 'sunset' ? 0.85 : 0.65;
    const glare = dot > 0.65 ? Math.pow((dot - 0.65) / 0.35, 2.2) * strength : 0;
    this.sunGlareEl.style.opacity = glare.toFixed(3);
  }
}

window.addEventListener('DOMContentLoaded', () => {
  window.__skiGame = new Vysota3400Game();
});
