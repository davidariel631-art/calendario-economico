// RESERVAS INTERNACIONALES DEL BCRA
// ------------------------------------------------------------------
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

    console.warn('⚠️ Falló por certificado SSL, reintentando...');
    const insecureAgent = new Agent({ connect: { rejectUnauthorized: false } });
    const res2 = await undiciFetch(BCRA_URL, { dispatcher: insecureAgent });
    if (!res2.ok) throw new Error(`BCRA respondió ${res2.status} (reintento)`);
    return await res2.json();
  }
}

export async function scrapeReservas() {
  const data = await fetchReservas();
  
  let historia = null;

  // Extracción directa sin importar cómo venga envuelto el objeto del BCRA
  if (Array.isArray(data) && data[0] && data[0].detalle) {
    historia = data[0].detalle;
  } else if (data && data.detalle) {
    historia = data.detalle;
  } else if (Array.isArray(data)) {
    historia = data;
  }

  if (!historia || !Array.isArray(historia) || historia.length === 0) {
    console.log('Estructura inesperada de la API:', JSON.stringify(data).substring(0, 500));
    throw new Error('No se pudo encontrar la lista de datos en la respuesta del BCRA.');
  }

  // El primer elemento contiene la fecha más reciente ('2026-07-06')
  const ultimo = historia[0];
  const fechaEfectiva = ultimo.fecha || ultimo.Fecha;
  const valorEfectivo = ultimo.valor !== undefined ? ultimo.valor : ultimo.Valor;

  if (!fechaEfectiva || valorEfectivo === undefined || valorEfectivo === null) {
    console.log('Registro seleccionado inválido:', ultimo);
    throw new Error('La fecha o el valor vinieron vacíos.');
  }

  const registro = {
    idVariable: ID_VARIABLE_RESERVAS,
    descripcion: 'Reservas Internacionales del BCRA',
    fecha: fechaEfectiva,
    valorMillonesUSD: Number(valorEfectivo),
    unidad: 'Millones de USD',
    fuente: 'api.bcra.gob.ar (API oficial Principales Variables v4.0)',
    scrapedAt: new Date().toISOString(),
  };

  console.log('✅ Reservas BCRA encontradas con éxito:', registro);

  const db = getDb();
  await db.collection('indicadores').doc('reservas_bcra').set({ ultimo: registro }, { merge: true });
  await db.collection('indicadores').doc('reservas_bcra').collection('historico').doc(registro.fecha).set(registro, { merge: true });

  console.log('💾 ✅ Guardado impecable en Firestore: indicadores/reservas_bcra');
  return registro;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  scrapeReservas().catch(err => {
    console.error('❌ Error al leer reservas del BCRA:', err.message);
    process.exit(1);
  });
}
