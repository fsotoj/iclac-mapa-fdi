---
name: verify
description: Receta de verificación end-to-end del mapa_FDI (SPA React/Vite). Cómo levantar la app y manejarla headless para capturar evidencia.
---

# Verificar mapa_FDI end-to-end

## Levantar

```bash
npm run dev          # Vite en http://localhost:5173 (background)
curl -s -o /dev/null -w "%{http_code}" http://localhost:5173/   # 200 = arriba
```

Si el cambio toca datos: correr antes `node scripts/build_investors_map.mjs` (o `npm run etl` para el pipeline completo) para regenerar los JSON de `public/data/`.

## Manejar (headless, sin tocar package.json del repo)

No hay Playwright en el proyecto. Instalar `playwright-core` en el scratchpad de la sesión y usar el Edge del sistema:

```js
import { chromium } from 'playwright-core'
const browser = await chromium.launch({ channel: 'msedge', headless: true })
```

## Rutas / superficies

- `/` mapa Leaflet (canvas + panel filtros)
- `/sankey` diagrama ECharts (canvas) + barra de dropdowns
- Estado de filtros vive en la URL (`p`, `yMin/yMax`, `s`, `inv`, `own`, `cons`…) — verificar leyendo `page.url()` y recargando con params.

## Gotchas

- **`CheckList` (país/sector/propiedad) muestra TODOS los checkbox marcados cuando la selección está vacía** ("todos = ninguno seleccionado"). Playwright `.check()` es no-op sobre un checkbox ya marcado → usar `.click()` para togglear.
- Los nodos del Sankey son canvas: no hay DOM que consultar. Validar vía URL params, filas del dropdown (`label:has(input[type=checkbox])`) y screenshots.
- Placeholder del buscador de inversores: `Buscar…` (i18n `list.search`).
- Dropdowns se cierran con `Escape`.
- Esperar `networkidle` + ~1.5s tras `goto` (fetch de investments.json 4.3 MB + render ECharts).

## Flujos que vale la pena manejar

- Búsqueda de inversores (incluye members de consorcios — hint "incluye: …").
- Selección de inversor → URL `inv=` → nodos en diagrama (screenshot).
- Filtros Propiedad (`own=`) y Consorcios (`cons=only|none`).
- Reload con params combinados → badges de los botones conservan estado.
- Params basura (`?cons=garbage&own=NOPE`) → no crash, fallback a default.
