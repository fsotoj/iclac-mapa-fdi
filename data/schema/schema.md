# Esquema canónico de datos — mapa_FDI

**Versión:** 1.0 (2026-06-25)
**Estado:** propuesta para el flujo por país (next_steps 2.1). Base del validador JS de GH Actions (2.3).

Este documento define el **contrato de datos** que debe cumplir cada archivo de inversiones.
Una columna por campo. Sin columnas de trabajo (`*_ORIG`, `*_ARREGLADO`). Sin columnas redundantes.

Derivado de lo que consumen el ETL (`scripts/etl.mjs`) y los tipos (`src/types/data.ts`).
Lo que no aparezca aquí, el ETL lo ignora.

---

## 1. Alcance y formato del archivo

- **Un archivo por país** en `data/sources/countries/<ISO3>.xlsx` (p. ej. `CHL.xlsx`, `ARG.xlsx`).
- Una sola hoja con los datos. Nombre de hoja libre; si hay varias, se usa la primera (o `Total`/`TOTAL_*` si existe).
- Primera fila = cabeceras exactas de la tabla §3 (sensible a mayúsculas).
- Codificación UTF-8. Decimales con punto (`1234.5`), no coma.
- Sin filas en blanco intercaladas ni columnas fantasma (`__EMPTY*`).

### Granularidad de filas

Una **inversión** puede ocupar **1 o N filas**:
- `Vector = Punto` → 1 fila = 1 punto. (Aunque compartan `Id_Investment`, cada fila Punto sale como punto independiente; el ETL **no** las agrupa.)
- `Vector = Vector` → N filas = waypoints de una **polilínea**. Los waypoints de una misma línea comparten **`Id_Investment` + `Path`**. El orden de filas es el orden de la línea.

### `Path`: discriminador de línea (no es "vacío para Punto")

`Path` no se deja en blanco. Su rol depende de `Vector`:
- **`Punto`** → convención `Path = 0` (centinela). El ETL **ignora** el valor de `Path` en filas Punto, así que cualquier valor "funciona", pero entregar `0` mantiene la base limpia. **Confirmado con cliente** (correo 24-06-2026): dejar `0` para todo punto, sea único o no, está bien.
- **`Vector`** → `Path` es un entero `≥ 1` que **numera la línea** dentro del mismo `Id_Investment`. Una inversión puede tener **varias líneas separadas**: p. ej. `Id_Investment = 15100` con `Path = 1` y `Path = 2` produce **dos** polilíneas. El ETL agrupa por `(Id_Investment, Path)`; cada par = una línea.

> ⚠️ En una línea (`Vector`, mismo id+path), los campos no geográficos (monto, sector, detalle…) se repiten por waypoint. El ETL toma el valor de la **primera fila** del grupo. Mantenerlos consistentes.

---

## 2. Convenciones de tipos

| Tipo | Regla |
|---|---|
| `texto` | string; se hace `trim`; vacío → `null` |
| `entero` | número sin decimales |
| `decimal` | número con punto decimal |
| `enum` | uno de un conjunto cerrado (case-sensitive salvo nota) |
| `coords` | `"lat, lng"` en una celda; ver §4 |
| `bool-YN` | literal `Yes` / `No` |

Obligatoriedad:
- **req** = obligatorio; fila sin él se **descarta** en ETL.
- **opt** = puede ir vacío → `null`.

---

## 3. Columnas canónicas

| Columna | Tipo | Oblig. | Formato / enum | Notas |
|---|---|---|---|---|
| `Id_Investment` | texto | **req** | basado en ISO, guardar como **texto** | Ver §5. Único por inversión (mismo en todas las filas de un Vector). |
| `Coordinates` | coords | **req** | `"lat, lng"` | Ver §4. Fila sin coords válidas se descarta. |
| `Year` | entero | opt | `1900–<año actual>` | |
| `Country` | texto | **req** | nombre país | Debe ser consistente con `COUNTRY_ISO_ALPHA3`. |
| `COUNTRY_ISO_NUM` | texto | **req** | ISO 3166-1 numérico, 3 díg. con ceros (`152`=Chile) | Guardar como texto (preservar ceros). |
| `COUNTRY_ISO_ALPHA3` | enum | **req** | ISO 3166-1 alfa-3 (`CHL`, `ARG`…) | Debe coincidir con el nombre del archivo. |
| `Province_ISO` | texto | opt | ISO 3166-2 (`CL-RM`) | Subdivisión. |
| `Investor` | texto | **req** | | Empresa inversora (clave del filtro Sankey S5). |
| `Vector` | enum | **req** | `Punto` \| `Vector` | Define geometría. Ver §1. |
| `Path` | entero | **req** | `0` para `Punto`; `≥1` para `Vector` | Numera la línea dentro de un `Id_Investment`. Agrupa waypoints `(id, Path)`. Ver §1. |
| `Area_EN` | enum | **req** | 8 sectores canónicos (`sectores.md`) | **No omitir.** Es la dimensión de color/leyenda/Sankey. |
| `Area_ES` | enum | **req** | traducción canónica (`sectores.md`) | Debe corresponder 1:1 con `Area_EN`. |
| `Detail_ES` | texto | opt | | Descripción en español. |
| `Detail_EN` | texto | opt | | Descripción en inglés. |
| `Investment` | decimal | opt | **millones de USD** | Unidad fija (no mezclar). Mismo valor en todas las filas de un Vector. |
| `Location` | texto | opt | dirección / lugar | Texto plano, **sin URLs** embebidas. |
| `Project_Type` | enum | **req** | `Adquisición` \| `Greenfield` \| `Construcción` | Canónico en español. Tildes correctas. |
| `Joint_Venture` | bool-YN | opt | `Yes` \| `No` | Vacío = `No`. |
| `Origin of seller` | texto | opt | | Origen del vendedor (en adquisiciones). |
| `Stake` | decimal | opt | porcentaje `0–100` | % adquirido. |
| `Research` | enum | **req** | `Yes` \| `No` | Ver §6. |
| `Caso1`…`Caso14` | texto | opt | título del estudio/fuente | Ver §6. |
| `Link1`…`Link14` | texto | opt | URL (`http…`) | Pareado con `CasoN`. La **URL va aquí**, no en `CasoN`. |

### Columnas que NO deben ir (eliminar antes de entregar)

- Booleanos redundantes con `Project_Type`: `Greenfield`, `Acquisition`.
  En la base actual son one-hot exacto de `Project_Type` (8938 `Adquisición`=`Acquisition`, 713 `Greenfield`); no aportan información.
- Columnas de trabajo: cualquier `*_ORIG`, `*_ARREGLADO`, `Project_Type_ES`/`Project_Type_EN` (colapsar en `Project_Type`).
- Columnas fantasma `__EMPTY*` (artefacto de Excel).

> ⚠️ **`Construction` NO está resuelto** — ver §9. No eliminar hasta que el cliente decida si `Construcción` es excluyente o un componente que se superpone a otro tipo.

---

## 4. Formato de coordenadas

- Una celda: `"-33.45, -70.66"` → `lat, lng`.
- **Orden: latitud primero, longitud después.** (Error frecuente en origen: invertidas.)
- Rangos: `lat ∈ [-90, 90]`, `lng ∈ [-180, 180]`.
- Decimal con punto. Sin grados/minutos, sin `N/S/E/W`.
- Para LATAM continental se espera `lat < 15` y `lng < -30`; fuera de eso, revisar (probable inversión lat/lng).

---

## 5. Identificador (`Id_Investment`)

- **Texto** siempre, no número (preservar ceros a la izquierda y evitar colisiones por coerción numérica de Excel; el cero inicial causó la colisión `0019100`).
- **Adoptar ID basado en ISO — ahora.** En el hilo de correo 24-06-2026 Florencia aceptó la propuesta de Felipe: usar las columnas `COUNTRY_ISO_*` (ya pobladas) como base del `Id_Investment` en vez del código de país heredado, **manteniendo compatibilidad con los registros existentes**. (Revierte el "diferir a futuro" del primer correo de Florencia.)
  - **Pendiente cliente:** formato exacto (Florencia lo está evaluando). El validador exige tipo texto; la regla de formato se fija cuando confirme.
- **No es único global.** El mismo `Id_Investment` se repite por diseño: en cada waypoint de una línea (mismo id+`Path`), y puede aparecer en varias líneas (`Path` distinto) o en varios puntos. La clave de geometría es `(Id_Investment, Path)`, no el id solo.
- **Scope de unicidad: LATAM.** La validación de unicidad/consistencia de IDs se hace dentro del conjunto LATAM (México se integra después).
- Estable entre entregas (no re-numerar; el ID es la clave de seguimiento).

### `Company_Id` (nuevo — pendiente de implementar)

Francisco pidió un **identificador propio por empresa**, aparte del `Id_Investment`:
- La propiedad (SOE/POE/SASAC, ver §10) se clasifica **una sola vez por empresa** y se hereda a todas sus inversiones.
- Hace directo detectar cuándo un mismo inversor reaparece → alimenta `previous_fdi` (§10).
- Aún no está en los datos; se agrega al consolidar la versión final.

---

## 6. Research y citas (`Research` + `CasoN`/`LinkN`)

- `Research`: `Yes` si la inversión tiene respaldo en estudio/paper; `No` si solo prensa o sin fuente formal.
  - **Pendiente cliente (1.A6):** revisar sobre-asignación (≈77% `Yes` en la última base) y separar noticias de research.
- Por cada fuente `n` (1–14): título en `Cason`, **URL en `Linkn`**.
  - Regresión conocida (1.A5): hay URLs pegadas en `CasoN` con `LinkN` vacío. **Mover la URL a `LinkN`.**
- El ETL deduplica casos por **título** dentro de una inversión Vector (waypoints repiten la misma cita).

---

## 7. Resumen legible por máquina (para el validador)

Tabla fuente del validador JS (2.3). `req` = obligatorio, `enum` = conjunto cerrado.

```
Id_Investment        text   req   (no único global; ver reglas inter-fila)
Coordinates          coords req   lat[-90,90] lng[-180,180]
Year                 int    opt   [1900,CURRENT_YEAR]
Country              text   req
COUNTRY_ISO_NUM      text   req   /^\d{3}$/
COUNTRY_ISO_ALPHA3   enum   req   ISO3166-1-alpha3 ; == filename
Province_ISO         text   opt
Investor             text   req
Vector               enum   req   {Punto,Vector}
Path                 int    req   Vector==Punto => 0 ; Vector==Vector => >=1
Area_EN              enum   req   sectores.md::EN
Area_ES              enum   req   sectores.md::ES ; pairs-with Area_EN
Detail_ES            text   opt
Detail_EN            text   opt
Investment           number opt   >=0 ; unit=MUSD
Location             text   opt   no-url
Project_Type         enum   req   {Adquisición,Greenfield,Construcción}
Joint_Venture        enum   opt   {Yes,No}
Origin of seller     text   opt
Stake                number opt   [0,100]
Research             enum   req   {Yes,No}
Caso1..Caso14        text   opt
Link1..Link14        text   opt   url-if-present ; pairs-with CasoN
```

Reglas inter-fila:
- Una **línea** = grupo de filas con mismo `(Id_Investment, Path)` y `Vector=Vector`.
- Un `Id_Investment` puede repetirse: en varios puntos, o en varias líneas (`Path` distinto). No exigir `Id_Investment` único global. Unicidad se evalúa en scope **LATAM**.
- En una línea, los campos no geográficos deben ser idénticos entre sus filas.
- `Country` consistente con `COUNTRY_ISO_ALPHA3`.
- **Multi-point = punto por punto** (confirmado): una inversión con N sitios = N registros (p. ej. CNPC Perú 5.153 puntos = 5.153 filas). Al **sumar montos**, deduplicar por `Id_Investment` para no sobrecontar (ver riesgo de sobreconteo en `next_steps`).

**Umbral del validador (2.3):** el cliente acepta **95%** de filas válidas como umbral (correo 24-06-2026). El validador reporta el % válido y falla bajo 95% (no exige 100%).

---

## 8. Pendientes que afectan al esquema

| Ref | Pendiente | Impacto en esquema |
|---|---|---|
| 1.A2 | ✅ Lista de 8 sectores cerrada por cliente (correo) — falta **reclasificar filas `Real Estate`** + color `Services` | enum en `sectores.md` v1.1; sector **req** |
| 1.A7 | ✅ Resuelto: mantener IDs actuales, **no** reindexar a ISO (diferido) | §5 actualizado |
| 1.B3 | `Location` como dirección (opción A/B/C) — ayudantes implementan | §3: `Location` texto sin URL |
| 1.B5 | Unidad de `Investment` | asumida **MM USD**; metodología dice "amounts in US dollars" pero **no dice "millones" textual** — la magnitud lo implica (total ≈ 216.819 → ~US$ 216 mil M; umbral CGIT 100 M). El header del mapa ya muestra `US$ … MM`. **Confirmar con Fran.** Ver §11 |
| §11 | **Total FDI incluye Construcción** (decisión provisional del cliente) | el header suma todo incl. Construcción; metodología (§9) la **excluye** del FDI. Confirmar con Fran. Ver §11 |
| 1.B4 | Filtro Joint Venture en UI | columna ya en esquema; uso UI aparte |
| §10 | `previous_fdi` (no booleano; convención repo) + `soe`/`poe`/`sasac` + `Company_Id` | semántica definida por Francisco; implementación pendiente |
| §9 | **Exclusividad de `Construcción`** = 8ª categoría sector (Infrastructure) | resolver junto con `sectores.md` |

Ver `docs/generales/next_steps.md`, `docs/sprint_3/correo_cliente_entrega_24062026.md` y `docs/sprint_3/validacion_entrega_datos_24062026.html`.

---

## 9. Pendiente: ¿es `Construcción` excluyente? (no resuelto)

`Project_Type` modela el tipo como **un solo valor** (`Adquisición` | `Greenfield` | `Construcción`).
El ETL deriva `is_construction = (Project_Type === 'Construcción')` y el front filtra con `includeConstruction`
(además del riesgo conocido de sobreconteo: "excluir Construcción del FDI").

Eso asume que `Construcción` es **excluyente** con los otros tipos. **El cliente aún no lo confirma.**

- **Hoy en los datos sí lo es:** en `AUDITADO_COMPLETO`, `Project_Type` y los booleanos son one-hot
  (8938 Adquisición / 2863 Construcción / 713 Greenfield; solo ~10 filas ruido). Con esta base, los
  booleanos sobran y `Project_Type` único basta.
- **Conceptualmente puede no serlo:** una inversión podría ser p. ej. *Greenfield con componente de
  obra*. Si la metodología lo admite, un enum único **no puede representarlo** y se pierde información.

**Decisión a tomar con el cliente:**
1. **Excluyente** → mantener `Project_Type` único (contrato actual); eliminar también `Construction`.
2. **No excluyente** → `Project_Type ∈ {Adquisición, Greenfield}` + **flag aparte** `Construction` (`Yes`/`No`),
   y el ETL pasa a `is_construction = (Construction === 'Yes')` (independiente del tipo).

Hasta que se decida, **conservar la columna `Construction`** en origen (no eliminarla con los otros booleanos).
El validador no debe rechazar `Construction` todavía.

**Conexión con el sector (importante):** `Construcción` no es solo un `Project_Type`. La metodología la trata como la
**8ª categoría de sector** ("infrastructure/construction projects"), cuyo **monto se excluye del total FDI**
(ver `sectores.md`). Es decir: el `Project_Type = 'Construcción'`, el sector `Infrastructure`/`Construcción` y la
regla `includeConstruction`/exclusión-FDI **son la misma cosa vista desde tres ángulos**. Resolver §9 implica
definir si esa categoría vive en `Project_Type`, en `Area`, o en ambas, y cómo se evita el doble registro.

---

## 10. Propiedad de empresa y `previous_fdi` (semántica definida, implementación pendiente)

Definido por Francisco en hilo 24-06-2026. Aún no en los datos; entra al consolidar la versión final.

### `Company_Id` + clasificación de propiedad

- Cada empresa lleva un **`Company_Id`** propio (≠ `Id_Investment`). La propiedad se clasifica **una vez por empresa** y se hereda a sus inversiones.
- **SOE** = *state-owned enterprise* (estatal china). **POE** = *privately-owned enterprise* (privada).
- **SASAC** = comisión del Estado chino que supervisa las grandes estatales **centrales**; **no es una 3ª categoría**, son las SOE más grandes (dependencia central).
- Modelo sugerido: un campo de propiedad `{SOE, POE}` + flag/derivado `SASAC` (solo dentro de SOE).
- **Regla de clasificación:** por **quién controla en última instancia**, no por la filial que firma el contrato.
- Cómo: clasificar el listado de empresas con Claude (Francisco lo delega explícitamente a ese flujo).

### `previous_fdi`

- **NO es booleano.** Usar la **convención existente del repositorio**: etiquetas de secuencia tipo
  *"primera inversión"*, *"segunda inversión"*, *"segunda reinversión"* (cf. metodología: reinversiones años
  después se cuentan como inversiones **separadas** para no perder la historia ni duplicar montos).
- El campo guarda **en qué punto de la secuencia** está cada registro, no un sí/no.
- Con `Company_Id`, rastrear las repeticiones de un mismo inversor es directo.
- Afinamiento opcional pendiente: distinguir *reinversión sobre el mismo activo* vs *entrada a proyecto nuevo del mismo inversor*, manteniendo las etiquetas del repo.

### `Research` vs noticias (duda metodológica abierta de Florencia)

- Hay links que son **noticias**, no estudios de respaldo. Florencia pregunta: ¿categoría/columna aparte para
  noticias, o excluirlas del `Research`? **Criterio a definir antes de la depuración final.** Afecta el enum de
  `Research` y posiblemente agrega un campo. Sin resolver.

Relacionado: memoria del proyecto marca el mapeo de "construcción" como no resuelto desde S2.

---

## 11. Conteo y monto en el header del mapa (dedup) — decisiones abiertas

El header del mapa muestra ahora **conteo real de inversiones + monto total**, deduplicando por `Id_Investment`.

**Por qué dedup:** un mismo `Id_Investment` se explota en varias filas/marcadores (puntos multi-ubicación `Punto`, waypoints de línea) que **repiten el monto completo en cada fila**. Sin dedup el conteo y el monto se inflan masivamente. En la base actual (Entrega 1): **7.129 objetos → 443 inversiones reales**; suma cruda por fila ≈ 17,5 millones MM (absurdo, ~80× inflado) vs **216.819 MM** deduplicado por id. Regla: una inversión = un `Id_Investment`; monto = primer valor no nulo del grupo (mismo en todas sus filas por contrato, §3). 36 inversiones sin monto se cuentan aparte ("sin monto"), no suman.

**Preguntas para Fran (este documento):**
1. **¿El total FDI excluye `Construcción`?** Hoy el header **incluye todo** (decisión provisional del cliente): incl. Construcción = **216.819 MM**, excl. Construcción = **152.084 MM**. La metodología (§9) trata Construcción como categoría cuyo monto **se excluye del FDI**. Hay contradicción a resolver: o el header excluye Construcción (coherente con metodología), o la metodología admite incluirla.
2. **¿Unidad de `Investment` = millones de USD?** (ver 1.B5). Se usa `US$ … MM` hasta confirmación explícita.
