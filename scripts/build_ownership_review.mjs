// One-off: genera el XLSX de revisión de propiedad (ownership) para el equipo Dialogue
// (Yifang Wang; cc Margaret/Claire) desde data/schema/investors_map.csv → docs/sprint_5/ownership_review.xlsx
// Hojas: README (instrucciones) · companies (1 fila por empresa, foco de la revisión)
//        · consortiums (19 vehículos conjuntos) · raw_mapping (las 210 filas tal cual, referencia).
// Re-correr tras cada actualización de investors_map.csv.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import xlsx from 'xlsx';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CSV = path.join(root, 'data', 'schema', 'investors_map.csv');
const OUT = path.join(root, 'docs', 'sprint_5', 'ownership_review.xlsx');

function parseCSV(text) {
  const rows = [];
  let row = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; }
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(cur); cur = ''; }
    else if (c === '\n') { row.push(cur.replace(/\r$/, '')); rows.push(row); row = []; cur = ''; }
    else cur += c;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  return rows;
}

const raw = parseCSV(readFileSync(CSV, 'utf8'));
const header = raw[0];
const idx = Object.fromEntries(header.map((h, i) => [h, i]));
const rows = raw.slice(1).filter(r => r.length > 1).map(r => ({
  investor_raw: r[idx.investor_raw],
  company_id: r[idx.company_id],
  company_canonical: r[idx.company_canonical],
  is_consortium: r[idx.is_consortium] === 'TRUE',
  members: r[idx.members],
  ownership: r[idx.ownership],
  review_note: r[idx.review_note],
  count: Number(r[idx._count]) || 0,
  musd: Number(r[idx._musd]) || 0,
}));

// company_id → canonical (para resolver members); ids huérfanos se humanizan como en la UI
const idToCanonical = new Map();
for (const r of rows) if (!idToCanonical.has(r.company_id)) idToCanonical.set(r.company_id, r.company_canonical);
// misma regla que src/lib/sankey.ts humanizeId (≤3 chars = sigla) + overrides que esa regla no cubre
const ACRONYMS = { cneec: 'CNEEC', camce: 'CAMCE', 'xiamen-cd': 'Xiamen C&D' };
const humanize = id => ACRONYMS[id] ?? id.split('-')
  .map(w => (w.length <= 3 ? w.toUpperCase() : w[0].toUpperCase() + w.slice(1)))
  .join(' ');
const resolveMembers = members => !members ? '' :
  [...new Set(members.split('|').map(id => idToCanonical.get(id) ?? humanize(id)))].join(', ');

// Agregar por company_id
const byId = new Map();
for (const r of rows) {
  if (!byId.has(r.company_id)) byId.set(r.company_id, { ...r, raws: [], notes: [], count: 0, musd: 0 });
  const c = byId.get(r.company_id);
  c.raws.push(r.investor_raw);
  if (r.review_note && !c.notes.includes(r.review_note)) c.notes.push(r.review_note);
  c.count += r.count;
  c.musd += r.musd;
}
const companies = [...byId.values()];
const OWN_ORDER = { UNKNOWN: 0, MIXED: 1, SASAC: 2, SOE: 3, POE: 4 };
const sortRows = arr => arr.sort((a, b) =>
  (OWN_ORDER[a.ownership] ?? 9) - (OWN_ORDER[b.ownership] ?? 9) || b.musd - a.musd);

// Glosas EN de las notas para las filas prioritarias (UNKNOWN + MIXED no-consorcio).
// Las notas fuente quedan en español/mixto; esto evita fricción en las 20 que importan.
const GENERIC_EN = 'Poorly documented entity; ultimate control unconfirmed.';
const NOTE_EN = {
  'north-lima-power-grid-holding': 'Acquisition vehicle in Peru; ultimate controller unconfirmed (likely State Grid / China Southern Power Grid).',
  'beijing-limawei': GENERIC_EN,
  'lanzhou-haimo-technologies': 'Oilfield-technology company; ultimate control unconfirmed.',
  'citic-guoan': 'Recapitalized in 2014: CITIC Group holds only 20.95%, the rest is private capital. Not clearly state-owned nor a controlled subsidiary; kept separate from CITIC.',
  'terminal-portuario-jinzhao': 'Project vehicle in Peru (Marcona port); Chinese controller unconfirmed (Jinzhao Mining).',
  'revotech-asia-limited': GENERIC_EN,
  'sinovel-wind': 'Shanghai-listed (Han Junliang); fraud history. Set to MIXED following the original ICLAC research classification, replacing our earlier web estimate of POE.',
  'cnnet': GENERIC_EN,
  'everchina': GENERIC_EN,
  'changyu-pioneer-wine': 'Yantai Changyu: municipal-SOE origin with mixed-ownership reform (management buyout + Illva Saronno).',
  'cnqc': 'CNQC International Holdings (Qingdao); ultimate control unconfirmed (Qingdao SOE origin).',
  'yangtze-optical-fibre-and-cable': 'YOFC: joint venture between state shareholders (China Huaxin) and private/foreign ones (Draka). Genuinely mixed ownership.',
  'gold-anda-agricultural-technology': GENERIC_EN,
  'excellbio': GENERIC_EN,
  'zhen-jiang-no-2': GENERIC_EN,
  'maverick-motos': 'Motorcycle brand in Brazil; Chinese parent unconfirmed.',
  'fubao-food-company': GENERIC_EN,
  'shanghai-kangzheng': GENERIC_EN,
  'dashang-group': 'Dalian Dashang: municipal-SOE origin, mixed-ownership reform (retail).',
  'china-mingjin-group': GENERIC_EN,
};

// Registro del libro de Francisco (adjunto del hilo 11-07): taxonomía fina como referencia.
// Se muestra donde matchea por nombre/alias; el veredicto sigue sobre nuestro enum.
const BOOK = path.join(root, '_scratch', 'corporate_code_classified.xlsx');
const FINE_TO_COARSE = {
  'SASAC central': 'SASAC', 'SASAC local': 'SOE', 'Other central-state (non-SASAC)': 'SOE',
  'Collective or local government': 'SOE', 'Private': 'POE', 'Undetermined': 'UNKNOWN',
};
const bnorm = s => String(s || '').toLowerCase()
  .replace(/\b(co|ltd|limited|corp|corporation|company|group|holdings?|inc)\b/g, '')
  .replace(/[^a-z0-9]/g, '');
const bookIndex = new Map();
for (const b of xlsx.utils.sheet_to_json(xlsx.readFile(BOOK).Sheets.Sheet1)) {
  for (const k of ['name', 'alternative_name_a', 'alternative_name_b'])
    if (b[k] && !bookIndex.has(bnorm(b[k]))) bookIndex.set(bnorm(b[k]), b.ownership_controller);
}
// → { fine, status: 'agrees' | 'DISAGREES' | 'book: undetermined' | '' }
function bookInfo(c) {
  let fine = null;
  for (const n of [c.company_canonical, ...c.raws]) { const hit = bookIndex.get(bnorm(n)); if (hit) { fine = hit; break; } }
  if (!fine) return { fine: '', status: '' };
  if (fine === 'Undetermined') return { fine, status: 'book: undetermined' };
  return { fine, status: FINE_TO_COARSE[fine] === c.ownership ? 'agrees' : 'DISAGREES' };
}

const REVIEW_COLS = { 'your verdict (OK / WRONG / UNSURE)': '', 'corrected ownership': '', comments: '' };
// En consortiums el veredicto aplica a la lista de members, no al MIXED estructural:
// sin columna "corrected ownership" ahí.
const CONS_REVIEW_COLS = { 'your verdict on the member list (OK / WRONG / UNSURE)': '', comments: '' };
// Orden: UNKNOWN → MIXED → conflictos con el libro → resto (por monto dentro de cada grupo)
const firmsSrc = companies.filter(c => !c.is_consortium).map(c => ({ c, book: bookInfo(c) }));
const firmRank = f => f.c.ownership === 'UNKNOWN' ? 0 : f.c.ownership === 'MIXED' ? 1 : f.book.status === 'DISAGREES' ? 2 : 3;
firmsSrc.sort((a, b) => firmRank(a) - firmRank(b) || b.c.musd - a.c.musd);
const firms = firmsSrc.map(({ c, book }) => ({
  company: c.company_canonical,
  ownership: c.ownership,
  "Francisco's registry (book)": book.fine,
  'book vs ours': book.status,
  'justification / source (our note)': c.notes.join(' | '),
  'note in English (priority rows)': NOTE_EN[c.company_id] ?? '',
  'raw name(s) in the database': c.raws.join(' | '),
  'investments (n)': c.count,
  'total (US$ M)': c.musd,
  ...REVIEW_COLS,
}));
const bookStats = firmsSrc.reduce((a, f) => { if (f.book.status) a[f.book.status] = (a[f.book.status] || 0) + 1; return a; }, {});
const consortiums = sortRows(companies.filter(c => c.is_consortium)).map(c => ({
  'consortium (as displayed)': c.company_canonical,
  members: resolveMembers(c.members),
  ownership: c.ownership,
  'our note': c.notes.join(' | '),
  'investments (n)': c.count,
  'total (US$ M)': c.musd,
  ...CONS_REVIEW_COLS,
}));
const rawSheet = rows.map(r => ({
  investor_raw: r.investor_raw,
  company_id: r.company_id,
  company_canonical: r.company_canonical,
  is_consortium: r.is_consortium ? 'TRUE' : 'FALSE',
  members: r.members,
  ownership: r.ownership,
  review_note: r.review_note,
  investments_n: r.count,
  total_musd: r.musd,
}));

const dist = {};
for (const c of companies) dist[c.ownership] = (dist[c.ownership] || 0) + 1;

const readme = [
  ['ICLAC investor base — ownership review'],
  [''],
  ['Purpose', 'Review the ownership classification we assigned to each Chinese investor in the repository. Companion document: investor_base_guide_12072026.html (explains every variable, category, and the id conventions).'],
  [''],
  ['How to review', '1) Work on the "companies" sheet: one row per company, sorted so UNKNOWN, MIXED and book-conflicts come first (they need you most). 2) Fill "your verdict": OK if the ownership value is right, WRONG if not (then put the right value in "corrected ownership"), UNSURE if it needs discussion. 3) Use "comments" for anything else (wrong merges, better sources, renames). 4) The "consortiums" sheet lists joint-investment vehicles; their MIXED is a structural placeholder, review the member list instead.'],
  [''],
  ["Francisco's registry", 'The column "Francisco\'s registry (book)" shows, where the company matches by name, the classification from the registry Francisco attached in this thread (finer taxonomy: SASAC central / SASAC local / other central-state / private / undetermined). "book vs ours" says whether it agrees with our value. Treat it as one more source: where it DISAGREES, your verdict decides.'],
  [''],
  ['Categories', 'SASAC = central SOE under SASAC supervision · SOE = other state-owned (provincial/municipal, state banks, sovereign funds) · POE = privately owned · MIXED = genuinely mixed ownership or consortium · UNKNOWN = we could not determine it with confidence. Classification is by ULTIMATE control, not immediate shareholder.'],
  [''],
  ['Current distribution (distinct companies)', Object.entries(dist).map(([k, v]) => `${k} ${v}`).join(' · ') + ` · total ${companies.length}`],
  [''],
  ['Sheets', 'companies = one row per company (the review target) · consortiums = joint vehicles with members · raw_mapping = the full 1:1 mapping table as we maintain it (reference only).'],
  [''],
  ['Generated', new Date().toISOString().slice(0, 10) + ' from data/schema/investors_map.csv'],
];

const wb = xlsx.utils.book_new();
const wsReadme = xlsx.utils.aoa_to_sheet(readme);
wsReadme['!cols'] = [{ wch: 38 }, { wch: 120 }];
xlsx.utils.book_append_sheet(wb, wsReadme, 'README');

const wsFirms = xlsx.utils.json_to_sheet(firms);
wsFirms['!cols'] = [{ wch: 34 }, { wch: 10 }, { wch: 22 }, { wch: 18 }, { wch: 70 }, { wch: 50 }, { wch: 45 }, { wch: 12 }, { wch: 12 }, { wch: 26 }, { wch: 18 }, { wch: 40 }];
xlsx.utils.book_append_sheet(wb, wsFirms, 'companies');

const wsCons = xlsx.utils.json_to_sheet(consortiums);
wsCons['!cols'] = [{ wch: 40 }, { wch: 50 }, { wch: 10 }, { wch: 70 }, { wch: 12 }, { wch: 12 }, { wch: 30 }, { wch: 40 }];
xlsx.utils.book_append_sheet(wb, wsCons, 'consortiums');

const wsRaw = xlsx.utils.json_to_sheet(rawSheet);
wsRaw['!cols'] = [{ wch: 45 }, { wch: 30 }, { wch: 34 }, { wch: 12 }, { wch: 30 }, { wch: 10 }, { wch: 70 }, { wch: 12 }, { wch: 12 }];
xlsx.utils.book_append_sheet(wb, wsRaw, 'raw_mapping');

xlsx.writeFile(wb, OUT);
console.log(`OK → ${OUT}`);
console.log(`companies: ${firms.length} · consortiums: ${consortiums.length} · raw rows: ${rawSheet.length}`);
console.log('distribution:', dist);
console.log('book cross:', bookStats);
const unknown = companies.filter(c => c.ownership === 'UNKNOWN').map(c => c.company_canonical);
console.log('UNKNOWN:', unknown.join(' · '));
