# investors_map.csv — registro de empresas inversoras

Tabla de equivalencias mantenida de nuestro lado (fuera del contrato XLSX del cliente, decisión 04-07):
cada `investor_raw` del repositorio apunta a una empresa canónica con clasificación de propiedad.
La consumen el Sankey, el buscador de inversores y los filtros Propiedad/Consorcio
(vía `public/data/investors_map.json`, regenerado por `scripts/build_investors_map.mjs` y el ETL).

## Reglas del sistema de ids (`company_id`)

Formalizadas 2026-07-12; hasta entonces eran práctica implícita. Documento interno: la guía para
Yifang solo resume lo esencial en la fila `company_id` (decisión 14-07: las convenciones no le
conciernen a ella; si se busca validación externa, va con Francisco).

1. **Un id por empresa real**, definida por **control último** (no accionista inmediato).
   Todas las variantes de nombre (`investor_raw`) de la misma empresa comparten id.
2. **Formato:** slug kebab-case legible, derivado del nombre canónico *al momento de crearlo*
   (`china-three-gorges`, `state-grid`). El id es identificador, no display:
   **si el nombre canónico cambia, el id NO se renombra.**
3. **Un id nunca se reutiliza** para otra empresa, aunque quede retirado.
4. **Fusiones:** las filas se reapuntan al id sobreviviente (por defecto, el de la entidad que perdura).
   Si la fusión corporativa crea una entidad nueva (caso Sinochem+ChemChina), se acuña id nuevo
   y los anteriores se retiran.
5. **Ids retirados quedan registrados** en la tabla de abajo y no vuelven a usarse.
   Pendiente técnico: resolverlos en URLs antiguas (`inv=` con id retirado hoy filtra a 0 resultados).
6. **Consorcios:** el vehículo lleva id propio (`is_consortium=TRUE`); `members` referencia
   company_ids separados por `|`. Members sin fila propia ("huérfanos", hoy 21) se permiten
   —la UI humaniza el slug— pero al tener datos, preferir crearles fila mínima.
7. **Ownership es atributo del id** (por empresa), no de la variante de nombre: todas las filas
   de un mismo `company_id` deben llevar el mismo `ownership` (inconsistencia goldwind/chemchina
   corregida 2026-07-07 bajo esta regla).
8. **Joint venture NO vive en este registro.** Es propiedad del deal (`is_joint_venture` en la base
   de inversiones): la misma empresa puede hacer un JV en un proyecto y entrar sola en otro
   (PowerChina tiene ambos en los datos). El consorcio sí vive aquí porque el vehículo *es* el
   inversor registrado; su flag a nivel deal se deriva vía `investor_raw`. Nunca duplicar el hecho
   en ambas bases.

## Ids retirados

| Id retirado | Fecha | Ahora vive en | Motivo |
|---|---|---|---|
| `sinochem` | 2026-07-07 | `sinochem-holdings` | fusión corporativa 2021, canónico nuevo (aprobado Francisco, correo 2026-07-02) |
| `chemchina` | 2026-07-07 | `sinochem-holdings` | ídem |
| `citic-agri-fund` | 2026-07-07 | `citic` | fondo JV fusionado a matriz (aprobado Francisco, correo 2026-07-02) |
| `hanaq` | 2026-07-07 | `hanaq-group` | duplicado del dato fuente (confirmado Francisco por WhatsApp) |
| `icbc` | 2026-07-07 | `industrial-and-commercial-bank-of-china` | sigla vs nombre completo, mismo banco (ídem) |

## Por qué slugs y no códigos numéricos

El `corp_code` numérico de Francisco se re-numeró por completo entre sus propias versiones
(02-07 vs 11-07: 0 coincidencias código+nombre) — un código opaco sin regla de estabilidad no
sirve de llave. Los slugs son legibles, URL-friendly y estables por regla 2/3. Todo cruce con
archivos externos va **por nombre** (+ alias), nunca por corp_code.
