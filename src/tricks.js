/**
 * Combinatorial Freestyle Ski Trick & Combo Engine
 * Supports 10 distinct visible 3D aerial grabs/stunts, 3-axis flips/spins/corks/rodeos/mistys,
 * 5 ground freestyle butter/manual/one-ski/revert tricks, multi-grab air chaining,
 * combo grace window chaining, and 1,000+ unique named trick combinations!
 */

export const AIR_GRABS = {
  mute: { id: 'mute', name: 'Мьют-грэб', key: 'Shift / ПКМ', basePts: 240, style: 'cross' },
  method: { id: 'method', name: 'Метод-грэб', key: 'ЛКМ', basePts: 270, style: 'method' },
  tail: { id: 'tail', name: 'Тейл-грэб', key: 'F', basePts: 260, style: 'tail' },
  japan: { id: 'japan', name: 'Джапан-эйр', key: 'G', basePts: 310, style: 'japan' },
  nose: { id: 'nose', name: 'Ноуз-грэб', key: 'Z', basePts: 260, style: 'nose' },
  spread: { id: 'spread', name: 'Спред-игл', key: 'X', basePts: 250, style: 'spread' },
  daffy: { id: 'daffy', name: 'Даффи', key: 'V', basePts: 290, style: 'daffy' },
  cossack: { id: 'cossack', name: 'Казак', key: 'B', basePts: 320, style: 'cossack' },
  shifty: { id: 'shifty', name: 'Шифти', key: 'T', basePts: 280, style: 'shifty' },
  octo: { id: 'octo', name: 'Окто-грэб', key: 'Shift + ЛКМ/ПКМ', basePts: 380, style: 'octo' },
};

export const GROUND_TRICKS = {
  noseButter: { id: 'noseButter', name: 'Ноуз-баттер', key: 'F', ptsPerSec: 210, takeoffTag: 'Нолли' },
  tailManual: { id: 'tailManual', name: 'Тейл-мануал', key: 'Z', ptsPerSec: 220, takeoffTag: 'Тейл-поп' },
  oneSki: { id: 'oneSki', name: 'На одной лыже', key: 'X', ptsPerSec: 240, takeoffTag: 'Ван-ски' },
  butter360: { id: 'butter360', name: 'Баттер-спин 360°', key: 'V', ptsPerSec: 360, takeoffTag: 'Спин-поп' },
  slashRevert: { id: 'slashRevert', name: 'Слэш-реверт 180°', key: 'B', ptsPerSec: 320, takeoffTag: 'Свитч' },
};

const COMBO_GRACE_DURATION = 2.9; // snappy window after landing / ground trick to chain the next trick!

export class TrickComboSystem {
  constructor(callbacks = {}) {
    this.cb = callbacks;
    this.reset();
  }

  reset() {
    // Active combo chain (accumulates until grace timer expires or sketchy crash)
    this.chainItems = []; // [{ label, pts }]
    this.chainPoints = 0;
    this.chainMultiplier = 0;
    this.graceTimer = 0;
    this.graceMax = COMBO_GRACE_DURATION;

    // Active mid-air trick tracker
    this.airActive = false;
    this.takeoffStyle = ''; // '', 'Олли', 'Нолли', 'Тейл-поп', 'Ван-ски', 'Свитч', 'Биг-Эйр'
    this.airGrabsPerformed = []; // ordered list of { id, name, holdTime, tweaked }
    this.currentGrabId = null;
    this.currentGrabTime = 0;
    this.airLiveLabel = '';
    this.airLivePoints = 0;

    // Active ground trick tracker
    this.activeGroundId = null;
    this.groundHoldTime = 0;
    this.groundSpinAccum = 0;
    this.lastGroundTag = '';
    this.lastGroundTagTimer = 0;

    // Lifetime run stats
    this.uniqueTricks = new Set();
    this.bestComboScore = 0;
    this.totalTricksLanded = 0;
  }

  /**
   * Determine which aerial grab is currently being held by inputs
   */
  resolveAirGrab(input) {
    // Dual hold = signature Octograb!
    if (input.shift && (input.grab || input.leftClick)) return 'octo';
    if (input.trickB) return 'cossack';
    if (input.trickV) return 'daffy';
    if (input.trickG) return 'japan';
    if (input.trickF) return 'tail';
    if (input.trickZ) return 'nose';
    if (input.trickX) return 'spread';
    if (input.trickT) return 'shifty';
    if (input.leftClick) return 'method';
    if (input.shift || input.grab) return 'mute';
    return null;
  }

  /**
   * Determine active ground freestyle trick (only when grounded & moving)
   */
  resolveGroundTrick(input, speed) {
    if (speed < 4.5 || input.brake) return null;
    if (input.trickV) return 'butter360';
    if (input.trickB) return 'slashRevert';
    if (input.trickF) return 'noseButter';
    if (input.trickZ) return 'tailManual';
    if (input.trickX) return 'oneSki';
    return null;
  }

  /**
   * Called on exact takeoff moment
   */
  onTakeoff(state, fromRamp, rampObj, jumpCharge) {
    this.airActive = true;
    this.airGrabsPerformed = [];
    this.currentGrabId = null;
    this.currentGrabTime = 0;

    // Preserve any active ground trick as an epic takeoff prefix AND bank its points into combo!
    let takeoffPrefix = '';
    if (this.activeGroundId && this.groundHoldTime > 0.12) {
      const gt = GROUND_TRICKS[this.activeGroundId];
      takeoffPrefix = gt.takeoffTag;
      this._commitGroundTrick(state, true);
    } else if (this.lastGroundTagTimer > 0 && this.lastGroundTag) {
      takeoffPrefix = this.lastGroundTag;
    } else if (fromRamp) {
      takeoffPrefix = rampObj && rampObj.height >= 4.5 ? 'Биг-Эйр' : 'Кикер';
    } else if (jumpCharge > 0.55) {
      takeoffPrefix = 'Супер-Олли';
    } else {
      takeoffPrefix = '';
    }

    this.takeoffStyle = takeoffPrefix;
    this.activeGroundId = null;
    this.groundHoldTime = 0;
    this.lastGroundTagTimer = 0;
  }

  /**
   * Per-frame update while airborne: tracks grab switches, tweaks, live 3D rotation naming!
   */
  updateAir(state, input, dt) {
    if (!this.airActive) return;

    // Keep combo timer frozen while soaring in the air!
    if (this.chainMultiplier > 0) {
      this.graceTimer = Math.max(this.graceTimer, this.graceMax);
    }

    const grabId = state.airTime > 0.08 ? this.resolveAirGrab(input) : null;
    state.activeGrab = grabId;

    if (grabId !== this.currentGrabId) {
      if (grabId) {
        const gDef = AIR_GRABS[grabId];
        // Allow chaining different grabs in one jump!
        const last = this.airGrabsPerformed[this.airGrabsPerformed.length - 1];
        if (!last || last.id !== grabId) {
          this.airGrabsPerformed.push({
            id: grabId,
            name: gDef.name,
            basePts: gDef.basePts,
            holdTime: 0,
            tweaked: false,
          });
          if (this.cb.onGrabTrigger) this.cb.onGrabTrigger(gDef, this.airGrabsPerformed.length);
        }
      }
      this.currentGrabId = grabId;
      this.currentGrabTime = 0;
    }

    if (this.currentGrabId && this.airGrabsPerformed.length > 0) {
      this.currentGrabTime += dt;
      const entry = this.airGrabsPerformed[this.airGrabsPerformed.length - 1];
      entry.holdTime += dt;
      if (entry.holdTime > 0.55 && !entry.tweaked) {
        entry.tweaked = true;
        if (this.cb.onGrabTweaked) this.cb.onGrabTweaked(entry);
      }
    }

    // Build live real-time trick label & points estimate
    const summary = this._evaluateAirTrick(state);
    this.airLiveLabel = summary.label;
    this.airLivePoints = summary.points;
  }

  /**
   * Per-frame update while grounded: handles Butter/Manual/One-Ski/360-Butter/Slash-Revert & Combo Grace Timer!
   */
  updateGround(state, input, dt) {
    if (this.lastGroundTagTimer > 0) {
      this.lastGroundTagTimer = Math.max(0, this.lastGroundTagTimer - dt);
    }

    const gId = this.resolveGroundTrick(input, state.speed);
    state.activeGroundTrick = gId;

    if (gId !== this.activeGroundId) {
      // Finished previous ground trick -> commit it to combo chain!
      if (this.activeGroundId && this.groundHoldTime >= 0.25) {
        this._commitGroundTrick(state, false);
      }
      this.activeGroundId = gId;
      this.groundHoldTime = 0;
      this.groundSpinAccum = 0;
      if (gId && this.cb.onGroundTrickStart) {
        this.cb.onGroundTrickStart(GROUND_TRICKS[gId]);
      }
    }

    if (this.activeGroundId) {
      this.groundHoldTime += dt;
      // Keep combo grace timer alive while actively holding a manual / butter!
      if (this.chainMultiplier > 0) {
        this.graceTimer = Math.max(this.graceTimer, this.graceMax * 0.85);
      }
      // Track continuous butter spin cycles
      if (this.activeGroundId === 'butter360') {
        this.groundSpinAccum += dt * 4.8;
      }
      this.lastGroundTag = GROUND_TRICKS[this.activeGroundId].takeoffTag;
      this.lastGroundTagTimer = 0.45;
    } else if (this.chainMultiplier > 0) {
      // Count down combo link grace window
      this.graceTimer -= dt;
      if (this.graceTimer <= 0) {
        return this.bankCombo(state);
      }
    }

    return null;
  }

  _commitGroundTrick(state, intoJump) {
    const gt = GROUND_TRICKS[this.activeGroundId];
    if (!gt) return;
    const dur = this.groundHoldTime;
    let label = gt.name;
    let pts = Math.round(140 + dur * gt.ptsPerSec);

    if (this.activeGroundId === 'butter360') {
      const spins = Math.max(1, Math.round(this.groundSpinAccum / (Math.PI * 2)));
      label = spins >= 2 ? `Дабл Баттер ${spins * 360}°` : 'Баттер-спин 360°';
      pts = spins * 320 + Math.round(dur * 110);
    } else if (dur > 1.8) {
      label = `Долгий ${gt.name}`;
      pts = Math.round(pts * 1.25);
    }

    this.addComboStep(label, pts, { state, isNewCheck: true, silent: intoJump });
  }

  /**
   * Evaluate exact combinatorial trick name from 3D spin + flip + off-axis + grabs + takeoff
   */
  _evaluateAirTrick(state) {
    const absSpin = Math.abs(state.airSpin);
    const absFlip = Math.abs(state.airFlipPitch);
    const flipDir = state.airFlipPitch >= 0 ? 'back' : 'front'; // +X = Backflip, -X = Frontflip

    // Snap spins to 180° increments (with generous completion threshold)
    const halfTurns = Math.floor((absSpin + 0.82) / Math.PI);
    const spinDeg = halfTurns * 180;

    // Snap flips to full 360° somersaults (with generous completion threshold)
    const fullFlips = Math.floor((absFlip + 1.05) / (Math.PI * 2));
    const isOffAxis = fullFlips > 0 && spinDeg >= 360;

    // Rotation name & points
    let rotName = '';
    let rotPts = 0;

    const multWord = (n) => (n === 2 ? 'Дабл ' : n === 3 ? 'Трипл ' : n >= 4 ? `Квад ` : '');

    if (isOffAxis) {
      // Real freestyle off-axis naming: Cork, Rodeo, Misty, Bio!
      const isStrongRoll = Math.abs(state.airOffAxisRoll) > 0.25;
      if (flipDir === 'back') {
        const styleName = spinDeg % 360 === 180 || isStrongRoll ? 'Родео' : 'Корк';
        rotName = `${multWord(fullFlips)}${styleName} ${spinDeg}°`;
      } else {
        const styleName = spinDeg >= 720 ? 'Био' : 'Мисти';
        rotName = `${multWord(fullFlips)}${styleName} ${spinDeg}°`;
      }
      rotPts = fullFlips * 560 + (spinDeg / 180) * 210;
    } else if (fullFlips > 0) {
      const flipWord = flipDir === 'back' ? 'Бэкфлип' : 'Фронтфлип';
      rotName = `${multWord(fullFlips)}${flipWord}`;
      if (spinDeg === 180) rotName += ' 180°';
      rotPts = fullFlips * 520 + (spinDeg > 0 ? 180 : 0);
    } else if (spinDeg >= 180) {
      rotName = `${spinDeg}°`;
      rotPts = (spinDeg / 180) * 185 + (spinDeg >= 720 ? 220 : 0) + (spinDeg >= 1080 ? 450 : 0);
    }

    // Grab chain formatting (supports single grab, tweaked grab, or multi-grab mid-air combos!)
    let grabParts = [];
    let grabPts = 0;
    for (let i = 0; i < this.airGrabsPerformed.length; i++) {
      const g = this.airGrabsPerformed[i];
      const prefix = g.tweaked ? 'Твик ' : '';
      grabParts.push(`${prefix}${g.name}`);
      // Extra bonus for chaining 2nd, 3rd, 4th grab in the same jump!
      const chainBonus = 1 + i * 0.35;
      grabPts += Math.round((g.basePts + g.holdTime * 190) * chainBonus);
    }

    const airPts = Math.round(state.airTime * 110 + state.airPeakHeight * 24);
    const hasRealTrick = rotName.length > 0 || grabParts.length > 0;

    const parts = [];
    if (this.takeoffStyle && (hasRealTrick || state.airTime > 0.7)) {
      parts.push(this.takeoffStyle);
    }
    if (rotName) parts.push(rotName);
    if (grabParts.length > 0) {
      parts.push(grabParts.join(' → '));
    }

    let label = parts.join(' ');
    if (!label && state.airTime > 0.4) {
      label = state.airFromRamp ? `Вылет ${state.airTime.toFixed(1)}с` : `Прыжок ${state.airTime.toFixed(1)}с`;
    }

    // Style diversity bonus for combining spin + flip + multi-grab!
    let styleBonus = 1.0;
    if (isOffAxis && grabParts.length >= 1) styleBonus += 0.25;
    if (grabParts.length >= 2) styleBonus += 0.2 * (grabParts.length - 1);

    const points = Math.round((airPts + rotPts + grabPts) * styleBonus);

    return {
      label,
      points,
      hasRealTrick,
      spinDeg,
      fullFlips,
      isSwitchLand: spinDeg % 360 === 180,
      grabCount: grabParts.length,
    };
  }

  /**
   * Called on landing touchdown; evaluates stomp cleanliness, switch revert, unique discovery & combo chain!
   */
  onLanding(state) {
    if (!this.airActive) return null;
    this.airActive = false;
    state.activeGrab = null;

    // Check upright pitch alignment (within ±58° of upright after any full 360° flips)
    const nearestFlip = Math.round(state.airFlipPitch / (Math.PI * 2)) * Math.PI * 2;
    const flipErr = Math.abs(state.airFlipPitch - nearestFlip);

    // Check yaw alignment: allow BOTH Forward (0°, 360°, 720°...) AND Switch (180°, 540°, 900°...)!
    const nearestHalf = Math.round(state.airSpin / Math.PI) * Math.PI;
    const spinErr = Math.abs(state.airSpin - nearestHalf);

    const cleanFlip = flipErr < 0.98;
    const cleanSpin = spinErr < 0.88;
    const clean = cleanFlip && cleanSpin;

    const evalRes = this._evaluateAirTrick(state);

    // Tiny hops (<0.38s with no tricks) don't clutter callouts
    if (state.airTime < 0.38 && !evalRes.hasRealTrick) {
      return { clean: true, label: null, points: 0, isTrick: false, isSwitchRevert: false };
    }

    if (clean) {
      const switchTag = evalRes.isSwitchLand && evalRes.hasRealTrick ? ' (Свитч)' : '';
      const finalLabel = `${evalRes.label}${switchTag}`;
      const stompPts = Math.round(evalRes.points * (evalRes.isSwitchLand ? 1.2 : 1.15));

      const isNew = this.addComboStep(finalLabel, stompPts, { state, isNewCheck: evalRes.hasRealTrick });
      this.totalTricksLanded += 1;

      if (evalRes.isSwitchLand) {
        this.lastGroundTag = 'Свитч';
        this.lastGroundTagTimer = 1.4;
      }

      return {
        clean: true,
        label: finalLabel,
        points: stompPts,
        isTrick: evalRes.hasRealTrick || state.airTime > 1.1,
        isNew,
        isSwitchRevert: evalRes.isSwitchLand,
        sublabel: isNew
          ? `НОВЫЙ ТРЮК #${this.uniqueTricks.size}! · Комбо x${this.chainMultiplier}`
          : evalRes.isSwitchLand
          ? `СВИТЧ-РЕВЕРТ! · Комбо x${this.chainMultiplier}`
          : `ЧИСТОЕ ПРИЗЕМЛЕНИЕ · Комбо x${this.chainMultiplier}`,
      };
    } else {
      // Wipeout / bailed trick! Loses pending unbanked combo chain (real THPS risk & reward!)
      const lostCombo = this.chainPoints * Math.max(1, this.chainMultiplier);
      this.cancelCombo();
      return {
        clean: false,
        label: !cleanFlip ? 'НЕДОКРУТ САЛЬТО!' : 'КРИВАЯ ПОСАДКА!',
        points: 0,
        isTrick: false,
        isSwitchRevert: false,
        sublabel: lostCombo > 0 ? `Комбо ${lostCombo.toLocaleString('ru-RU')} потеряно` : 'Отпусти клавиши перед снегом',
      };
    }
  }

  /**
   * Add a trick, butter, manual, or slalom gate into the active live combo chain!
   * Base points are awarded immediately via stateRef if supplied; combo multiplier bonus banks on chain completion.
   */
  addComboStep(label, pts, opts = {}) {
    if (!label || pts <= 0) return false;

    let isNew = false;
    if (opts.isNewCheck) {
      const normalized = label.trim();
      if (!this.uniqueTricks.has(normalized)) {
        this.uniqueTricks.add(normalized);
        isNew = true;
        pts += 250; // Discovery bonus for every unique trick combo!
      }
    }

    if (opts.state) {
      opts.state.score += pts;
    }

    this.chainItems.push({ label, pts });
    if (this.chainItems.length > 6) {
      this.chainItems.shift();
    }
    this.chainPoints += pts;
    this.chainMultiplier += 1;
    this.graceTimer = this.graceMax;

    const currentTotal = this.chainPoints * this.chainMultiplier;
    if (currentTotal > this.bestComboScore) {
      this.bestComboScore = currentTotal;
    }

    if (!opts.silent && this.cb.onComboStep) {
      this.cb.onComboStep({
        label,
        pts,
        isNew,
        multiplier: this.chainMultiplier,
        chainPoints: this.chainPoints,
      });
    }

    return isNew;
  }

  /**
   * Bank accumulated combo multiplier bonus into official run score!
   */
  bankCombo(state) {
    if (this.chainMultiplier <= 0 || this.chainPoints <= 0) {
      this.cancelCombo();
      return null;
    }

    const total = this.chainPoints * this.chainMultiplier;
    const bonus = this.chainPoints * Math.max(0, this.chainMultiplier - 1);
    const mult = this.chainMultiplier;
    const steps = this.chainItems.length;

    if (bonus > 0) {
      state.score += bonus;
    }
    if (total > this.bestComboScore) {
      this.bestComboScore = total;
    }

    this.cancelCombo();

    const result = { total, bonus, multiplier: mult, steps };
    if (bonus > 0 && this.cb.onComboBanked) {
      this.cb.onComboBanked(result);
    }
    return result;
  }

  cancelCombo() {
    this.chainItems = [];
    this.chainPoints = 0;
    this.chainMultiplier = 0;
    this.graceTimer = 0;
  }

  /**
   * Snapshot for real-time bottom-center Combo & Trick HUD
   */
  getLiveHUDState(state) {
    let activeLabel = '';
    let activePts = 0;
    let mode = 'idle'; // 'air' | 'ground' | 'grace' | 'idle'

    if (this.airActive && this.airLiveLabel) {
      activeLabel = this.airLiveLabel;
      activePts = this.airLivePoints;
      mode = 'air';
    } else if (this.activeGroundId) {
      const gt = GROUND_TRICKS[this.activeGroundId];
      activeLabel = gt.name;
      activePts = Math.round(140 + this.groundHoldTime * gt.ptsPerSec);
      mode = 'ground';
    } else if (this.chainMultiplier > 0) {
      mode = 'grace';
    }

    return {
      mode,
      activeLabel,
      activePts,
      chainPoints: this.chainPoints,
      chainMultiplier: this.chainMultiplier,
      chainItems: this.chainItems,
      graceRatio: this.chainMultiplier > 0 ? Math.max(0, Math.min(1, this.graceTimer / this.graceMax)) : 0,
      uniqueCount: this.uniqueTricks.size,
      bestComboScore: this.bestComboScore,
    };
  }
}
