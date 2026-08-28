// KRAX — Edición diaria verificada de actualidad institucional.
// Lee la lista pública de Casa Rosada y guarda sólo datos atribuidos:
// título, fecha, enlace y tipo. No genera opiniones ni atribuye medidas
// que el comunicado no confirme.
import { getDb } from './firebase-admin.js';

const INDEX_URL = 'https://www.casarosada.gob.ar/informacion/ultimas-noticias';
const BASE_URL = 'https://www.casarosada.gob.ar';
const USER_AGENT = 'KRAX-Actualidad/1.0 (+https://github.com/davidariel631-art/calendario-economico)';

function stripHtml(value = '') {
  return value.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&aacute;/g, 'á').replace(/&eacute;/g, 'é').replace(/&iacute;/g, 'í').replace(/&oacute;/g, 'ó').replace(/&uacute;/g, 'ú').replace(/&ntilde;/g, 'ñ').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim();
}

function normalizeUrl(path) {
  return path.startsWith('http') ? path : `${BASE_URL}${path}`;
}

function typeOf(title) {
  if (/discurso|palabras del presidente/i.test(title)) return 'Declaración presidencial';
  if (/decreto|resoluci[oó]n|ley|bolet[ií]n oficial/i.test(title)) return 'Norma o medida publicada';
  return 'Comunicado oficial';
}

async function articleData(path) {
  const response = await fetch(normalizeUrl(path), { headers: { 'User-Agent': USER_AGENT } });
  if (!response.ok) return null;
  const html = await response.text();
  const title = stripHtml(html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1] ?? 'Publicación oficial de Casa Rosada');
  const date = stripHtml(html.match(/(?:fecha|datePublished)[^>]*>\s*([^<]{4,80})</i)?.[1] ?? '');
  const type = typeOf(title);
  return {
    titulo: title,
    fechaTexto: date || null,
    link: normalizeUrl(path),
    fuente: 'Casa Rosada · Presidencia de la Nación',
    tipo: type,
    quePaso: `${type}: ${title}.`,
    porQueImporta: type === 'Norma o medida publicada'
      ? 'La publicación permite revisar el alcance de una medida formal y su texto de origen.'
      : 'Es una comunicación oficial. KRAX la separa de las noticias de prensa y de las normas ya publicadas.',
    queMirar: 'Fecha, texto completo y, si corresponde, su publicación en el Boletín Oficial.',
  };
}

async function main() {
  const response = await fetch(INDEX_URL, { headers: { 'User-Agent': USER_AGENT } });
  if (!response.ok) throw new Error(`Casa Rosada → HTTP ${response.status}`);
  const html = await response.text();
  const routes = [...html.matchAll(/href="(\/slider-principal\/[^"?#]+)"/g)].map((match) => match[1]);
  const uniqueRoutes = [...new Set(routes)].slice(0, 5);
  if (!uniqueRoutes.length) throw new Error('Casa Rosada no devolvió publicaciones recientes.');
  const fetched = await Promise.all(uniqueRoutes.map(articleData));
  const items = fetched.filter(Boolean);
  if (!items.length) throw new Error('No se pudieron leer publicaciones oficiales.');

  const db = getDb();
  await db.collection('indicadores').doc('actualidad').set({
    lista: items,
    fuente: 'Casa Rosada · Presidencia de la Nación',
    metodo: 'lectura_publica_atribuida',
    scrapedAt: new Date().toISOString(),
    criterio: 'declara fuente, fecha y tipo; no infiere medidas ni emite opinión',
  }, { merge: true });
  console.log(`✅ actualidad oficial: ${items.length} publicaciones guardadas`);
}

main().catch((error) => {
  console.error('❌ actualidad oficial:', error.message);
  process.exit(1);
});
