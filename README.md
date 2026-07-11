# Indicadores económicos — modelo híbrido

Estrategia final, después de comprobar que ARCA/INDEC no tienen ni API ni
una página estática confiable para leer con un scraper:

| Indicador | Fuente de verdad | Cómo se actualiza |
|---|---|---|
| **Reservas del BCRA** | API oficial (`api.bcra.gob.ar`) | Sola, todos los días, vía GitHub Actions |
| **Recaudación (ARCA)** | Carga manual | Vos, 1 vez por mes, desde `admin-carga.html` |
| **EMAE (INDEC)** | Carga manual | Vos, 1 vez por mes, desde `admin-carga.html` |
| **Resultado fiscal (Hacienda)** | Carga manual | Vos, 1 vez por mes, desde `admin-carga.html` |
| **Balance cambiario (BCRA)** | Carga manual | Vos, 1 vez por mes, desde `admin-carga.html` |
| **REM — inflación esperada** | Carga manual | Vos, 1 vez por mes, desde `admin-carga.html` |
| **IPC (INDEC)** | API pública (ArgentinaDatos) | Sola, ya conectada en el panel principal |

Se sacó el scraper de INDEC con Puppeteer: dependía de que la home no
cambiara de diseño, tardaba ~30s por corrida y de todos modos ARCA/EMAE/REM
nunca tuvieron una fuente automatizable real. Es más honesto y más
sostenible cargar esos 4 a mano (10 segundos por mes) que mantener un
scraper que se rompe solo.

## IDs exactos de Firestore (tienen que coincidir sí o sí)

```
indicadores/
  reservas_bcra        <- escribe el scraper (no tocar a mano)
  recaudacion          <- admin-carga.html
  emae                 <- admin-carga.html
  resultado_fiscal     <- admin-carga.html
  cambiario            <- admin-carga.html
  rem_ipc_esperado     <- admin-carga.html
```

Cada doc tiene `{ ultimo: {...} }` + subcolección `historico/{fecha}`.
El panel principal (`pizarra-economica-argentina.html`) busca primero
`ultimo`; si no existe, cae automáticamente al dato más reciente de
`historico` y lo muestra igual, aclarando la fecha real ("🕘 Dato: [mes]")
en vez de mostrar "Pendiente" para siempre.

## Configuración (una sola vez)

1. **Cuenta de servicio de Firebase** (para que el scraper pueda escribir):
   Consola de Firebase → ⚙️ Configuración del proyecto → Cuentas de servicio
   → Generar nueva clave privada → copiás el JSON completo a un secret de
   GitHub llamado `FIREBASE_SERVICE_ACCOUNT`.

2. **Auth para `admin-carga.html`**: Authentication → Sign-in method →
   habilitar Email/Password → crear tu usuario.

3. **Reglas de Firestore**:
```
match /indicadores/{key} {
  allow read: if true;
  allow write: if request.auth != null;
  match /historico/{doc} {
    allow read: if true;
    allow write: if request.auth != null;
  }
}
```

## Correr el scraper de Reservas

```bash
npm install
FIREBASE_SERVICE_ACCOUNT='...' npm run reservas
```

O simplemente dejalo correr solo — el workflow de GitHub Actions ya está
configurado para las 09:15 (hora Argentina), todos los días.
