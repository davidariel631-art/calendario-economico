# Indicadores económicos — estado final

Después de investigar fuente por fuente, este es el resultado real (no
promesas): 5 de 7 indicadores quedaron 100% automáticos. Los 2 que no,
es porque la fuente oficial en sí misma no es automatizable de forma
confiable (te muestro la prueba abajo).

| Indicador | Fuente | Automático |
|---|---|---|
| Reservas (BCRA) | API oficial `api.bcra.gob.ar` | ✅ |
| IPC (INDEC) | API `argentinadatos.com` | ✅ |
| REM — inflación esperada (BCRA) | API `argentinadatos.com` | ✅ |
| EMAE (INDEC) | API oficial de gobierno `apis.datos.gob.ar` | ✅ |
| Balance Cambiario (BCRA) | Scraping del informe HTML mensual oficial | ✅ |
| Recaudación (ARCA) | Excel/PDF con nombre de archivo que cambia cada mes | ❌ manual |
| Resultado Fiscal (Hacienda) | Excel/PDF con nombre de archivo que cambia cada mes | ❌ manual |

## Por qué Recaudación y Resultado Fiscal quedan manuales

No es pereza — es que la fuente en sí es inestable. Ejemplo real que
encontramos en argentina.gob.ar en la misma página, mes a mes:

- Enero 2026: `sector_publico_base_caja_enero_2026.xlsx`
- Marzo 2026: `marzo_26.xlsx`
- Abril 2026: `cuentas_publicas3.rar` ← ni siquiera es un Excel

Armar un scraper "robusto" contra eso es mentirte a vos mismo — se rompe
solo, y cuando se rompe, silenciosamente. Por eso quedan en
`admin-carga.html` (10 segundos por mes).

## Cómo se resolvió cada uno

- **Reservas**: la home de bcra.gob.ar es una SPA de JS que un scraper
  simple no puede leer — pero el BCRA tiene una API REST pública real
  (`api.bcra.gob.ar/estadisticas/v4.0/monetarias/1`), así que no hace
  falta scrapear nada.
- **Balance Cambiario**: a diferencia de la home, el *informe mensual* de
  Balance Cambiario del BCRA es una página HTML normal (server-rendered,
  sin JS), publicada en una URL predecible cada mes. Se lee el número
  directo del texto del resumen ejecutivo con una expresión regular — sin
  Puppeteer, sin navegador.
- **IPC, REM**: `api.argentinadatos.com` (gratis, sin key). Ojo con la
  casing exacta de las URLs — `inflacionInteranual` es camelCase, no
  `inflacion-interanual`.
- **EMAE**: no está en ArgentinaDatos (es de INDEC, no del BCRA), pero sí
  está espejado en la API oficial de Series de Tiempo del Gobierno
  (`apis.datos.gob.ar/series/api/series`), serie `143.3_NO_PR_2004_A_21`,
  pidiendo directamente la transformación `percent_change_a_year_ago`.

## IDs exactos de Firestore

```
indicadores/
  reservas_bcra        <- scraper (API oficial BCRA)
  cambiario             <- scraper (scraping del informe HTML mensual)
  recaudacion           <- admin-carga.html
  resultado_fiscal      <- admin-carga.html
```
(IPC, REM y EMAE no pasan por Firestore — el panel los pide en vivo
directo a sus APIs cada vez que carga.)

## Configuración (una sola vez)

1. **Cuenta de servicio de Firebase**: Consola de Firebase → ⚙️
   Configuración del proyecto → Cuentas de servicio → Generar nueva clave
   privada → pegás el JSON completo en un secret de GitHub llamado
   `FIREBASE_SERVICE_ACCOUNT`.
2. **Auth para `admin-carga.html`**: Authentication → Sign-in method →
   habilitar Email/Password → creás tu usuario.
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

## Correr a mano

```bash
npm install
FIREBASE_SERVICE_ACCOUNT='...' npm run reservas
FIREBASE_SERVICE_ACCOUNT='...' npm run cambiario
```

O dejalo correr solo — el workflow de GitHub Actions ya está configurado
para las 09:15 (hora Argentina), todos los días. El paso de Balance
Cambiario tiene `continue-on-error: true` porque el BCRA publica ese
informe con ~1 mes de rezago y no todos los días va a encontrar uno nuevo
— eso es esperado, no un bug.
