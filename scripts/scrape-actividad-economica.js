// ACTIVIDAD ECONÓMICA (EMAE) — para la nueva interfaz React
// ------------------------------------------------------------------
// La app nueva pide "indicadores/actividad_economica" y hasta ahora NADIE
// lo escribía (ni el sitio viejo, que lo pedía en vivo directo a la API
// en el navegador, ni ningún script de este scraper). Se detectó en la
// auditoría cruzada con Manus. Usamos la misma fuente que ya usaba el
// sitio viejo: la API oficial de Series de Tiempo del Gobierno, serie
// del EMAE (143.3_NO_PR_2004_A_21), pidiendo directamente la variación
// interanual (así no la calculamos nosotros).

import { getDb } from './firebase-admin.js';

async function getJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
  return res.json();
}

async function main() {
  const url = 'https://apis.datos.gob.ar/series/api/series/?ids=143.3_NO_PR_2004_A_21:percent_change_a_year_ago&format=json&sort=desc&limit=6';
  const json = await getJson(url);
  const rows = json?.data || [];
  if (!rows.length) throw new Error('EMAE: la API de series no devolvió datos.');

  const [fecha, valor] = rows[0]; // la fila más reciente (sort=desc)
  if (typeof valor !== 'number' || valor < -50 || valor > 50) {
    throw new Error(`Control de calidad: actividad económica (${valor}%) fuera de rango razonable — no se guarda.`);
  }

  const registro = {
    valor,
    variacionInteranual: valor, // mismo número — la interfaz nueva busca este nombre primero
    unidad: '%',
    fecha,
    fuente: 'INDEC — EMAE, vía Series de Tiempo del Gobierno (apis.datos.gob.ar)',
    scrapedAt: new Date().toISOString(),
  };

  const db = getDb();
  await db.collection('indicadores').doc('actividad_economica').set({ ultimo: registro }, { merge: true });
  await db.collection('indicadores').doc('actividad_economica').collection('historico').doc(fecha).set(registro, { merge: true });

  console.log('✅ actividad_economica:', registro);
}

main().catch(err => {
  console.error('❌ Error en actividad_economica:', err.message);
  process.exit(1);
});
