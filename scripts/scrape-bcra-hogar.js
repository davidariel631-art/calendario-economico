// ÍNDICES DE HOGAR — BCRA, Principales Variables v4.0
// ------------------------------------------------------
// ICL (40) y UVA (31) se publican diariamente por el BCRA. El script usa la
// API primaria, guarda fecha y fuente, y permite un backfill manual del tramo
// que la propia API expone. No proyecta ni completa valores anteriores.

import { getDb } from "./firebase-admin.js";

const BASE_URL = "https://api.bcra.gob.ar/estadisticas/v4.0/monetarias";
const INDICES = [
  {
    key: "icl",
    id: 40,
    descripcion: "Índice para Contratos de Locación (base 30.6.20=1)",
    unidad: "Índice",
    rango: [1, 10000],
  },
  {
    key: "uva",
    id: 31,
    descripcion: "Unidad de valor adquisitivo (base 31.3.16=14.05)",
    unidad: "ARS por UVA",
    rango: [1, 100000],
  },
];

async function readVariable(index) {
  const response = await fetch(`${BASE_URL}/${index.id}`, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; KRAX/1.0)" },
  });
  if (!response.ok)
    throw new Error(`BCRA variable ${index.id}: HTTP ${response.status}.`);
  const data = await response.json();
  const today = new Date().toISOString().slice(0, 10);
  const points = (data?.results?.[0]?.detalle ?? [])
    .filter(
      (item) =>
        item?.fecha &&
        item.fecha <= today &&
        Number.isFinite(Number(item?.valor)),
    )
    .map((item) => ({ fecha: item.fecha, valor: Number(item.valor) }))
    .sort((a, b) => a.fecha.localeCompare(b.fecha));
  if (!points.length)
    throw new Error(`BCRA variable ${index.id}: sin detalle histórico.`);
  const latest = points.at(-1);
  if (!latest || latest.valor < index.rango[0] || latest.valor > index.rango[1])
    throw new Error(`${index.key}: valor fuera de rango de control.`);
  const source = `BCRA · API Principales Variables v4.0 · variable ${index.id}`;
  return {
    ...index,
    points,
    latest: {
      ...latest,
      unidad: index.unidad,
      fuente: source,
      scrapedAt: new Date().toISOString(),
    },
  };
}

async function saveIndex(db, data) {
  const root = db.collection("indicadores").doc(data.key);
  if (process.env.BACKFILL === "1") {
    if (process.env.DRY_RUN === "1") {
      console.log(
        `✅ prueba backfill ${data.key}: ${data.points.length} días · ${data.points[0].fecha}–${data.points.at(-1).fecha}`,
      );
      return;
    }
    for (let start = 0; start < data.points.length; start += 450) {
      const batch = db.batch();
      data.points
        .slice(start, start + 450)
        .forEach((point) =>
          batch.set(
            root.collection("historico").doc(point.fecha),
            {
              ...point,
              unidad: data.unidad,
              fuente: data.latest.fuente,
              scrapedAt: data.latest.scrapedAt,
            },
            { merge: true },
          ),
        );
      await batch.commit();
    }
    await root.set(
      {
        ultimo: data.latest,
        backfillDesde: data.points[0].fecha,
        backfillHasta: data.points.at(-1).fecha,
        descripcion: data.descripcion,
        historialFuente: data.latest.fuente,
      },
      { merge: true },
    );
    console.log(
      `✅ backfill ${data.key}: ${data.points.length} días · ${data.points[0].fecha}–${data.points.at(-1).fecha}`,
    );
    return;
  }
  await root.set(
    { ultimo: data.latest, descripcion: data.descripcion },
    { merge: true },
  );
  await root
    .collection("historico")
    .doc(data.latest.fecha)
    .set(data.latest, { merge: true });
  console.log(`✅ ${data.key}: ${data.latest.fecha} · ${data.latest.valor}`);
}

async function main() {
  const records = await Promise.all(INDICES.map(readVariable));
  if (process.env.DRY_RUN === "1" && process.env.BACKFILL !== "1") {
    records.forEach((data) =>
      console.log(
        `✅ prueba ${data.key}: ${data.latest.fecha} · ${data.latest.valor}`,
      ),
    );
    return;
  }
  const db = getDb();
  for (const record of records) await saveIndex(db, record);
}

main().catch((error) => {
  console.error("❌ Índices de hogar BCRA:", error.message);
  process.exit(1);
});
