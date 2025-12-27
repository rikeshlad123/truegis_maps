const inkmap = window["@camptocamp/inkmap"];

export async function inkmapPrint(spec) {
  const blob = await inkmap.print(spec);
  const url = URL.createObjectURL(blob);
  window.open(url, "_blank");
}
