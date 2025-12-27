export const $ = (id) =>
  document.getElementById(
    typeof id === "string" && id.startsWith("#") ? id.slice(1) : id
  );

export function must$(id) {
  const el = $(id);
  if (!el) throw new Error(`Missing element #${id}`);
  return el;
}
