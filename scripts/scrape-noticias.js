// NOTICIAS INTELIGENTES
// ------------------------------------------------------------------
// Trae los últimos titulares de Economía de Ámbito (RSS oficial, público,
// sin necesidad de scraping de HTML) y le pide a Claude que elija los 3-5
// más relevantes para el bolsillo de una persona común, resumidos en
// lenguaje simple — sin copiar el texto original, en sus propias palabras.
//
// Necesita un secret nuevo en GitHub: ANTHROPIC_API_KEY
// (se genera en https://console.anthropic.com/settings/keys — tiene costo
// por uso, pero esto son ~10 noticias resumidas una vez por día, el gasto
// es de centavos de dólar por corrida usando un modelo económico).

import { getDb } from './firebase-admin.js';

const RSS_URL = 'https://www.ambito.com/rss/pages/economia.xml';
const ANTHROPIC_MODEL = 'claude-haiku-4-5-20251001'; // modelo económico, alcanza de sobra para resumir

function extraerItems(xml) {
  const items = [];
  const bloques = xml.split('<item>').slice(1);
  for (const bloque of bloques) {
    const titulo = /<title>([\s\S]*?)<\/title>/.exec(bloque)?.[1]?.trim();
    const descripcion = /<description>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/description>/.exec(bloque)?.[1]?.trim();
    const link = /<link>([\s\S]*?)<\/link>/.exec(bloque)?.[1]?.trim();
    if (titulo) items.push({ titulo, descripcion: descripcion || '', link });
  }
  return items.slice(0, 12); // los 12 más recientes alcanzan de sobra
}

async function pedirResumenIA(items) {
  const listado = items.map((it, i) => `${i + 1}. ${it.titulo}${it.descripcion ? ' — ' + it.descripcion : ''}`).join('\n');

  const prompt = `Sos un asistente que le explica economía argentina a alguien sin conocimientos financieros. Te paso una lista de titulares de noticias económicas de hoy. Tu tarea:

1. Elegí solo los 3 a 5 más relevantes para el bolsillo de una persona común (dólar, inflación, precios, salarios, impuestos, tarifas). Ignorá noticias de política pura, deportes, o análisis muy técnicos de mercado financiero que no afectan a la gente de a pie.
2. Para cada uno, escribí un resumen de UNA sola oración, en tus propias palabras (no copies el titular ni la descripción tal cual), en lenguaje simple, sin jerga económica, sin opinión política.
3. Devolvé SOLO un JSON válido, sin texto extra, con este formato exacto:
[{"titulo": "...", "resumen": "..."}]

Noticias de hoy:
${listado}`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: 1000,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!res.ok) throw new Error(`Anthropic API → HTTP ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const texto = data.content?.[0]?.text?.trim() || '';

  // Por si el modelo agrega texto antes/después del JSON a pesar de la instrucción.
  const match = texto.match(/\[[\s\S]*\]/);
  if (!match) throw new Error('La IA no devolvió un JSON reconocible: ' + texto.slice(0, 200));
  return JSON.parse(match[0]);
}

// Modo gratis (sin IA): si no hay ANTHROPIC_API_KEY, o si Anthropic falla
// por falta de saldo, elegimos las noticias más relevantes con un filtro
// de palabras clave simple, sin pedir nada pago. No queda tan "inteligente"
// como el resumen de la IA, pero nunca deja el workflow en rojo por plata.
const PALABRAS_CLAVE = /dólar|inflaci[oó]n|precio|salario|impuesto|tarifa|jubilaci[oó]n|monotributo|combustible|nafta|alquiler|canasta/i;

function elegirSinIA(items) {
  const relevantes = items.filter(it => PALABRAS_CLAVE.test(it.titulo) || PALABRAS_CLAVE.test(it.descripcion));
  const elegidos = (relevantes.length ? relevantes : items).slice(0, 5);
  return elegidos.map(it => ({
    titulo: it.titulo,
    // Sin IA no parafraseamos — mostramos la descripción original del RSS tal cual
    // (o el título si no hay descripción), aclarando que es la fuente original.
    resumen: it.descripcion || it.titulo,
  }));
}

async function main() {
  console.log('Descargando RSS de Ámbito Economía...');
  const res = await fetch(RSS_URL, {
    headers: {
      // Sin esto, Ámbito devuelve 403 — el user-agent por defecto de Node/GitHub
      // Actions se identifica como bot y lo bloquean.
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Accept': 'application/rss+xml, application/xml, text/xml, */*',
    },
  });
  if (!res.ok) throw new Error(`RSS → HTTP ${res.status}`);
  const xml = await res.text();
  const items = extraerItems(xml);
  if (!items.length) throw new Error('No se encontraron noticias en el RSS.');

  let resumen, metodo;
  if (!process.env.ANTHROPIC_API_KEY) {
    console.log('No hay ANTHROPIC_API_KEY configurada — uso el modo gratis (sin IA).');
    resumen = elegirSinIA(items);
    metodo = 'sin_ia';
  } else {
    try {
      console.log(`Encontradas ${items.length} noticias, pidiendo resumen a Claude...`);
      resumen = await pedirResumenIA(items);
      metodo = 'ia';
    } catch (err) {
      console.warn('⚠️  Falló el resumen con IA (' + err.message + '). Uso el modo gratis como respaldo.');
      resumen = elegirSinIA(items);
      metodo = 'sin_ia_respaldo';
    }
  }

  const db = getDb();
  await db.collection('indicadores').doc('noticias').set({
    lista: resumen,
    metodo,
    fuente: metodo === 'ia' ? 'Ámbito (RSS) + resumen generado por IA' : 'Ámbito (RSS) — titulares originales, sin resumen de IA',
    scrapedAt: new Date().toISOString(),
  }, { merge: true });

  console.log(`✅ noticias: ${resumen.length} resúmenes guardados`);
}

main().catch(err => {
  console.error('❌ Error en noticias:', err.message);
  process.exit(1);
});
