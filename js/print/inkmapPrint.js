const inkmap = window["@camptocamp/inkmap"];

function openBlob(blob, filename = "truegis-map.pdf") {
  const url = URL.createObjectURL(blob);
  const win = window.open(url, "_blank");
  if (!win) {
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
  }
}

export async function inkmapPrint(spec) {
  const blob = await inkmap.print(spec);
  openBlob(blob, "truegis-scaled-print.pdf");
}

export async function inkmapPrintMany(specs, { filename = "truegis-ddp-print.pdf", onProgress } = {}) {
  if (!Array.isArray(specs) || !specs.length) {
    throw new Error("No DDP pages available to print.");
  }

  const PDFLib = window.PDFLib;
  if (!PDFLib?.PDFDocument) {
    throw new Error("PDF merger failed to load. Check your connection and try again.");
  }

  const merged = await PDFLib.PDFDocument.create();

  for (let i = 0; i < specs.length; i += 1) {
    onProgress?.(i + 1, specs.length);
    const blob = await inkmap.print(specs[i]);
    const bytes = await blob.arrayBuffer();
    const pdf = await PDFLib.PDFDocument.load(bytes);
    const pages = await merged.copyPages(pdf, pdf.getPageIndices());
    for (const page of pages) merged.addPage(page);
  }

  const mergedBytes = await merged.save();
  const blob = new Blob([mergedBytes], { type: "application/pdf" });
  openBlob(blob, filename);
}
