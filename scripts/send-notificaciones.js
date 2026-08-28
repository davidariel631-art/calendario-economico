// ENVÍO DE NOTIFICACIONES PUSH
// ------------------------------------------------------------------
// Corre después de scrape-indicadores-mercado.js. Revisa si pasó algo que
// valga la pena avisar (por ahora: el dólar blue se movió más de un 3%
// desde la última vez que mandamos una notificación) y, si es así, le
// manda un push a todos los que se suscribieron desde el botón
// "🔔 Activar notificaciones" del panel.
//
// No manda notificaciones por cada corrida del scraper (sería spam) —
// guarda en Firestore cuál fue el último valor "notificado" y compara
// contra eso, no contra el valor del día anterior.

import { getDb } from './firebase-admin.js';
import admin from 'firebase-admin';

const UMBRAL_VARIACION_PORCENTUAL = 3; // % de variación del dólar blue para justificar un aviso

async function chequearDolarBlue(db) {
  const doc = await db.collection('indicadores').doc('dolar_blue').get();
  if (!doc.exists || !doc.data().ultimo) return null;
  const actual = doc.data().ultimo.valor;

  const estadoRef = db.collection('indicadores').doc('_ultimo_notificado_dolar_blue');
  const estado = await estadoRef.get();
  const anterior = estado.exists ? estado.data().valor : null;

  if (anterior === null) {
    // Primera vez que corre esto — guardamos el valor base sin notificar nada.
    await estadoRef.set({ valor: actual, actualizadoEn: new Date().toISOString() });
    return null;
  }

  const variacionPct = ((actual - anterior) / anterior) * 100;
  if (Math.abs(variacionPct) < UMBRAL_VARIACION_PORCENTUAL) return null;

  await estadoRef.set({ valor: actual, actualizadoEn: new Date().toISOString() });

  return {
    title: `Dólar blue ${variacionPct > 0 ? 'subió' : 'bajó'} ${Math.abs(variacionPct).toFixed(1)}%`,
    body: `Ahora está en $${actual.toLocaleString('es-AR')} (antes $${anterior.toLocaleString('es-AR')}).`,
  };
}

async function enviarATodos(db, notificacion) {
  const subs = await db.collection('push_subscribers').get();
  if (subs.empty) {
    console.log('No hay suscriptores todavía — nadie activó las notificaciones aún.');
    return;
  }

  const tokens = subs.docs.map(d => d.id);
  console.log(`Enviando notificación a ${tokens.length} suscriptor(es)...`);

  const mensaje = {
    notification: { title: notificacion.title, body: notificacion.body },
    tokens,
  };

  const resultado = await admin.messaging().sendEachForMulticast(mensaje);
  console.log(`✅ Enviadas: ${resultado.successCount}, fallidas: ${resultado.failureCount}`);

  // Limpieza: si un token falló porque ya no es válido (usuario desinstaló,
  // borró caché, etc.), lo sacamos de la lista para no seguir intentando
  // mandarle para siempre.
  const tokensInvalidos = [];
  resultado.responses.forEach((r, i) => {
    if (!r.success && ['messaging/invalid-registration-token', 'messaging/registration-token-not-registered'].includes(r.error?.code)) {
      tokensInvalidos.push(tokens[i]);
    }
  });
  for (const token of tokensInvalidos) {
    await db.collection('push_subscribers').doc(token).delete();
  }
  if (tokensInvalidos.length) console.log(`🧹 Se limpiaron ${tokensInvalidos.length} tokens inválidos.`);
}

async function main() {
  const db = getDb();
  const notificacion = await chequearDolarBlue(db);

  if (!notificacion) {
    console.log('Nada que notificar en esta corrida (sin variación significativa).');
    return;
  }

  await enviarATodos(db, notificacion);
}

main().catch(err => {
  console.error('❌ Error al enviar notificaciones:', err.message);
  process.exit(1);
});
