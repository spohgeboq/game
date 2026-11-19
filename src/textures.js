import * as THREE from 'three';

function makeCanvas(width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

/**
 * High-resolution snow normal map with fine crystalline grain + subtle groomed corduroy lines
 */
export function createSnowNormalTexture() {
  const size = 512;
  const canvas = makeCanvas(size, size);
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(size, size);
  const data = img.data;

  // Build height field first for accurate central-difference normals
  const heights = new Float32Array(size * size);
  let seed = 1337;
  const rand = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // Periodic corduroy ripples along X (runs lengthwise down Z on terrain!)
      const corduroy = Math.sin((x / size) * Math.PI * 2 * 36) * 0.42;
      // Soft wind-blown snow drifts across both axes
      const drift =
        Math.sin((x / size) * Math.PI * 2 * 3 + Math.sin((y / size) * Math.PI * 2 * 2) * 1.4) * 0.35 +
        Math.cos((y / size) * Math.PI * 2 * 5 + (x / size) * Math.PI * 2 * 2) * 0.25;
      // Fine icy powder crystal grain
      const grain = (rand() - 0.5) * 0.42;
      heights[y * size + x] = corduroy + drift + grain;
    }
  }

  // Smooth slightly to remove harsh pixel aliasing while keeping crisp facets
  const strength = 2.1;
  for (let y = 0; y < size; y++) {
    const ym = (y - 1 + size) % size;
    const yp = (y + 1) % size;
    for (let x = 0; x < size; x++) {
      const xm = (x - 1 + size) % size;
      const xp = (x + 1) % size;

      const dX = (heights[y * size + xp] - heights[y * size + xm]) * strength;
      const dY = (heights[yp * size + x] - heights[ym * size + x]) * strength;
      const nx = -dX;
      const ny = -dY;
      const nz = 1.0;
      const invLen = 1.0 / Math.sqrt(nx * nx + ny * ny + nz * nz);

      const idx = (y * size + x) * 4;
      data[idx] = Math.round((nx * invLen * 0.5 + 0.5) * 255);
      data[idx + 1] = Math.round((ny * invLen * 0.5 + 0.5) * 255);
      data[idx + 2] = Math.round((nz * invLen * 0.5 + 0.5) * 255);
      data[idx + 3] = 255;
    }
  }

  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  return tex;
}

/**
 * Subtle crystalline snow diffuse/albedo map for crisp up-close snow texture
 */
export function createSnowAlbedoTexture() {
  const size = 512;
  const canvas = makeCanvas(size, size);
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(size, size);
  const data = img.data;

  let seed = 90210;
  const rand = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const groove = Math.sin((x / size) * Math.PI * 2 * 36) * 5.5;
      const wave =
        Math.sin((x / size) * Math.PI * 2 * 4 + (y / size) * Math.PI * 2 * 2) * 4.0 +
        Math.cos((y / size) * Math.PI * 2 * 6) * 2.5;
      const sparkle = rand() > 0.985 ? 16 : (rand() - 0.5) * 7;

      const base = 240 + groove + wave + sparkle;
      const idx = (y * size + x) * 4;
      data[idx] = Math.max(210, Math.min(255, Math.round(base - 2)));
      data[idx + 1] = Math.max(216, Math.min(255, Math.round(base + 1)));
      data[idx + 2] = Math.max(224, Math.min(255, Math.round(base + 6)));
      data[idx + 3] = 255;
    }
  }

  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  return tex;
}

/**
 * Racing alpine ski top-sheet texture (matte carbon, crisp vermilion chevrons, titanium edge)
 */
export function createSkiTexture(isRight = false) {
  const canvas = makeCanvas(256, 1024);
  const ctx = canvas.getContext('2d');

  // Deep alpine carbon charcoal base
  const grad = ctx.createLinearGradient(0, 0, 0, 1024);
  grad.addColorStop(0, '#161b24');
  grad.addColorStop(0.25, '#1d2430');
  grad.addColorStop(0.55, '#151a22');
  grad.addColorStop(1, '#10141b');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 1024);

  // Subtle brushed weave lines
  ctx.strokeStyle = 'rgba(255,255,255,0.035)';
  ctx.lineWidth = 2;
  for (let i = -256; i < 1280; i += 14) {
    ctx.beginPath();
    ctx.moveTo(0, i);
    ctx.lineTo(256, i + 180);
    ctx.stroke();
  }

  // Brushed silver steel edges along both sides
  ctx.fillStyle = '#c8d4e0';
  ctx.fillRect(0, 0, 11, 1024);
  ctx.fillRect(245, 0, 11, 1024);

  // Bright Swiss safety vermilion nose tip accent
  ctx.fillStyle = '#e6482e';
  ctx.beginPath();
  ctx.moveTo(12, 0);
  ctx.lineTo(244, 0);
  ctx.lineTo(244, 185);
  ctx.lineTo(12, 235);
  ctx.closePath();
  ctx.fill();

  // Crisp snow-white diagonal speed stripe
  ctx.fillStyle = '#f2f6fa';
  ctx.beginPath();
  ctx.moveTo(12, 255);
  ctx.lineTo(244, 205);
  ctx.lineTo(244, 252);
  ctx.lineTo(12, 302);
  ctx.closePath();
  ctx.fill();

  // Subtle glacier blue accent chevron near binding
  ctx.fillStyle = '#6ec2ed';
  ctx.beginPath();
  ctx.moveTo(12, 315);
  ctx.lineTo(244, 265);
  ctx.lineTo(244, 282);
  ctx.lineTo(12, 332);
  ctx.closePath();
  ctx.fill();

  // Precision racing badge on front shovel (clearly readable when looking down!)
  ctx.save();
  ctx.translate(128, 430);
  ctx.fillStyle = 'rgba(245, 248, 252, 0.9)';
  ctx.font = '700 34px -apple-system, BlinkMacSystemFont, "Helvetica Neue", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('V·3400', 0, 0);
  ctx.fillStyle = '#e6482e';
  ctx.font = '600 18px -apple-system, BlinkMacSystemFont, "Helvetica Neue", sans-serif';
  ctx.fillText(isRight ? 'GS PRO · R' : 'GS PRO · L', 0, 28);
  ctx.restore();

  // Rear racing bars
  ctx.fillStyle = '#e6482e';
  ctx.fillRect(16, 860, 224, 18);
  ctx.fillStyle = '#f2f6fa';
  ctx.fillRect(16, 892, 224, 8);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

/**
 * Weathered warm alpine larch wood texture for chalets, fences, and start pavilion
 */
export function createWoodTexture() {
  const canvas = makeCanvas(512, 512);
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#6b472d';
  ctx.fillRect(0, 0, 512, 512);

  // Horizontal planks
  const plankCount = 8;
  const plankH = 512 / plankCount;
  for (let p = 0; p < plankCount; p++) {
    const y0 = p * plankH;
    const tone = (p % 3) * 8 - 8;
    ctx.fillStyle = `rgb(${108 + tone}, ${72 + tone * 0.7}, ${46 + tone * 0.5})`;
    ctx.fillRect(0, y0, 512, plankH - 2);

    // Subtle grain streaks
    for (let g = 0; g < 24; g++) {
      const gy = y0 + Math.random() * (plankH - 4);
      ctx.strokeStyle = g % 2 === 0 ? 'rgba(40,22,12,0.22)' : 'rgba(185,135,90,0.12)';
      ctx.lineWidth = 1 + Math.random() * 2;
      ctx.beginPath();
      ctx.moveTo(0, gy);
      ctx.bezierCurveTo(170, gy + (Math.random() - 0.5) * 6, 340, gy + (Math.random() - 0.5) * 6, 512, gy);
      ctx.stroke();
    }

    // Plank seam
    ctx.fillStyle = 'rgba(26,15,9,0.75)';
    ctx.fillRect(0, y0 + plankH - 3, 512, 3);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  return tex;
}

/**
 * Crisp Swiss alpine gantry banner texture (Start or Finish arch)
 */
export function createGantryBannerTexture(title, subtitle, accentColor = '#e6482e') {
  const canvas = makeCanvas(1024, 256);
  const ctx = canvas.getContext('2d');

  // Deep alpine navy/slate backdrop
  ctx.fillStyle = '#111b29';
  ctx.fillRect(0, 0, 1024, 256);

  // Top & bottom crisp safety trim bars
  ctx.fillStyle = accentColor;
  ctx.fillRect(0, 0, 1024, 18);
  ctx.fillRect(0, 238, 1024, 18);

  // Diagonal alpine chevron blocks on left & right ends
  ctx.fillStyle = '#f5f8fc';
  for (let i = 0; i < 3; i++) {
    const xL = 32 + i * 32;
    ctx.beginPath();
    ctx.moveTo(xL, 46);
    ctx.lineTo(xL + 16, 46);
    ctx.lineTo(xL + 34, 128);
    ctx.lineTo(xL + 16, 210);
    ctx.lineTo(xL, 210);
    ctx.lineTo(xL + 18, 128);
    ctx.closePath();
    ctx.fill();

    const xR = 992 - i * 32;
    ctx.beginPath();
    ctx.moveTo(xR, 46);
    ctx.lineTo(xR - 16, 46);
    ctx.lineTo(xR - 34, 128);
    ctx.lineTo(xR - 16, 210);
    ctx.lineTo(xR, 210);
    ctx.lineTo(xR - 18, 128);
    ctx.closePath();
    ctx.fill();
  }

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ffffff';
  ctx.font = '800 84px -apple-system, BlinkMacSystemFont, "Helvetica Neue", sans-serif';
  ctx.fillText(title, 512, 108);

  ctx.fillStyle = '#9ad6f5';
  ctx.font = '600 32px -apple-system, BlinkMacSystemFont, "Helvetica Neue", sans-serif';
  ctx.fillText(subtitle, 512, 182);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

/**
 * Soft radial snow puff texture for carving snow plumes and ambient snowflakes
 */
export function createSnowParticleTexture() {
  const size = 128;
  const canvas = makeCanvas(size, size);
  const ctx = canvas.getContext('2d');

  const grad = ctx.createRadialGradient(64, 64, 4, 64, 64, 62);
  grad.addColorStop(0, 'rgba(255, 255, 255, 1.0)');
  grad.addColorStop(0.42, 'rgba(244, 250, 255, 0.82)');
  grad.addColorStop(0.75, 'rgba(220, 236, 252, 0.28)');
  grad.addColorStop(1, 'rgba(210, 230, 250, 0.0)');

  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Safety net / fence banner mesh texture (translucent World Cup alpine red catch-net)
 */
export function createSafetyNetTexture() {
  const canvas = makeCanvas(256, 128);
  const ctx = canvas.getContext('2d');

  ctx.clearRect(0, 0, 256, 128);

  // Subtle translucent crimson backing
  ctx.fillStyle = 'rgba(224, 62, 40, 0.42)';
  ctx.fillRect(0, 12, 256, 104);

  // Top & bottom reinforced bands
  ctx.fillStyle = '#e6482e';
  ctx.fillRect(0, 0, 256, 16);
  ctx.fillRect(0, 112, 256, 16);

  // Diamond mesh weave
  ctx.strokeStyle = 'rgba(255, 245, 240, 0.72)';
  ctx.lineWidth = 2.5;
  for (let x = -128; x < 384; x += 24) {
    ctx.beginPath();
    ctx.moveTo(x, 14);
    ctx.lineTo(x + 98, 114);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(x + 98, 14);
    ctx.lineTo(x, 114);
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}
