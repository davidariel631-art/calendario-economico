// ============================================================
// common.js — utilidades compartidas por todos los módulos
// (dashboard, transporte, y los que se vayan agregando)
// ============================================================

const fmt = (n, d = 2) =>
  (n === null || n === undefined || isNaN(n)) ? '—' : Number(n).toLocaleString('es-AR', { minimumFractionDigits: d, maximumFractionDigits: d });

const fmtDate = (iso) => {
  if (!iso) return '—';
  const full = iso.length === 7 ? iso + '-01' : iso;
  return new Date(full + 'T12:00:00').toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' });
};

const arrow = (delta) => {
  if (delta === null || delta === undefined || isNaN(delta) || delta === 0) return '→';
  return delta > 0 ? '▲' : '▼';
};

// Fetch con timeout + reintentos — mismo patrón que ya probamos en el panel
// principal, para no repetir el problema de pedidos colgados sin explicación.
async function fetchJsonRetry(url, { retries = 2, timeoutMs = 9000 } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, { signal: ctrl.signal });
      clearTimeout(t);
      if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      clearTimeout(t);
      lastErr = err;
      if (attempt < retries) await new Promise(r => setTimeout(r, 800 * (attempt + 1)));
    }
  }
  throw lastErr;
}

// Busca el primer campo numérico "razonable" en un objeto de respuesta,
// probando varios nombres posibles. Esto existe porque no tenemos el
// schema exacto y confirmado de cada endpoint de Argly (la doc no expone
// el JSON de ejemplo sin ejecutar el playground en el navegador) — así que
// en vez de asumir un nombre de campo y romper si está mal, buscamos entre
// los candidatos más probables. Si no encuentra nada, devuelve null:
// NUNCA inventa un valor.
function pickNumber(obj, candidatos) {
  if (!obj || typeof obj !== 'object') return null;
  for (const key of candidatos) {
    if (typeof obj[key] === 'number') return obj[key];
    if (typeof obj[key] === 'string' && !isNaN(parseFloat(obj[key]))) return parseFloat(obj[key]);
  }
  return null;
}
function pickString(obj, candidatos) {
  if (!obj || typeof obj !== 'object') return null;
  for (const key of candidatos) {
    if (typeof obj[key] === 'string') return obj[key];
  }
  return null;
}

// Marca visual de "esto todavía no está conectado" — nunca mostramos un
// número inventado; si algo no tiene fuente automatizable, se aclara.
function proximamenteTag() {
  return `<span class="tag-proximamente">Próximamente</span>`;
}
