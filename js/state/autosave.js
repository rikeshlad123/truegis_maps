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
 * Persist the latest committed history state.
 * Called AFTER snapshotting (never during undo/redo snapshot creation).
 */
export function saveAutosave(text) {
  if (typeof text !== "string") return;
  try {
    localStorage.setItem(KEY, text);
  } catch {
    // storage full / private mode — silently ignore
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
}
