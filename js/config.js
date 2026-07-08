export const CONFIG = {
  DPI: 150,

  // Existing A4 usable map-frame sizes, kept for backwards compatibility.
  PAPER_SIZES: {
    landscape: [277, 170],
    portrait: [170, 277],
  },

  // Usable print areas in millimetres. These are slightly smaller than full ISO
  // paper sizes so scale bars, north arrows, margins and labels do not sit hard
  // on the edge of the PDF.
  PAPER_SIZE_PRESETS: {
    A4: {
      landscape: [277, 170],
      portrait: [170, 277],
    },
    A3: {
      landscape: [400, 277],
      portrait: [277, 400],
    },
    A2: {
      landscape: [574, 400],
      portrait: [400, 574],
    },
    A1: {
      landscape: [821, 574],
      portrait: [574, 821],
    },
    A0: {
      landscape: [1169, 821],
      portrait: [821, 1169],
    },
  },

  STANDARD_SCALES: [500, 750, 1000, 1250, 2500, 5000, 7500, 10000, 25000, 50000],

  NOMINATIM_URL: "https://nominatim.openstreetmap.org/search",
};

export function getPaperSizeMM(paperSize = "A4", orientation = "landscape") {
  const preset = CONFIG.PAPER_SIZE_PRESETS[paperSize] || CONFIG.PAPER_SIZE_PRESETS.A4;
  return preset[orientation] || preset.landscape;
}
