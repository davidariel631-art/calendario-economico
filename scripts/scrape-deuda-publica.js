// DEUDA PÚBLICA — Secretaría de Finanzas (fuente primaria)
// ----------------------------------------------------------
// Descarga el Excel trimestral oficial y conserva las métricas de alcance
// explícito: Deuda Bruta de la Administración Central. No confunde este
// stock con deuda externa total, ni convierte sus señales en una nota de país.

import XLSX from 'xlsx';
import { getDb } from './firebase-admin.js';

const LANDING_URL = 'https://www.argentina.gob.ar/economia/finanzas/datos-trimestrales-de-la-deuda';

const browserHeaders = {
  'User-Agent': 'Mozilla/5.0 (compatible; KRAX/1.0; +https://davidariel631-art.github.io/calendario-economico/)',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
};

export async function debtSourceFiles() {
  const response = await fetch(LANDING_URL, { headers: browserHeaders });
  if (!response.ok) throw new Error(`Página de deuda pública: HTTP ${response.status}.`);
  const html = await response.text();
  const files = [...html.matchAll(/href="([^"]*deuda[^"?#]*\.xlsx)"/gi)].map((match) => new URL(match[1].replaceAll('&amp;', '&'), LANDING_URL).href);
  const uniqueFiles = [...new Set(files)];
  if (!uniqueFiles.length) throw new Error('No se encontraron enlaces Excel de deuda pública en la página oficial.');
  return uniqueFiles;
}

function rowsFor(workbook, sheetName) {
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) throw new Error(`No existe la hoja ${sheetName} en el archivo oficial.`);
  return XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: null });
}

function findRow(rows, label) {
  const row = rows.find((values) => values.some((value) => typeof value === 'string' && value.trim().startsWith(label)));
  if (!row) throw new Error(`No se encontró la fila "${label}" en la fuente oficial.`);
  return row;
}

function firstNumberAfterLabel(row, label) {
  const index = row.findIndex((value) => typeof value === 'string' && value.trim().startsWith(label));
  const value = row.slice(index + 1).find((item) => typeof item === 'number' && Number.isFinite(item));
  if (typeof value !== 'number') throw new Error(`No se encontró un valor numérico para "${label}".`);
  return value;
}

function lastNumberAfterLabel(row, label) {
  const index = row.findIndex((value) => typeof value === 'string' && value.trim().startsWith(label));
  const values = row.slice(index + 1).filter((item) => typeof item === 'number' && Number.isFinite(item));
  const value = values.at(-1);
  if (typeof value !== 'number') throw new Error(`No se encontró el último valor numérico para "${label}".`);
  return value;
}

function assertRange(label, value, min, max) {
  if (!Number.isFinite(value) || value < min || value > max) throw new Error(`${label} fuera de rango de control: ${value}.`);
}

function reportDate(rows) {
  const text = rows.flat().find((value) => typeof value === 'string' && /al\s+\d{2}\/\d{2}\/\d{4}/i.test(value));
  const match = typeof text === 'string' ? text.match(/(\d{2})\/(\d{2})\/(\d{4})/) : null;
  if (!match) throw new Error('No se encontró la fecha de corte del informe oficial.');
  const [, day, month, year] = match;
  const quarter = Math.ceil(Number(month) / 3);
  return { fecha: `${year}-${month}-${day}`, periodo: `${quarter}T ${year}` };
}

export async function readDebtRecord(sourceFile) {
  const response = await fetch(sourceFile, {
    headers: {
      ...browserHeaders,
      Accept: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/octet-stream;q=0.9,*/*;q=0.8',
      Referer: LANDING_URL,
    },
  });
  if (!response.ok) throw new Error(`Excel de deuda pública: HTTP ${response.status}.`);
  const workbook = XLSX.read(Buffer.from(await response.arrayBuffer()), { type: 'buffer', cellDates: false });
  const instrumentRows = rowsFor(workbook, 'A.1.1');
  const currencyRows = rowsFor(workbook, 'A.1.4');
  const rateRows = rowsFor(workbook, 'A.1.5');
  const lifeRows = rowsFor(workbook, 'A.1.6');
  const quarterlyRows = rowsFor(workbook, 'A.2.1');
  const { fecha, periodo } = reportDate(instrumentRows);

  const stockMillonesUSD = firstNumberAfterLabel(findRow(instrumentRows, 'II- DEUDA BRUTA'), 'II- DEUDA BRUTA') / 1000;
  const paymentNormalMillonesUSD = firstNumberAfterLabel(findRow(instrumentRows, 'III- DEUDA EN SITUACIÓN DE PAGO NORMAL'), 'III- DEUDA EN SITUACIÓN DE PAGO NORMAL') / 1000;
  const localMillonesUSD = firstNumberAfterLabel(findRow(currencyRows, 'Moneda local'), 'Moneda local') / 1000;
  const foreignMillonesUSD = firstNumberAfterLabel(findRow(currencyRows, 'Moneda extranjera'), 'Moneda extranjera') / 1000;
  const cerMillonesUSD = firstNumberAfterLabel(findRow(currencyRows, 'Deuda ajustable por CER'), 'Deuda ajustable por CER') / 1000;
  const weightedRatePct = firstNumberAfterLabel(findRow(rateRows, 'TASA PROMEDIO PONDERADA TOTAL'), 'TASA PROMEDIO PONDERADA TOTAL') * 100;
  const avgLifeYears = firstNumberAfterLabel(findRow(lifeRows, 'VIDA PROMEDIO TOTAL'), 'VIDA PROMEDIO TOTAL');
  const shortTermMillonesUSD = lastNumberAfterLabel(findRow(quarterlyRows, 'IV- CORTO PLAZO'), 'IV- CORTO PLAZO') / 1000;

  assertRange('Deuda bruta (millones USD)', stockMillonesUSD, 100000, 1000000);
  assertRange('Vida promedio (años)', avgLifeYears, 0.1, 100);
  assertRange('Tasa promedio ponderada (%)', weightedRatePct, 0, 100);

  const registro = {
    stockMillonesUSD,
    pagoNormalPct: paymentNormalMillonesUSD / stockMillonesUSD * 100,
    monedaLocalPct: localMillonesUSD / stockMillonesUSD * 100,
    monedaExtranjeraPct: foreignMillonesUSD / stockMillonesUSD * 100,
    cerPct: cerMillonesUSD / stockMillonesUSD * 100,
    tasaPromedioPct: weightedRatePct,
    vidaPromedioAnios: avgLifeYears,
    cortoPlazoMillonesUSD: shortTermMillonesUSD,
    fecha,
    periodo,
    alcance: 'Deuda Bruta de la Administración Central; no equivale a deuda externa total ni consolida provincias, municipios o empresas públicas.',
    fuente: 'Secretaría de Finanzas · Datos trimestrales de la deuda',
    sourceUrl: LANDING_URL,
    sourceFile,
    scrapedAt: new Date().toISOString(),
  };

  return registro;
}

async function main() {
  const [latestSourceFile] = await debtSourceFiles();
  const registro = await readDebtRecord(latestSourceFile);
  if (process.env.DRY_RUN === '1') {
    console.log(`✅ prueba deuda pública ${registro.fecha}: USD ${registro.stockMillonesUSD.toFixed(2)} millones · moneda local ${registro.monedaLocalPct.toFixed(2)}%`);
    return;
  }
  const db = getDb();
  await db.collection('indicadores').doc('deuda_publica').set({ ultimo: registro }, { merge: true });
  await db.collection('indicadores').doc('deuda_publica').collection('historico').doc(fecha).set(registro, { merge: true });
  console.log(`✅ deuda pública ${fecha}: USD ${stockMillonesUSD.toFixed(2)} millones · moneda local ${registro.monedaLocalPct.toFixed(2)}%`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => { console.error('❌ Deuda pública:', error.message); process.exit(1); });
}
