import { CONFIG } from "../config.js";

export async function nominatimSearch(query) {
  const url = new URL(CONFIG.NOMINATIM_URL);
  url.searchParams.set("format", "json");
  url.searchParams.set("q", query);

  const res = await fetch(url.toString(), {
    headers: { Accept: "application/json" }
  });

  if (!res.ok) throw new Error("Nominatim request failed");
  const data = await res.json();
  return Array.isArray(data) && data.length ? data[0] : null;
}
