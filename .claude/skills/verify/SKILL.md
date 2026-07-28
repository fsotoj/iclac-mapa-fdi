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

## Viewports

Tres tamaños cubren los bugs que aparecen sólo a cierto ancho:

```js
{ width: 1536, height: 730, deviceScaleFactor: 1.25 }                       // el notebook de Felipe
{ width: 360, height: 640, deviceScaleFactor: 2, isMobile: true, hasTouch: true }  // teléfono
{ width: 320, height: 568, deviceScaleFactor: 2, isMobile: true, hasTouch: true }  // sólo si algo va justo
```

360 es el que pilla: el cromo del mapa entraba a 390 y 414 y no a 360, y la barra de acciones que lo
reemplazó despeja su fila por 2 px ahí. Al monitor externo (1920×1080) no se le cree nada.

Medir, no mirar: `getBoundingClientRect()` de los dos elementos y calcular la intersección. Un
screenshot con antialiasing no distingue "pegado" de "encima por 3 px".

## Gotchas

- **`CheckList` (país/sector/propiedad) muestra TODOS los checkbox marcados cuando la selección está vacía** ("todos = ninguno seleccionado"). Playwright `.check()` es no-op sobre un checkbox ya marcado → usar `.click()` para togglear.
- **Varios controles se renderizan DOS veces**, uno `hidden md:flex` y otro `md:hidden` (el conmutador Puntos/Agregados del mapa, la leyenda de sectores). En móvil `.first()` agarra la copia de escritorio, que está oculta: el clic no hace nada y con un `.catch(() => {})` alrededor el test pasa igual. Usar `.last()`, o mejor un selector que ancle el contenedor.
- Un elemento con `hidden` mide **0×0**, no `null`. Un chequeo de "existe" da falso positivo; comparar el ancho.
- El modal de presentación se abre solo una vez por sesión (`sessionStorage`) y cada `newContext()` es sesión nueva → cerrarlo antes de medir cualquier cosa, o tapa la vista. **Cerrarlo con `Escape`, no con su botón:** «Ver el mapa» navega a `/` y las mediciones terminan siendo de otra página.
- `innerText` de Chromium devuelve el texto **con `text-transform` aplicado**. Buscar «Cita sugerida» da 0 aunque la caja esté ahí, porque se renderiza en versalitas. Usar `textContent` o buscar sin distinguir mayúsculas.
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
