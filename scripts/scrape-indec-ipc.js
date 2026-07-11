// IPC (INDEC) - variación mensual
// ------------------------------------------------------------------
// A diferencia del BCRA, el INDEC no tiene una API pública con este dato
// puntual, y el panel de indicadores de su home (indec.gob.ar) se arma
// con JavaScript: si le pedís el HTML "a pelo" (fetch/curl), el número
// no está ahí todavía, así que hace falta un navegador real (Puppeteer)
// para que la página termine de renderizar antes de leerla.
//
// Esto lo hace más fantasioso a que se rompa que el de BCRA: si el INDEC
// rediseña la home, el selector puede dejar de encontrar el texto. Por
// eso este script:
//   1) Intenta leer el panel de la home con Puppeteer, buscando el
//      patrón "IPC ... X,X%" en el texto visible de la página (no un
//      selector CSS rígido, para tolerar cambios menores de diseño).
//   2) Si no lo encuentra o la página falla, cae automáticamente a la
//      API pública de ArgentinaDatos (que también toma el dato oficial
//      de INDEC) para que NUNCA te quedes sin dato guardado.
//   3) Guarda en Firestore de qué método salió el dato, para que sepas
//      si tenés que revisar el selector.

import puppeteer from 'puppeteer';
import { getDb } from './firebase-admin.js';

const INDEC_URL = 'https://www.indec.gob.ar/';
const FALLBACK_URL = 'https://api.argentinadatos.com/v1/finanzas/indices/inflacion';

async function tryScrapeIndecHome() {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  try {
    const page = await browser.newPage();
    await page.goto(INDEC_URL, { waitUntil: 'networkidle2', timeout: 30000 });

    // Le damos un margen extra por si el panel de indicadores carga
    // sus datos con un fetch propio después del networkidle inicial.
    await new Promise(r => setTimeout(r, 3000));

    const bodyText = await page.evaluate(() => document.body.innerText);

    // Buscamos "IPC" o "Índice de precios al consumidor" seguido, en las
    // ~120 letras siguientes, de un número con % (ej: "3,4%" o "3.4 %").
    const regex = /(IPC|Índice de precios al consumidor)[\s\S]{0,120}?(-?\d{1,2}[.,]\d{1,2})\s?%/i;
    const match = bodyText.match(regex);

    if (!match) return null;

    const valor = parseFloat(match[2].replace(',', '.'));
    if (Number.isNaN(valor)) return null;

    return {
      valorPorcentaje: valor,
      metodo: 'scraping_home_indec',
      textoEncontrado: match[0].replace(/\s+/g, ' ').trim(),
    };
  } finally {
    await browser.close();
  }
}

async function fallbackArgentinaDatos() {
  const res = await fetch(FALLBACK_URL);
  if (!res.ok) throw new Error(`ArgentinaDatos respondió ${res.status}`);
  const data = await res.json();
  const ultimo = data[data.length - 1];
  return {
    valorPorcentaje: ultimo.valor,
    fecha: ultimo.fecha,
    metodo: 'fallback_argentinadatos_api',
  };
}

export async function scrapeIPC() {
  let resultado = null;

  try {
    resultado = await tryScrapeIndecHome();
    if (resultado) {
      console.log('✅ IPC leído del home de INDEC por scraping:', resultado);
    } else {
      console.warn('⚠️  No se encontró el patrón de IPC en la home del INDEC. Usando respaldo...');
    }
  } catch (err) {
    console.warn('⚠️  Falló el scraping de INDEC (', err.message, '). Usando respaldo...');
  }

  if (!resultado) {
    resultado = await fallbackArgentinaDatos();
    console.log('✅ IPC obtenido del respaldo (ArgentinaDatos):', resultado);
  }

  const registro = {
    descripcion: 'IPC - variación mensual',
    valorPorcentaje: resultado.valorPorcentaje,
    metodo: resultado.metodo,
    fecha: resultado.fecha || new Date().toISOString().slice(0, 10),
    fuente: resultado.metodo === 'scraping_home_indec'
      ? 'indec.gob.ar (home, scraping con Puppeteer)'
      : 'api.argentinadatos.com (respaldo, dato original INDEC)',
    scrapedAt: new Date().toISOString(),
  };

  const db = getDb();
  await db.collection('indicadores').doc('ipc_mensual').set({ ultimo: registro }, { merge: true });
  await db.collection('indicadores')
    .doc('ipc_mensual')
    .collection('historico')
    .doc(registro.fecha)
    .set(registro, { merge: true });

  console.log('✅ Guardado en Firestore: indicadores/ipc_mensual (método:', registro.metodo, ')');
  return registro;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  scrapeIPC().catch(err => {
    console.error('❌ Error al leer el IPC:', err.message);
    process.exit(1);
  });
}
