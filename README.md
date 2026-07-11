# Scraper de indicadores económicos (BCRA + INDEC)

Lee dos indicadores una vez por día y los guarda en Firestore:

- **Reservas del BCRA** → vía la API oficial del BCRA (no hace falta scraping real, es un JSON público).
- **IPC del INDEC** → vía scraping de la home con Puppeteer, con respaldo automático a una API pública si el scraping falla.

## Pasos para dejarlo andando (una sola vez)

1. **Creá la cuenta de servicio de Firebase** (distinta del `firebaseConfig` del navegador):
   - Consola de Firebase → ⚙️ Configuración del proyecto → Cuentas de servicio
   - "Generar nueva clave privada" → se descarga un `.json`

2. **Subí este código a tu repo de GitHub** (el mismo donde tenés `critophaton`, o uno nuevo — como prefieras).

3. **Cargá el secret en GitHub**:
   - Settings → Secrets and variables → Actions → New repository secret
   - Nombre: `FIREBASE_SERVICE_ACCOUNT`
   - Valor: pegá el contenido completo del `.json` de la cuenta de servicio

4. **Probalo a mano primero**: en la pestaña "Actions" de GitHub, elegí este workflow y tocá "Run workflow". Mirá los logs — te va a decir si el scraping de INDEC encontró el patrón o si usó el respaldo.

5. Listo — de ahí en más corre solo todos los días a las 09:15 (hora Argentina), gratis, en la infraestructura de GitHub.

## Si el scraping de INDEC deja de encontrar el dato

Es esperable que en algún momento el INDEC cambie el diseño de su home y el patrón de texto no matchee más. Cuando pase:
- El pipeline **no se rompe**: cae automáticamente al respaldo (ArgentinaDatos) y lo marca en Firestore con `"metodo": "fallback_argentinadatos_api"`.
- Para arreglar el scraping real, hay que volver a `scripts/scrape-indec-ipc.js`, entrar a indec.gob.ar, inspeccionar el HTML actual, y ajustar el regex o directamente apuntar a un selector CSS nuevo si preferís algo más preciso que la búsqueda de texto libre.

## Estructura en Firestore

```
indicadores/
  reservas_bcra/
    ultimo: { fecha, valorMillonesUSD, fuente, ... }
    historico/
      2026-07-11: { ...mismo formato }
      2026-07-10: { ... }
  ipc_mensual/
    ultimo: { fecha, valorPorcentaje, metodo, fuente, ... }
    historico/
      2026-06: { ... }
```

Tu panel HTML (`pizarra-economica-argentina.html`) puede leer esto directamente
con el SDK web de Firebase (el `firebaseConfig` que ya tenés) apuntando a
`indicadores/reservas_bcra` e `indicadores/ipc_mensual` — ese sí es de lectura
pública y no necesita la cuenta de servicio.

⚠️ Antes de eso, configurá las reglas de Firestore para que cualquiera pueda
**leer** `indicadores/**` pero nadie pueda escribir salvo el Admin SDK:

```
match /indicadores/{doc=**} {
  allow read: if true;
  allow write: if false; // solo se escribe desde el Admin SDK (GitHub Actions)
}
```
