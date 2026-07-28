// Núcleo puro del validador del REGISTRO DE PAÍSES (data/schema/countries.csv).
// Consumido por scripts/validate_countries.mjs.
//
// El registro dejó de ser sólo una lista: desde 28-07 su columna `publish` es la
// compuerta que decide qué país sale publicado. Un archivo que gobierna eso tiene
// que validarse como cualquier otro dato, y sobre todo tiene que detectar el modo
// en que un CSV se rompe de verdad: alguien lo abre en Excel y lo guarda.
//
// Los dos daños de ese camino, ambos silenciosos:
//   - Excel en configuración regional española guarda con `;` en vez de `,`.
//   - Excel convierte `032` a número y se come el cero a la izquierda.
//
// El contrato lo recibe por parámetro (texto crudo, no ruta): sin I/O, testeable.

const EXPECTED = ['alpha3', 'numeric', 'name', 'aliases', 'filename', 'publish']
const REQUIRED = ['alpha3', 'numeric', 'name']
const PUBLISH_OK = ['yes', 'no']

const s = (v) => (v == null ? '' : String(v).trim())

/**
 * @param {string} text contenido crudo de countries.csv
 * @returns {{ issues: Array, stats: { rows, errors, warnings, publicados, retenidos, passed } }}
 */
export const validateCountries = (text) => {
  const issues = []
  const push = (severity, rule, row, column, value, message) =>
    issues.push({ severity, rule, row, column, value, message })

  const lines = String(text ?? '').replace(/^﻿/, '').trim().split(/\r?\n/)
  if (!lines[0]) {
    push('error', 'archivo/vacio', 0, null, null, 'El archivo está vacío.')
    return { issues, stats: { rows: 0, errors: 1, warnings: 0, publicados: 0, retenidos: 0, passed: false } }
  }

  // Separador: si la cabecera no tiene comas pero sí punto y coma, lo guardó Excel.
  if (!lines[0].includes(',') && lines[0].includes(';')) {
    push('error', 'archivo/separador', 1, null, null,
      'El archivo usa punto y coma como separador. Es lo que hace Excel en configuración regional en español al guardar un CSV: reemplazar por comas, o editar el archivo en la web de GitHub en vez de en Excel.')
    return { issues, stats: { rows: 0, errors: 1, warnings: 0, publicados: 0, retenidos: 0, passed: false } }
  }

  const header = lines[0].split(',').map((h) => h.trim())
  for (const c of REQUIRED) {
    if (!header.includes(c)) push('error', 'archivo/columna-requerida', 1, c, null, `Falta la columna obligatoria "${c}".`)
  }
  if (!header.includes('publish')) {
    push('warning', 'archivo/sin-publish', 1, 'publish', null,
      'No está la columna "publish": todos los países del registro se van a publicar. Es el default a propósito, pero si esperabas retener alguno, falta la columna.')
  }
  const extra = header.filter((h) => h && !EXPECTED.includes(h))
  for (const c of extra) {
    push('warning', 'archivo/columna-extra', 1, c, null, `Columna "${c}" no reconocida: el sistema la ignora.`)
  }
  const col = (n) => header.indexOf(n)
  const [iA3, iNum, iName, iFile, iPub] = ['alpha3', 'numeric', 'name', 'filename', 'publish'].map(col)

  const seenA3 = new Map()
  const seenFile = new Map()
  let rows = 0
  let publicados = 0
  let retenidos = 0

  lines.slice(1).forEach((line, idx) => {
    if (!line.trim()) return
    const row = idx + 2
    rows++
    const cells = line.split(',')
    if (cells.length !== header.length) {
      push('warning', 'fila/celdas', row, null, String(cells.length),
        `La fila tiene ${cells.length} celdas y la cabecera ${header.length}. Si algún nombre lleva coma, hay que entrecomillarlo.`)
    }

    const alpha3 = s(cells[iA3])
    const numeric = s(cells[iNum])
    const name = s(cells[iName])
    const filename = s(cells[iFile])
    const publish = s(cells[iPub]).toLowerCase()

    if (!/^[A-Z]{3}$/.test(alpha3)) {
      push('error', 'fila/alpha3', row, 'alpha3', alpha3,
        `alpha3 "${alpha3}" inválido: tres letras mayúsculas (ISO 3166-1 alfa-3), por ejemplo CHL.`)
    } else if (seenA3.has(alpha3)) {
      push('error', 'fila/alpha3-duplicado', row, 'alpha3', alpha3,
        `alpha3 "${alpha3}" ya está en la fila ${seenA3.get(alpha3)}: un país, una fila.`)
    } else {
      seenA3.set(alpha3, row)
    }

    if (!/^\d{3}$/.test(numeric)) {
      const hint = /^\d{1,2}$/.test(numeric)
        ? ` Le faltan los ceros a la izquierda (debería ser "${numeric.padStart(3, '0')}"): pasa cuando el archivo se abre y se guarda en Excel, que lo convierte a número.`
        : ''
      push('error', 'fila/numeric', row, 'numeric', numeric,
        `numeric "${numeric}" inválido: código ISO 3166-1 numérico de 3 dígitos.${hint}`)
    }

    if (!name) push('error', 'fila/name', row, 'name', null, 'name vacío: es el nombre con que se compara la columna Country de los datos.')

    if (filename) {
      if (!/^[A-Z0-9_]+$/.test(filename)) {
        push('warning', 'fila/filename', row, 'filename', filename,
          `filename "${filename}" no tiene la forma esperada (MAYÚSCULAS, sin tildes ni espacios; por ejemplo COSTA_RICA).`)
      }
      if (seenFile.has(filename)) {
        push('error', 'fila/filename-duplicado', row, 'filename', filename,
          `filename "${filename}" ya está en la fila ${seenFile.get(filename)}: dos países no pueden esperar el mismo archivo.`)
      } else {
        seenFile.set(filename, row)
      }
    }

    if (iPub >= 0) {
      if (publish === '') {
        push('warning', 'fila/publish-vacio', row, 'publish', null,
          `publish vacío en "${name || alpha3}": se publica (es el default). Escribir "no" para retenerlo.`)
        publicados++
      } else if (!PUBLISH_OK.includes(publish)) {
        push('error', 'fila/publish', row, 'publish', s(cells[iPub]),
          `publish "${s(cells[iPub])}" no es un valor válido: usar "yes" o "no". Ojo que cualquier otra cosa se interpreta como "yes".`)
        publicados++
      } else {
        publish === 'yes' ? publicados++ : retenidos++
      }
    } else {
      publicados++
    }
  })

  const errors = issues.filter((x) => x.severity === 'error').length
  return {
    issues,
    stats: {
      rows,
      errors,
      warnings: issues.filter((x) => x.severity === 'warning').length,
      publicados,
      retenidos,
      passed: errors === 0
    }
  }
}
