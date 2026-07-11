// RESERVAS INTERNACIONALES DEL BCRA
// ------------------------------------------------------------------
// Buena noticia: NO hace falta raspar el HTML de bcra.gob.ar.
// El BCRA tiene una API pública y oficial (API de Principales Variables
// v4.0) que devuelve exactamente el mismo número que ves en la tabla
// de la home, en JSON, sin necesidad de parsear HTML ni JS.
//
// Documentación oficial: https://www.bcra.gob.ar/apis-banco-central/
// La variable "Reservas internacionales" tiene idVariable = 1 (es fija,
// no cambia). 
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
  
  let historia = [];
  
  // Extracción ultra-precisa analizando la envoltura de la API
  if (Array.isArray(data)) {
    if (data.length > 0 && (data[0].detalle || data[0].Detalle || data[0].results)) {
      historia = data[0].detalle || data[0].Detalle || data[0].results;
    } else {
      historia = data;
    }
  } else if (data && typeof data === 'object') {
    historia = data.detalle || data.Detalle || data.results || [];
  }
  
  if (!historia || !historia.length) {
    console.log('Respuesta cruda de la API del BCRA:', JSON.stringify(data, null, 2));
    throw new Error('La API del BCRA respondió sin un listado de datos reconocible (detalle/results).');
  }

  // Evaluamos las fechas del primero y del último para asegurar cuál es el más reciente de la lista
  let ultimo = historia[0]; 
  if (historia.length > 1) {
    const fechaPrimero = historia[0].fecha || historia[0].Fecha || '';
    const fechaUltimo = historia[historia.length - 1].fecha || historia[historia.length - 1].Fecha || '';
    
    // Si la fecha del último elemento es más nueva, se queda con el último, sino con el primero
    if (fechaUltimo > fechaPrimero) {
      ultimo = historia[historia.length - 1];
    }
  }
  
  // Mapeo adaptativo de campos (fecha o Fecha, valor o Valor)
  const fechaEfectiva = ultimo.fecha || ultimo.Fecha;
  const valorEfectivo = ultimo.valor !== undefined ? ultimo.valor : ultimo.Valor;

  if (!fechaEfectiva || valorEfectivo === undefined || valorEfectivo === null) {
    console.log('Contenido del registro seleccionado:', ultimo);
    throw new Error('La fecha o el valor del registro elegido vinieron vacíos.');
  }

  const registro = {
    idVariable: ID_VARIABLE_RESERVAS,
    descripcion: 'Reservas Internacionales del BCRA',
    fecha: fechaEfectiva,               // YYYY-MM-DD
    valorMillonesUSD: valorEfectivo,
    unidad: 'Millones de USD',
    fuente: 'api.bcra.gob.ar (API oficial Principales Variables v4.0)',
    scrapedAt: new Date().toISOString(),
  };

  console.log('✅ Reservas BCRA encontradas con éxito:', registro);

  const db = getDb();
  
  // Guardar el último dato disponible en el documento principal
  await db.collection('indicadores').doc('reservas_bcra').set({
    ultimo: registro,
  }, { merge: true });

  // Guardar en la subcolección histórica usando la fecha como ID de documento
  await db.collection('indicadores')
    .doc('reservas_bcra')
    .collection('historico')
    .doc(registro.fecha)
    .set(registro, { merge: true });

  console.log('💾 ✅ Guardado impecable en Firestore: indicadores/reservas_bcra');
  return registro;
}

// Permite correr este archivo solo, con: node scripts/scrape-bcra-reservas.js
if (import.meta.url === `file://${process.argv[1]}`) {
  scrapeReservas().catch(err => {
    console.error('❌ Error al leer reservas del BCRA:', err.message);
    process.exit(1);
  });
}
