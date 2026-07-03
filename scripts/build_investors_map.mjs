// Converts data/schema/investors_map.csv -> public/data/investors_map.json
// (keyed by investor_raw). NOTE: `scripts/etl.mjs` now does this too on every
// build; this standalone remains for regenerating the JSON without a full ETL run.
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SRC = resolve(ROOT, 'data/schema/investors_map.csv')
const OUT = resolve(ROOT, 'public/data/investors_map.json')

const parseLine = line => {
  const out = []
  let cur = ''
  let q = false
  for (const ch of line) {
    if (ch === '"') q = !q
    else if (ch === ',' && !q) { out.push(cur); cur = '' }
    else cur += ch
  }
  out.push(cur)
  return out
}

const rows = readFileSync(SRC, 'utf8').trim().split(/\r?\n/)
const header = parseLine(rows[0])
const idx = name => header.indexOf(name)
const iRaw = idx('investor_raw')
const iId = idx('company_id')
const iCanon = idx('company_canonical')
const iCons = idx('is_consortium')
const iOwn = idx('ownership')
const iMembers = idx('members')

const map = {}
for (const line of rows.slice(1)) {
  const c = parseLine(line)
  const entry = {
    company_id: c[iId],
    company_canonical: c[iCanon],
    ownership: c[iOwn],
    is_consortium: c[iCons] === 'true'
  }
  const members = (c[iMembers] ?? '').split('|').map(s => s.trim()).filter(Boolean)
  if (members.length) entry.members = members
  map[c[iRaw]] = entry
}

writeFileSync(OUT, JSON.stringify(map), 'utf8')
console.log(`investors_map.json: ${Object.keys(map).length} entries -> ${OUT}`)
