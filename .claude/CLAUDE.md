# CLAUDE.md — mapa_FDI

Contexto del proyecto para futuras sesiones de Claude Code.

## Qué es

Reescritura desde cero de la plataforma ICLAC (Repositorio Regional de Inversiones Chinas en América Latina). Cliente: ICLAC.

Reemplaza implementación anterior (Vue 3). El repositorio + Netlify quedan bajo cuenta ICLAC al cierre de la Fase 1.

## Stack acordado

- React 18 + Vite + **TypeScript strict** (decidido en S1)
- react-router-dom 6
- react-i18next (es / en / cn)
- Leaflet 1.9 + react-leaflet + leaflet.markercluster
- D3 v7 (módulos sueltos)
- ECharts 5 + echarts-for-react (instalado, sin uso aún — Sankey S5)
- Tailwind CSS 3
- Hosting: Netlify (cuenta cliente al cierre)
- CI: GitHub Actions con validación JS de esquema de datos (S5)

## Alcance Fase 1 (10 semanas, 100 horas, 3.700.000 CLP)

Ver `docs/generales/cotizacion_iclac_fase1_felipe.html` para detalle completo.

Resumen:
1. Rebuild mapa: stack moderno, paridad funcional con producción actual
2. Mejoras visuales mapa (definidas en UAT S2)
3. Filtros Sankey por empresa inversora
4. Workflow GH Actions + JS validation para que cliente actualice datos
5. Handover infra a ICLAC al cierre

## Sprints

| Sprint | Fechas | Foco |
|---|---|---|
| S1 | 25 may – 7 jun | Scaffold + mapa base + staging |
| S2 | 8 jun – 21 jun | Paridad funcional |
| S3 | 22 jun – 5 jul | Mejoras visuales + UAT |
| S4 | 6 jul – 19 jul | Producción + feedback |
| S5 | 20 jul – 2 ago | Sankey filters + GH Actions + handover |

## Referencia al proyecto legado

Carpeta `legacy/` contiene copia completa del código y datos del proyecto anterior (Vue + IMFD):

- `legacy/AUDIT.md` — auditoría completa con hallazgos críticos. **Leer antes de empezar.**
- `legacy/components/` — componentes Vue originales (MapCountry.vue, SankeyDiagram.vue, etc.)
- `legacy/views/` — vistas Vue originales
- `legacy/locales/` — strings es/en/cn ya traducidos (reusar)
- `legacy/data/` — geojson + json del repo legado (xlsx no copiados por peso)
- `legacy/router.js`, `legacy/main.js`, `legacy/store.js`, `legacy/index.html`, `legacy/package.json` — config legada
- `legacy/CLAUDE_legacy.md`, `legacy/README_legacy.md` — docs originales

Usar como referencia visual y funcional, **no copiar el código tal cual** (ver problemas en AUDIT.md).

## Datos

Fuente original: `China-Latam-main/public/data/` en el repo legado (mismo contenido en `legacy/data/`).

Archivos relevantes:
- `america.geojson`, `south-america.geojson` — bordes continentales
- `argentina.json`, `bolivia.json`, ... — bordes por país
- `latam.json`, `sankey.json` — agregados FDI
- `FDI_*.xlsx`, `Datos*.xlsx` — fuente Excel (convertir a JSON en build)
- `methodology/*.pdf` — documentación metodológica

Pipeline datos:
1. Cliente edita XLSX
2. PR en GitHub
3. GH Action ejecuta validador JS (esquema, tipos, FK)
4. Si pasa: merge → Netlify rebuild → JSON regenerado
5. Si falla: PR rojo con mensaje claro

## Idiomas

es (default), en, cn. Revisor externo de chino confirmado.

## Filtros existentes del mapa (a migrar en S2)

Inversión, año, sectores, paper. Confirmar al inicio de S2 si la nomenclatura cambió (cliente mencionó "país, año, tipo, estudios, construcción").

## Estado de filtros = la URL (`useFilters`)

`src/hooks/useFilters.ts` es la única fuente: `Filters` ↔ query string. Mapa y Sankey comparten
los mismos params, por eso las pestañas del header navegan con `search` (si no, cambiar de vista
resetea los filtros). `reset()` limpia todo el query string.

| param | campo | notas |
|---|---|---|
| `p` `t` `s` `inv` `own` | countries, types, sectors, investors, ownership | CSV; `[]` = todos |
| `yMin` `yMax` | yearMin, yearMax | |
| `c` | `construction` | **enum, no booleano** (27-07): sin param = `exclude` (default), `c=1` = `include`, `c=only` = `only`. `c=0` legado cae en `exclude` |
| `r` | research | |
| `q` | query | buscador de la lista, debounce en `ProjectSearchBox` |
| `view` `pie` `pm` | presentación | **no** cuentan como filtro |
| `id` | focusId | aislar una inversión; gana sobre todo lo demás |

`activeFilterCount` (en `lib/filter.ts`) decide cuándo mostrar "Limpiar filtros". Compara **contra
`DEFAULT_FILTERS`**, no contra una dirección fija: con construcción excluida por defecto, lo que
cuenta como filtro activo es *pedirla*.

**Construcción es dimensión propia, no un valor de `types`:** la metodología la cuenta aparte
(no es IED, ver `data/schema/sectores.md`). El filtro Tipo no gobierna esas filas, y con `only`
queda deshabilitado porque Adquisición/Greenfield son justo lo que se está filtrando fuera.

## Regla de hover (27-07)

Resaltado único del proyecto: **`brand` = `#00A89C`**, con `brand-dark` = `#00776E` para lo que ya
es oscuro. Definidos en `tailwind.config.js`. La regla existe porque el hover gris aclaraba los
botones activos (fondo `gray-900`, texto blanco) y **el texto desaparecía**.

| Elemento | Reposo | Hover |
|---|---|---|
| Botón/fila clara | `bg-white` / transparente | `hover:bg-brand hover:text-gray-900` |
| Botón activo u oscuro | `bg-gray-900 text-white` | `hover:bg-brand-dark` (el texto sigue blanco) |
| Link o ícono suelto | `text-gray-500` | `hover:text-brand-dark` |
| Fila de tabla | zebra | `hover:bg-brand/20` |

**Nunca `text-white` sobre `brand`**: da 2,96:1, bajo el mínimo AA de 4,5:1 para el texto chico del
panel. Las combinaciones de la tabla dan 5,4:1 a 6:1, medidas en navegador.

## Componentes compartidos del front

Antes de escribir uno nuevo, revisar estos (todos en `src/components/`):

- `Segmented` (dentro de `FilterPanel.tsx`) — botones unidos, activo en oscuro. Tipo, Estudios,
  Construcción. Acepta `disabled`.
- `MiniSegmented.tsx` — misma idea en chico, para las cabeceras de la lista y del mapa.
- `ProjectSearchBox.tsx` — buscador de la lista (icono + draft con debounce + ×). Lo usan Fichas
  **y** Tabla; escribe `filters.query`.
- `HelpTip.tsx` — el `(?)` chico, para **un control**. Abre por **clic**, no hover (en touch no hay
  hover). `position: fixed` calculada al abrir + **portal a `<body>`** (ver regla abajo). `\n` en el
  texto = párrafo. `width` opcional para textos largos.
- `InfoModal.tsx` — shell de los tres paneles que interrumpen la vista (backdrop, ×, Escape, foco,
  portal). Lo usan `LandingModal` y `ToolInfo`; `panelClass` define ancho y fondo.
- `LandingModal.tsx` — presentación del Repositorio, tres columnas es/中文/en simultáneas con el
  trazo de `America.png`. Una vez por sesión + el ícono "Acerca de" del header, cuyo estado vive en
  `Layout`. Es el **único** panel con el trazo de fondo. El «una vez por sesión» está en
  `lib/firstVisit.ts`: un archivo de componente que además exporta un helper rompe Fast Refresh y
  `npm run lint` (que corre con `--max-warnings 0` en CI) lo falla.
- `ToolInfo.tsx` — el `(?)` de **una herramienta**: abre pop-up con el ícono de la tab, el texto de
  `about.map` / `about.trends` y un `note` opcional (la cita sugerida). Sin fondo decorativo.
- `icons.tsx` — `MapIcon` y `TrendsIcon`. Sólo las dos herramientas llevan ícono: en el nav y en la
  cabecera de su pop-up. Metodología/Datos/Contacto son páginas, no instrumentos.
- `Citation.tsx` — cita sugerida con botón de copiar. La etiqueta «Cita sugerida» la pone el
  componente: los strings de `about.*.citation` **no** llevan ese prefijo.
- `BottomSheet.tsx` — hoja que sube desde abajo, para lo que en escritorio es caja flotante o
  popover: leyenda de sectores y filtros de Tendencias. Backdrop, ×, Escape, foco, **portal a
  `<body>`**. `max-h-[70vh]` y scroll propio.
- `SectorLegend.tsx` — exporta **dos** componentes: `SectorLegend` (caja flotante, `hidden md:block`)
  y `SectorLegendChip` (chip + `BottomSheet`, `md:hidden`). Las filas son el mismo control interno.
- `CollapsibleSection.tsx`, `CheckList.tsx`, `InvestorFilter.tsx`, `YearRangeSlider.tsx`.

**Valores de la base que se muestran traducidos** viven en `lib/`, no en cada componente:
`lib/sectors.ts` + `sector.*`, `lib/countries.ts` + `country.*`. La clave es el **valor exacto en
inglés** que trae la base y el respaldo es ese mismo valor, así un sector o país nuevo se dibuja
igual, sólo que sin traducir. El **inversor no se traduce**: es nombre propio.

**`cn` no es un tag BCP-47.** Es nuestra etiqueta interna; `Intl` conoce `zh`. Y no falla ruidosamente:
`localeCompare(a, b, 'cn')` cae a orden de codepoint, que no es ni pinyin ni trazos (la lista de
países salía 乌拉圭 antes que 阿根廷). Para cualquier `Intl` — `Collator`, `NumberFormat`,
`DateTimeFormat` — pasar `intlLocale(lang)` de `lib/countries.ts`. Y **ordenar por el nombre
mostrado**, no por el crudo: ordenar por el inglés deja la lista arbitraria en las otras dos lenguas.

**Todo flotante va portalizado a `<body>`.** `position: fixed` sólo es relativo al viewport si
**ningún** ancestro tiene `transform`, `filter` o `backdrop-filter`. La caja de totales del mapa usa
`backdrop-blur`: sin portal, el popover del `HelpTip` aterrizaba a ~300 px de su ícono y el
`InfoModal` quedaba encerrado dentro de esa cajita (28-07, pagado dos veces). Portalizar, no
clampear. Ojo: al portalizar, un popover que cierra por clic-afuera necesita chequear también su
propio nodo, que ya no está dentro del ref del disparador.

## Móvil: nada flota sobre el mapa (28-07)

El corte es `md` (767 px, `useIsMobile`), el mismo del panel de filtros y del menú del header.

**Regla: en teléfono el cromo del mapa no flota, se apoya.** La caja de totales, el botón del
listado y la leyenda eran tres cajas flotantes sobre 312 px de ancho útil; el botón del listado
(180 px) pisaba 76 px de la caja de totales y se comía el monto **en los tres tamaños medidos**
(360/390/414). Ahora:

- La caja de totales toma el ancho completo y sólo lleva las cifras.
- El conmutador Puntos/Datos agregados, la leyenda y el listado bajan a una **barra de acciones que
  es hermana del mapa, no una capa encima**: el mapa se achica solo, sin reservarle espacio en el
  encuadre ni pelear con la atribución de Leaflet. `displayControls` se define una vez y se
  renderiza en los dos sitios (caja en escritorio, barra en móvil).
- La barra entra en una fila a 360 px con `gap-1` y `px-1.5`: los tres controles suman 294 px sobre
  296 disponibles. Con `gap-1.5` se pasaba por 2 px y «Lista» caía a una segunda fila.
- La barra pasa a dos filas en modo agregado (aparece el segundo nivel) → el alto del mapa cambia,
  por eso el `trigger` de `InvalidateSize` incluye `filters.pieByCountry`.

El footer de socios (133 px, 21% de una pantalla de 640) arranca colapsado a una línea en móvil.
En Tendencias los cinco dropdowns pasan a una hoja con acordeones; el diagrama sube de 265 a 420 px.

**Etiquetas del Sankey en móvil:** el margen derecho por defecto de ECharts (`right: '20%'`) es donde
se dibujan las etiquetas de la última columna: en un teléfono son ~70 px y los nombres salían
cortados («Manufactura…»). En móvil se recupera ese margen (`right: '3%'`) y los nodos de `depth === 2`
llevan `label: { position: 'left' }`, o sea hacia adentro. Las otras dos columnas ya se dibujaban
sobre los flujos.

## Mapa: encuadre y límites (`MapView.tsx`)

Zona sensible, con dos trampas ya pagadas:

- **La región paneable se DERIVA del geojson cargado** (`regionOf`), intersecada con
  `REGION_CLAMP`. El alcance de países es dato (`countries.csv` → `build_borders.mjs`), así que
  sumar Centroamérica/Caribe amplía el cuadro solo. El clamp existe sólo para Isla de Pascua
  (lng −109,4, cero inversiones): si algún día entra un dato al oeste de −95, correrlo.
- **`fitBounds({padding})` no sirve para reservar el espacio de la caja de totales.** Si el
  viewport es más alto en grados que `maxBounds` (pantallas bajas), Leaflet recentra dentro de
  `maxBounds` y descarta el padding en silencio. Se resuelve desplazando el **centro** en píxeles
  proyectados (`framedView`) y metiendo el mismo offset en `maxBounds`. El alto de la caja se mide
  del DOM (`totalsRef`), porque envuelve a dos líneas en pantallas angostas.
- `RegionLimits` re-encuadra en cada `resize` **hasta el primer gesto del usuario**
  (`pointerdown`/`wheel` del contenedor, no eventos de Leaflet, que dispara nuestro propio fit).
- `MAX_ZOOM = 8` (nivel provincia) es decisión editorial: las coordenadas de la base tienen
  precisión despareja y el detalle de calle sugiere exactitud inexistente.

## Validar ≠ publicar: las dos compuertas de país (28-07)

Eran la misma cosa y no debían serlo: con la entrega del 28-07 los 4 países en incorporación
(CRI/HND/NIC/TTO) pasaron a 100% válidos, y eso solo los habría publicado en el siguiente build sin
que nadie lo decidiera.

| Compuerta | Pregunta | La contesta | Vive en |
|---|---|---|---|
| Validación | ¿el dato está bien? | el validador | reglas de `schema.md` §3/§7 |
| Publicación | ¿lo mostramos ya? | ICLAC | columna `publish` de `data/schema/countries.csv` |

`publish=no` → el país **se sigue validando** y sale en el informe como «PASA · RETENIDO», pero el
ETL no lo ingesta y `build_borders` no le arma el polígono (si no, queda un país vacío clickeable).
**Sin columna o celda vacía = publica**: el default no puede ser retener, o un CSV viejo apaga el
mapa entero. Escapes locales: `npm run etl -- --include-unpublished` (salta publicación),
`--no-filter` (salta validación). Son flags distintos a propósito.

La compuerta va en `countries.csv` y no en un archivo nuevo porque ese CSV **ya existe en el repo
del cliente**, ya es el registro de alcance de países y se edita como texto en la web de GitHub. Un
`publish.yml` aparte dejaría el alcance definido en dos lugares que hay que mantener sincronizados.

## Reglas geográficas: la caja es la del país, no una ventana regional (28-07)

`fila/coordenadas-sospechosas` comparaba contra `lat < 15 && lng < -30`, calibrado para Sudamérica.
Con Centroamérica en la base marcó **35 de las 75 filas de Honduras**, que están bien: el país llega
a ~16°N. Lo reportó el cliente y tenía razón — un validador que grita en datos correctos se vuelve
ruido y deja de leerse.

Ahora la caja sale de la **geometría del propio país** (`loadCountryBounds` sobre
`borders.geojson`), con `COORD_MARGIN_DEG = 1` de margen y `REGION_BOX` de respaldo para los países
sin geometría. Mismo principio que el alcance de países: es dato, no constante. Al cambiar, bajó de
35 falsos positivos a 0 y **apareció uno real** que la regla vieja no veía (`ECU-0041`, latitud de
Perú con Location Orellana).

Antes de agregar un umbral geográfico nuevo: preguntarse si la referencia existe ya como dato.

## Colores por sector (referencia código actual)

```
Energy:        rgba(153,17,17,1)
Manufacturing: rgba(95,25,58,1)
Mining:        rgba(9,49,77,1)
RealEstate:    rgba(53,107,126,1)
ICT:           rgba(12,202,188,1)
Infrastructure:rgba(255,169,42,1)
Agroindustry:  rgba(245,106,14,1)
Finance:       rgba(173,77,14,1)
```

## Deuda técnica del proyecto original a NO repetir

- d3 v4 cargado por CDN con `d3.event` roto → usar d3 v7 vía npm
- `MapCountry.vue` de 1034 líneas → componer en chunks pequeños
- Estado de selección en refs de módulo → URL + state
- xlsx servidos al cliente → convertir a JSON en build
- 60 MB de geojson sin simplificar → mapshaper -simplify 5%
- tw-elements 1.0 abandonado → no usar (en React no aplica)
- Sin lazy routes → usar React.lazy + Suspense

## Convenciones

- Components: PascalCase, un componente por archivo
- Hooks: prefijo `use`
- Estado global mínimo: solo locale + selección de país. URL primero, Zustand solo si no alcanza.
- No usar Pinia/Redux. Zustand si hace falta.
- Tests: vitest + react testing library. Solo lógica de filtros y validación de datos.
- i18n: **toda** cadena visible en es/en/cn. Los textos cn los escribimos nosotros y van a la cola
  del revisor externo; anotarlo en `next_steps.md` §2.2 al agregarlos. Antes de redactar uno nuevo,
  buscarlo en `legacy/locales/*.json`: buena parte ya está traducida y revisada (`landing.*` y
  `about.trends` salieron de ahí).
- **Vocabulario del equipo fuera de la UI.** «Empresa canónica», «raw», «vector», «FK» son términos
  del esquema, no del lector: en pantalla se describe lo que le pasa al dato (el Sankey dice «las
  filiales se cuentan bajo su matriz y las variantes del mismo nombre se unifican»). En
  `data/schema/` y en los scripts el término técnico sigue siendo el correcto.
- **La herramienta del Sankey se llama "Tendencias"** en la UI (Trends / 趋势, nombre del legado).
  La ruta `/sankey` y las claves `sankey.*` / `nav.sankey` **no** se renombraron: romperían enlaces
  compartidos sin cambiar nada visible.
- **Correr `npm run lint` antes de dar por cerrado**, no sólo `tsc` + tests: CI lo corre con
  `--max-warnings 0`, así que un warning rompe el build. El que ya mordió (28-07):
  `react-refresh/only-export-components` cuando un archivo de componente exporta además una
  constante o función → mover el helper a `lib/`.
- Cambios de UI visibles: verificar en navegador antes de darlos por hechos, no sólo `tsc` + tests
  (receta en `.claude/skills/verify`). Varios bugs de esta clase (encuadre, popover recortado) sólo
  aparecen a cierto tamaño de viewport.
- **ECharts: registrar TODO lo que la opción usa** en el `echarts.use([...])` de `SankeyView.tsx`,
  incluidas las *features* (`echarts/features`), no sólo charts/components/renderers. El dev server
  pre-empaqueta echarts entero y disimula lo que falte; el build tree-shakeado no. Caso real
  (27-07): sin `LabelLayout`, `labelLayout: { hideOverlap: true }` se ignoraba **sólo en producción**
  y las etiquetas del Sankey se solapaban. Si se toca la opción del gráfico, probar contra
  `npm run build && npx vite preview`, no contra `npm run dev`.

## Workflow de trabajo

- Sprints de 2 semanas
- Demo + UAT al cierre de cada sprint
- Hitos de pago: ver cotización

## Convención sobre deficiencias de datos

**Regla establecida (S2):** las deficiencias estructurales del XLSX cliente se **documentan en auditoría, no se enmascaran en código**. Ejemplos: `Location` con URL embebida, URLs pegadas en `CasoN` en vez de `LinkN`, lat/lng intercambiados, coordenadas faltantes en México. El frontend renderiza la fuente cruda; el cliente debe corregir en origen.

- **Por qué:** parchear silenciosamente oculta el problema y dificulta que el cliente lo vea. El handover S5 requiere que cliente entienda la calidad real de sus datos.
- **Excepciones legítimas:** trim de whitespace, normalización de casing, typos canonizables (`Adquisión` → `Adquisición`), overlay legado para recuperar geometría (regresión documentada §8), dedup de `research_cases` por título en vectores (artefacto de arrastre Excel que duplicaba citaciones con `Link` autoincremental). Estas curaciones automáticas viven en `scripts/etl.mjs` y se listan en `docs/sprint_2/auditoria_datos.html` sección "Curación aplicada de nuestro lado".

## Documentos vivos (leer al retomar)

`docs/` está organizado por sprint; ver `docs/README.md` como índice.

Tres documentos vivos con contenidos que **no se mezclan** (separados el 28-07; antes todo vivía en
`next_steps.md`, que llegó a 584 líneas con la mitad de bitácora adentro). El criterio de ruteo es
*¿esta línea cambia lo que hago después?*:

- `docs/generales/next_steps.md` — **sólo lo que falta**. Al cerrar un ítem se **borra** de ahí y se
  registra en el devlog; no se marca ✅.
- `docs/generales/devlog.md` — **qué pasó**: procedencia, mediciones, trampas pagadas. Reverso
  cronológico. Acá va el "por qué salió así", no en next_steps.
- `docs/generales/correcciones_cliente.md` — **cola de correcciones de datos para el cliente**
  (C1–C11 + puntos abiertos). Borrador del próximo correo a Flo.

El cuarto destino es este archivo: las reglas de código que no caducan.
- `docs/sprint_2/auditoria_datos.html` — entregable consolidado para cliente (Entrega 1 + México), reemplaza `sprint_2/raw/auditoria_xlsx_entrega1.md` + `auditoria_mexico.md` como vista canónica.
- `docs/sprint_3/validacion_entrega_datos_24062026.html` — validación de la base corregida del cliente (`AUDITADO_COMPLETO.xlsx`) + propuesta de flujo de datos por país.
- `docs/generales/pipeline_datos.md` — flujo XLSX → ETL → JSON → mapa.
- `docs/sprint_2/plan_s2.md` — estado del sprint.

`docs/` está gitignored (local-only) → mover fuera o ajustar `.gitignore` antes del handover S5 si cliente debe verlos.

## Scripts (no estándar de npm)

- `npm run etl` (`scripts/etl.mjs`) — XLSX → `public/data/investments.json`. Corre en cada build Netlify. **Modo directorio (23-07):** si el input es una carpeta, lee todos los `*.xlsx` (primera hoja, flujo por país) y **filtra por dos compuertas**: los países que PASAN validación (23-07; `--no-filter` desactiva) y los que el registro marca `publish=yes` (28-07; `--include-unpublished` desactiva). Modo archivo único (base legada, hoja `Total`) intacto. Canoniza Country + carga `Ownership`/`Origin_Of_Seller` vía la capa compartida. **También emite la descarga pública** `public/data/iclac_inversiones_china_latam.xlsx` (28-07): hojas `README` / `investments` (con `coordinates` abierto en `lat`/`lng`) / `case_studies`. Es el archivo que sirve la pestaña Datos, así que si cambia la forma de las filas, cambia la descarga.
- `npm run validate` (`scripts/validate_data.mjs` + núcleo `scripts/lib/validate.mjs`) — valida XLSX por país contra `data/schema/schema.md` §7. Corre en GH Actions (`validate-data.yml`, **reconectado** 23-07: trigger `push` en `data/sources/countries/**`; corre validación + `build_validation_report.mjs` como `index.html` y lo **publica en GitHub Pages** con link fijo `https://<org>.github.io/<repo>/`). Acepta un **directorio** (se expande a sus `*.xlsx`). Para activar en el repo cliente `nucleomilenioiclac/iclac-mapa-fdi`: desplegar el pipeline (tenemos push) + habilitar Settings>Pages>Source="GitHub Actions" (§0.a). También acepta rutas explícitas (bases agregadas). Umbral 95% e id `ALPHA3-NNNN` como warning = pendientes de confirmación cliente (`--strict-ids`). Tests en `scripts/validate.test.mjs`. **País como dato (v1.4, 23-07):** el alcance ya NO está hardcodeado — se carga de `data/schema/countries.csv` (registro semilla, toda la región, México excluido) vía `scripts/lib/load_registry.mjs`; el núcleo lo recibe por `opts.registry` (sigue puro). **Capa de normalización** `scripts/lib/normalize.mjs` (compartida con el ETL): quita apóstrofe de `COUNTRY_ISO_NUM`/`Id_Seq`, canoniza `Country`, nombre de archivo case-insensitive; las curaciones se listan (no se enmascaran). `Area_ES` salió de validación de formato → sólo `fila/sector-conflicto` (warning, conflicto conceptual EN↔ES). Chequeo `archivo/sin-borde` (compuerta blanda) contra la semilla de bordes. **Inversor sin mapear (28-07):** warning `fila/inversor-sin-mapear`, uno por nombre distinto, para la cola del steward; el set de nombres conocidos lo carga `loadInvestorMap()` y si `investors_map.csv` no está el chequeo se salta solo (el repo del cliente aún no lo lleva). Un país con `publish=no` se valida igual y sale como «PASA · RETENIDO».
- `node scripts/build_borders.mjs [dirDatos]` (`scripts/lib/countries.mjs`) — **one-off idempotente**, NO en build chain aún. Desde `legacy/data/america.geojson` (Natural Earth) genera: (1) `data/sources/geo/borders.geojson` = semilla de bordes disponibles (todos los del registro con geometría) que el validador consulta para `archivo/sin-borde`; (2) `public/data/south-america.geojson` = mapa filtrado a países que pasan validación (si se da dirDatos) **y están marcados `publish=yes`** + decorativos, preservando la resolución de los países existentes (NE solo para nuevos), **México excluido**. `south-america.geojson` está versionado y lo usa el mapa vivo → correrlo es parte de la integración de la base nueva.
- `node scripts/build_validation_report.mjs <dir|archivos> [--out ruta] [--fragment]` — informe HTML autocontenido de validación para el cliente (Flo): países colapsables con conteo de tipos, bloqueante vs aviso, curaciones aplicadas, checklist de incorporación de país (geometría/datos), conflicto de sector destacado. `--fragment` para publicar como Artifact.
- `npm run conflicts` (`scripts/export_vector_conflicts.mjs`) — genera XLSX de conflictos Vector para revisión cliente.
- `node scripts/merge_geo.mjs` — **one-off idempotente**, NO está en build chain. Mergea polígonos Panamá (de `legacy/data/america.geojson`) + México (de `public/data/mx.json`) en `south-america.geojson`. Re-correr es seguro: skip si ya están.
- `node scripts/build_investors_map.mjs` — **one-off**, genera `public/data/investors_map.json` desde `data/schema/investors_map.csv` (mapeo investor_raw→canónico/ownership para el Sankey). NO está en build chain aún; foldear en `etl.mjs` antes del handover.
- `node scripts/build_id_map.mjs` — **one-off**, genera `docs/sprint_3/equivalencia_ids.xlsx`: equivalencia Id_Investment legado → formato propuesto `ALPHA3-NNNN` (entregable 26/06 §II.4). Re-correr regenera la tabla desde la última base del cliente.
- `node scripts/build_fdi_share.mjs` — **one-off**, análisis métricas FDI: share chino del stock total (vs UNCTAD) + brecha vs posición oficial bilateral (vs FMI CDIS). `investments.json` + `data/external/{unctad_fdi_stock,imf_cdis_china}.csv` → `docs/sprint_4/analisis_fdi_share.xlsx` (5 hojas). Sin UI (decisión 04-07: datos primero, tab después). Re-correr tras integrar base nueva o refresh anual de fuentes.
- `node scripts/build_fdi_share_report.mjs` — **one-off**, genera `docs/sprint_4/informe_fdi_share.html` (informe cliente-ready, 4 figuras SVG inline) desde el xlsx anterior. Corre después de `build_fdi_share.mjs`. Aplica corrección de presentación Zijin/Surinam (3.600→360, marcada con asterisco) sin tocar datos fuente.
- `node scripts/audit_base.mjs` — **one-off**, auditoría de datos: cruza el archivo RA de Fran (`transformation_loading/Datos-de-descarga(revisado por Max, Allison y Claude).xlsx`, fuente de verdad para montos) contra `docs/sprint_3/AUDITADO_COMPLETO_26_06.xlsx` + detector de geometría duplicada entre ids → `docs/sprint_4/auditoria_base.xlsx` (5 hojas). Re-correr tras cada entrega nueva del cliente. Análisis en `docs/sprint_4/auditoria_base.md`; cola de correcciones en `docs/generales/correcciones_cliente.md`.
- `npm run validate:countries` (`scripts/validate_countries.mjs` + núcleo `scripts/lib/validate_countries.mjs`) — valida el **registro de países** `data/schema/countries.csv`. Existe porque ese archivo dejó de ser una lista: su columna `publish` decide qué sale publicado, y un archivo de control se valida como cualquier dato. Detecta sobre todo los dos daños de abrirlo en Excel, ambos silenciosos: **separador `;`** (Excel en regional español) y **ceros a la izquierda comidos** (`032`→`32`), más alpha3/filename duplicados y `publish` fuera de `{yes,no}` (ojo: cualquier otro valor se leería como `yes`). **Job aparte en el workflow** (`registro`), sin `continue-on-error`: si el registro se rompe el run queda rojo, mientras el job `report` publica el informe igual. Tests en `scripts/validate_countries.test.mjs` (incluye el CSV real).
- `node scripts/drop_base_columns.mjs <dirEntrada> <dirSalida>` — saca de la base por país las columnas con una segunda fuente en conflicto. Hoy: `Ownership` y `Ownership_Original` (schema v1.5). Emite respaldo en `docs/sprint_5/respaldo_columnas_ownership.xlsx`: «está en el historial de git» no es una vía de recuperación para el cliente. NO toca `reliability_score` (discusión abierta), `Id_Investment_Original` (llave del join) ni `source1-3`. Reescribe la hoja entera, así que verificar celda a celda contra el original antes de dar por buena una corrida (la del 28-07: 726.770 celdas comparadas, 0 diferencias fuera de las 2 columnas).
- `npm run validate:investors` (`scripts/validate_investors.mjs` + núcleo `scripts/lib/validate_investors.mjs`) — valida la **tabla de inversores** `data/schema/investors_map.csv`: enum de ownership, `investor_raw` único, `company_id ↔ company_canonical` 1:1, ownership consistente por `company_id`. Convención de 2 lugares (schema §5.2): base=raw, tabla=identidad+ownership. Tests en `scripts/validate_investors.test.mjs` (incluye test del CSV real). Paso guardado en el workflow. Halló colisión real de `company_id` entre 2 consorcios (24-07).
- `node scripts/restore_investor_raw.mjs <dirEntrada> <dirSalida>` — **one-off** (opción 1, 24-07): restaura el nombre RAW del inversor en la base (la entrega lo había normalizado a canónico y `Investor_Original` llegó roto). Join por `Id_Investment_Original` (numérico) contra la base **pre-Flo inmediatamente anterior** (`docs/sprint_3/AUDITADO_COMPLETO_26_06.xlsx`, con `AUDITADO_COMPLETO` y `entrega1` como relleno); edición in-place. **Recupera 100% (12.446 filas, 0 sin raw).** Ojo: joinear solo contra `entrega1` daba 4 falsas "nuevas" (entraron en una entrega intermedia). Cobertura Sankey con raw: 100%.
- `node scripts/audit_ownership_cross.mjs <dirBaseXlsx>` — **one-off** (E.1), verifica que la base del cliente haya aplicado los veredictos de ownership de la revisión externa (`docs/sprint_5/ownership_review_ywedits.xlsx`). Cruza base ↔ raw_mapping ↔ veredicto Yifang por empresa → `docs/sprint_5/auditoria_ownership_cross.xlsx`. **Hallazgo 23-07: la base NO aplicó las 30 correcciones (solo el rename SASAC→Central SOE)** → next_steps C10.
- `node scripts/rebuild_investors_map_ownership.mjs` — **one-off** (E.2), reescribe la columna `ownership` de `investors_map.csv` con el veredicto de Yifang en el enum nuevo (`Central SOE/Local SOE/POE/MIXED/UNKNOWN`; 30 WRONG aplicados + traducción). Respaldo en `.bak`. Después correr `build_investors_map.mjs`. La fuente de ownership es este CSV, NO la base (schema §5.1).
- `node scripts/check_investor_coverage.mjs [investments.json] [investors_map.json]` — **handover asset**: lista los `Investor` de la base que no están en `investors_map` (caen a UNKNOWN en el Sankey). Mecanismo de degradación elegante: el mapa no se rompe con un inversor nuevo, este chequeo le dice al steward qué clasificar. → `docs/sprint_5/cobertura_inversores.xlsx`. **Nota:** `build_investors_map.mjs` (y el inline del ETL) keyean por `investor_raw` **y** `company_canonical` — sin el canónico, la base nueva (que usa el nombre canónico como `Investor`) caía ~50% a UNKNOWN.
- `node scripts/build_ownership_review.mjs` — **one-off**, genera `docs/sprint_5/ownership_review.xlsx` (instrumento de revisión ownership para Yifang Wang/Dialogue, hilo 8–11 jul) desde `data/schema/investors_map.csv`. Hojas README/companies/consortiums/raw_mapping + columnas de veredicto; companies ordenadas UNKNOWN/MIXED primero. Doc compañero: `docs/sprint_5/investor_base_guide_12072026.html` (inglés). Reglas del sistema de ids: `data/schema/investors_map.README.md`. Re-correr tras cada cambio del CSV; al integrar correcciones, regenerar también `investors_map.json` (`build_investors_map.mjs`).
