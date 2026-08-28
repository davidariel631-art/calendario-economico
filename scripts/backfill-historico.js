// CARGA INICIAL DE HISTÓRICO (correr UNA SOLA VEZ)
// ------------------------------------------------------------------
// El scraper diario (scrape-indicadores-mercado.js) solo guarda UN dato
// por corrida, así que el histórico en Firestore recién empieza a
// acumularse desde el día que lo prendiste — para calculadoras como la de
// ajuste de alquiler (ICL/UVA), eso significa meses de espera hasta tener
// suficiente profundidad real.
//
// Este script soluciona eso de una vez: trae el histórico COMPLETO (años)
// de ICL, UVA y Riesgo País desde ArgentinaDatos (server-side, sin
// problema de CORS acá) y carga todo de golpe en Firestore. Se corre UNA
// SOLA VEZ (o cada tanto si querés refrescar el pasado, no hace daño
// repetirlo — usa "merge" así que no duplica nada).

import { getDb } from './firebase-admin.js';

async function getJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
  return res.json();
}

async function backfillSerie(db, key, url, mapFn) {
  console.log(`Descargando histórico completo de ${key}...`);
  const data = await getJson(url);
  const items = data.map(mapFn).filter(r => r && r.fecha && typeof r.valor === 'number');

  const col = db.collection('indicadores').doc(key).collection('historico');
  const CHUNK = 400; // Firestore tiene un límite de 500 operaciones por batch
  let escritos = 0;
  for (let i = 0; i < items.length; i += CHUNK) {
    const batch = db.batch();
    for (const item of items.slice(i, i + CHUNK)) {
      batch.set(col.doc(item.fecha), item, { merge: true });
    }
    await batch.commit();
    escritos += Math.min(CHUNK, items.length - i);
    console.log(`  ...${escritos}/${items.length}`);
  }

  // Actualizamos también "ultimo" con el dato más reciente de esta serie.
  if (items.length) {
    const ultimo = items[items.length - 1];
    await db.collection('indicadores').doc(key).set({ ultimo }, { merge: true });
  }
  console.log(`✅ ${key}: ${items.length} registros históricos cargados`);
}

async function main() {
  const db = getDb();

  await backfillSerie(
    db, 'icl',
    'https://api.argentinadatos.com/v1/finanzas/indices/icl',
    d => ({ valor: d.valor, fecha: d.fecha, fuente: 'ArgentinaDatos (carga histórica inicial)' })
  );

  await backfillSerie(
    db, 'uva',
    'https://api.argentinadatos.com/v1/finanzas/indices/uva',
    d => ({ valor: d.valor, fecha: d.fecha, fuente: 'ArgentinaDatos (carga histórica inicial)' })
  );

  await backfillSerie(
    db, 'riesgo_pais',
    'https://api.argentinadatos.com/v1/finanzas/indices/riesgo-pais',
    d => ({ valor: d.valor, fecha: d.fecha, fuente: 'ArgentinaDatos (carga histórica inicial)' })
  );

  console.log('✅ Backfill completo. De acá en más, el scraper diario sigue sumando un día más arriba de esta base.');
}

main().catch(err => {
  console.error('❌ Error en el backfill:', err.message);
  process.exit(1);
});
