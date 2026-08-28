# CALENDARIO-ECONOMICO — TODO en UN SOLO repo

Esta carpeta es exactamente cómo tiene que quedar tu repo
`davidariel631-art/calendario-economico`. No hay "repo 1" y "repo 2" —
eso fue una confusión mía en un mensaje anterior. **Es todo un solo repo.**

## Cómo subirlo

1. Descomprimís este ZIP en tu compu.
2. Abrís la carpeta `calendario-economico-COMPLETO` — ahí adentro está
   TODO (no la carpeta en sí, lo de adentro).
3. Vas a tu repo en GitHub → **Add file → Upload files**.
4. Seleccionás **todo lo que está adentro** de esa carpeta (Ctrl+A / Cmd+A)
   y lo arrastrás entero a la ventana de GitHub. El navegador mantiene las
   subcarpetas (`assets/`, `legacy/`, `scripts/`, `.github/workflows/`)
   solo, no hace falta subir carpeta por carpeta.
5. Abajo, en "Commit changes", escribís algo como "Subida completa" y
   confirmás.

## Lo único que tenés que cargar aparte (no viene en el ZIP)

**Un solo secret, en este mismo repo:**
- Settings → Secrets and variables → Actions → New repository secret
- Nombre: `FIREBASE_SERVICE_ACCOUNT`
- Valor: el JSON completo de la cuenta de servicio de Firebase (Firebase
  Console → ⚙️ → Configuración del proyecto → Cuentas de servicio →
  Generar nueva clave privada)

**Nada de Anthropic** — confirmado que no lo necesitás, el sitio anda
100% gratis sin esa key.

## Después de subir

1. **Settings → Pages** → confirmá que "Source" esté en `main` / `/ (root)`
2. **Pestaña Actions** → elegís el workflow → **"Run workflow"** → esperás
   1-2 minutos
3. Abrís `davidariel631-art.github.io/calendario-economico/` en una
   ventana de incógnito (para que no te moleste el caché viejo)

## Qué es cada cosa, por si te perdés

| Carpeta/archivo | Qué es |
|---|---|
| `index.html`, `assets/`, `manifest.json`, `sw.js`, `manus-storage/` | El sitio nuevo (lo que la gente ve) |
| `legacy/` | El sitio viejo, guardado como respaldo — no lo toques |
| `scripts/`, `package.json`, `.github/` | El robot que trae los datos todos los días — corre solo, no lo abrís nunca a mano |
