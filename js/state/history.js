import { exportGeoJSON, importGeoJSONText } from "../data/geojson.js";

/**
 * Undo/Redo history for vector drawings (GeoJSON snapshots).
 * Excludes preview (__truegis_preview).
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
    return exportGeoJSON({ vectorSource });
  }

  function restoreFromText(text) {
    withSuspend(() => {
      vectorSource.clear(true);
      importGeoJSONText({ text, vectorSource, applyStyle });
    });
  }

  function snapshot() {
    if (suspended) return;
    const text = getSnapshotText();
    if (undoStack.length && undoStack[undoStack.length - 1] === text) return;
    undoStack.push(text);
    redoStack.length = 0;
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
    snapshot,
    undo,
    redo,
    canUndo,
    canRedo,
    resetBaselineFromCurrent,
    withSuspend,
    _debug: { undoStack, redoStack },
  };
}
