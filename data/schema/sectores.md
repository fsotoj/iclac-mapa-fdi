# Sectores canónicos — mapa_FDI

**Versión:** 1.2 (2026-07-04)
Enum cerrado para `Area_EN` / `Area_ES` en `schema.md`. Dimensión de color, leyenda y filtro Sankey (S5).
**Fuente de verdad:** sección II.5 de `docs/sprint_3/entrega_2606_validacion_esquema_04072026.html`.

> **v1.2 (rev. 2026-07-04):** sincronizado con el entregable 26/06 (II.5). La 8ª categoría queda
> `Infrastructure` / **`Infraestructura`** en ES (igual que ya la manda el cliente) — cierra el
> "pendiente menor" de wording de la revisión anterior, que proponía `Construcción` como label ES.
> Se explicita la consecuencia de un `Area_EN` no exacto (punto gris + categoría duplicada en filtro).
>
> **v1.2 (2026-06-25):** lista **zanjada por Francisco** (hilo de correo 24-06-2026) = **metodología
> publicada** (`docs/generales/metodologia.md` líneas 155-161). Revierte la v1.1: **`Services` fue
> rechazado**, **`Bienes Raíces` se queda**, no hay rename a `Agriculture`. Coincide con la lista
> original de CLAUDE.md.

## Lista canónica (8)

| `Area_EN` | `Area_ES` | Color (rgba) | Nota |
|---|---|---|---|
| `Energy` | `Energía` | `rgba(153,17,17,1)` | |
| `Manufacturing` | `Manufactura` | `rgba(95,25,58,1)` | locale viejo decía "Manufacturas" |
| `Real Estate` | `Bienes Raíces` | `rgba(53,107,126,1)` | se mantiene (Services rechazado) |
| `Mining` | `Minería` | `rgba(9,49,77,1)` | |
| `ICT` | `TIC` | `rgba(12,202,188,1)` | |
| `Agroindustry` | `Agronegocios` | `rgba(245,106,14,1)` | metodología EN = "agribusiness" |
| `Finance` | `Finanzas` | `rgba(173,77,14,1)` | |
| `Infrastructure` | `Infraestructura` | `rgba(255,169,42,1)` | = construction/infrastructure projects; **monto excluido del FDI total** |

## La 8ª categoría: `Infrastructure` = `Infraestructura` (FDI-excluded)

La metodología define **7 sectores + "infrastructure/construction projects"** como 8ª categoría:

> *"seven categories plus the aforementioned infrastructure projects… We remove construction project values from our counts of total Chinese operational FDI."* (`metodologia.md`)

Tres nombres, **una misma categoría**:
- `Infrastructure` — string canónico de `Area_EN` (y key en `sectors.ts`/locales).
- `Infraestructura` — label ES, **igual que ya la manda el cliente** en la base.
- "construction/infrastructure projects" — wording de la metodología EN.

Implicaciones:
- Su **monto se excluye del total FDI** (regla `includeConstruction` del front; riesgo de sobreconteo en `next_steps`).
- Es la misma categoría que `Project_Type = 'Construcción'` (contratos de obra sin propiedad china):
  el tipo `Construcción`, el sector `Infrastructure`/`Infraestructura` y la regla de exclusión del FDI
  son una sola cosa vista desde tres ángulos. La exclusividad de `Project_Type` quedó **resuelta**
  en `schema.md` §9 (v1.2): enum único, booleanas fuera.

## Traducción: la hace el frontend, no el Excel

La traducción del sector a los 3 idiomas (es / en / cn) la hace el **frontend vía i18n, keyed por
`Area_EN`** — basta con que `Area_EN` traiga exacto uno de los 8 valores canónicos.

**Si el valor no matchea exacto** (p. ej. valor en español en `Area_EN`, typo, casing), no es solo
texto en el idioma equivocado: esas inversiones se pintan **grises** en el mapa (color por defecto,
no el del sector) y aparecen como **una categoría duplicada en el filtro** — en los 3 idiomas.

## ⚠️ Cambios pendientes en código (lista vieja sigue activa)

Actualizar **a la vez**:
- `src/lib/sectors.ts` (`SECTOR_COLORS`): mantener las 8 keys; alinear con esta tabla. Quitar la key duplicada `RealEstate` (dejar solo `Real Estate`).
- `src/locales/{es,en,cn}.json` clave `sector.*`: ES `Manufactura` (no "Manufacturas"), `Agronegocios` (no "Agroindustria"), **`Infraestructura`** para Infrastructure.
- `CLAUDE.md` sección "Colores por sector": ya tenía la lista correcta; solo ajustar labels ES si hace falta.
- cn: **diferido** (Margaret coordina traductor; correo 24-06-2026).

## Reglas

- `Area_EN` debe ser **exactamente** uno de los 8 valores `EN` (case-sensitive).
- `Area_ES` debe ser la traducción pareada de la misma fila (`Area_EN=Mining` ⇒ `Area_ES=Minería`).
- Ambos **obligatorios** (req). Sin sector la inversión no se puede pintar ni clasificar (color/leyenda/Sankey).

## Normalizaciones que aplica el ETL (no amplían el enum)

- `trim` de espacios.
- Title-case si llega en minúscula (`mining` → `Mining`, `Bienes raíces` → `Bienes Raíces`).

El valor resultante debe caer igual en la lista canónica.

## No-canónicos (corregir en origen)

| Valor | Acción |
|---|---|
| `Services` | **NO es canónico** (rechazado; contradecía la metodología). Reclasificar a uno de los 8. |
| `RealEstate` (sin espacio) | normalizar a `Real Estate`. |
| Valores ES en `Area_EN` (`Infraestructura`, `Energía`, `Bienes Raíces`…) | regresión conocida (entrega 26/06: 104 filas). Corregir a la clave EN. |
| cualquier otro fuera de los 8 | reclasificar contra metodología. |
