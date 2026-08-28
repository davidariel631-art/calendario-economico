// INVERSIÓN EXTRANJERA DIRECTA — BCRA, serie trimestral desde 2017
// -----------------------------------------------------------------
// Publica los flujos transaccionales totales del Relevamiento de Activos y
// Pasivos Externos. No se mezcla con la serie previa a 2017: el BCRA advierte
// diferencias metodológicas entre relevamientos.

import XLSX from "xlsx";
import { getDb } from "./firebase-admin.js";

const SOURCE_URL =
  "https://www.bcra.gob.ar/archivos/Pdfs/PublicacionesEstadisticas/informes/anexo-informe-inversion-extranjera-directa.xlsx";
const SOURCE_PAGE =
  "https://www.bcra.gob.ar/informe-de-inversion-extranjera-directa/";
const monthForQuarter = { 1: "03-31", 2: "06-30", 3: "09-30", 4: "12-31" };

function text(value) {
  return String(value ?? "").trim();
}

async function readIed() {
  const response = await fetch(SOURCE_URL, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; KRAX/1.0)",
      Referer: SOURCE_PAGE,
    },
  });
  if (!response.ok) throw new Error(`Anexo IED BCRA: HTTP ${response.status}.`);
  const workbook = XLSX.read(Buffer.from(await response.arrayBuffer()), {
    type: "buffer",
    cellDates: false,
  });
  const sheetName = workbook.SheetNames.find((name) =>
    /^Cuadro\s*5$/i.test(name.trim()),
  );
  if (!sheetName)
    throw new Error(
      "Anexo IED: no se encontró el Cuadro 5 de flujos trimestrales.",
    );
  const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
    header: 1,
    raw: true,
    defval: null,
  });
  const headerRow = rows.findIndex(
    (row) =>
      row.some((item) => /Total de Transacciones/i.test(text(item))) &&
      row.some((item) => /Aportes netos/i.test(text(item))),
  );
  if (headerRow < 0)
    throw new Error("Anexo IED: no se encontró encabezado de flujos.");
  const header = rows[headerRow].map(text);
  const totalIndex = header.findIndex((item) =>
    /Total de Transacciones/i.test(item),
  );
  if (totalIndex < 0)
    throw new Error(
      "Anexo IED: no se encontró columna Total de Transacciones.",
    );
  const series = [];
  let year = null;
  for (const row of rows.slice(headerRow + 1)) {
    const label = text(row[0]);
    if (/^20\d{2}$/.test(label)) {
      year = label;
      continue;
    }
    const quarter = /^Trim\.?\s*([1-4])$/i.exec(label)?.[1];
    const total = Number(row[totalIndex]);
    if (
      !year ||
      !quarter ||
      !Number.isFinite(total) ||
      Math.abs(total) > 1000000
    )
      continue;
    series.push({
      fecha: `${year}-${monthForQuarter[quarter]}`,
      periodo: `${year}T${quarter}`,
      totalTransaccionesUSD: total,
      valor: total,
      unidad: "Millones de USD",
      definicion: "Flujos transaccionales totales de IED",
      fuente: "BCRA · Relevamiento de Activos y Pasivos Externos",
      sourceUrl: SOURCE_PAGE,
      sourceFile: SOURCE_URL,
      scrapedAt: new Date().toISOString(),
    });
  }
  if (!series.length)
    throw new Error("Anexo IED: no se pudo reconstruir la serie trimestral.");
  return series.sort((a, b) => a.fecha.localeCompare(b.fecha));
}

async function main() {
  const series = await readIed();
  const latest = series.at(-1);
  if (process.env.DRY_RUN === "1") {
    console.log(
      `✅ prueba IED: ${series.length} trimestres · ${series[0].periodo}–${latest.periodo} · USD ${latest.totalTransaccionesUSD.toFixed(1)} M`,
    );
    return;
  }
  const db = getDb();
  const root = db.collection("indicadores").doc("ied_directa");
  for (let start = 0; start < series.length; start += 450) {
    const batch = db.batch();
    series
      .slice(start, start + 450)
      .forEach((record) =>
        batch.set(root.collection("historico").doc(record.periodo), record, {
          merge: true,
        }),
      );
    await batch.commit();
  }
  await root.set(
    {
      ultimo: latest,
      descripcion:
        "Flujos transaccionales de inversión extranjera directa desde 2017",
      coberturaDesde: series[0].periodo,
      coberturaHasta: latest.periodo,
      notaMetodologica:
        "No comparable con la serie 2004–2016 por diferencias metodológicas advertidas por el BCRA.",
    },
    { merge: true },
  );
  console.log(
    `✅ IED: ${series.length} trimestres · ${latest.periodo} · USD ${latest.totalTransaccionesUSD.toFixed(1)} M`,
  );
}

main().catch((error) => {
  console.error("❌ Inversión directa BCRA:", error.message);
  process.exit(1);
});
