// RESERVAS INTERNACIONALES DEL BCRA
// ------------------------------------------------------------------
// Buena noticia: NO hace falta raspar el HTML de bcra.gob.ar.
// El BCRA tiene una API pública y oficial (API de Principales Variables
// v4.0) que devuelve exactamente el mismo número que ves en la tabla
// de la home, en JSON, sin necesidad de parsear HTML ni JS.
//
// Documentación oficial: https://www.bcra.gob.ar/apis-banco-central/
// La variable "Reservas internacionales" tiene idVariable = 1 (es fija,
// no cambia). Si alguna vez quisieras confirmar el id de otra variable,
// hacé GET a /estadisticas/v4.0/monetarias y buscá por "descripcion".
//
// Nota técnica: el certificado SSL de api.bcra.gob.ar históricamente dio
// problemas en algunos entornos Node. Este script primero intenta la
// conexión normal (segura); solo si falla por certificado, reintenta
// con verificación TLS relajada, y te avisa por consola que lo hizo.

import { Agent, fetch as undiciFetch } from 'undici';
import { getDb } from './firebase-admin.js';

const BCRA_URL = 'https://api.bcra.gob.ar/estadisticas/v4.0/monetarias/1';
const ID_VARIABLE_RESERVAS = 1;

async function fetchReservas() {
  try {
    const res = await fetch(BCRA_URL);
    if (!res.ok) throw new Error(`BCRA respondió ${res.status}`);
    return await res.json();
  } catch (err) {
    const isCertError = /certificate|SSL|TLS/i.test(err.message || '');
    if (!isCertError) throw err;

    console.warn('⚠️  Falló por certificado SSL, reintentando con verificación relajada...');
    const insecureAgent = new Agent({ connect: { rejectUnauthorized: false } });
    const res2 = await undiciFetch(BCRA_URL, { dispatcher: insecureAgent });
    if (!res2.ok) throw new Error(`BCRA respondió ${res2.status} (reintento)`);
    return await res2.json();
  }
}

export async function scrapeReservas() {
  const data = await fetchReservas();
  const results = data?.results || [];
  if (!results.length) {
    throw new Error('La API del BCRA respondió sin resultados para idVariable=1');
  }

  // Forma real de la respuesta (confirmada en un run real): "results" es una
  // lista de VARIABLES (acá una sola, la 1), y cada variable trae su
  // histórico adentro de "detalle": [{fecha, valor}, {fecha, valor}, ...].
  // (Mi primer intento asumía que "results" ya era la lista de fechas —
  // era incorrecto, por eso tiraba el error.)
  const variable = results[0];
  const detalle = variable?.detalle || [];
  if (!detalle.length) {
    throw new Error('La variable 1 no trajo "detalle" con datos históricos.');
  }

  // Ordenamos nosotros mismos por fecha descendente, sin confiar en el
  // orden que venga de la API.
  const ordenado = [...detalle].sort((a, b) => b.fecha.localeCompare(a.fecha));
  const ultimo = ordenado[0];

  const registro = {
    idVariable: ID_VARIABLE_RESERVAS,
    descripcion: 'Reservas Internacionales del BCRA',
    fecha: ultimo.fecha,               // YYYY-MM-DD
    valorMillonesUSD: ultimo.valor,
    unidad: 'Millones de USD',
    fuente: 'api.bcra.gob.ar (API oficial Principales Variables v4.0)',
    scrapedAt: new Date().toISOString(),
  };

  // Control de calidad: las reservas de Argentina nunca estuvieron ni van
  // a estar en un valor absurdo como 0 o negativo, ni por encima de los
  // ~200.000M (seria un cambio de escala insólito). Si viniera así, es
  // casi seguro un error de la fuente, no un dato real.
  if (typeof registro.valorMillonesUSD !== 'number' || registro.valorMillonesUSD <= 0 || registro.valorMillonesUSD > 200000) {
    throw new Error(`Control de calidad: reservas (${registro.valorMillonesUSD} M USD) fuera de rango razonable — no se guarda.`);
  }

  console.log('✅ Reservas BCRA:', registro);

  const db = getDb();
  await db.collection('indicadores').doc('reservas_bcra').set({
    ultimo: registro,
  }, { merge: true });

  await db.collection('indicadores')
    .doc('reservas_bcra')
    .collection('historico')
    .doc(registro.fecha)
    .set(registro, { merge: true });

  console.log('✅ Guardado en Firestore: indicadores/reservas_bcra');
  return registro;
}

// Permite correr este archivo solo, con: node scripts/scrape-bcra-reservas.js
if (import.meta.url === `file://${process.argv[1]}`) {
  scrapeReservas().catch(err => {
    console.error('❌ Error al leer reservas del BCRA:', err.message);
    process.exit(1);
  });
}
