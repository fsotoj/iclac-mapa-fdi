// Registro de países del proyecto (pure, sin I/O). Fuente: data/schema/countries.csv
// (semilla pre-cargada por nosotros con toda LATAM + Centroamérica + Caribe).
//
// Vuelve el alcance de países un DATO editable en vez de constantes hardcodeadas
// en validate.mjs. El validador y el ETL lo cargan por `opts`, así el cliente
// puede sumar un país (o nosotros la semilla) sin tocar código.
//
// México NO está en la semilla a propósito (exclusión metodológica 14-07): no es
// un país del proyecto, así que un mexico.xlsx cae como "fuera de la lista".

/**
 * Parsea el CSV del registro a las estructuras que consumen validador y ETL.
 * @param {string} text contenido de countries.csv
 * @returns {{
 *   countryIso: Record<string,{alpha3:string,num:string}>,
 *   filenameByAlpha3: Record<string,string>,
 *   canonicalFilenames: Set<string>,
 *   canonicalByAlpha3: Record<string,string>,
 *   list: Array<{alpha3:string,num:string,name:string,aliases:string[],filename:string}>
 * }}
 */
export const parseCountriesCsv = (text) => {
  const lines = text.trim().split(/\r?\n/)
  const header = lines[0].split(',').map((h) => h.trim())
  const col = (n) => header.indexOf(n)
  const [iA3, iNum, iName, iAlias, iFile] = ['alpha3', 'numeric', 'name', 'aliases', 'filename'].map(col)

  const countryIso = {}
  const filenameByAlpha3 = {}
  const canonicalByAlpha3 = {}
  const list = []

  for (const line of lines.slice(1)) {
    if (!line.trim()) continue
    const c = line.split(',')
    const alpha3 = (c[iA3] ?? '').trim()
    const num = (c[iNum] ?? '').trim()
    const name = (c[iName] ?? '').trim()
    if (!alpha3 || !name) continue
    const aliases = (c[iAlias] ?? '').split('|').map((s) => s.trim()).filter(Boolean)
    const filename = ((c[iFile] ?? '').trim() || name.toUpperCase().replace(/\s+/g, '_'))

    countryIso[name] = { alpha3, num }
    for (const a of aliases) countryIso[a] = { alpha3, num }
    filenameByAlpha3[alpha3] = filename
    canonicalByAlpha3[alpha3] = name
    list.push({ alpha3, num, name, aliases, filename })
  }

  return {
    countryIso,
    filenameByAlpha3,
    canonicalFilenames: new Set(Object.values(filenameByAlpha3)),
    canonicalByAlpha3,
    list
  }
}
