/**
 * utils.js — DeepGuard Utility Functions
 * File validation, image resizing, histogram, report export
 */

'use strict';

/* ── Constants ────────────────────────────────────────────── */
export const ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
export const MAX_FILE_SIZE  = 20 * 1024 * 1024; // 20 MB

/* ── File Validation ──────────────────────────────────────── */
/**
 * Validate an uploaded file.
 * @param {File} file
 * @returns {{ valid: boolean, error?: string }}
 */
export function validateFile(file) {
  if (!file) return { valid: false, error: 'No file selected.' };

  if (!ACCEPTED_TYPES.includes(file.type)) {
    return {
      valid: false,
      error: `Unsupported format "${sanitizeText(file.name)}". Please upload PNG, JPG, JPEG, or WEBP.`
    };
  }

  if (file.size > MAX_FILE_SIZE) {
    return {
      valid: false,
      error: `File too large (${formatBytes(file.size)}). Maximum allowed is 20 MB.`
    };
  }

  return { valid: true };
}

/**
 * Attempt to load an image and check it renders.
 * Returns a promise resolving to HTMLImageElement or rejecting with error.
 * @param {string} dataUrl
 * @returns {Promise<HTMLImageElement>}
 */
export function loadImageFromDataUrl(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload  = () => resolve(img);
    img.onerror = () => reject(new Error('Corrupted or unreadable image.'));
    img.src = dataUrl;
  });
}

/* ── File → Data URL ──────────────────────────────────────── */
/**
 * @param {File} file
 * @returns {Promise<string>}
 */
export function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = e => resolve(e.target.result);
    reader.onerror = () => reject(new Error('Could not read file.'));
    reader.readAsDataURL(file);
  });
}

/* ── Image Resizing ───────────────────────────────────────── */
/**
 * Resize an image to target dimensions for model inference.
 * Returns an ImageData object.
 * @param {HTMLImageElement} img
 * @param {number} targetW
 * @param {number} targetH
 * @returns {ImageData}
 */
export function resizeImage(img, targetW = 224, targetH = 224) {
  const canvas = document.createElement('canvas');
  canvas.width  = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, targetW, targetH);
  return ctx.getImageData(0, 0, targetW, targetH);
}

/**
 * Get a canvas element with the image drawn at original size.
 * @param {HTMLImageElement} img
 * @returns {HTMLCanvasElement}
 */
export function imageToCanvas(img) {
  const canvas = document.createElement('canvas');
  canvas.width  = img.naturalWidth;
  canvas.height = img.naturalHeight;
  canvas.getContext('2d').drawImage(img, 0, 0);
  return canvas;
}

/* ── Color Histogram ──────────────────────────────────────── */
/**
 * Draw an RGB histogram on a canvas element.
 * @param {HTMLImageElement} img
 * @param {HTMLCanvasElement} canvas
 */
export function drawHistogram(img, canvas) {
  const W = canvas.width  = canvas.offsetWidth  || 400;
  const H = canvas.height = canvas.offsetHeight || 120;

  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, W, H);

  // Draw source image into offscreen canvas to read pixels
  const offscreen = document.createElement('canvas');
  offscreen.width  = Math.min(img.naturalWidth, 200);
  offscreen.height = Math.min(img.naturalHeight, 200);
  const octx = offscreen.getContext('2d');
  octx.drawImage(img, 0, 0, offscreen.width, offscreen.height);
  const data = octx.getImageData(0, 0, offscreen.width, offscreen.height).data;

  // Accumulate channels
  const r = new Uint32Array(256);
  const g = new Uint32Array(256);
  const b = new Uint32Array(256);
  for (let i = 0; i < data.length; i += 4) {
    r[data[i]]++;
    g[data[i+1]]++;
    b[data[i+2]]++;
  }

  const maxVal = Math.max(Math.max(...r), Math.max(...g), Math.max(...b), 1);

  // Background
  ctx.fillStyle = 'rgba(255,255,255,0.03)';
  ctx.fillRect(0, 0, W, H);

  const drawChannel = (hist, color, alpha = 0.55) => {
    ctx.beginPath();
    ctx.moveTo(0, H);
    for (let i = 0; i < 256; i++) {
      const x = (i / 255) * W;
      const y = H - (hist[i] / maxVal) * H * 0.95;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.lineTo(W, H);
    ctx.closePath();
    ctx.fillStyle = color.replace('1)', `${alpha})`);
    ctx.fill();
    // Stroke
    ctx.beginPath();
    for (let i = 0; i < 256; i++) {
      const x = (i / 255) * W;
      const y = H - (hist[i] / maxVal) * H * 0.95;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.stroke();
  };

  drawChannel(r, 'rgba(239,68,68,1)',   0.4);
  drawChannel(g, 'rgba(34,197,94,1)',   0.4);
  drawChannel(b, 'rgba(59,130,246,1)',  0.4);
}

/* ── Pixel-Level Analysis Utilities ──────────────────────── */
/**
 * Compute basic statistics on image pixel data useful for heuristics.
 * @param {HTMLImageElement} img
 * @returns {{ noise: number, edgeScore: number, colorEntropy: number, compressionArtifacts: number }}
 */
export function analyzePixels(img) {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, size, size);
  const { data } = ctx.getImageData(0, 0, size, size);

  // Noise estimation: variance of luminance differences
  let noiseSum = 0;
  let edgeSum  = 0;
  const luma = new Float32Array(size * size);

  for (let i = 0; i < size * size; i++) {
    const p = i * 4;
    luma[i] = 0.299 * data[p] + 0.587 * data[p+1] + 0.114 * data[p+2];
  }

  for (let y = 1; y < size - 1; y++) {
    for (let x = 1; x < size - 1; x++) {
      const c  = luma[y * size + x];
      const r  = luma[y * size + (x+1)];
      const d  = luma[(y+1) * size + x];
      const dr = luma[(y+1) * size + (x+1)];

      const diff = Math.abs(c - r) + Math.abs(c - d);
      edgeSum  += diff;

      // Local noise = deviation from neighbors
      const avg = (luma[(y-1)*size+x] + luma[(y+1)*size+x] +
                   luma[y*size+x-1]   + luma[y*size+x+1]) / 4;
      noiseSum += (c - avg) ** 2;
    }
  }

  const total = (size - 2) * (size - 2);
  const noise = Math.sqrt(noiseSum / total) / 255;
  const edgeScore = edgeSum / total / 255;

  // Color entropy (simplified: unique color buckets)
  const buckets = new Set();
  for (let i = 0; i < data.length; i += 4) {
    const key = `${data[i] >> 4},${data[i+1] >> 4},${data[i+2] >> 4}`;
    buckets.add(key);
  }
  const colorEntropy = buckets.size / 4096; // normalized 0-1

  // JPEG artifact detection: blockiness at 8x8 boundaries
  let blockDiff = 0;
  let blockCount = 0;
  for (let y = 7; y < size; y += 8) {
    for (let x = 0; x < size; x++) {
      const diff = Math.abs(luma[y * size + x] - luma[(y-1) * size + x]);
      blockDiff += diff;
      blockCount++;
    }
  }
  const compressionArtifacts = blockCount ? blockDiff / blockCount / 255 : 0;

  return { noise, edgeScore, colorEntropy, compressionArtifacts };
}

/* ── Diff Heatmap ────────────────────────────────────────── */
/**
 * Draw a basic pixel difference heatmap between two images on a canvas.
 * @param {HTMLImageElement} img1
 * @param {HTMLImageElement} img2
 * @param {HTMLCanvasElement} canvas
 */
export function drawDiffHeatmap(img1, img2, canvas) {
  const W = 256, H = 256;
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');

  const o1 = document.createElement('canvas'), o2 = document.createElement('canvas');
  [o1, o2].forEach(c => { c.width = W; c.height = H; });
  o1.getContext('2d').drawImage(img1, 0, 0, W, H);
  o2.getContext('2d').drawImage(img2, 0, 0, W, H);

  const d1 = o1.getContext('2d').getImageData(0, 0, W, H).data;
  const d2 = o2.getContext('2d').getImageData(0, 0, W, H).data;
  const out = ctx.createImageData(W, H);

  for (let i = 0; i < d1.length; i += 4) {
    const diff = (Math.abs(d1[i]-d2[i]) + Math.abs(d1[i+1]-d2[i+1]) + Math.abs(d1[i+2]-d2[i+2])) / 3;
    const heat = Math.min(255, diff * 3);
    out.data[i]   = heat;
    out.data[i+1] = Math.max(0, 100 - diff);
    out.data[i+2] = Math.max(0, 200 - diff * 2);
    out.data[i+3] = 200;
  }
  ctx.putImageData(out, 0, 0);
}

/* ── Sanitization ─────────────────────────────────────────── */
/**
 * Sanitize a string for safe text node insertion.
 * @param {string} str
 * @returns {string}
 */
export function sanitizeText(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/* ── Formatting ───────────────────────────────────────────── */
/**
 * @param {number} bytes
 * @returns {string}
 */
export function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

/**
 * @param {number} ms
 * @returns {string}
 */
export function formatMs(ms) {
  return ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(2)} s`;
}

/**
 * @param {number|string} ts
 * @returns {string}
 */
export function formatDate(ts) {
  return new Date(ts).toLocaleString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
}

/* ── Report Export ─────────────────────────────────────────── */
/**
 * Export result as JSON file download.
 * @param {object} result
 * @param {string} filename
 */
export function exportJSON(result, filename = 'deepguard-report.json') {
  const data = {
    appName: 'DeepGuard',
    exportedAt: new Date().toISOString(),
    ...result
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  triggerDownload(blob, filename);
}

/**
 * Export result as a simple text-based "PDF" (using print dialog).
 * Since we have no backend, we build a printable HTML page and open it.
 * @param {object} result
 */
export function exportPDF(result) {
  const safe = s => sanitizeText(String(s));
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>DeepGuard Report</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
         max-width: 720px; margin: 40px auto; color: #111; background: #fff; }
  h1 { color: #00aabb; border-bottom: 2px solid #00aabb; padding-bottom: 8px; }
  .section { margin: 24px 0; }
  .label { font-size: 12px; color: #888; text-transform: uppercase; letter-spacing: .06em; }
  .value { font-size: 18px; font-weight: 700; margin-top: 4px; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin: 16px 0; }
  .stat { background: #f5f5f5; border-radius: 8px; padding: 12px 16px; }
  .real { color: #16a34a; }
  .ai   { color: #dc2626; }
  .suspicious { color: #d97706; }
  .indicator { display: flex; align-items: center; gap: 8px; padding: 8px 0;
               border-bottom: 1px solid #eee; font-size: 14px; }
  footer { margin-top: 48px; font-size: 12px; color: #aaa; }
  @media print { body { margin: 20px; } }
</style>
</head>
<body>
<h1>🛡 DeepGuard — Deepfake Analysis Report</h1>
<p style="color:#888; font-size:13px">Generated: ${safe(new Date(result.timestamp || Date.now()).toLocaleString())}</p>

<div class="section">
  <div class="label">Verdict</div>
  <div class="value ${safe(result.prediction?.toLowerCase().replace(' ','') || '')}">
    ${safe(result.prediction || 'N/A')}
  </div>
</div>

<div class="grid">
  <div class="stat"><div class="label">Confidence</div><div class="value">${safe(result.confidence != null ? result.confidence.toFixed(1) + '%' : 'N/A')}</div></div>
  <div class="stat"><div class="label">Trust Score</div><div class="value">${safe(result.trustScore != null ? result.trustScore.toFixed(0) + '/100' : 'N/A')}</div></div>
  <div class="stat"><div class="label">Inference Time</div><div class="value">${safe(result.inferenceTime != null ? result.inferenceTime + ' ms' : 'N/A')}</div></div>
  <div class="stat"><div class="label">Model Version</div><div class="value">${safe(result.modelVersion || 'N/A')}</div></div>
</div>

<div class="section">
  <h3>Image Information</h3>
  <div class="grid">
    <div class="stat"><div class="label">Filename</div><div class="value" style="font-size:14px">${safe(result.imageInfo?.filename || 'N/A')}</div></div>
    <div class="stat"><div class="label">Dimensions</div><div class="value">${safe(result.imageInfo?.width || '?')} × ${safe(result.imageInfo?.height || '?')}</div></div>
    <div class="stat"><div class="label">File Size</div><div class="value">${safe(result.imageInfo?.size || 'N/A')}</div></div>
    <div class="stat"><div class="label">Format</div><div class="value">${safe(result.imageInfo?.format || 'N/A')}</div></div>
  </div>
</div>

${result.indicators ? `
<div class="section">
  <h3>Detection Indicators</h3>
  ${result.indicators.map(ind => `
  <div class="indicator">
    <strong>${safe(ind.name)}</strong> — ${safe(ind.desc)}
    <span style="margin-left:auto;font-weight:700">${safe(ind.score)}</span>
  </div>`).join('')}
</div>` : ''}

<footer>Generated by DeepGuard · All analysis performed locally · No data uploaded to any server.</footer>
</body>
</html>`;

  const win = window.open('', '_blank');
  if (win) {
    win.document.write(html);
    win.document.close();
    setTimeout(() => win.print(), 800);
  }
}

/**
 * Trigger a file download.
 * @param {Blob} blob
 * @param {string} filename
 */
function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a   = document.createElement('a');
  a.href     = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  requestAnimationFrame(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  });
}

/* ── Misc ─────────────────────────────────────────────────── */
/**
 * Generate a short random ID.
 * @returns {string}
 */
export function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

/**
 * Clamp a value between min and max.
 */
export function clamp(val, min, max) {
  return Math.min(max, Math.max(min, val));
}
