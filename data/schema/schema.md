# Esquema canónico de datos — mapa_FDI

**Versión:** 1.2 (2026-07-04)
**Estado:** contrato vigente para el flujo por país. Base del validador JS de GH Actions (2.3).
**Fuente de verdad:** Parte II (II.1–II.7) de `docs/sprint_3/entrega_2606_validacion_esquema_04072026.html` (entregable cliente). Este .md es la versión técnica de ese contrato.

> **Changelog v1.2 (2026-07-04):** sincronizado con la Parte II del entregable 26/06.
> `Year` pasa a **req**; `Investment` queda **opt** (hay inversiones reales sin monto público).
> Nueva columna `Id_Seq` (secuencia por país, **propuesta pendiente de confirmación cliente**) y
> formato propuesto de `Id_Investment` = `ALPHA3-NNNN` (§5). Nueva columna `News` (enum `Yes`/`No`, req).
> `Origin of seller` → `Origin_Of_Seller`. Archivos por país en minúscula/español/sin tildes (`chile.xlsx`).
> Columnas extra del cliente permitidas (se ignoran). **Resuelto §9:** `Project_Type` es UNA columna con
> 3 valores excluyentes; las booleanas `Acquisition`/`Greenfield`/`Construction` salen del esquema.
> `Company_Id`/`previous_fdi` salen del esquema (se resuelven de nuestro lado, §10).
>
> **v1.0 (2026-06-25):** primera propuesta del contrato.

Este documento define el **contrato de datos** que debe cumplir cada archivo de inversiones.
Una columna por campo. Sin columnas de trabajo (`*_ORIG`, `*_ARREGLADO`). Sin columnas redundantes.

Derivado de lo que consumen el ETL (`scripts/etl.mjs`) y los tipos (`src/types/data.ts`).
Lo que no aparezca aquí, el ETL y el validador lo **ignoran** (columnas extra permitidas, ver §3).

---

## 1. Alcance y formato del archivo

- **Un archivo por país** en `data/source/`, nombrado en **minúscula, en español, sin tildes, espacios → `_`**
  (p. ej. `chile.xlsx`, `costa_rica.xlsx`, `republica_dominicana.xlsx`). Es como el equipo ya reparte el trabajo.
- **Una sola hoja** con los datos.
- Primera fila = cabeceras exactas de la tabla §3 (sensibles a mayúsculas).
- Codificación UTF-8. Decimales con punto (`1234.5`), no coma.
- Sin filas en blanco intercaladas ni columnas fantasma (`__EMPTY*`).

### Granularidad de filas

Una **inversión** puede ocupar **1 o N filas**, según su geometría:
- `Vector = Punto` → 1 fila = 1 punto. Una adquisición multipunto se reporta **punto por punto**
  (p. ej. CNPC Perú: 5.153 puntos = 5.153 filas; confirmado por cliente). Aunque compartan
  `Id_Investment`, cada fila Punto sale como punto independiente; el ETL **no** las agrupa.
- `Vector = Vector` → N filas = vértices de una **polilínea** (oleoducto, transmisión, etc.).
  Los vértices de una misma línea comparten **`Id_Investment` + `Path`**. El orden de filas es el orden de la línea.

### `Path`: discriminador de línea (no es "vacío para Punto")

`Path` no se deja en blanco. Su rol depende de `Vector`:
- **`Punto`** → `Path = 0`, sea la inversión única o no. En filas Punto el sistema **ignora** su valor;
  el `0` solo mantiene la base ordenada. **Confirmado con cliente** (correo 24-06-2026).
- **`Vector`** → `Path` es un entero `≥ 1` que **numera cada trazado** dentro de un mismo `Id_Investment`.
  Una inversión puede tener **varias líneas separadas** (`Path` 1, 2, …) y cada una se dibuja por separado.
  El ETL agrupa por `(Id_Investment, Path)`; cada par = una línea.

> ⚠️ En una línea (`Vector`, mismo id+path), los campos no geográficos (monto, sector, detalle…) se repiten
> por vértice. El ETL toma el valor de la **primera fila** del grupo. Mantenerlos consistentes.

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
| `Id_Investment` | texto | **req** | propuesto `ALPHA3-NNNN` (`ARG-0080`), por confirmar | Ver §5. Guardar como **texto**. Mismo id en todas las filas de una inversión. |
| `Id_Seq` ⏳ *propuesta* | entero | **req** | `≥ 1`, secuencia por país (1, 2, 3…) | **Propuesta pendiente de confirmación cliente.** Base del `Id_Investment`; entra junto con el formato de §5. |
| `Coordinates` | coords | **req** | `"lat, lng"` | Ver §4. Fila sin coords válidas se descarta. |
| `Year` | entero | **req** | `1900–<año actual>` | |
| `Country` | texto | **req** | nombre país | Debe ser consistente con `COUNTRY_ISO_ALPHA3`. |
| `COUNTRY_ISO_NUM` | texto | **req** | ISO 3166-1 numérico, 3 díg. con ceros (`152`=Chile) | Guardar como texto (preservar ceros). |
| `COUNTRY_ISO_ALPHA3` | enum | **req** | ISO 3166-1 alfa-3 (`CHL`, `ARG`…) | Consistente con el país del nombre del archivo (§1). |
| `Province_ISO` | texto | opt | ISO 3166-2 (`CL-RM`) | Subdivisión. |
| `Investor` | texto | **req** | | Empresa inversora (clave del filtro Sankey S5). |
| `Vector` | enum | **req** | `Punto` \| `Vector` | Define geometría. Ver §1. |
| `Path` | entero | **req** | `0` para `Punto`; `≥1` para `Vector` | Numera la línea dentro de un `Id_Investment`. Agrupa vértices `(id, Path)`. Ver §1. |
| `Area_EN` | enum | **req** | 8 sectores canónicos (`sectores.md`) | **Match exacto** con una de las 8 claves EN; el frontend traduce a es/en/cn vía i18n keyed por `Area_EN`. Mismatch = punto **gris** + categoría duplicada en filtro, en los 3 idiomas. |
| `Area_ES` | enum | **req** | traducción canónica (`sectores.md`) | Debe corresponder 1:1 con `Area_EN`. |
| `Detail_ES` | texto | opt | | Descripción en español. |
| `Detail_EN` | texto | opt | | Descripción en inglés. |
| `Investment` | decimal | opt | **millones de USD** (unidad por confirmar, §8) | Queda **opcional**: hay inversiones reales sin monto público. Mismo valor en todas las filas de una inversión. |
| `Location` | texto | opt | dirección / lugar | Texto plano, **sin URLs** embebidas. |
| `Project_Type` | enum | **req** | `Adquisición` \| `Greenfield` \| `Construcción` | **Valores mutuamente excluyentes.** Canónico en español, tildes correctas. Ver §9. |
| `Joint_Venture` | bool-YN | opt | `Yes` \| `No` | |
| `Origin_Of_Seller` | texto | opt | | Origen del vendedor (en adquisiciones). Renombrada desde `Origin of seller` (v1.2). |
| `Stake` | decimal | opt | porcentaje `0–100` | % adquirido. |
| `Research` | enum | **req** | `Yes` \| `No` | `Yes` si tiene respaldo en un **estudio**. Ver §6. |
| `News` | enum | **req** | `Yes` \| `No` | `Yes` si el enlace es **noticia** y no estudio — columna aparte de `Research`. Nueva en v1.2 (ya implementada en la entrega 26/06). Ver §6. |
| `Caso1`…`Caso14` | texto | opt | título del estudio/fuente | Ver §6. |
| `Link1`…`Link14` | texto | opt | URL (`http…`) | Pareado con `CasoN`. La **URL va aquí**, no en `CasoN`. |

### Columnas que NO deben ir (eliminar antes de entregar)

- Booleanos redundantes con `Project_Type`: **`Greenfield`, `Acquisition`, `Construction`** —
  son la misma información que `Project_Type` (ver §9; resuelto en v1.2, `Construction` también sale).
- Columnas de trabajo: cualquier `*_ORIG`, `*_ARREGLADO`, `Project_Type_ES`/`Project_Type_EN` (colapsar en `Project_Type`).
- Columnas fantasma `__EMPTY*` (artefacto de Excel).

### Columnas extra permitidas

El cliente **puede añadir columnas propias** si lo considera necesario (p. ej. `Location_ES`).
El validador y el ETL solo leen las columnas canónicas e **ignoran el resto**.

---

## 4. Formato de coordenadas

- Una celda: `"-33.45, -70.66"` → `lat, lng`.
- **Orden: latitud primero, longitud después.** (Error frecuente en origen: invertidas.)
- Rangos: `lat ∈ [-90, 90]`, `lng ∈ [-180, 180]`.
- Decimal con punto. Sin grados/minutos, sin `N/S/E/W`.
- Para LATAM continental se espera `lat < 15` y `lng < -30`; fuera de eso, revisar (probable inversión lat/lng).

---

## 5. Identificador (`Id_Investment` + `Id_Seq`)

- **Texto** siempre, no número (preservar el cero inicial; el cero perdido causó la colisión `0019100`).
- **Base ISO — ahora.** Acordado con cliente (hilo 24-06-2026): usar las columnas `COUNTRY_ISO_*`
  (ya pobladas) como base del identificador, manteniendo compatibilidad con los registros existentes.
- **No es único global.** El mismo `Id_Investment` se repite por diseño: en cada vértice de una línea
  (mismo id+`Path`), y puede aparecer en varias líneas (`Path` distinto) o en varios puntos.
  La clave de geometría es `(Id_Investment, Path)`, no el id solo.
- **Scope de unicidad: LATAM.** La validación de unicidad/consistencia de IDs se hace dentro del conjunto LATAM.
- Estable entre entregas (no re-numerar; el ID es la clave de seguimiento).

### Formato propuesto: `ALPHA3-NNNN` ⏳ *propuesta pendiente de confirmación cliente*

Mismo flujo de armado que el cliente ya usa (secuencia por país + código de país), con dos ajustes:

- **Código como prefijo, no sufijo:** `ARG-0080` en vez de `80160`. El sufijo actual es ambiguo de
  parsear y el código a mano ya produjo la colisión `0019100` (un id de Venezuela con código de Colombia).
- **Alfa-3, no numérico:** con una letra adentro, Excel no puede convertir el id a número —
  el problema del cero perdido desaparece **por construcción**, no por disciplina.

La secuencia vive en su propia columna, **`Id_Seq`** (entero: 1, 2, 3…): para agregar una inversión
basta tomar el máximo de `Id_Seq` del archivo y sumar 1. El `Id_Investment` se arma desde ella:
prefijo alfa-3 + `Id_Seq` con relleno a 4 dígitos (`Id_Seq = 80` en Argentina → `ARG-0080`).
Cada equipo de país solo necesita conocer la secuencia de su propio archivo; la unicidad global
la garantiza el prefijo.

**El validador chequea:** prefijo == país del archivo, y `Id_Investment` consistente con `Id_Seq`.

**Tabla de equivalencia lista:** `docs/sprint_3/equivalencia_ids.xlsx` (generada por
`scripts/build_id_map.mjs`) — los 450 ids actuales mapeados al formato nuevo (id actual → id nuevo,
con país e `Id_Seq`), verificados sin colisiones. Basta aplicar el reemplazo.

### Fuera del esquema: `Company_Id` / `previous_fdi`

**No son columnas del archivo del cliente** (salen del esquema en v1.2). La identidad canónica de
empresa y su clasificación de propiedad (SOE/POE/SASAC) se resuelven **de nuestro lado** con
`data/schema/investors_map.csv` (mapeo `investor_raw` → canónico/ownership; script
`scripts/build_investors_map.mjs`, decisiones aprobadas por Francisco 03-07-2026).

---

## 6. Research, News y citas (`Research` + `News` + `CasoN`/`LinkN`)

- `Research` = `Yes` si la inversión tiene respaldo en un **estudio**; `No` en otro caso.
- `News` = `Yes` si el enlace es una **noticia** y no un estudio de investigación — columna aparte
  de `Research`, ya implementada en la entrega 26/06.
- **Regla:** toda fila con `CasoN`/`LinkN` poblado debe tener `Research = Yes` **o** `News = Yes` —
  si no, la fuente queda invisible en la interfaz (no aparece en ningún filtro).
- Por cada fuente `n` (1–14): el **título va en `Cason`**, la **URL en `Linkn`** (no en `CasoN`).
- El ETL deduplica casos por **título** dentro de una inversión Vector (vértices repiten la misma cita).

---

## 7. Resumen legible por máquina (para el validador)

Tabla fuente del validador JS (2.3). `req` = obligatorio, `enum` = conjunto cerrado.

```
Id_Investment        text   req   propuesto /^[A-Z]{3}-\d{4}$/ (por confirmar) ; prefijo == COUNTRY_ISO_ALPHA3 ; consistente con Id_Seq ; no único global (ver reglas inter-fila)
Id_Seq               int    req   >=1 ; secuencia por país ; Id_Investment == ALPHA3 + "-" + pad4(Id_Seq)   [PROPUESTA pendiente confirmación cliente]
Coordinates          coords req   lat[-90,90] lng[-180,180]
Year                 int    req   [1900,CURRENT_YEAR]
Country              text   req
COUNTRY_ISO_NUM      text   req   /^\d{3}$/
COUNTRY_ISO_ALPHA3   enum   req   ISO3166-1-alpha3 ; consistente con país del archivo
Province_ISO         text   opt
Investor             text   req
Vector               enum   req   {Punto,Vector}
Path                 int    req   Vector==Punto => 0 ; Vector==Vector => >=1
Area_EN              enum   req   sectores.md::EN (match exacto, case-sensitive)
Area_ES              enum   req   sectores.md::ES ; pairs-with Area_EN
Detail_ES            text   opt
Detail_EN            text   opt
Investment           number opt   >=0 ; unit=MUSD (unidad por confirmar)
Location             text   opt   no-url
Project_Type         enum   req   {Adquisición,Greenfield,Construcción} (mutuamente excluyentes)
Joint_Venture        enum   opt   {Yes,No}
Origin_Of_Seller     text   opt
Stake                number opt   [0,100]
Research             enum   req   {Yes,No}
News                 enum   req   {Yes,No}
Caso1..Caso14        text   opt
Link1..Link14        text   opt   url-if-present ; pairs-with CasoN
```

Columnas prohibidas (error si aparecen): `Acquisition`, `Greenfield`, `Construction`,
`*_ORIG`, `*_ARREGLADO`, `Project_Type_ES`, `Project_Type_EN`, `__EMPTY*`.
Columnas no reconocidas distintas de las prohibidas: **se ignoran** (permitidas).

Reglas de archivo e inter-fila:
- Nombre de archivo: minúscula, español, sin tildes, espacios → `_` (`chile.xlsx`). Una sola hoja.
- Consistencia país: nombre de archivo ↔ `Country` ↔ `COUNTRY_ISO_ALPHA3` ↔ `COUNTRY_ISO_NUM` ↔ prefijo de `Id_Investment`.
- Una **línea** = grupo de filas con mismo `(Id_Investment, Path)` y `Vector=Vector`.
  En una línea, los campos no geográficos deben ser idénticos entre sus filas.
- Un `Id_Investment` puede repetirse: en varios puntos, o en varias líneas (`Path` distinto).
  No exigir `Id_Investment` único global. Unicidad se evalúa en scope **LATAM**.
- `CasoN`/`LinkN` poblado ⇒ `Research == Yes` o `News == Yes` (§6).
- **Multi-point = punto por punto** (confirmado): una inversión con N sitios = N registros.
  Al **sumar montos**, deduplicar por `Id_Investment` para no sobrecontar.

**Umbral del validador (2.3):** el cliente acepta **95%** de filas válidas como umbral
(correo 24-06-2026). El validador reporta el % válido y falla bajo 95% (no exige 100%);
el reporte indica qué filas fallan y por qué.

---

## 8. Decisiones abiertas que afectan al esquema (Parte III.1 del entregable)

| Tema | Estado |
|---|---|
| **Formato exacto de `Id_Investment`** basado en ISO (+ columna `Id_Seq`) | Propuesta concreta en §5 (`ALPHA3-NNNN`) + tabla de equivalencia entregada. **Por confirmar y aplicar por cliente.** |
| **Unidad de `Investment`** | Asumida **millones de USD**; falta confirmación explícita del cliente. |

Resueltos en v1.2 (ya no abiertos): exclusividad de `Construcción` (§9), lista de sectores y 8ª
categoría (`sectores.md`), `News` vs `Research` (§6), `Company_Id`/`previous_fdi` fuera del esquema (§5).

Ver `docs/generales/next_steps.md` y `docs/sprint_3/entrega_2606_validacion_esquema_04072026.html`.

---

## 9. `Project_Type`: una sola columna, 3 valores excluyentes (RESUELTO v1.2)

La metodología define el "tipo" de inversión solo como **Greenfield o Adquisición (M&A)** — ambos con
participación china en la propiedad. **"Construcción" es aparte:** contratos de obra pública donde China
**no** retiene propiedad; la metodología es explícita en que esos proyectos se conservan igual en la base
y solo se **resta su monto del total de FDI**.

Por eso `Project_Type` = `Adquisición` | `Greenfield` | `Construcción`, **mutuamente excluyentes** —
sin columnas booleanas aparte: `Acquisition`, `Greenfield` y `Construction` **salen del esquema** (§3).

El ETL deriva `is_construction = (Project_Type === 'Construcción')` y el front filtra con `includeConstruction`.

**Conexión con el sector:** la categoría Construcción/Infraestructura es también la **8ª categoría de
sector** de la metodología ("infrastructure/construction projects"), cuyo monto se **excluye del total
FDI** (`Area_EN = Infrastructure`, `Area_ES = Infraestructura`; ver `sectores.md`).
