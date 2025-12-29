import { exportGeoJSON, importGeoJSONText } from "../data/geojson.js";

/**
 * Undo/Redo history for vector drawings (GeoJSON snapshots).
 * Excludes preview (__truegis_preview).
 *
 * Key rules:
 * - snapshotNow() is the ONLY "commit" function (pushes + clears redo)
 * - undo()/redo() must NEVER call snapshotNow() (or redo will get wiped)
 * - withSuspend() prevents snapshots during programmatic restores/imports
 */
export function createHistory({ vectorSource, applyStyle }) {
  const undoStack = [];
  const redoStack = [];
  let suspended = false;

  function withSuspend(fn) {
    suspended = true;
    try {
      fn();
    } finally {
      suspended = false;
    }
  }

  function getSnapshotText() {
    // exportGeoJSON is canonical now, so identical map state -> identical text
    return exportGeoJSON({ vectorSource });
  }

  function restoreFromText(text) {
    withSuspend(() => {
      vectorSource.clear(true);
      importGeoJSONText({ text, vectorSource, applyStyle });
    });
  }

  function getCurrent() {
    return undoStack.length ? undoStack[undoStack.length - 1] : null;
  }

  function _pushIfChanged(text) {
    if (suspended) return false;

    const last = getCurrent();
    if (last != null && last === text) return false;

    undoStack.push(text);
    // IMPORTANT: any new commit invalidates redo history
    redoStack.length = 0;
    return true;
  }

  /**
   * Snapshot current state (creates an undo step if changed).
   * Returns true if a new step was added.
   */
  function snapshotNow() {
    const text = getSnapshotText();
    return _pushIfChanged(text);
  }

  // Backwards compat: existing code calls history.snapshot()
  function snapshot() {
    return snapshotNow();
  }

  function canUndo() {
    return undoStack.length > 1;
  }
  function canRedo() {
    return redoStack.length > 0;
  }

  function undo() {
    if (!canUndo()) return false;

    const current = undoStack.pop();
    redoStack.push(current);

    const prev = getCurrent();
    if (prev == null) return false;

    restoreFromText(prev);
    return true;
  }

  function redo() {
    if (!canRedo()) return false;

    const next = redoStack.pop();
    undoStack.push(next);

    restoreFromText(next);
    return true;
  }

  function resetBaselineFromCurrent() {
    undoStack.length = 0;
    redoStack.length = 0;
    undoStack.push(getSnapshotText());
  }

  return {
    snapshot,      // existing API
    snapshotNow,   // explicit commit point
    getCurrent,    // useful for autosave + debugging
    undo,
    redo,
    canUndo,
    canRedo,
    resetBaselineFromCurrent,
    withSuspend,
    _debug: { undoStack, redoStack },
  };
}
