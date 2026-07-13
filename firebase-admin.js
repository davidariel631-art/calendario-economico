// IMPORTANTE: esto NO usa el firebaseConfig del SDK web (el que tiene "apiKey").
// Ese config es para que el NAVEGADOR del usuario LEA datos.
// Para que un script de Node ESCRIBA en Firestore desde GitHub Actions,
// hace falta una "cuenta de servicio" (Service Account) con permisos de administrador.
//
// Cómo generarla (una sola vez, 2 minutos):
// 1. Consola de Firebase -> ⚙️ Configuración del proyecto -> Cuentas de servicio
// 2. "Generar nueva clave privada" -> se descarga un .json
// 3. Copiá TODO el contenido de ese .json
// 4. En GitHub: Settings -> Secrets and variables -> Actions -> New repository secret
//    Nombre: FIREBASE_SERVICE_ACCOUNT
//    Valor: pegá el JSON completo
//
// El script de acá abajo lee ese secret desde process.env.FIREBASE_SERVICE_ACCOUNT.
// Si corrés esto en tu máquina en vez de GitHub Actions, guardá ese mismo JSON
// en un archivo local (ej: serviceAccountKey.json) y NO lo subas al repo
// (agregalo a .gitignore).

import admin from 'firebase-admin';

let dbInstance = null;

export function getDb() {
  if (dbInstance) return dbInstance;

  if (!admin.apps.length) {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (!raw) {
      throw new Error(
        'Falta la variable de entorno FIREBASE_SERVICE_ACCOUNT (el JSON de la cuenta de servicio). ' +
        'Ver instrucciones arriba de este archivo.'
      );
    }
    const serviceAccount = JSON.parse(raw);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
  }

  dbInstance = admin.firestore();
  return dbInstance;
}
