// BACKFILL FISCAL — últimos cinco años de publicaciones SPN base caja.
import { getDb } from './firebase-admin.js';
import { fiscalArticleUrls, readFiscalArticle } from './scrape-resultado-fiscal.js';

const YEARS = 5;
const INDEX_PAGES = Number(process.env.INDEX_PAGES ?? 8);

async function main() {
  const floor = `${new Date().getUTCFullYear() - YEARS}-01-01`;
  const urls = await fiscalArticleUrls(INDEX_PAGES);
  const records = [];
  for (const url of urls) {
    try {
      const record = await readFiscalArticle(url);
      if (record.fecha >= floor) records.push(record);
    } catch (error) {
      console.warn(`⚠️  Fiscal omitido (${url.split('/').at(-1)}): ${error.message}`);
    }
  }
  const unique = [...new Map(records.map((record) => [record.periodo, record])).values()].sort((a, b) => a.periodo.localeCompare(b.periodo));
  if (!unique.length) throw new Error(`No se extrajeron informes fiscales desde ${floor}.`);
  if (process.env.DRY_RUN === '1') {
    console.log(`✅ prueba backfill fiscal: ${unique.length} meses · ${unique[0].periodo}–${unique.at(-1).periodo}`);
    return;
  }
  const db = getDb();
  const batch = db.batch();
  const root = db.collection('indicadores').doc('resultado_fiscal');
  unique.forEach((record) => batch.set(root.collection('historico').doc(record.periodo), record, { merge: true }));
  batch.set(root, { ultimo: unique.at(-1), backfillDesde: unique[0].periodo, backfillHasta: unique.at(-1).periodo, historialFuente: 'Secretaría de Hacienda · publicaciones mensuales SPN base caja' }, { merge: true });
  await batch.commit();
  console.log(`✅ backfill fiscal: ${unique.length} meses · ${unique[0].periodo}–${unique.at(-1).periodo}`);
}

main().catch((error) => { console.error('❌ Backfill fiscal:', error.message); process.exit(1); });
