// BALANCE CAMBIARIO (BCRA) — cuenta corriente cambiaria, resultado mensual
// ------------------------------------------------------------------
// A diferencia de INDEC, el informe mensual de Balance Cambiario del BCRA
// SÍ es una página HTML normal (server-rendered, sin JavaScript), publicada
// en una URL predecible cada mes:
//
//   https://www.bcra.gob.ar/publicaciones/informe-mercado-de-cambios-y-balance-cambiario-{mes}-de-{año}/
//
// Por eso este scraper NO necesita Puppeteer: un fetch normal + una
// expresión regular sobre el texto del "Resumen ejecutivo" alcanza. Es más
// simple y más robusto que levantar un navegador entero.
//
// Fragilidad real (para que la conozcas): si el BCRA cambia la frase exacta
// del resumen ejecutivo, el regex puede dejar de matchear. Por eso, si no
// encuentra el patrón, el script AVISA con un error claro en vez de guardar
// cualquier cosa — nunca escribe un valor inventado.

import { getDb } from './firebase-admin.js';

const MESES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];

function urlDelMes(year, monthIndex0){
  const mes = MESES[monthIndex0];
  return `https://www.bcra.gob.ar/publicaciones/informe-mercado-de-cambios-y-balance-cambiario-${mes}-de-${year}/`;
}

// El BCRA suele publicar el informe de un mes ~25-30 días después de
// terminado ese mes. Probamos primero el mes pasado; si todavía no está
// publicado (404), probamos el anterior a ese.
async function encontrarUltimoInforme(){
  const hoy = new Date();
  for(let atras = 1; atras <= 3; atras++){
    const d = new Date(hoy.getFullYear(), hoy.getMonth() - atras, 1);
    const url = urlDelMes(d.getFullYear(), d.getMonth());
    const res = await fetch(url);
    if(res.ok){
      const html = await res.text();
      return { url, html, year: d.getFullYear(), month: d.getMonth() };
    }
  }
  throw new Error('No se encontró ningún informe de Balance Cambiario publicado en los últimos 3 meses.');
}

function extraerSaldoCuentaCorriente(html){
  // Texto real del informe (confirmado): "se registró un déficit de USD 115
  // millones en la cuenta corriente cambiaria" o "...un superávit de USD X..."
  const regex = /se registró un (déficit|superávit) de USD\s*([\d.,]+)\s*millones en la cuenta corriente cambiaria/i;
  const match = html.match(regex);
  if(!match) return null;

  const tipo = match[1].toLowerCase();
  const magnitud = parseFloat(match[2].replace(/\./g, '').replace(',', '.'));
  const valor = tipo === 'déficit' ? -Math.abs(magnitud) : Math.abs(magnitud);
  return { valor, tipoTexto: match[1] };
}

export async function scrapeBalanceCambiario(){
  const { url, html, year, month } = await encontrarUltimoInforme();
  const extraido = extraerSaldoCuentaCorriente(html);

  if(!extraido){
    throw new Error(
      `Se encontró la página del informe (${url}) pero el texto no matcheó el patrón esperado. ` +
      `El BCRA puede haber cambiado la redacción del resumen ejecutivo — hay que revisar la página a mano.`
    );
  }

  const fecha = `${year}-${String(month+1).padStart(2,'0')}`;
  const registro = {
    valor: extraido.valor,
    unidad: 'Millones de USD',
    fecha,
    fuente: `BCRA — Informe Mercado de Cambios y Balance Cambiario (${url})`,
    metodo: 'scraping_html_bcra',
    scrapedAt: new Date().toISOString(),
  };

  console.log('✅ Balance cambiario:', registro);

  const db = getDb();
  await db.collection('indicadores').doc('cambiario').set({ ultimo: registro }, { merge: true });
  await db.collection('indicadores').doc('cambiario').collection('historico').doc(fecha).set(registro, { merge: true });

  console.log('✅ Guardado en Firestore: indicadores/cambiario');
  return registro;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  scrapeBalanceCambiario().catch(err => {
    console.error('❌ Error al leer el Balance Cambiario:', err.message);
    process.exit(1);
  });
}
