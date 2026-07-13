// INDICADORES DE MERCADO (riesgo país, inflación, UVA, SMVM, canasta, feriados)
// ------------------------------------------------------------------
// Por qué existe este archivo: tanto ArgentinaDatos como Argly bloquean
// CORS — no dejan que un navegador les pida datos directo, solo permiten
// pedidos servidor-a-servidor. Eso significa que el panel NUNCA va a poder
// leerlos directo desde el navegador del usuario, sin importar cuántos
// reintentos o proxies le pongamos. La única solución real es traer estos
// datos desde acá (Node, corriendo en GitHub Actions, sin navegador de por
// medio) y guardarlos en Firestore. El panel después solo lee Firestore.
//
// Todos los campos de Argly están confirmados pidiéndolos directo
// (no son adivinados): la respuesta viene envuelta en {"data": {...}}.

import { getDb } from './firebase-admin.js';

async function getJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
  return res.json();
}

function fechaISO(str) {
  if (!str) return null;
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(str);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : str;
}

async function guardar(db, key, registro) {
  await db.collection('indicadores').doc(key).set({ ultimo: registro }, { merge: true });
  await db.collection('indicadores').doc(key).collection('historico').doc(registro.fecha).set(registro, { merge: true });
  console.log(`✅ ${key}:`, registro);
}

async function scrapeRiesgoPais(db) {
  const { data } = await getJson('https://api.argly.com.ar/v1/riesgo-pais');
  const { data: anterior } = await getJson('https://api.argly.com.ar/v1/riesgo-pais?anterior=true');
  await guardar(db, 'riesgo_pais', {
    valor: data.ultimo,
    valorAnterior: anterior?.ultimo ?? null,
    fecha: data.fecha,
    tendencia: data.tendencia,
    fuente: 'Argly (api.argly.com.ar), fuente original ' + (data.fuente || 'ambito.com'),
    scrapedAt: new Date().toISOString(),
  });
}

async function scrapeInflacion(db) {
  const { data } = await getJson('https://api.argly.com.ar/v1/ipc');
  await guardar(db, 'ipc_mensual', {
    valor: data.indice_ipc,
    unidad: '%',
    fecha: `${data.anio}-${String(data.mes).padStart(2, '0')}`,
    fechaProximoInforme: data.fecha_proximo_informe ? fechaISO(data.fecha_proximo_informe) : null,
    fuente: 'Argly (api.argly.com.ar)',
    scrapedAt: new Date().toISOString(),
  });
}

async function scrapeInflacionInteranual(db) {
  // Argly no trae la interanual en /v1/ipc — esta sigue viniendo de
  // ArgentinaDatos, pero server-side (acá no hay problema de CORS).
  const data = await getJson('https://api.argentinadatos.com/v1/finanzas/indices/inflacionInteranual');
  const ultimo = data[data.length - 1];
  await guardar(db, 'ipc_interanual', {
    valor: ultimo.valor,
    unidad: '%',
    fecha: ultimo.fecha,
    fuente: 'ArgentinaDatos (api.argentinadatos.com)',
    scrapedAt: new Date().toISOString(),
  });
}

async function scrapeUVA(db) {
  const { data } = await getJson('https://api.argly.com.ar/v1/uva');
  await guardar(db, 'uva', {
    valor: data.valor,
    fecha: fechaISO(data.fecha),
    fuente: 'Argly (api.argly.com.ar)',
    scrapedAt: new Date().toISOString(),
  });
}

async function scrapeSMVM(db) {
  const { data } = await getJson('https://api.argly.com.ar/v1/smvm');
  await guardar(db, 'smvm', {
    valor: data.smvm,
    fecha: fechaISO(data.vigente_desde),
    fuente: data.fuente || 'Argly (api.argly.com.ar)',
    scrapedAt: new Date().toISOString(),
  });
}

async function scrapeCanasta(db) {
  const { data } = await getJson('https://api.argly.com.ar/v1/canasta');
  const fecha = data.periodo || data.fecha_publicacion;
  await guardar(db, 'canasta', {
    cbaAdultoEquivalente: data.cba?.adulto_equivalente ?? null,
    cbtAdultoEquivalente: data.cbt?.adulto_equivalente ?? null,
    fecha,
    fuente: 'Argly (api.argly.com.ar)',
    scrapedAt: new Date().toISOString(),
  });
}

async function scrapeFeriados(db) {
  const year = new Date().getFullYear();
  const data = await getJson(`https://api.argentinadatos.com/v1/feriados/${year}`);
  // Este es un array completo, no un "último dato" — lo guardamos entero
  // en un solo doc (no tiene sentido un historico/ acá).
  await db.collection('indicadores').doc('feriados').set({
    anio: year,
    lista: data,
    fuente: 'ArgentinaDatos (api.argentinadatos.com)',
    scrapedAt: new Date().toISOString(),
  }, { merge: true });
  console.log(`✅ feriados ${year}: ${data.length} cargados`);
}

async function main() {
  const db = getDb();
  const tareas = [
    ['riesgo país', scrapeRiesgoPais],
    ['inflación (IPC)', scrapeInflacion],
    ['inflación interanual', scrapeInflacionInteranual],
    ['UVA', scrapeUVA],
    ['SMVM', scrapeSMVM],
    ['canasta básica', scrapeCanasta],
    ['feriados', scrapeFeriados],
  ];

  let huboError = false;
  for (const [nombre, fn] of tareas) {
    try {
      await fn(db);
    } catch (err) {
      huboError = true;
      console.error(`❌ Error en ${nombre}:`, err.message);
    }
  }
  if (huboError) process.exit(1);
}

main();
