# Sectores canónicos — mapa_FDI

**Versión:** 1.2 (2026-06-25)
Enum cerrado para `Area_EN` / `Area_ES` en `schema.md`. Dimensión de color, leyenda y filtro Sankey (S5).

> **v1.2:** lista **zanjada por Francisco** (hilo de correo 24-06-2026) = **metodología publicada**
> (`docs/generales/metodologia.md` líneas 155-161). Revierte la v1.1: **`Services` fue rechazado**,
> **`Bienes Raíces` se queda**, no hay rename a `Agriculture`. Coincide con la lista original de CLAUDE.md;
> solo se afinan labels ES y se aclara la 8ª categoría.

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
| `Infrastructure` | `Construcción` | `rgba(255,169,42,1)` | = construction/infrastructure projects; **excluida del FDI total** |

## La 8ª categoría: `Infrastructure` = `Construcción` (FDI-excluded)

La metodología define **7 sectores + "infrastructure/construction projects"** como 8ª categoría:

> *"seven categories plus the aforementioned infrastructure projects… We remove construction project values from our counts of total Chinese operational FDI."* (`metodologia.md`)

Tres nombres, **una misma categoría**:
- `Infrastructure` — string en código legacy (`sectors.ts`, locales).
- `Construcción` — etiqueta ES acordada por Francisco/Florencia.
- "construction/infrastructure projects" — wording de la metodología EN.

Implicaciones:
- Su **monto se excluye del total FDI** (regla `includeConstruction` del front; riesgo de sobreconteo en `next_steps`).
- Coincide con el valor `Project_Type = 'Construcción'`. Por eso la exclusividad de Construcción (schema §9)
  no es solo un tema de `Project_Type`: es **la misma categoría que el sector 8**. Resolver §9 y esta fila juntas.
- **Pendiente menor:** confirmar el string exacto de `Area_EN` para esta fila (`Infrastructure` vs `Construction`)
  y los labels ES `Manufactura`/`Agronegocios`. Decisión de wording, no metodológica.

## ⚠️ Cambios pendientes en código (lista vieja sigue activa)

Actualizar **a la vez**:
- `src/lib/sectors.ts` (`SECTOR_COLORS`): mantener las 8 keys; alinear con esta tabla. Quitar la key duplicada `RealEstate` (dejar solo `Real Estate`).
- `src/locales/{es,en,cn}.json` clave `sector.*`: ES `Manufactura` (no "Manufacturas"), `Agronegocios` (no "Agroindustria"), `Construcción` para Infrastructure.
- `CLAUDE.md` sección "Colores por sector": ya tenía la lista correcta; solo ajustar labels ES si hace falta.
- cn: **diferido** (Margaret coordina traductor; correo 24-06-2026).

## Reglas

- `Area_EN` debe ser **exactamente** uno de los 8 valores `EN` (case-sensitive).
- `Area_ES` debe ser la traducción pareada de la misma fila (`Area_EN=Mining` ⇒ `Area_ES=Minería`).
  - Excepción de diseño: `Infrastructure` ↔ `Construcción` no es traducción literal (ver arriba).
- Ambos **obligatorios**. Sin sector la inversión pierde color/leyenda/Sankey.

## Normalizaciones que aplica el ETL (no amplían el enum)

- `trim` de espacios.
- Title-case si llega en minúscula (`mining` → `Mining`).

El valor resultante debe caer igual en la lista canónica.

## No-canónicos (corregir en origen)

| Valor | Acción |
|---|---|
| `Services` | **NO es canónico** (rechazado). Reclasificar a uno de los 8. |
| `RealEstate` (sin espacio) | normalizar a `Real Estate`. |
| cualquier otro fuera de los 8 | reclasificar contra metodología. |
