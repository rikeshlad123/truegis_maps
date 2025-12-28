const KEY = "truegis_autosave_v1";

export function loadAutosave() {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function saveAutosave(text) {
  try {
    localStorage.setItem(KEY, text);
  } catch {
    // ignore
  }
}

export function clearAutosave() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}
