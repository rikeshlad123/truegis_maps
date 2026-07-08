import { buildInkmapSpec } from "../print/spec.js";
import { inkmapPrintMany } from "../print/inkmapPrint.js";
import { exportDdpGeoJSON, generateSmartDdpIndex } from "./smartDdp.js";

const $ = (id) => document.querySelector(id);

function bindClick(id, handler) {
  const el = $(id);
  if (el) el.onclick = handler;
}

function downloadText(text, filename, type = "application/json") {
  const blob = new Blob([text], { type });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
}

function readOptions(store) {
  const state = store.getState();
  return {
    paperSize: $("#paperSize")?.value || state.paperSize || "A4",
    orientation: $("#orientation")?.value || state.orientation || "landscape",
    scale: Number($("#scale")?.value || state.scale || 5000),
    bufferMeters: Number($("#ddpBuffer")?.value || 0),
    overlapPct: Number($("#ddpOverlap")?.value || 20),
  };
}

function setStatus(message) {
  const el = $("#ddpStatus");
  if (el) el.textContent = message;
}

function pageCenter(feature) {
  const e = feature.getGeometry().getExtent();
  return [(e[0] + e[2]) / 2, (e[1] + e[3]) / 2];
}

function createPages({ app, store }) {
  const opts = readOptions(store);
  const pages = generateSmartDdpIndex({ vectorSource: app.vectorSource, ...opts });
  app.ddpSource.clear();
  app.ddpSource.addFeatures(pages);
  setStatus(`${pages.length} north-up DDP page${pages.length === 1 ? "" : "s"} created`);
  return pages;
}

export function bindDdpUI({ app, store }) {
  // Paper size affects normal scaled print as well as DDP print.
  $("#paperSize")?.addEventListener("change", () => {
    store.setState({ paperSize: $("#paperSize").value });
    app.preview?.update?.();
  });

  bindClick("#generateDdp", () => {
    try {
      createPages({ app, store });
    } catch (e) {
      console.error("DDP generation failed:", e);
      alert(e.message || "DDP generation failed.");
    }
  });

  bindClick("#clearDdp", () => {
    app.ddpSource?.clear?.();
    setStatus("DDP layer cleared");
  });

  bindClick("#exportDdp", () => {
    const count = app.ddpSource?.getFeatures?.().length || 0;
    if (!count) return alert("Create DDP pages first.");
    const text = exportDdpGeoJSON({ ddpSource: app.ddpSource });
    downloadText(text, "truegis-ddp-index.geojson", "application/geo+json");
  });

  bindClick("#printDdp", async () => {
    const btn = $("#printDdp");
    try {
      if (btn) btn.disabled = true;

      let pages = app.ddpSource?.getFeatures?.().filter((f) => f.get("__truegis_ddp")) || [];
      if (!pages.length) pages = createPages({ app, store });

      pages = pages.slice().sort((a, b) => Number(a.get("page_no")) - Number(b.get("page_no")));
      const opts = readOptions(store);
      const specs = pages.map((page) =>
        buildInkmapSpec({
          app,
          store,
          center3857: pageCenter(page),
          scaleOverride: page.get("scale") || opts.scale,
          paperSizeOverride: page.get("paper_size") || opts.paperSize,
          ddpFeature: page,
        })
      );

      await inkmapPrintMany(specs, {
        filename: "truegis-ddp-multipage-print.pdf",
        onProgress: (page, total) => setStatus(`Printing DDP page ${page} of ${total}...`),
      });
      setStatus(`Multi-page PDF created (${pages.length} pages)`);
    } catch (e) {
      console.error("DDP print failed:", e);
      alert(e.message || "DDP print failed.");
    } finally {
      if (btn) btn.disabled = false;
    }
  });
}
