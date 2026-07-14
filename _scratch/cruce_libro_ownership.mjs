// One-off análisis (NO modifica nada): cruza corporate_code_classified.xlsx
// (libro de Francisco, taxonomía fina) contra data/schema/investors_map.csv (ownership operativo).
// Salida: consola + _scratch/cruce_libro_ownership.md
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import xlsx from 'xlsx';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

// libro → enum operativo (codebook publicado)
const FINE_TO_COARSE = {
  'SASAC central': 'SASAC',
  'SASAC local': 'SOE',
  'Other central-state (non-SASAC)': 'SOE',
  'Collective or local government': 'SOE',
  'Private': 'POE',
  'Undetermined': 'UNKNOWN',
};

function parseCSV(t) {
  const rs = []; let row = [], cur = '', q = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (q) { if (c === '"') { if (t[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(cur); cur = ''; }
    else if (c === '\n') { row.push(cur.replace(/\r$/, '')); rs.push(row); row = []; cur = ''; }
    else cur += c;
  }
  if (cur || row.length) { row.push(cur); rs.push(row); }
  return rs;
}
const norm = s => String(s || '').toLowerCase()
  .replace(/\b(co|ltd|limited|corp|corporation|company|group|holdings?|inc|sa|s\.a\.)\b/g, '')
  .replace(/[^a-z0-9]/g, '');

// --- nuestra base (por company_id, sin consorcios) ---
const csv = parseCSV(readFileSync(path.join(root, 'data/schema/investors_map.csv'), 'utf8'));
const hdr = csv[0]; const idx = Object.fromEntries(hdr.map((h, i) => [h, i]));
const companies = new Map(); // id -> {canonical, ownership, names:Set}
for (const r of csv.slice(1).filter(r => r.length > 1)) {
  if (r[idx.is_consortium] === 'TRUE') continue;
  const id = r[idx.company_id];
  if (!companies.has(id)) companies.set(id, { canonical: r[idx.company_canonical], ownership: r[idx.ownership], names: new Set(), musd: 0 });
  const c = companies.get(id);
  c.names.add(norm(r[idx.company_canonical]));
  c.names.add(norm(r[idx.investor_raw]));
  c.musd += Number(r[idx._musd]) || 0;
}

// --- libro ---
const wb = xlsx.readFile(path.join(root, '_scratch/corporate_code_classified.xlsx'));
const book = xlsx.utils.sheet_to_json(wb.Sheets.Sheet1);
const bookIndex = new Map(); // normName -> book row
for (const b of book)
  for (const k of ['name', 'alternative_name_a', 'alternative_name_b'])
    if (b[k]) bookIndex.set(norm(b[k]), b);

// --- cruce ---
const matches = [], conflicts = [], refines = [], unknownResolved = [], unknownStill = [];
let agree = 0, bookUndetermined = 0;
const matchedBookNames = new Set();
for (const [id, c] of companies) {
  let b = null;
  for (const n of c.names) if (bookIndex.has(n)) { b = bookIndex.get(n); break; }
  if (!b) { if (c.ownership === 'UNKNOWN') unknownStill.push(c); continue; }
  matchedBookNames.add(b.name);
  const fine = b.ownership_controller;
  const coarse = FINE_TO_COARSE[fine] ?? '??';
  const row = { canonical: c.canonical, ours: c.ownership, fine, coarse, musd: Math.round(c.musd), obs: b.observacion || '' };
  matches.push(row);
  if (fine === 'Undetermined') {
    bookUndetermined++;
    if (c.ownership === 'UNKNOWN') unknownStill.push(c);
    continue;
  }
  if (c.ownership === 'UNKNOWN') { unknownResolved.push(row); continue; }
  if (coarse === c.ownership) {
    agree++;
    if (c.ownership === 'SOE' || c.ownership === 'SASAC') refines.push(row); // subcategoría fina disponible
  } else conflicts.push(row);
}
for (const [, c] of companies) if (c.ownership === 'UNKNOWN' && !unknownResolved.find(r => r.canonical === c.canonical) && !unknownStill.includes(c)) unknownStill.push(c);

const fmt = r => `| ${r.canonical} | ${r.ours} | ${r.fine} | ${r.coarse} | ${r.musd} |${r.obs ? ' ⚠️ ' + r.obs : ''}`;
const md = [];
md.push('# Cruce libro Francisco (corporate_code_classified) ↔ investors_map.csv');
md.push(`\nGenerado ${new Date().toISOString().slice(0, 10)}. Solo análisis — nada modificado. Libro: ${book.length} firmas (taxonomía fina). Nuestra base: ${companies.size} empresas (sin consorcios).`);
md.push(`\n## Resumen`);
md.push(`- Matchean: **${matches.length}** empresas nuestras (nombre normalizado, incl. alternativos del libro)`);
md.push(`- De esas, libro Undetermined (no aporta): **${bookUndetermined}**`);
md.push(`- Coinciden (colapsando taxonomía fina a nuestro enum): **${agree}**`);
md.push(`- **Conflictos: ${conflicts.length}**`);
md.push(`- Nuestros UNKNOWN que el libro resuelve: **${unknownResolved.length}** de 15`);
md.push(`- Coincidentes donde el libro aporta subcategoría fina (SASAC central/local/no-SASAC): **${refines.length}**`);
md.push(`\n## Conflictos (libro ≠ nuestra clasificación)`);
md.push('| Empresa | Nuestro | Libro (fino) | Libro→enum | MUSD |');
md.push('|---|---|---|---|---|');
for (const r of conflicts.sort((a, b) => b.musd - a.musd)) md.push(fmt(r));
md.push(`\n## UNKNOWN nuestros resueltos por el libro`);
md.push('| Empresa | Nuestro | Libro (fino) | Libro→enum | MUSD |');
md.push('|---|---|---|---|---|');
for (const r of unknownResolved) md.push(fmt(r));
md.push(`\n## UNKNOWN que siguen sin resolver (${unknownStill.length})`);
md.push(unknownStill.map(c => c.canonical).join(' · ') || '—');
md.push(`\n## Subcategoría fina disponible para nuestros SASAC/SOE coincidentes (${refines.length})`);
md.push('| Empresa | Nuestro | Libro (fino) | Libro→enum | MUSD |');
md.push('|---|---|---|---|---|');
for (const r of refines.sort((a, b) => b.musd - a.musd)) md.push(fmt(r));
md.push(`\n## Firmas del libro sin match en nuestra base: ${book.length - matchedBookNames.size} (mayormente México/otros países fuera del alcance actual)`);

writeFileSync(path.join(here, 'cruce_libro_ownership.md'), md.join('\n'));
console.log(md.slice(0, 12).join('\n'));
console.log(`\nConflictos:`); for (const r of conflicts.sort((a, b) => b.musd - a.musd)) console.log(` ${r.canonical}: ${r.ours} vs libro ${r.fine} (${r.musd} MUSD)${r.obs ? ' ⚠️' + r.obs : ''}`);
console.log(`\nUNKNOWN resueltos:`); for (const r of unknownResolved) console.log(` ${r.canonical}: → ${r.fine}`);
console.log(`\nMD completo: _scratch/cruce_libro_ownership.md`);