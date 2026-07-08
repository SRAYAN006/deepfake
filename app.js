/**
 * app.js — DeepGuard Application Controller
 * Manages all UI interactions, upload flow, analysis, history, settings
 */

'use strict';

import { validateFile, fileToDataUrl, loadImageFromDataUrl, formatBytes, formatMs, formatDate, drawHistogram, drawDiffHeatmap, sanitizeText, exportJSON, exportPDF, generateId } from './utils.js';
import { initModel, detectImage, getModelState } from './model.js';
import { getSettings, updateSettings, getHistory, addHistoryEntry, deleteHistoryEntry, clearHistory } from './storage.js';

/* ── App State ─────────────────────────────────────────────── */
const state = {
  image:        null,   // HTMLImageElement
  imageFile:    null,   // File
  imageDataUrl: null,   // string
  result:       null,   // DetectionResult
  analyzing:    false,
  compareImages: [null, null],
  compareResults:[null, null],
  activeTab:    'analyze',
};

/* ── DOM Refs ─────────────────────────────────────────────────── */
const $ = id => document.getElementById(id);
const $q = sel => document.querySelector(sel);

/* ── Boot ────────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  applySettings();
  setupNav();
  setupUpload();
  setupAnalyzeBtn();
  setupFAB();
  setupSettings();
  setupCompare();
  setupExport();
  renderHistory();
  setupPaste();

  // Init AI model (lazy)
  initModel(onModelStateChange);
});

/* ── Settings Apply ──────────────────────────────────────────── */
function applySettings() {
  const s = getSettings();
  document.documentElement.dataset.theme = s.theme === 'light' ? 'light' : 'dark';

  // Sync toggles
  const syncs = {
    'setting-theme':      s.theme === 'light',
    'setting-auto':       s.autoAnalyze,
    'setting-history':    s.saveHistory,
    'setting-animations': s.enableAnimations,
  };
  Object.entries(syncs).forEach(([id, val]) => {
    const el = $(id);
    if (el) el.checked = val;
  });

  const slider = $('setting-threshold');
  if (slider) {
    slider.value = s.confidenceThreshold;
    $('threshold-val').textContent = `${s.confidenceThreshold}%`;
  }
}

/* ── Navigation ─────────────────────────────────────────────── */
function setupNav() {
  document.querySelectorAll('[data-tab]').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });
}

function switchTab(tab) {
  state.activeTab = tab;

  document.querySelectorAll('[data-tab]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tab);
  });
  document.querySelectorAll('.panel').forEach(p => {
    p.classList.toggle('active', p.id === `panel-${tab}`);
  });

  if (tab === 'history') renderHistory();
}

/* ── Model State ─────────────────────────────────────────────── */
function onModelStateChange(state, msg) {
  const badge = $('model-status-badge');
  const label = $('model-status-label');
  if (!badge || !label) return;

  badge.className = `model-status ${state}`;
  switch (state) {
    case 'loading':
      label.textContent = 'Loading model…';
      break;
    case 'ready':
      label.textContent = `TF.js Model`;
      break;
    case 'heuristic':
      label.textContent = 'Heuristic Mode';
      break;
    case 'error':
      label.textContent = 'Model Error';
      break;
  }
}

/* ── Upload ──────────────────────────────────────────────────── */
function setupUpload() {
  const zone      = $('upload-zone');
  const fileInput = $('file-input');
  const browseBtn = $('browse-btn');

  // Browse
  browseBtn?.addEventListener('click', e => {
    e.stopPropagation();
    fileInput.click();
  });

  fileInput?.addEventListener('change', () => {
    if (fileInput.files[0]) handleFile(fileInput.files[0]);
    fileInput.value = '';
  });

  // Drag & Drop
  zone?.addEventListener('dragover', e => {
    e.preventDefault();
    zone.classList.add('drag-over');
  });
  zone?.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
  zone?.addEventListener('drop', e => {
    e.preventDefault();
    zone.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  });

  // Click on zone (not on button)
  zone?.addEventListener('click', e => {
    if (e.target === zone || e.target.closest('.upload-empty')) {
      fileInput.click();
    }
  });

  // Clear
  $('clear-image-btn')?.addEventListener('click', clearImage);
}

function setupPaste() {
  document.addEventListener('paste', e => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) { handleFile(file); break; }
      }
    }
  });
}

async function handleFile(file) {
  const validation = validateFile(file);
  if (!validation.valid) {
    showSnack(validation.error, 'error');
    return;
  }

  try {
    const dataUrl = await fileToDataUrl(file);
    const img     = await loadImageFromDataUrl(dataUrl);

    state.image        = img;
    state.imageFile    = file;
    state.imageDataUrl = dataUrl;
    state.result       = null;

    renderImagePreview(img, dataUrl, file);

    // Auto-analyze if enabled
    const settings = getSettings();
    if (settings.autoAnalyze) {
      setTimeout(() => runAnalysis(), 300);
    }
  } catch (err) {
    showSnack(err.message || 'Could not load image.', 'error');
  }
}

function renderImagePreview(img, dataUrl, file) {
  const zone      = $('upload-zone');
  const emptyView = $('upload-empty');
  const preview   = $('upload-preview');
  const prevImg   = $('preview-img');
  const filename  = $('preview-filename');
  const filesize  = $('preview-filesize');
  const dims      = $('preview-dims');

  if (emptyView) emptyView.style.display = 'none';
  if (preview)   preview.style.display   = '';

  if (prevImg)  { prevImg.src = dataUrl; prevImg.alt = sanitizeText(file.name); }
  if (filename) filename.textContent = file.name.length > 40 ? file.name.slice(0, 37) + '…' : file.name;
  if (filesize) filesize.textContent = formatBytes(file.size);
  if (dims)     dims.textContent = `${img.naturalWidth} × ${img.naturalHeight}`;

  zone?.classList.add('has-image');

  // Enable analyze btn
  const analyzeBtn = $('analyze-btn');
  if (analyzeBtn) analyzeBtn.disabled = false;
}

function clearImage() {
  state.image = null;
  state.imageFile = null;
  state.imageDataUrl = null;
  state.result = null;

  const zone      = $('upload-zone');
  const emptyView = $('upload-empty');
  const preview   = $('upload-preview');
  const resultPanel = $('result-panel');
  const progressWrap = $('progress-wrap');

  if (emptyView) emptyView.style.display = '';
  if (preview)   preview.style.display   = 'none';
  zone?.classList.remove('has-image');

  resultPanel?.classList.remove('visible');
  progressWrap?.classList.remove('visible');

  const analyzeBtn = $('analyze-btn');
  if (analyzeBtn) analyzeBtn.disabled = true;
}

/* ── Analyze ─────────────────────────────────────────────────── */
function setupAnalyzeBtn() {
  $('analyze-btn')?.addEventListener('click', runAnalysis);
}
function setupFAB() {
  $('fab-analyze')?.addEventListener('click', runAnalysis);
}

async function runAnalysis() {
  if (!state.image || state.analyzing) return;
  state.analyzing = true;

  const progressWrap  = $('progress-wrap');
  const resultPanel   = $('result-panel');
  const analyzeBtn    = $('analyze-btn');
  const fabBtn        = $('fab-analyze');

  if (analyzeBtn) { analyzeBtn.disabled = true; analyzeBtn.innerHTML = `<span class="spinner"></span> Analyzing…`; }
  if (fabBtn)     { fabBtn.setAttribute('aria-busy', 'true'); }
  resultPanel?.classList.remove('visible');
  progressWrap?.classList.add('visible');

  // Animate steps
  const steps = ['step-load', 'step-preprocess', 'step-inference', 'step-explain'];
  const fills  = [25, 50, 80, 100];
  const fill   = $('progress-bar-fill');

  for (let i = 0; i < steps.length; i++) {
    const stepEl = $(steps[i]);
    if (stepEl) stepEl.className = 'progress-step active';
    if (fill) fill.style.width = `${fills[i]}%`;
    await delay(i < 2 ? 300 : 500);
    if (stepEl) stepEl.className = 'progress-step done';
  }

  // Run detection
  try {
    const settings = getSettings();
    const result = await detectImage(state.image, {
      confidenceThreshold: settings.confidenceThreshold
    });
    state.result = result;
    renderResult(result, state.imageFile);
    renderDashboard(state.image, state.imageFile);
    renderExplainability(result);
    saveToHistory(result, state.imageFile, state.imageDataUrl);
    showSnack('Analysis complete!', 'success');
  } catch (err) {
    showSnack('Detection failed: ' + err.message, 'error');
  }

  progressWrap?.classList.remove('visible');
  resultPanel?.classList.add('visible');

  if (analyzeBtn) {
    analyzeBtn.disabled = false;
    analyzeBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 3H5a2 2 0 0 0-2 2v4m6-6h10a2 2 0 0 1 2 2v4M9 3v18m0 0h10a2 2 0 0 0 2-2V9M9 21H5a2 2 0 0 1-2-2V9m0 0h18"/></svg> Analyze Image`;
  }
  if (fabBtn) fabBtn.removeAttribute('aria-busy');
  state.analyzing = false;
}

/* ── Render Result ─────────────────────────────────────────── */
function renderResult(result, file) {
  const { prediction, confidence, trustScore, aiProbability, inferenceTime, modelVersion, mode } = result;

  // Verdict card
  const verdict = $('verdict-card');
  if (verdict) {
    verdict.className = `result-verdict ${prediction === 'Real' ? 'real' : prediction === 'AI Generated' ? 'ai' : 'suspicious'}`;
  }

  const icons = {
    'Real':         `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 12l2 2 4-4"/><circle cx="12" cy="12" r="10"/></svg>`,
    'AI Generated': `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`,
    'Suspicious':   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
  };

  const taglines = {
    'Real':         'This image shows no significant signs of AI manipulation.',
    'AI Generated': 'Multiple indicators suggest this image is AI-generated or manipulated.',
    'Suspicious':   'Some irregularities detected. Manual review recommended.',
  };

  setText('verdict-icon', icons[prediction] || '');
  getText('verdict-prediction').textContent = prediction;
  getText('verdict-tagline').textContent = taglines[prediction] || '';

  // Confidence bar
  const confFill = $('confidence-fill');
  const confVal  = $('confidence-value');
  if (confFill) confFill.style.width = `${confidence}%`;
  if (confVal)  confVal.textContent = `${confidence.toFixed(1)}%`;

  // Trust score ring
  renderRing($('ring-svg-fill'), $('ring-score-val'), trustScore);

  // Meta stats
  setMeta('meta-inference-time', formatMs(inferenceTime));
  setMeta('meta-model-version', modelVersion.split(' ').slice(-1)[0]);
  setMeta('meta-ai-prob', `${aiProbability.toFixed(1)}%`);
  setMeta('meta-mode', mode === 'ready' ? 'TF.js' : 'Heuristic');

  // Heuristic notice
  const notice = $('heuristic-notice');
  if (notice) notice.classList.toggle('hidden', mode !== 'heuristic');
}

function renderRing(ringEl, scoreEl, score) {
  if (!ringEl || !scoreEl) return;
  const r = 50;
  const circ = 2 * Math.PI * r;
  const dash  = ((100 - score) / 100) * circ;

  ringEl.setAttribute('stroke-dasharray', circ.toFixed(1));
  ringEl.setAttribute('stroke-dashoffset', dash.toFixed(1));
  ringEl.setAttribute('r', r);
  ringEl.setAttribute('cx', 60);
  ringEl.setAttribute('cy', 60);

  const color = score >= 70 ? '#22c55e' : score >= 40 ? '#f59e0b' : '#ef4444';
  ringEl.setAttribute('stroke', color);
  scoreEl.textContent = score;
  scoreEl.style.color = color;
}

/* ── Dashboard ───────────────────────────────────────────────── */
function renderDashboard(img, file) {
  if (!img || !file) return;

  // Image stats
  setMeta('stat-width',  `${img.naturalWidth}px`);
  setMeta('stat-height', `${img.naturalHeight}px`);
  setMeta('stat-size',   formatBytes(file.size));
  setMeta('stat-format', file.type.split('/')[1].toUpperCase());

  // Histogram
  const histCanvas = $('histogramCanvas');
  if (histCanvas) drawHistogram(img, histCanvas);
}

/* ── Explainability ──────────────────────────────────────────── */
function renderExplainability(result) {
  const list = $('indicators-list');
  if (!list) return;

  list.innerHTML = '';
  result.indicators.forEach(ind => {
    const item = document.createElement('div');
    item.className = 'indicator-item';
    item.innerHTML = `
      <div class="indicator-icon ${sanitizeText(ind.severity)}">
        ${indicatorIcon(ind.severity)}
      </div>
      <div class="indicator-content">
        <div class="indicator-name">${sanitizeText(ind.name)}</div>
        <div class="indicator-desc">${sanitizeText(ind.desc)}</div>
      </div>
      <div class="indicator-score" style="color:${severityColor(ind.severity)}">${sanitizeText(ind.score)}</div>
    `;
    list.appendChild(item);
  });

  // Confidence chart
  renderConfidenceChart(result);
}

function renderConfidenceChart(result) {
  const canvas = $('confidenceChart');
  if (!canvas) return;

  const W = canvas.width  = canvas.offsetWidth || 300;
  const H = canvas.height = 160;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, W, H);

  const bars = [
    { label: 'AI Prob',    value: result.aiProbability,       color: '#ef4444' },
    { label: 'Real Prob',  value: 100 - result.aiProbability, color: '#22c55e' },
    { label: 'Trust',      value: result.trustScore,          color: '#00d4d4' },
    { label: 'Confidence', value: result.confidence,          color: '#f59e0b' },
  ];

  const pad = 40, barW = (W - pad * 2) / bars.length - 10;

  bars.forEach((bar, i) => {
    const x = pad + i * ((W - pad * 2) / bars.length);
    const barH = (bar.value / 100) * (H - 40);
    const y = H - 20 - barH;

    // Bar
    ctx.fillStyle = bar.color + '33';
    ctx.fillRect(x, H - 20, barW, -barH);
    ctx.fillStyle = bar.color;
    ctx.fillRect(x, y, barW, 3);

    // Label
    ctx.fillStyle = '#a0a0a0';
    ctx.font = '10px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(bar.label, x + barW / 2, H - 4);

    // Value
    ctx.fillStyle = bar.color;
    ctx.font = 'bold 12px JetBrains Mono, monospace';
    ctx.fillText(`${bar.value.toFixed(0)}%`, x + barW / 2, y - 5);
  });
}

/* ── History ─────────────────────────────────────────────────── */
function saveToHistory(result, file, thumbUrl) {
  if (!file) return;
  const entry = {
    id:         generateId(),
    filename:   file.name,
    timestamp:  result.timestamp || Date.now(),
    prediction: result.prediction,
    confidence: result.confidence,
    trustScore: result.trustScore,
    fileSize:   formatBytes(file.size),
    format:     file.type.split('/')[1].toUpperCase(),
    thumbUrl:   thumbUrl ? thumbUrl.slice(0, 2000) : null, // Cap thumbnail size
  };
  addHistoryEntry(entry);
}

function renderHistory() {
  const list  = $('history-list');
  const count = $('history-count');
  const empty = $('history-empty');
  if (!list) return;

  const entries = getHistory();
  if (count) count.textContent = `${entries.length} record${entries.length !== 1 ? 's' : ''}`;

  if (entries.length === 0) {
    list.innerHTML = '';
    if (empty) empty.classList.remove('hidden');
    return;
  }
  if (empty) empty.classList.add('hidden');

  list.innerHTML = '';
  entries.forEach(entry => {
    const item = document.createElement('div');
    item.className = 'history-item';
    item.dataset.id = entry.id;

    const badgeClass = entry.prediction === 'Real' ? 'real' : entry.prediction === 'AI Generated' ? 'ai' : 'suspicious';

    const thumb = entry.thumbUrl
      ? `<img class="history-thumb" src="${entry.thumbUrl}" alt="${sanitizeText(entry.filename)}" loading="lazy">`
      : `<div class="history-thumb-placeholder"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg></div>`;

    item.innerHTML = `
      ${thumb}
      <div class="history-info">
        <div class="history-filename">${sanitizeText(entry.filename)}</div>
        <div class="history-meta">${sanitizeText(formatDate(entry.timestamp))} · ${sanitizeText(entry.fileSize)}</div>
        <span class="badge badge-${badgeClass}" style="margin-top:4px">${sanitizeText(entry.prediction)}</span>
        <span class="badge" style="margin-top:4px;margin-left:4px">${entry.confidence.toFixed(0)}% confidence</span>
      </div>
      <div class="history-actions">
        <button class="btn btn-ghost btn-sm delete-entry" aria-label="Delete entry" data-id="${sanitizeText(entry.id)}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
        </button>
      </div>
    `;

    list.appendChild(item);
  });

  // Attach delete handlers
  list.querySelectorAll('.delete-entry').forEach(btn => {
    btn.addEventListener('click', e => {
      const id = e.currentTarget.dataset.id;
      deleteHistoryEntry(id);
      renderHistory();
      showSnack('Entry deleted.', 'success');
    });
  });
}

function setupHistoryControls() {
  $('clear-history-btn')?.addEventListener('click', () => {
    clearHistory();
    renderHistory();
    showSnack('History cleared.', 'success');
  });
}

/* ── Comparison Mode ─────────────────────────────────────────── */
function setupCompare() {
  ['A', 'B'].forEach((slot, i) => {
    const zone  = $(`compare-zone-${slot}`);
    const input = $(`compare-input-${slot}`);

    zone?.addEventListener('click', () => input?.click());
    zone?.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag-over'); });
    zone?.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
    zone?.addEventListener('drop', async e => {
      e.preventDefault();
      zone.classList.remove('drag-over');
      const file = e.dataTransfer.files[0];
      if (file) await handleCompareFile(file, i, slot);
    });

    input?.addEventListener('change', async () => {
      if (input.files[0]) await handleCompareFile(input.files[0], i, slot);
      input.value = '';
    });
  });

  $('compare-analyze-btn')?.addEventListener('click', runComparison);
}

async function handleCompareFile(file, idx, slot) {
  const validation = validateFile(file);
  if (!validation.valid) { showSnack(validation.error, 'error'); return; }

  try {
    const dataUrl = await fileToDataUrl(file);
    const img     = await loadImageFromDataUrl(dataUrl);
    state.compareImages[idx] = img;

    const zone   = $(`compare-zone-${slot}`);
    const preview = $(`compare-preview-${slot}`);

    if (preview) {
      preview.src = dataUrl;
      preview.style.display = '';
    }
    if (zone) {
      zone.classList.add('loaded');
      zone.querySelector('.compare-empty')?.remove();
    }
  } catch (err) {
    showSnack(err.message, 'error');
  }
}

async function runComparison() {
  const [imgA, imgB] = state.compareImages;
  if (!imgA || !imgB) {
    showSnack('Please upload both images to compare.', 'warning');
    return;
  }

  const settings = getSettings();

  try {
    const [resA, resB] = await Promise.all([
      detectImage(imgA, { confidenceThreshold: settings.confidenceThreshold }),
      detectImage(imgB, { confidenceThreshold: settings.confidenceThreshold }),
    ]);

    state.compareResults = [resA, resB];
    renderCompareResults(resA, resB);

    // Diff heatmap
    const diffCanvas = $('diffCanvas');
    if (diffCanvas) drawDiffHeatmap(imgA, imgB, diffCanvas);

    $('compare-results-section')?.classList.remove('hidden');
    showSnack('Comparison complete!', 'success');
  } catch (err) {
    showSnack('Comparison failed: ' + err.message, 'error');
  }
}

function renderCompareResults(resA, resB) {
  ['A', 'B'].forEach((slot, i) => {
    const res   = i === 0 ? resA : resB;
    const badge = $(`compare-badge-${slot}`);
    const conf  = $(`compare-conf-${slot}`);
    if (badge) {
      badge.className = `compare-result-badge ${res.prediction === 'Real' ? 'real' : res.prediction === 'AI Generated' ? 'ai' : 'suspicious'}`;
      badge.textContent = res.prediction;
    }
    if (conf) conf.textContent = `${res.confidence.toFixed(1)}% confidence`;
  });
}

/* ── Export ─────────────────────────────────────────────────── */
function setupExport() {
  $('export-json-btn')?.addEventListener('click', () => {
    if (!state.result) { showSnack('Analyze an image first.', 'warning'); return; }
    const data = {
      ...state.result,
      imageInfo: {
        ...state.result.imageInfo,
        filename: state.imageFile?.name,
        size: state.imageFile ? formatBytes(state.imageFile.size) : null,
        format: state.imageFile?.type?.split('/')[1]?.toUpperCase(),
      }
    };
    exportJSON(data, `deepguard-${Date.now()}.json`);
    showSnack('JSON report downloaded.', 'success');
  });

  $('export-pdf-btn')?.addEventListener('click', () => {
    if (!state.result) { showSnack('Analyze an image first.', 'warning'); return; }
    const data = {
      ...state.result,
      imageInfo: {
        ...state.result.imageInfo,
        filename: state.imageFile?.name,
        size: state.imageFile ? formatBytes(state.imageFile.size) : null,
        format: state.imageFile?.type?.split('/')[1]?.toUpperCase(),
      }
    };
    exportPDF(data);
  });
}

/* ── Settings Modal ────────────────────────────────────────── */
function setupSettings() {
  const backdrop = $('settings-modal');
  const openBtn  = $('settings-btn');
  const closeBtn = $('settings-close');

  openBtn?.addEventListener('click', () => backdrop?.classList.add('open'));
  closeBtn?.addEventListener('click', () => backdrop?.classList.remove('open'));
  backdrop?.addEventListener('click', e => {
    if (e.target === backdrop) backdrop.classList.remove('open');
  });

  // Theme toggle
  $('setting-theme')?.addEventListener('change', e => {
    const theme = e.target.checked ? 'light' : 'dark';
    document.documentElement.dataset.theme = theme;
    updateSettings({ theme });
  });

  // Auto-analyze toggle
  $('setting-auto')?.addEventListener('change', e => {
    updateSettings({ autoAnalyze: e.target.checked });
  });

  // Save history toggle
  $('setting-history')?.addEventListener('change', e => {
    updateSettings({ saveHistory: e.target.checked });
  });

  // Animations toggle
  $('setting-animations')?.addEventListener('change', e => {
    updateSettings({ enableAnimations: e.target.checked });
  });

  // Threshold slider
  $('setting-threshold')?.addEventListener('input', e => {
    const val = parseInt(e.target.value, 10);
    $('threshold-val').textContent = `${val}%`;
    updateSettings({ confidenceThreshold: val });
  });

  // Clear history from settings
  $('settings-clear-history')?.addEventListener('click', () => {
    clearHistory();
    renderHistory();
    showSnack('History cleared.', 'success');
    backdrop?.classList.remove('open');
  });

  setupHistoryControls();
}

/* ── Snackbar ─────────────────────────────────────────────── */
function showSnack(message, type = 'info') {
  const container = $('snackbar-container');
  if (!container) return;

  const icons = {
    success: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>`,
    error:   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`,
    warning: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
    info:    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`,
  };

  const snack = document.createElement('div');
  snack.className = `snackbar ${type}`;
  snack.setAttribute('role', 'alert');
  snack.innerHTML = `${icons[type] || icons.info}<span>${sanitizeText(message)}</span>`;
  container.appendChild(snack);

  setTimeout(() => {
    snack.classList.add('hiding');
    setTimeout(() => snack.remove(), 300);
  }, 3500);
}

/* ── DOM Helpers ────────────────────────────────────────────── */
function setText(id, html) {
  const el = $(id);
  if (el) el.innerHTML = html; // Only used with trusted icon SVGs
}
function getText(id) {
  return $(id) || { textContent: '' };
}
function setMeta(id, val) {
  const el = $(id);
  if (el) el.textContent = val;
}

/* ── Misc Helpers ────────────────────────────────────────────── */
function delay(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function indicatorIcon(severity) {
  const icons = {
    error:   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`,
    warning: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
    success: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>`,
    info:    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`,
  };
  return icons[severity] || icons.info;
}

function severityColor(severity) {
  const colors = { error: '#ef4444', warning: '#f59e0b', success: '#22c55e', info: '#3b82f6' };
  return colors[severity] || '#a0a0a0';
}
