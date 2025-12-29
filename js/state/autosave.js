// Versioned autosave key so future schema changes don't break old saves
const KEY = "truegis_autosave_v1";

/**
 * Load last autosaved GeoJSON text (or null).
 * Autosave is intentionally dumb storage: history controls correctness.
 */
export function loadAutosave() {
  try {
    const text = localStorage.getItem(KEY);
    return typeof text === "string" && text.length ? text : null;
  } catch {
    return null;
  }
}

/**
 * Persist the latest committed state (GeoJSON text).
 *
 * Notes:
 * - This should be called after real edits (draw/modify/style/delete/import/clear),
 *   and after undo/redo restores (WITHOUT snapshotting).
 * - We also mirror into sessionStorage as a fallback for stricter environments.
 */
export function saveAutosave(text) {
  if (typeof text !== "string" || !text.length) return;

  try {
    localStorage.setItem(KEY, text);
  } catch {
    // storage full / blocked — ignore
  }

  // Best-effort fallback: sessionStorage
  try {
    sessionStorage.setItem(KEY, text);
  } catch {
    // ignore
  }
}

/**
 * Clear autosave explicitly (useful if you add a "New Map" button later).
 */
export function clearAutosave() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}

/**
 * Optional helper: load from sessionStorage if localStorage was blocked.
 * Safe to call from createMap.js if you want a fallback restore path.
 */
export function loadAutosaveFallback() {
  try {
    const text = sessionStorage.getItem(KEY);
    return typeof text === "string" && text.length ? text : null;
  } catch {
    return null;
  }
}
