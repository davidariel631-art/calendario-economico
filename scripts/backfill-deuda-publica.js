// BACKFILL DEUDA PÚBLICA — Secretaría de Finanzas
// -------------------------------------------------
// Recorre los Excel trimestrales visibles en la página oficial y guarda sólo
// los últimos cinco años. Se ejecuta manualmente: no descarga el archivo
// histórico completo en la rutina diaria.

import { getDb } from './firebase-admin.js';
import { debtSourceFiles, readDebtRecord } from './scrape-deuda-publica.js';

const YEARS = 5;

async function main() {
  const floor = `${new Date().getUTCFullYear() - YEARS}-01-01`;
  const files = await debtSourceFiles();
  const records = [];
  for (const file of files) {
    try {
      const record = await readDebtRecord(file);
      if (record.fecha >= floor) records.push(record);
    } catch (error) {
      console.warn(`⚠️  Deuda omitida (${file.split('/').at(-1)}): ${error.message}`);
    }
  }
  const unique = [...new Map(records.map((record) => [record.fecha, record])).values()].sort((a, b) => a.fecha.localeCompare(b.fecha));
  if (!unique.length) throw new Error(`No se extrajeron informes de deuda desde ${floor}.`);
  if (process.env.DRY_RUN === '1') {
    console.log(`✅ prueba backfill deuda: ${unique.length} trimestres · ${unique[0].fecha}–${unique.at(-1).fecha}`);
    return;
  }
  const db = getDb();
  const batch = db.batch();
  const root = db.collection('indicadores').doc('deuda_publica');
  unique.forEach((record) => batch.set(root.collection('historico').doc(record.fecha), record, { merge: true }));
  batch.set(root, { ultimo: unique.at(-1), backfillDesde: unique[0].fecha, backfillHasta: unique.at(-1).fecha, historialFuente: 'Secretaría de Finanzas · Datos trimestrales de la deuda' }, { merge: true });
  await batch.commit();
  console.log(`✅ backfill deuda: ${unique.length} trimestres · ${unique[0].fecha}–${unique.at(-1).fecha}`);
}

main().catch((error) => { console.error('❌ Backfill deuda pública:', error.message); process.exit(1); });
