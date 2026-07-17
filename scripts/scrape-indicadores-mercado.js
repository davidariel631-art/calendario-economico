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

// ------------------------------------------------------------------
// CONTROL DE CALIDAD: rangos razonables por indicador. Si una fuente
// devuelve un número fuera de estos límites (por un cambio de formato,
// un error de la API, un campo mal interpretado, etc.), NO lo guardamos
// — mejor mantener el dato anterior (que sabemos válido) que pisarlo con
// basura en silencio. Los límites son generosos a propósito: no buscan
// validar que el número sea "razonable hoy", sino filtrar errores
// groseros (un campo en 0, un string mal parseado, un cero de más o de
// menos).
// ------------------------------------------------------------------
const RANGOS = {
  riesgo_pais: [0, 20000],        // puntos básicos
  ipc_mensual: [-5, 40],          // % mensual
  ipc_interanual: [0, 500],       // % interanual
  uva: [1, 100000],
  icl: [1, 10000],
  smvm: [10000, 10000000],        // pesos
  canasta_cba: [1000, 10000000],
  canasta_cbt: [1000, 10000000],
};

function esValorRazonable(clave, valor) {
  if (typeof valor !== 'number' || !isFinite(valor)) return false;
  const rango = RANGOS[clave];
  if (!rango) return true; // sin rango definido -> no filtramos de más
  return valor >= rango[0] && valor <= rango[1];
}

function fechaISO(str) {
  if (!str) return null;
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(str);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : str;
}

async function guardar(db, key, registro, claveRango=key) {
  if ('valor' in registro && !esValorRazonable(claveRango, registro.valor)) {
    throw new Error(
      `Control de calidad: el valor de "${key}" (${registro.valor}) está fuera del rango razonable ` +
      `[${RANGOS[claveRango]?.join(' a ')}] — no se guarda, para no pisar el último dato válido con basura. ` +
      `Revisar si la fuente cambió de formato.`
    );
  }
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
  const cba = data.cba?.adulto_equivalente ?? null;
  const cbt = data.cbt?.adulto_equivalente ?? null;

  if (!esValorRazonable('canasta_cba', cba)) throw new Error(`Control de calidad: CBA (${cba}) fuera de rango razonable — no se guarda.`);
  if (!esValorRazonable('canasta_cbt', cbt)) throw new Error(`Control de calidad: CBT (${cbt}) fuera de rango razonable — no se guarda.`);
  if (cbt !== null && cba !== null && cbt < cba) throw new Error(`Control de calidad: CBT (${cbt}) no puede ser menor que CBA (${cba}) — algo está mal en la fuente, no se guarda.`);

  await guardar(db, 'canasta', {
    cbaAdultoEquivalente: cba,
    cbtAdultoEquivalente: cbt,
    fecha,
    fuente: 'Argly (api.argly.com.ar)',
    scrapedAt: new Date().toISOString(),
  }, null); // null = sin chequeo genérico de "valor" (ya lo hicimos arriba a mano)
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

async function scrapeICL(db) {
  const { data } = await getJson('https://api.argly.com.ar/v1/icl');
  await guardar(db, 'icl', {
    valor: data.valor,
    fecha: fechaISO(data.fecha),
    fuente: 'Argly (api.argly.com.ar)',
    scrapedAt: new Date().toISOString(),
  });
}

// Plazos fijos: confirmado en el manual oficial del desarrollador del BCRA
// — el endpoint es "PlazosFijos" (plural), y los campos son
// descripcionEntidad / tasaEfectivaAnualMinima / montoMinimoInvertir.
async function scrapePlazosFijos(db) {
  const json = await getJson('https://api.bcra.gob.ar/transparencia/v1.0/PlazosFijos');
  const lista = (json.results || [])
    .filter(r => typeof r.tasaEfectivaAnualMinima === 'number' && r.tasaEfectivaAnualMinima > 0)
    .map(r => ({
      entidad: r.descripcionEntidad,
      tasa: r.tasaEfectivaAnualMinima,
      montoMinimo: r.montoMinimoInvertir ?? null,
      fechaInformacion: r.fechaInformacion,
    }))
    .sort((a, b) => b.tasa - a.tasa)
    .slice(0, 20);

  await db.collection('indicadores').doc('plazos_fijos').set({
    lista,
    fuente: 'BCRA — API de Régimen de Transparencia v1.0',
    scrapedAt: new Date().toISOString(),
  }, { merge: true });
  console.log(`✅ plazos fijos: ${lista.length} entidades`);
}

// Combustibles: promedio nacional simple usando Buenos Aires como
// referencia (Argly pide provincia obligatoria). Si más adelante querés
// por provincia real del usuario, hay que sumar un scrape por cada una.
async function scrapeCombustibles(db) {
  const provincia = 'buenos-aires';
  const tipos = [
    ['super', 'nafta-super'],
    ['premium', 'nafta-premium'],
    ['gasoil', 'gasoil'],
  ];
  const precios = {};
  for (const [key, slug] of tipos) {
    try {
      const { data } = await getJson(`https://api.argly.com.ar/v1/combustibles/promedio?provincia=${provincia}&combustible=${slug}`);
      precios[key] = data.precio_promedio ?? null;
    } catch (e) {
      console.warn(`⚠️  combustible ${slug} falló:`, e.message);
      precios[key] = null;
    }
  }
  await db.collection('indicadores').doc('combustibles').set({
    provincia,
    precios,
    fuente: 'Argly (api.argly.com.ar)',
    scrapedAt: new Date().toISOString(),
  }, { merge: true });
  console.log('✅ combustibles:', precios);
}

async function main() {
  const db = getDb();
  const tareas = [
    ['riesgo país', scrapeRiesgoPais],
    ['inflación (IPC)', scrapeInflacion],
    ['inflación interanual', scrapeInflacionInteranual],
    ['UVA', scrapeUVA],
    ['ICL', scrapeICL],
    ['SMVM', scrapeSMVM],
    ['canasta básica', scrapeCanasta],
    ['feriados', scrapeFeriados],
    ['plazos fijos', scrapePlazosFijos],
    ['combustibles', scrapeCombustibles],
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
