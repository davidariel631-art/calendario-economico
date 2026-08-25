// ============================================================
// argly.js — wrapper de la API de Argly (api.argly.com.ar)
// ============================================================
// Argly es real, gratis, sin auth, mantenido por un solo desarrollador
// (William López, github.com/William10101995/argly). Ventaja: unifica
// un montón de fuentes oficiales en un solo lugar. Riesgo real (para que
// lo sepas): si el mantenedor lo deja de actualizar, se cae. Por eso cada
// función de acá abajo devuelve null en vez de reventar si algo falla, y
// nunca inventa un número si el campo esperado no está.
//
// Nota técnica: la documentación de Argly no expone el JSON de ejemplo
// sin ejecutar su "Playground" en el navegador (es contenido armado con
// JS del lado del cliente), así que el nombre exacto de cada campo se
// terminó de confirmar recién la primera vez que esto corra en un
// navegador de verdad. Por eso pickNumber/pickString prueban varios
// nombres candidatos en vez de asumir uno solo.

const ARGLY_BASE = 'https://api.argly.com.ar/v1';

async function argly(path) {
  return fetchJsonRetry(`${ARGLY_BASE}/${path}`, { retries: 1 });
}

// ---------- Indicadores económicos ----------

async function getIPC() {
  try {
    const d = await argly('ipc');
    const valor = pickNumber(d, ['valor', 'value', 'variacion_mensual', 'porcentaje']);
    const fecha = pickString(d, ['fecha', 'date', 'periodo']);
    return valor !== null ? { valor, fecha, unidad: '%' } : null;
  } catch (e) { console.warn('Argly IPC falló:', e.message); return null; }
}

async function getRiesgoPais() {
  try {
    const d = await argly('riesgo-pais');
    const valor = pickNumber(d, ['valor', 'value', 'riesgo_pais', 'puntos']);
    const fecha = pickString(d, ['fecha', 'date']);
    return valor !== null ? { valor, fecha, unidad: 'pb' } : null;
  } catch (e) { console.warn('Argly Riesgo País falló:', e.message); return null; }
}

async function getICL() {
  try {
    const d = await argly('icl');
    const valor = pickNumber(d, ['valor', 'value']);
    const fecha = pickString(d, ['fecha', 'date']);
    return valor !== null ? { valor, fecha, unidad: '' } : null;
  } catch (e) { console.warn('Argly ICL falló:', e.message); return null; }
}

async function getUVA() {
  try {
    const d = await argly('uva');
    const valor = pickNumber(d, ['valor', 'value']);
    const fecha = pickString(d, ['fecha', 'date']);
    return valor !== null ? { valor, fecha, unidad: '' } : null;
  } catch (e) { console.warn('Argly UVA falló:', e.message); return null; }
}

async function getSMVM() {
  try {
    const d = await argly('smvm');
    const valor = pickNumber(d, ['valor', 'value', 'monto']);
    const fecha = pickString(d, ['fecha', 'date', 'periodo']);
    return valor !== null ? { valor, fecha, unidad: '$' } : null;
  } catch (e) { console.warn('Argly SMVM falló:', e.message); return null; }
}

async function getCBA() {
  try {
    const d = await argly('cba');
    const valor = pickNumber(d, ['valor', 'value', 'monto']);
    const fecha = pickString(d, ['fecha', 'date', 'periodo']);
    return valor !== null ? { valor, fecha, unidad: '$' } : null;
  } catch (e) { console.warn('Argly CBA falló:', e.message); return null; }
}

async function getCBT() {
  try {
    const d = await argly('cbt');
    const valor = pickNumber(d, ['valor', 'value', 'monto']);
    const fecha = pickString(d, ['fecha', 'date', 'periodo']);
    return valor !== null ? { valor, fecha, unidad: '$' } : null;
  } catch (e) { console.warn('Argly CBT falló:', e.message); return null; }
}

// ---------- Combustibles ----------
// Este endpoint devuelve precios por provincia/estación, no un único
// "precio nacional". Calculamos un promedio simple del array que venga,
// filtrando por tipo de combustible. Si el formato no coincide con lo
// esperado, devolvemos null en vez de inventar un promedio con datos mal
// interpretados.
async function getCombustibles() {
  try {
    const d = await argly('combustibles');
    const lista = Array.isArray(d) ? d : (d?.data || d?.resultados || d?.estaciones || null);
    if (!Array.isArray(lista) || !lista.length) return null;
    return lista;
  } catch (e) { console.warn('Argly Combustibles falló:', e.message); return null; }
}

function promedioCombustible(lista, tipoRegex) {
  if (!lista) return null;
  const precios = lista
    .filter(e => tipoRegex.test(pickString(e, ['tipo', 'producto', 'combustible', 'nombre']) || ''))
    .map(e => pickNumber(e, ['precio', 'valor', 'price']))
    .filter(p => typeof p === 'number' && p > 0);
  if (!precios.length) return null;
  const promedio = precios.reduce((a, b) => a + b, 0) / precios.length;
  return { valor: promedio, muestras: precios.length };
}
