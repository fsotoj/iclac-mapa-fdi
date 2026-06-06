# mapa_FDI

Repositorio Regional de Inversiones Chinas en América Latina — frontend.

Reescritura para ICLAC. Reemplaza la implementación anterior (Vue 3 / IMFD).

## Stack

- React 18 + Vite + TypeScript (strict)
- react-router-dom 6
- react-i18next (es / en / cn)
- Leaflet 1.9 + react-leaflet
- D3 v7
- ECharts 5
- Tailwind CSS 3
- Hosting: Netlify

## Requisitos

- Node ≥ 20 (ver `.nvmrc`)
- npm ≥ 10

## Setup

```bash
npm install
npm run dev
```

Abrir `http://localhost:5173`.

## Scripts

| Script | Acción |
|---|---|
| `npm run dev` | Vite dev server (HMR, puerto 5173) |
| `npm run build` | Typecheck (`tsc --noEmit`) + bundle producción a `dist/` |
| `npm run preview` | Servir `dist/` localmente para verificación post-build |
| `npm run typecheck` | Solo TypeScript, sin emitir |
| `npm run lint` | ESLint sobre `src/` (legacy excluido) |
| `npm run etl` | Procesa XLSX cliente → `public/data/investments.json` |
| `npm run conflicts` | Genera XLSX con conflictos de la columna `Vector` para revisión del cliente |

## Estructura

```
src/
  App.tsx              # rutas
  main.tsx             # entrypoint (Leaflet + markercluster CSS)
  i18n.ts              # config react-i18next
  index.css            # tailwind directivas + estilos cluster/slider
  components/
    Layout.tsx         # header + nav + footer + lang switcher
    FilterPanel.tsx    # sidebar (país, año, tipo, construcción, estudios)
    YearRangeSlider.tsx# bar dual-handle + play button
    SectorLegend.tsx   # legend flotante bottom-right que también filtra
    ProjectDocsCards.tsx # panel "Repositorio": inversiones por país, estudios destacados, locate
  hooks/
    useFilters.ts      # filtros + vista URL-backed (?p=&yMin=&t=&c=&r=&s=&view=)
  lib/
    filter.ts          # applyFilters + distinctCountries/Sectors/yearBounds + ViewMode
    sectors.ts         # paleta colores por sector (de legacy)
    clusterDonut.ts    # SVG donut + legenda para cluster bubbles
    projectDocs.ts     # dedupeById + groupByCountry + helpers locale/monto del repositorio
    popup.ts           # HTML de tooltip + popup por inversión (point/line)
  views/
    MapView.tsx        # mapa Leaflet (GeoJSON + clustering + markers/lines) + panel Repositorio + locate→popup
    SankeyView.tsx     # placeholder S5
    MethodologyView.tsx# placeholder
  locales/
    es.json, en.json, cn.json
  types/
    data.ts            # tipos (Investment point|line, CountryFeature, LocaleCode)
public/
  data/                # GeoJSON estáticos + investments.json (gitignored, regenerado)
data/
  source/              # XLSX del cliente (versionado)
  conflicts/           # XLSX de conflictos para revisión cliente (gitignored)
scripts/
  etl.mjs              # XLSX → investments.json
  export_vector_conflicts.mjs # XLSX de conflictos
legacy/                # código Vue original — solo referencia, no compilar
docs/                  # cotización, planes de sprint, auditoría
.github/workflows/ci.yml  # typecheck + lint + build
```

## Mapa y panel Repositorio

`MapView` combina el mapa Leaflet con un panel lateral **Repositorio** (`ProjectDocsCards`):

- **Repositorio** (`?view=cards`, default): columna derecha con las inversiones agrupadas por país. Cada ficha muestra sector, inversor, año, monto y — destacado — sus **estudios** (`research_cases`), colapsables. Toggle "Repositorio" en la barra superior lo oculta (`?view=map`), ensanchando el mapa (`invalidateSize` recarga los tiles).
- **Locate**: el pin de cada ficha centra el mapa en la inversión (`flyTo` / `zoomToShowLayer` si está en cluster) y **abre su popup**.
- La vista (`view`) y los filtros viven en la URL → compartible/recargable.

## Datos

Pipeline ETL adelantado a S2:

- **Fuente:** `data/source/entrega1_inversiones.xlsx` (XLSX del cliente, versionado)
- **Script:** `scripts/etl.mjs` (Node + sheetjs)
- **Salida:** `public/data/investments.json` (gitignored, regenerado)
- **Comando:** `npm run etl`
- **Producción:** Netlify ejecuta `npm run etl && npm run build` automáticamente

Auditoría del XLSX en [`docs/auditoria_xlsx_entrega1.md`](docs/auditoria_xlsx_entrega1.md): schema completo, problemas de calidad detectados, normalizaciones aplicadas, preguntas pendientes con cliente.

Pipeline planeado para S5 (validación automática):

1. Cliente edita XLSX en su repo fork
2. Abre PR
3. GitHub Action ejecuta validador JS (esquema, tipos, FK)
4. Merge → Netlify rebuild (incluye `npm run etl`)

## Idiomas

`es` (default), `en`, `cn`. Detección automática vía `navigator.language` con fallback a `es`. Strings en `src/locales/*.json`. Revisor externo confirmado para chino.

## TypeScript

Modo `strict` activo. Tipos compartidos en `src/types/data.ts`. Imports de JSON tipados vía `resolveJsonModule`. Alias `@/*` → `./src/*`.

Si se añade dependencia sin tipos, instalar `@types/<paquete>` o declarar shim en `src/vite-env.d.ts`.

## CI

`.github/workflows/ci.yml` corre en push a `main` y en PRs:

1. `npm ci`
2. `npm run typecheck`
3. `npm run lint`
4. `npm run build`

Build artifact se sube solo desde `main`.

## Despliegue

Netlify lee `netlify.toml`. Build command `npm run build`, publish dir `dist`. SPA redirect (`/* /index.html 200`) configurado.

- `main` → staging (cuenta dev en S1–S4)
- Transferencia a cuenta ICLAC en S5
- PRs / ramas → preview deploys automáticos

## Documentación

- [`.claude/CLAUDE.md`](.claude/CLAUDE.md) — contexto del proyecto para asistentes IA
- [`docs/plan_s1.md`](docs/plan_s1.md) — plan sprint actual
- [`docs/cotizacion_iclac_fase1_felipe.html`](docs/cotizacion_iclac_fase1_felipe.html) — alcance y precio Fase 1
- [`legacy/AUDIT.md`](legacy/AUDIT.md) — auditoría del proyecto Vue original (problemas a no replicar)
- [`legacy/`](legacy/) — código y datos del proyecto original como referencia
