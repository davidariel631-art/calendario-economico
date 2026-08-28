// RESULTADO FISCAL MENSUAL — Hacienda, SPN base caja
// ---------------------------------------------------
// Publica sólo la planilla "Base Caja — En millones de pesos" adjunta a cada
// comunicado oficial. Los importes se guardan en millones de ARS corrientes.

import XLSX from "xlsx";
import { getDb } from "./firebase-admin.js";

export const FISCAL_INDEX_URL =
  "https://www.argentina.gob.ar/node/85786/noticias";
const landingHeaders = {
  "User-Agent": "Mozilla/5.0 (compatible; KRAX/1.0)",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
};
const excelHeaders = {
  ...landingHeaders,
  Accept:
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/octet-stream;q=0.9,*/*;q=0.8",
  Referer: FISCAL_INDEX_URL,
};
const MONTHS = {
  enero: "01",
  febrero: "02",
  marzo: "03",
  abril: "04",
  mayo: "05",
  junio: "06",
  julio: "07",
  agosto: "08",
  septiembre: "09",
  octubre: "10",
  noviembre: "11",
  diciembre: "12",
};

function stripHtml(value = "") {
  return value
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
function rowValue(rows, startsWith) {
  const row = rows.find((items) =>
    items.some(
      (item) => typeof item === "string" && item.trim().startsWith(startsWith),
    ),
  );
  if (!row) throw new Error(`No se encontró la fila fiscal ${startsWith}.`);
  const number = [...row]
    .reverse()
    .find((item) => typeof item === "number" && Number.isFinite(item));
  if (typeof number !== "number")
    throw new Error(`No se encontró total numérico para ${startsWith}.`);
  return number;
}

function optionalRowValue(rows, startsWith) {
  try {
    return rowValue(rows, startsWith);
  } catch {
    return undefined;
  }
}

function reportMonth(rows, sourceFile) {
  const normalized = `${rows
    .flat()
    .filter((item) => typeof item === "string")
    .join(
      " ",
    )} ${decodeURIComponent(sourceFile).replaceAll("_", " ").replaceAll("-", " ")}`
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  const match = normalized.match(
    /\b(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\s+(?:de\s+)?(20\d{2})\b/,
  );
  if (!match || !MONTHS[match[1]])
    throw new Error("No se pudo identificar el mes y año del informe fiscal.");
  return `${match[2]}-${MONTHS[match[1]]}`;
}

export async function fiscalArticleUrls(pages = 1) {
  const urls = [];
  for (let page = 0; page < pages; page += 1) {
    const target = page ? `${FISCAL_INDEX_URL}?page=${page}` : FISCAL_INDEX_URL;
    const response = await fetch(target, { headers: landingHeaders });
    if (!response.ok)
      throw new Error(`Índice fiscal: HTTP ${response.status}.`);
    const html = await response.text();
    for (const match of html.matchAll(
      /href="([^"?#]*\/noticias\/[^"?#]+)"/gi,
    )) {
      const url = new URL(match[1], FISCAL_INDEX_URL).href;
      if (/sector-publico-nacional/i.test(url)) urls.push(url);
    }
  }
  return [...new Set(urls)];
}

export async function readFiscalArticle(articleUrl) {
  const article = await fetch(articleUrl, { headers: landingHeaders });
  if (!article.ok)
    throw new Error(`Publicación fiscal: HTTP ${article.status}.`);
  const html = await article.text();
  const files = [...html.matchAll(/href="([^"?#]*\.xlsx)"/gi)].map(
    (match) => new URL(match[1].replaceAll("&amp;", "&"), articleUrl).href,
  );
  const sourceFile = files.find((url) => !/imig/i.test(url));
  if (!sourceFile)
    throw new Error(
      "No se encontró la planilla de base caja en la publicación fiscal.",
    );
  const response = await fetch(sourceFile, {
    headers: { ...excelHeaders, Referer: articleUrl },
  });
  if (!response.ok)
    throw new Error(`Planilla fiscal: HTTP ${response.status}.`);
  const workbook = XLSX.read(Buffer.from(await response.arrayBuffer()), {
    type: "buffer",
    cellDates: false,
  });
  const sheets = workbook.SheetNames.map((name) => ({
    name,
    rows: XLSX.utils.sheet_to_json(workbook.Sheets[name], {
      header: 1,
      raw: true,
      defval: null,
    }),
  }));
  const preferredAif = sheets.find(({ name }) => /^AIF$/i.test(name.trim()));
  const preferred = sheets.find(({ rows }) => {
    const content = rows
      .flat()
      .filter((item) => typeof item === "string")
      .join(" ")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toUpperCase();
    return (
      !content.includes("VARIACION ANUAL") &&
      content.includes("SECTOR PUBLICO") &&
      content.includes("RESULTADO PRIMARIO") &&
      content.includes("RESULTADO FINANCIERO")
    );
  });
  const fallback = sheets.find(({ rows }) =>
    rows.some((row) =>
      row.some(
        (item) =>
          typeof item === "string" && item.includes("RESULTADO PRIMARIO"),
      ),
    ),
  );
  const rows = (preferredAif ?? preferred ?? fallback ?? sheets[0]).rows;
  const accumulated = sheets.find(
    ({ name, rows: candidate }) =>
      /acumulado/i.test(name) ||
      candidate
        .flat()
        .some(
          (item) =>
            typeof item === "string" &&
            /acumulado\s+a\s+(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)/i.test(
              item,
            ),
        ),
  );
  const fecha = reportMonth(rows, sourceFile);
  const primario = rowValue(rows, "RESULTADO PRIMARIO");
  const financiero = rowValue(rows, "RESULTADO FINANCIERO");
  const ingresos = optionalRowValue(rows, "INGRESOS ANTES DE FIGURAT.");
  const gastosPrimarios = optionalRowValue(
    rows,
    "GASTOS PRIMARIOS DESPUES DE FIGURAT.",
  );
  const primarioAcumulado = accumulated
    ? optionalRowValue(accumulated.rows, "RESULTADO PRIMARIO")
    : undefined;
  const financieroAcumulado = accumulated
    ? optionalRowValue(accumulated.rows, "RESULTADO FINANCIERO")
    : undefined;
  return {
    fecha: `${fecha}-01`,
    periodo: fecha,
    primario,
    financiero,
    ingresos,
    gastosPrimarios,
    primarioAcumulado,
    financieroAcumulado,
    acumuladoHasta: accumulated ? fecha : undefined,
    unidad: "Millones de ARS corrientes",
    base: "Caja",
    alcance: "Sector Público Nacional (SPN), ejecución provisoria base caja.",
    fuente: "Secretaría de Hacienda · Resultado fiscal mensual",
    sourceUrl: articleUrl,
    sourceFile,
    scrapedAt: new Date().toISOString(),
  };
}

export async function latestFiscalRecord() {
  if (process.env.FISCAL_ARTICLE_URL)
    return readFiscalArticle(process.env.FISCAL_ARTICLE_URL);
  const [latest] = await fiscalArticleUrls(1);
  if (!latest)
    throw new Error(
      "No se encontró una publicación de resultado fiscal en el índice oficial.",
    );
  return readFiscalArticle(latest);
}

async function main() {
  const record = await latestFiscalRecord();
  if (process.env.DRY_RUN === "1") {
    console.log(
      `✅ prueba fiscal ${record.periodo}: primario ${record.primario.toFixed(1)} M · financiero ${record.financiero.toFixed(1)} M · acumulado primario ${record.primarioAcumulado?.toFixed(1) ?? "no publicado"} M`,
    );
    return;
  }
  const db = getDb();
  const root = db.collection("indicadores").doc("resultado_fiscal");
  await root.set({ ultimo: record }, { merge: true });
  await root
    .collection("historico")
    .doc(record.periodo)
    .set(record, { merge: true });
  console.log(
    `✅ resultado fiscal ${record.periodo}: primario ${record.primario.toFixed(1)} M · financiero ${record.financiero.toFixed(1)} M`,
  );
}

if (import.meta.url === `file://${process.argv[1]}`)
  main().catch((error) => {
    console.error("❌ Resultado fiscal:", error.message);
    process.exit(1);
  });
