import { exportGeoJSON, importGeoJSONText } from "../data/geojson.js";

/**
 * Undo/Redo history for vector drawings (GeoJSON snapshots).
 * Excludes preview (__truegis_preview).
 */
export function createHistory({ vectorSource, applyStyle }) {
  const undoStack = [];
  const redoStack = [];
  let suspended = false;

  // If multiple changes happen quickly (e.g. slider drag), we allow callers to debounce
  // and then call snapshotNow() once for a single undo step.
  function withSuspend(fn) {
    suspended = true;
    try {
      fn();
    } finally {
      suspended = false;
    }
  }

  function getSnapshotText() {
    return exportGeoJSON({ vectorSource });
  }

  function restoreFromText(text) {
    withSuspend(() => {
      vectorSource.clear(true);
      importGeoJSONText({ text, vectorSource, applyStyle });
    });
  }

  function _pushIfChanged(text) {
    if (suspended) return false;
    if (undoStack.length && undoStack[undoStack.length - 1] === text) return false;
    undoStack.push(text);
    redoStack.length = 0;
    return true;
  }

  /**
   * Snapshot current state (creates an undo step if changed).
   */
  function snapshotNow() {
    const text = getSnapshotText();
    return _pushIfChanged(text);
  }

  // Backwards compat: existing code calls history.snapshot()
  function snapshot() {
    snapshotNow();
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
    const prev = undoStack[undoStack.length - 1];
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
    snapshot,     // existing API
    snapshotNow,  // new: explicit commit point
    undo,
    redo,
    canUndo,
    canRedo,
    resetBaselineFromCurrent,
    withSuspend,
    _debug: { undoStack, redoStack },
  };
}
