# Esquema canónico de datos — mapa_FDI

**Versión:** 1.4 (2026-07-23)
**Estado:** contrato vigente para el flujo por país. Base del validador JS de GH Actions (2.3).
**Fuente de verdad:** Parte II (II.1–II.7) de `docs/sprint_3/entrega_2606_validacion_esquema_04072026.html` (entregable cliente). Este .md es la versión técnica de ese contrato.

> **Changelog v1.4 (2026-07-23):** cambios para que el validador sea **resiliente** (rojo = problema
> real, no cosmético) y para que incorporar un país no requiera tocar código.
> - **Nombre de archivo case-insensitive.** `chile.xlsx` y `CHILE.xlsx` valen igual. La diferencia
>   de mayúsculas la absorbe la normalización, no es un error. *Por qué:* el ida-y-vuelta de
>   renombres costaba tiempo sin cambiar el significado del dato.
> - **País como dato, no código.** El alcance de países sale de las constantes del validador a un
>   registro `data/schema/countries.csv` (semilla pre-cargada por nosotros: toda LATAM +
>   Centroamérica + Caribe; **México excluido a propósito**). Sumar un país = editar ese CSV (o
>   nosotros la semilla), sin tocar el validador. Un país fuera del registro = "fuera de la lista",
>   con instrucción, no error críptico.
> - **Capa de normalización determinista (curaciones).** Antes de validar se arreglan de nuestro
>   lado, sin pérdida: apóstrofe de Excel en `COUNTRY_ISO_NUM`/`Id_Seq` (`'152`→`152`), `Country` a
>   forma canónica (`CHILE`→`Chile`, `Brasil`→`Brazil`). Cada arreglo se **lista** (no se enmascara).
> - **`Area_ES` fuera de la validación de formato.** El mapa traduce keyed por `Area_EN`, así que la
>   etiqueta ES es redundante. Se conserva SÓLO el **conflicto conceptual** (`fila/sector-conflicto`,
>   warning): cuando `Area_ES` apunta a un sector distinto de `Area_EN` (ej: `PRY-0001` COFCO
>   `Energy` vs `Agroindustria`) — ahí una de las dos está mal.
> - **`Ownership` entra al contrato**, mandada por la base del cliente (§5.1). Enum:
>   `Central SOE / Local SOE / POE / MIXED / UNKNOWN`.
> - **Geometría de país** como compuerta blanda: si un país no tiene borde cargado, avisa (no bota);
>   el país entra al mapa cuando su borde existe y sus datos pasan (§11).
> - **Umbral de rechazo explícito por severidad:** un archivo se rechaza si tiene un problema de
>   archivo (basta uno) o si baja del umbral de filas válidas. Warnings/curaciones nunca botan.
>
> **Changelog v1.3 (2026-07-14):** nombre de archivo por país pasa a **país en MAYÚSCULA, en
> inglés, sin tildes** (`CHILE.xlsx`, `BRAZIL.xlsx`). Es la convención con que el cliente hizo su
> primera carga al repo (09-07); se adopta tal cual para no hacerle renombrar nada. Reemplaza
> "minúscula/español" de v1.2. Lista cerrada de nombres válidos = países del proyecto
> (`FILENAME_BY_ALPHA3` en el validador).
>
> **v1.2 (2026-07-04):** sincronizado con la Parte II del entregable 26/06.
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

- **Un archivo por país** en `data/source/`, nombrado con el **país en inglés, sin tildes**
  (p. ej. `CHILE.xlsx`, `BRAZIL.xlsx`, `PERU.xlsx`, `COSTA_RICA.xlsx`). **Case-insensitive (v1.4):**
  `chile.xlsx` y `CHILE.xlsx` valen igual; la normalización unifica. La lista de nombres válidos =
  países del registro `data/schema/countries.csv` (columna `filename`).
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
| `Area_ES` | texto | opt | — | **v1.4: informativa, ya no se valida por formato** (el mapa traduce desde `Area_EN`). Sólo se chequea el **conflicto conceptual** con `Area_EN` (warning): si apunta a otro sector, una de las dos está mal. |
| `Ownership` | enum | **req** ⏳ | `Central SOE` \| `Local SOE` \| `POE` \| `MIXED` \| `UNKNOWN` | Propiedad de la empresa inversora. **La manda la base del cliente** (v1.4, §5.1). Categorías de Yifang Wang/Dialogue. Valor fuera del enum = **warning** (en adopción: `SOE`→`Local SOE`, `SASAC`→`Central SOE`), no bota. La identidad canónica de empresa (para el Sankey) sigue de nuestro lado en `investors_map.csv`. |
| `Detail_ES` | texto | opt | | Descripción en español. |
| `Detail_EN` | texto | opt | | Descripción en inglés. |
| `Investment` | decimal | opt | **millones de USD** (✅ confirmado por cliente, 2026-07-05) | Queda **opcional**: hay inversiones reales sin monto público. Mismo valor en todas las filas de una inversión. |
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

### 5.1 `Ownership`: fuente = revisión experta (`investors_map.csv`), NO la base (v1.4)

**Fuente de verdad = `data/schema/investors_map.csv`**, curado de nuestro lado desde la revisión
externa (Dialogue/Yifang Wang, 17-07). Enum `Central SOE / Local SOE / POE / MIXED / UNKNOWN`. El
Sankey y el filtro leen ownership de ahí (`investors_map.json`), **no** de la columna de la base.

**Por qué no la base:** la verificación del cruce (`scripts/audit_ownership_cross.mjs`, 23-07)
mostró que la entrega del cliente **no aplicó ninguna de las 30 correcciones** de la revisión
experta (hizo solo el rename mecánico `SASAC`→`Central SOE`). Clasificar propiedad de firmas chinas
(central vs local vs mixta) es trabajo experto, no de data-entry. Por eso ownership + identidad de
empresa viven en una tabla analista-owned (`investors_map.csv`), no en el flujo por país.

La columna `Ownership` del archivo del cliente es **opcional / cross-check**: el validador avisa
(warning) si un valor no está en el enum (`SOE`→`Local SOE`, `SASAC`→`Central SOE`), pero no la usa
como fuente. **Propuesta de handover (ver `next_steps` Parte E):** sacar `Ownership` del contrato
del cliente y mantenerla solo de nuestro lado.

### 5.2 Convención de dos lugares (24-07)

El manejo del inversor se reparte en **dos artefactos, con responsabilidades distintas**:

1. **La base por país (`Investor`)** lleva el nombre **RAW, tal como viene de la fuente**. No se
   normaliza. Conserva procedencia (ej: "Pacific Hydro", no "State Power Investment"). Lo mantiene
   el cliente al cargar inversiones. Recuperación del histórico: `scripts/restore_investor_raw.mjs`
   (join por `Id_Investment_Original` contra la base vieja, ~96%).
2. **La tabla de inversores (`data/schema/investors_map.csv`)** mapea `investor_raw` → identidad
   canónica (`company_id`, `company_canonical`, consorcio/`members`) + `ownership`. **También pasa
   por el validador** (`scripts/validate_investors.mjs` / núcleo `scripts/lib/validate_investors.mjs`):
   enum de ownership, `investor_raw` único, `company_id ↔ company_canonical` 1:1, ownership
   consistente por `company_id`. El ETL une base ↔ tabla por el nombre (raw y canónico) en el build.

   **Steward (a definir por ICLAC):** la poblamos nosotros para la v1, pero mantenerla es trabajo
   experto (estructura corporativa china) y **NO es tarea permanente nuestra ni del data-entry**.
   Antes del cierre, ICLAC debe designar quién la mantiene (equipo con ese conocimiento, o Diálogo).

Inversor nuevo que aparece en la base y no está en la tabla → cae a `UNKNOWN` y lo lista
`scripts/check_investor_coverage.mjs`; quien tenga la tabla a cargo lo clasifica. El mapa no se rompe.

### Fuera del esquema: `Company_Id` / `previous_fdi`

**No son columnas del archivo del cliente.** La identidad canónica de empresa se resuelve **de
nuestro lado** con `data/schema/investors_map.csv` (mapeo `investor_raw` → canónico; script
`scripts/build_investors_map.mjs`). El **atributo ownership** ahora viene de la base (§5.1), no del
CSV.

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
Area_ES              text   opt   INFORMATIVA (v1.4, no se valida formato) ; sólo warning si concepto != Area_EN (fila/sector-conflicto)
Ownership            enum   req   {Central SOE,Local SOE,POE,MIXED,UNKNOWN} (v1.4, la manda la base — §5.1)
Detail_ES            text   opt
Detail_EN            text   opt
Investment           number opt   >=0 ; unit=MUSD (confirmado)
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

Curación automática (determinista, sin pérdida — se lista, no se enmascara):
- `COUNTRY_ISO_NUM` / `Id_Seq`: se quita el apóstrofe inicial de Excel (`'152` → `152`).
- `Country`: se lleva a forma canónica del registro (`CHILE`/`chile`/`Brasil` → `Chile`/`Brazil`).
- Nombre de archivo: match case-insensitive contra el registro.

Reglas de archivo e inter-fila:
- Nombre de archivo: país en inglés sin tildes, **case-insensitive** (`CHILE.xlsx` = `chile.xlsx`);
  lista válida = `data/schema/countries.csv`. Una sola hoja.
- País fuera del registro = `archivo/nombre` (fuera de la lista, con instrucción). País sin borde de
  geometría = `archivo/sin-borde` (warning, compuerta blanda; ver §11).
- Consistencia país: nombre de archivo ↔ `Country` ↔ `COUNTRY_ISO_ALPHA3` ↔ `COUNTRY_ISO_NUM` ↔ prefijo de `Id_Investment`.
- Una **línea** = grupo de filas con mismo `(Id_Investment, Path)` y `Vector=Vector`.
  En una línea, los campos no geográficos deben ser idénticos entre sus filas.
- Un `Id_Investment` puede repetirse: en varios puntos, o en varias líneas (`Path` distinto).
  No exigir `Id_Investment` único global. Unicidad se evalúa en scope **LATAM**.
- `CasoN`/`LinkN` poblado ⇒ `Research == Yes` o `News == Yes` (§6).
- **Multi-point = punto por punto** (confirmado): una inversión con N sitios = N registros.
  Al **sumar montos**, deduplicar por `Id_Investment` para no sobrecontar.

**Umbral del validador (2.3):** **propuesto 95%** de filas válidas (Parte III.2 del entregable,
"Proponemos"; por confirmar por cliente). El validador reporta el % válido y falla bajo el umbral
(no exige 100%); el reporte indica qué filas fallan y por qué.

---

## 8. Decisiones abiertas que afectan al esquema (Parte III.1 del entregable)

| Tema | Estado |
|---|---|
| **Formato exacto de `Id_Investment`** basado en ISO (+ columna `Id_Seq`) | Propuesta concreta en §5 (`ALPHA3-NNNN`) + tabla de equivalencia entregada. **Por confirmar y aplicar por cliente.** |

Resueltos (ya no abiertos): **unidad de `Investment` = millones de USD** (✅ confirmado por cliente,
2026-07-05), exclusividad de `Construcción` (§9), lista de sectores y 8ª categoría (`sectores.md`),
`News` vs `Research` (§6), `Company_Id`/`previous_fdi` fuera del esquema (§5).

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

---

## 10. País como dato + geometría (v1.4)

El alcance de países dejó de estar hardcodeado en el validador. Vive en el registro
`data/schema/countries.csv` (columnas `alpha3,numeric,name,aliases,filename`), **pre-cargado por
nosotros** con toda LATAM + Centroamérica + Caribe. **México NO está en la semilla a propósito**
(exclusión metodológica 14-07): un `mexico.xlsx` cae como "país fuera de la lista".

Incorporar un país nuevo:
1. **Geometría de país** (compuerta blanda): la sembramos nosotros desde Natural Earth
   (`scripts/build_borders.mjs` → `data/sources/geo/borders.geojson`). Sin borde, el validador
   avisa `archivo/sin-borde` (no bota); el país no se dibuja hasta tenerlo.
2. **Datos sin bloqueantes:** el archivo del país pasa el contrato (§3/§7).
3. **Filtro en build:** el ETL ingesta **sólo los países que pasan**; `build_borders` arma el
   `south-america.geojson` del mapa **sólo con esos**. El mapa muestra únicamente países validados
   (validación ↔ "en vivo" atados por construcción).

El validador y el ETL cargan el registro vía `scripts/lib/load_registry.mjs`; el núcleo
(`scripts/lib/validate.mjs`) lo recibe por `opts.registry` y sigue puro.
