import { COURSE_FINISH_Z } from './terrain.js';
import { AIR_GRABS, GROUND_TRICKS } from './tricks.js';

function formatTime(sec) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  const cs = Math.floor((sec * 100) % 100);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}

function formatNum(n) {
  return Math.round(n).toLocaleString('ru-RU');
}

export class AlpineHUD {
  constructor() {
    this.hudEl = document.getElementById('hud');
    this.titleEl = document.getElementById('screen-title');
    this.pauseEl = document.getElementById('screen-pause');
    this.finishEl = document.getElementById('screen-finish');

    this.speedEl = document.getElementById('hud-speed');
    this.stanceEl = document.getElementById('hud-stance');
    this.jumpWrapEl = document.getElementById('jump-charge-wrap');
    this.jumpFillEl = document.getElementById('jump-charge-fill');

    this.altitudeEl = document.getElementById('hud-altitude');
    this.remainingEl = document.getElementById('hud-remaining');
    this.progressEl = document.getElementById('hud-progress-fill');

    this.timeEl = document.getElementById('hud-time');
    this.scoreEl = document.getElementById('hud-score');
    this.uniqueEl = document.getElementById('hud-unique');
    this.gatesEl = document.getElementById('hud-gates');
    this.comboEl = document.getElementById('hud-combo');

    this.skiMarkerEl = document.getElementById('compass-ski-marker');
    this.gazeBarEl = document.getElementById('compass-gaze-bar');

    this.weatherLabelEl = document.getElementById('hud-weather-label');
    this.muteLabelEl = document.getElementById('hud-mute-label');
    this.pointerHintEl = document.getElementById('pointer-hint');
    this.calloutStackEl = document.getElementById('callout-stack');
    this.vignetteEl = document.getElementById('speed-vignette');
    this.impactFlashEl = document.getElementById('impact-flash');
    this.keyhintsEl = document.getElementById('hud-keyhints');

    // Live Freestyle Combo Box
    this.comboBoxEl = document.getElementById('combo-live-box');
    this.comboActiveTrickEl = document.getElementById('combo-active-trick');
    this.comboChainTrailEl = document.getElementById('combo-chain-trail');
    this.comboBankPtsEl = document.getElementById('combo-bank-pts');
    this.comboBankMultEl = document.getElementById('combo-bank-mult');
    this.comboTimerFillEl = document.getElementById('combo-timer-fill');

    // Trick Book Drawer
    this.trickBookEl = document.getElementById('trick-book');
    this.tbDiscoveredEl = document.getElementById('tb-discovered');

    // Finish summary nodes
    this.finMedalEl = document.getElementById('finish-medal');
    this.finTimeEl = document.getElementById('fin-time');
    this.finScoreEl = document.getElementById('fin-score');
    this.finBestComboEl = document.getElementById('fin-bestcombo');
    this.finUniqueEl = document.getElementById('fin-unique');
    this.finSpeedEl = document.getElementById('fin-topspeed');
    this.finAirEl = document.getElementById('fin-air');
  }

  setScreen(mode) {
    this.titleEl.classList.toggle('hidden', mode !== 'title');
    this.pauseEl.classList.toggle('hidden', mode !== 'paused');
    this.finishEl.classList.toggle('hidden', mode !== 'finished');
    this.hudEl.classList.toggle('hidden', mode !== 'playing');
    if (mode !== 'playing') {
      this.trickBookEl.classList.add('hidden');
    }
  }

  toggleTrickBook() {
    this.trickBookEl.classList.toggle('hidden');
  }

  setPointerLocked(locked) {
    this.pointerHintEl.classList.toggle('hidden', locked);
  }

  syncLightingUI(presetId, label) {
    this.weatherLabelEl.textContent = label;
    document.querySelectorAll('[data-preset]').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.preset === presetId);
    });
  }

  syncLookModeUI(lookToSteer) {
    const activeVal = lookToSteer ? 'steer' : 'free';
    document.querySelectorAll('[data-look]').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.look === activeVal);
    });
  }

  setMuteUI(muted) {
    this.muteLabelEl.textContent = muted ? 'Тихо' : 'Звук';
  }

  toggleKeyHints() {
    this.keyhintsEl.classList.toggle('hidden');
  }

  flashImpact(intensity = 0.7) {
    this.impactFlashEl.style.opacity = String(Math.min(0.85, intensity * 0.65));
    clearTimeout(this._flashTimer);
    this._flashTimer = setTimeout(() => {
      this.impactFlashEl.style.opacity = '0';
    }, 110);
  }

  showCallout(mainText, subText = '', variant = 'default', duration = 1700) {
    if (!mainText) return;
    while (this.calloutStackEl.children.length >= 3) {
      this.calloutStackEl.removeChild(this.calloutStackEl.firstChild);
    }

    const el = document.createElement('div');
    el.className = `callout-item${variant === 'gold' ? ' callout-gold' : variant === 'warn' ? ' callout-warn' : ''}`;

    const mainEl = document.createElement('div');
    mainEl.className = 'callout-main';
    mainEl.textContent = mainText;
    el.appendChild(mainEl);

    if (subText) {
      const subEl = document.createElement('div');
      subEl.className = 'callout-sub';
      subEl.textContent = subText;
      el.appendChild(subEl);
    }

    this.calloutStackEl.appendChild(el);

    setTimeout(() => {
      el.classList.add('fading');
      setTimeout(() => el.remove(), 360);
    }, duration);
  }

  showFinishSummary(state) {
    const score = state.score;
    let medal = 'Финиш засчитан';
    if (score >= 40000) medal = 'Бог альпийского фристайла';
    else if (score >= 18000) medal = 'Золотой фристайл-спуск';
    else if (score >= 7500) medal = 'Серебряный спуск';
    else medal = 'Бронзовый спуск';

    this.finMedalEl.textContent = medal;
    this.finScoreEl.textContent = formatNum(state.score);
    this.finBestComboEl.textContent = formatNum(state.bestComboScore);
    this.finUniqueEl.textContent = `${state.uniqueTricksCount} / 1 000+`;
    this.finTimeEl.textContent = formatTime(state.finishTime || state.runTime);
    this.finSpeedEl.textContent = `${state.topSpeedKmh} км/ч`;
    this.finAirEl.textContent = `${state.longestAirTime.toFixed(2)} с`;
  }

  update(state, trickHud) {
    // 1. Speed & dynamic freestyle stance badge
    this.speedEl.textContent = String(state.speedKmh);

    let stance = 'Спуск';
    let stanceClass = 'stance-tag';
    if (!state.grounded) {
      if (state.activeGrab && AIR_GRABS[state.activeGrab]) {
        stance = AIR_GRABS[state.activeGrab].name;
      } else {
        stance = `Полёт ${state.airTime.toFixed(1)}с`;
      }
      stanceClass = 'stance-tag air';
    } else if (state.activeGroundTrick && GROUND_TRICKS[state.activeGroundTrick]) {
      stance = GROUND_TRICKS[state.activeGroundTrick].name;
      stanceClass = 'stance-tag air';
    } else if (state.braking) {
      stance = 'Тормоз';
      stanceClass = 'stance-tag tuck';
    } else if (state.tucking) {
      stance = 'Стойка';
      stanceClass = 'stance-tag tuck';
    } else if (state.offPisteRatio > 0.45) {
      stance = 'Целина';
    }
    this.stanceEl.textContent = stance;
    this.stanceEl.className = stanceClass;

    // 2. Jump Charge Gauge
    const charging = state.jumpCharging && state.jumpCharge > 0.01;
    this.jumpWrapEl.classList.toggle('charging', charging);
    this.jumpFillEl.style.width = `${Math.round(state.jumpCharge * 100)}%`;

    // 3. Look Compass
    const normOffset = Math.max(-1, Math.min(1, state.headYaw / 1.56));
    const skiPct = 50 + normOffset * 44;
    this.skiMarkerEl.style.left = `${skiPct.toFixed(1)}%`;

    const barLeft = Math.min(50, skiPct);
    const barWidth = Math.abs(skiPct - 50);
    this.gazeBarEl.style.left = `${barLeft.toFixed(1)}%`;
    this.gazeBarEl.style.width = `${barWidth.toFixed(1)}%`;

    // 4. Altitude & Remaining Descent Progress
    const distDown = Math.max(0, -state.pos.z);
    const totalCourse = Math.abs(COURSE_FINISH_Z);
    const pct = Math.max(0, Math.min(100, (distDown / totalCourse) * 100));
    const rem = Math.max(0, Math.round(totalCourse - distDown));

    this.altitudeEl.textContent = `${formatNum(state.altitude)} м`;
    this.remainingEl.textContent = rem > 0 ? `${formatNum(rem)} м` : 'ФИНИШ';
    this.progressEl.style.width = `${pct.toFixed(1)}%`;

    // 5. Stopwatch, Score, Unique Tricks & Gates
    this.timeEl.textContent = formatTime(state.runTime);
    this.scoreEl.textContent = formatNum(state.score);
    this.uniqueEl.textContent = `${state.uniqueTricksCount}`;
    this.gatesEl.textContent = `${state.gatesCleared} / ${state.totalGates}`;
    this.tbDiscoveredEl.textContent = `${state.uniqueTricksCount} / 1 000+`;

    if (trickHud && trickHud.chainMultiplier >= 2) {
      this.comboEl.textContent = `×${trickHud.chainMultiplier}`;
      this.comboEl.classList.remove('hidden');
    } else {
      this.comboEl.classList.add('hidden');
    }

    // 6. Live Bottom-Center Freestyle Combo Engine Box
    if (trickHud && trickHud.mode !== 'idle') {
      this.comboBoxEl.classList.remove('hidden', 'mode-air', 'mode-ground');
      if (trickHud.mode === 'air') this.comboBoxEl.classList.add('mode-air');
      else if (trickHud.mode === 'ground') this.comboBoxEl.classList.add('mode-ground');

      const liveTotalPts = trickHud.chainPoints + trickHud.activePts;
      const liveMult = Math.max(1, trickHud.chainMultiplier + (trickHud.activePts > 0 ? 1 : 0));

      if (trickHud.activeLabel) {
        this.comboActiveTrickEl.textContent = trickHud.activeLabel;
        this.comboActiveTrickEl.classList.remove('hidden');
      } else if (trickHud.chainItems.length > 0) {
        this.comboActiveTrickEl.textContent = 'Продолжай комбо: баттер (F/Z/X/V/B) или прыжок!';
        this.comboActiveTrickEl.classList.remove('hidden');
      } else {
        this.comboActiveTrickEl.classList.add('hidden');
      }

      if (trickHud.chainItems.length > 0) {
        const trail = trickHud.chainItems.map((it) => it.label).join(' → ');
        this.comboChainTrailEl.textContent = trail;
        this.comboChainTrailEl.classList.remove('hidden');
      } else {
        this.comboChainTrailEl.classList.add('hidden');
      }

      this.comboBankPtsEl.textContent = formatNum(liveTotalPts);
      this.comboBankMultEl.textContent = `×${liveMult}`;

      const timerW = trickHud.mode === 'air' || trickHud.mode === 'ground' ? 100 : Math.round(trickHud.graceRatio * 100);
      this.comboTimerFillEl.style.width = `${timerW}%`;
    } else {
      this.comboBoxEl.classList.add('hidden');
    }

    // 7. Dynamic Speed Vignette
    const speedFactor = Math.max(0, Math.min(1, (state.speedKmh - 65) / 65));
    const vigOpacity = 0.52 + speedFactor * 0.44 + (state.tucking ? 0.08 : 0);
    this.vignetteEl.style.opacity = vigOpacity.toFixed(2);
  }
}
