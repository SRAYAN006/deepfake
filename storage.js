/**
 * storage.js — DeepGuard localStorage Layer
 * Schema migration, history CRUD, settings persistence
 */

'use strict';

const STORAGE_KEY    = 'deepfakeValidator:data';
const SCHEMA_VERSION = 2;

/* ── Default Settings ─────────────────────────────────────── */
const DEFAULT_SETTINGS = {
  theme:             'dark',
  confidenceThreshold: 65,
  autoAnalyze:       true,
  saveHistory:       true,
  enableAnimations:  true,
};

/* ── Default Structure ────────────────────────────────────── */
function defaultData() {
  return {
    version:  SCHEMA_VERSION,
    settings: { ...DEFAULT_SETTINGS },
    history:  [],
  };
}

/* ── Migration ─────────────────────────────────────────────── */
/**
 * Upgrade older schema versions to current.
 * @param {object} old
 * @returns {object}
 */
function migrate(old) {
  if (!old || typeof old !== 'object') return defaultData();

  let data = { ...old };

  // v1 → v2: added confidenceThreshold and enableAnimations
  if (!data.version || data.version < 2) {
    data.version = 2;
    data.settings = {
      ...DEFAULT_SETTINGS,
      ...(data.settings || {}),
    };
    data.history = Array.isArray(data.history) ? data.history : [];
  }

  // Ensure required fields always present
  data.settings = { ...DEFAULT_SETTINGS, ...(data.settings || {}) };
  if (!Array.isArray(data.history)) data.history = [];

  return data;
}

/* ── Read / Write ──────────────────────────────────────────── */
/**
 * Load data from localStorage safely.
 * @returns {object}
 */
function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultData();
    const parsed = JSON.parse(raw);
    return migrate(parsed);
  } catch (e) {
    console.warn('[DeepGuard Storage] Corrupt data, resetting.', e);
    return defaultData();
  }
}

/**
 * Save data to localStorage safely.
 * @param {object} data
 */
function save(data) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (e) {
    console.warn('[DeepGuard Storage] Could not save (quota exceeded?).', e);
  }
}

/* ── Settings API ──────────────────────────────────────────── */
/**
 * Get all current settings.
 * @returns {object}
 */
export function getSettings() {
  return load().settings;
}

/**
 * Update one or more settings and persist.
 * @param {Partial<typeof DEFAULT_SETTINGS>} patch
 */
export function updateSettings(patch) {
  const data = load();
  data.settings = { ...data.settings, ...patch };
  save(data);
}

/* ── History API ───────────────────────────────────────────── */
/**
 * @typedef {object} HistoryEntry
 * @property {string} id
 * @property {string} filename
 * @property {number} timestamp
 * @property {string} prediction   — 'Real' | 'AI Generated' | 'Suspicious'
 * @property {number} confidence   — 0–100
 * @property {number} trustScore   — 0–100
 * @property {string} fileSize     — formatted string
 * @property {string} format
 * @property {string} [thumbUrl]   — data URL thumbnail (optional)
 */

/**
 * Get all history entries.
 * @returns {HistoryEntry[]}
 */
export function getHistory() {
  return load().history;
}

/**
 * Add a new history entry.
 * @param {HistoryEntry} entry
 */
export function addHistoryEntry(entry) {
  const data = load();
  if (!data.settings.saveHistory) return;

  // Keep max 100 entries
  data.history = [entry, ...data.history].slice(0, 100);
  save(data);
}

/**
 * Delete a history entry by ID.
 * @param {string} id
 */
export function deleteHistoryEntry(id) {
  const data = load();
  data.history = data.history.filter(e => e.id !== id);
  save(data);
}

/**
 * Clear all history.
 */
export function clearHistory() {
  const data = load();
  data.history = [];
  save(data);
}

/**
 * Get a single history entry by ID.
 * @param {string} id
 * @returns {HistoryEntry|undefined}
 */
export function getHistoryEntry(id) {
  return load().history.find(e => e.id === id);
}

/* ── Full Reset ─────────────────────────────────────────────── */
/**
 * Remove all stored data.
 */
export function resetAll() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (e) {
    console.warn('[DeepGuard Storage] Could not reset.', e);
  }
}
