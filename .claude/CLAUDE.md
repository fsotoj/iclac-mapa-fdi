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

- `docs/generales/next_steps.md` — lista de tareas pendientes (bloqueadas en cliente + accionables). Documento vivo.
- `docs/sprint_2/auditoria_datos.html` — entregable consolidado para cliente (Entrega 1 + México), reemplaza `sprint_2/raw/auditoria_xlsx_entrega1.md` + `auditoria_mexico.md` como vista canónica.
- `docs/sprint_3/validacion_entrega_datos_24062026.html` — validación de la base corregida del cliente (`AUDITADO_COMPLETO.xlsx`) + propuesta de flujo de datos por país.
- `docs/generales/pipeline_datos.md` — flujo XLSX → ETL → JSON → mapa.
- `docs/sprint_2/plan_s2.md` — estado del sprint.

`docs/` está gitignored (local-only) → mover fuera o ajustar `.gitignore` antes del handover S5 si cliente debe verlos.

## Scripts (no estándar de npm)

- `npm run etl` (`scripts/etl.mjs`) — XLSX → `public/data/investments.json`. Corre en cada build Netlify.
- `npm run conflicts` (`scripts/export_vector_conflicts.mjs`) — genera XLSX de conflictos Vector para revisión cliente.
- `node scripts/merge_geo.mjs` — **one-off idempotente**, NO está en build chain. Mergea polígonos Panamá (de `legacy/data/america.geojson`) + México (de `public/data/mx.json`) en `south-america.geojson`. Re-correr es seguro: skip si ya están.
- `node scripts/build_investors_map.mjs` — **one-off**, genera `public/data/investors_map.json` desde `data/schema/investors_map.csv` (mapeo investor_raw→canónico/ownership para el Sankey). NO está en build chain aún; foldear en `etl.mjs` antes del handover.
