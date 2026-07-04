#!/usr/bin/env node
// One-off: informe HTML cliente-ready de las métricas FDI share (2 y 2b).
// Lee docs/sprint_4/analisis_fdi_share.xlsx (output de build_fdi_share.mjs) y
// emite docs/sprint_4/informe_fdi_share.html con 4 figuras SVG inline.
// NO está en build chain. Re-correr tras regenerar el análisis.
import XLSX from 'xlsx'
import { writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(__dirname, '..')
const INPUT = resolve(REPO_ROOT, 'docs/sprint_4/analisis_fdi_share.xlsx')
const OUTPUT = resolve(REPO_ROOT, 'docs/sprint_4/informe_fdi_share.html')

// Corrección de presentación (no toca datos fuente): id 0005115 Zijin/Surinam,
// base registra 3.600 MM; operación real (Rosebel/IAMGOLD 2023) ≈ 360 MM.
const ZIJIN = { wrong: 3600, right: 360 }

const ES_NAME = {
  ARG: 'Argentina', BOL: 'Bolivia', BRA: 'Brasil', CHL: 'Chile', COL: 'Colombia',
  ECU: 'Ecuador', GUY: 'Guyana', PAN: 'Panamá', PRY: 'Paraguay', PER: 'Perú',
  SUR: 'Surinam', URY: 'Uruguay', VEN: 'Venezuela'
}

// Paleta validada (dataviz skill, surface #ffffff): PASS, aqua/amarillo <3:1 →
// relief vía etiquetas directas + tabla junto a cada figura.
const C = {
  blue: '#2a78d6', aqua: '#1baf7a', yellow: '#eda100', green: '#008300',
  muted: '#898781', grid: '#e1e0d9', inkSec: '#52514e', ink: '#0b0b0b'
}

const fmtPct = v => v.toLocaleString('es-CL', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '%'
const fmtMM = v => Math.round(v).toLocaleString('es-CL')
const fmtRatio = v => v.toLocaleString('es-CL', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '×'

// ---- Datos ----
const wb = XLSX.readFile(INPUT)
const sheet = n => XLSX.utils.sheet_to_json(wb.Sheets[n])
const serie = sheet('serie')
const resumen = sheet('resumen_ultimo_anio')
const cdisResumen = sheet('cdis_resumen')

// Fig 1: share 2024 por país, SUR corregido
const fig1Data = resumen.map(r => {
  if (r.iso3 === 'SUR') {
    const corrected = r.chinese_cum_musd - ZIJIN.wrong + ZIJIN.right
    return { ...r, share_raw: r.share_pct, chinese_cum_musd: corrected, share_pct: Math.round(corrected / r.unctad_stock_musd * 10000) / 100, corrected: true }
  }
  return { ...r, corrected: false }
}).sort((a, b) => b.share_pct - a.share_pct)

// Fig 2: dumbbell ICLAC vs oficial (ratio > 1), SUR corregido
const fig2Data = cdisResumen.map(r => {
  if (r.iso3 === 'SUR') {
    const corrected = r.iclac_cum_musd - ZIJIN.wrong + ZIJIN.right
    return { ...r, iclac_cum_musd: corrected, ratio: corrected / r.cdis_oficial_musd, corrected: true }
  }
  return { ...r, ratio: r.ratio_iclac_vs_oficial, corrected: false }
})
const fig2Main = fig2Data.filter(r => r.ratio > 1).sort((a, b) => b.ratio - a.ratio)
const fig2Inverted = fig2Data.filter(r => r.ratio <= 1).sort((a, b) => a.ratio - b.ratio)

// Fig 3: trayectorias PER/ARG/BRA/CHL desde 2005
const FIG3 = [
  { iso3: 'PER', color: C.blue }, { iso3: 'ARG', color: C.aqua },
  { iso3: 'BRA', color: C.yellow }, { iso3: 'CHL', color: C.green }
]
const fig3Series = FIG3.map(s => ({
  ...s,
  name: ES_NAME[s.iso3],
  points: serie.filter(r => r.iso3 === s.iso3 && r.year >= 2005 && r.share_pct !== null && r.share_pct !== undefined)
    .map(r => ({ year: r.year, share: r.share_pct }))
}))

// ---- Helpers SVG ----
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
// Barra horizontal: base cuadrada a la izquierda, punta redondeada (r=4) a la derecha
const barPath = (x, y, w, h, r = 4) => {
  if (w <= r) return `M${x},${y} h${w} v${h} h${-w} Z`
  return `M${x},${y} h${w - r} a${r},${r} 0 0 1 ${r},${r} v${h - 2 * r} a${r},${r} 0 0 1 ${-r},${r} h${-(w - r)} Z`
}

// ---- Fig 1: barras share por país ----
const fig1 = (() => {
  const W = 660, rowH = 26, padL = 88, padR = 64, padT = 8, padB = 26
  const H = padT + fig1Data.length * rowH + padB
  const maxShare = Math.max(...fig1Data.map(d => d.share_pct))
  const scale = v => (v / 30) * (W - padL - padR) // dominio 0–30%
  const ticks = [0, 10, 20, 30]
  let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Participación china en el stock FDI total por país, 2024">`
  for (const t of ticks) {
    const x = padL + scale(t)
    s += `<line x1="${x}" y1="${padT}" x2="${x}" y2="${H - padB}" stroke="${C.grid}" stroke-width="1"/>`
    s += `<text x="${x}" y="${H - padB + 16}" text-anchor="middle" class="ax">${t}%</text>`
  }
  fig1Data.forEach((d, i) => {
    const y = padT + i * rowH + 4
    const w = scale(Math.min(d.share_pct, 30))
    s += `<text x="${padL - 8}" y="${y + 13}" text-anchor="end" class="lbl">${esc(ES_NAME[d.iso3])}${d.corrected ? '*' : ''}</text>`
    s += `<path d="${barPath(padL, y, Math.max(w, 2), 18)}" fill="${C.blue}"/>`
    s += `<text x="${padL + w + 6}" y="${y + 13}" class="val">${fmtPct(d.share_pct)}</text>`
  })
  s += `</svg>`
  return s
})()

// ---- Fig 2: dumbbell log ICLAC vs oficial ----
const fig2 = (() => {
  const W = 660, rowH = 32, padL = 88, padR = 70, padT = 30, padB = 30
  const H = padT + fig2Main.length * rowH + padB
  const LOG_MIN = 0, LOG_MAX = 5 // 10^0=1 MM … 10^5=100.000 MM
  const x = v => padL + (Math.log10(v) - LOG_MIN) / (LOG_MAX - LOG_MIN) * (W - padL - padR)
  let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Stock chino por país: registro ICLAC versus posición oficial bilateral, 2024, escala logarítmica">`
  for (let e = LOG_MIN; e <= LOG_MAX; e++) {
    const gx = x(10 ** e)
    s += `<line x1="${gx}" y1="${padT - 6}" x2="${gx}" y2="${H - padB}" stroke="${C.grid}" stroke-width="1"/>`
    s += `<text x="${gx}" y="${H - padB + 16}" text-anchor="middle" class="ax">${(10 ** e).toLocaleString('es-CL')}</text>`
  }
  fig2Main.forEach((d, i) => {
    const y = padT + i * rowH + rowH / 2
    const x1 = x(Math.max(d.cdis_oficial_musd, 1)), x2 = x(d.iclac_cum_musd)
    s += `<text x="${padL - 8}" y="${y + 4}" text-anchor="end" class="lbl">${esc(ES_NAME[d.iso3])}${d.corrected ? '*' : ''}</text>`
    s += `<line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" stroke="${C.grid}" stroke-width="2"/>`
    s += `<circle cx="${x1}" cy="${y}" r="5" fill="${C.muted}" stroke="#fff" stroke-width="2"/>`
    s += `<circle cx="${x2}" cy="${y}" r="5" fill="${C.blue}" stroke="#fff" stroke-width="2"/>`
    s += `<text x="${W - padR + 8}" y="${y + 4}" class="val">${fmtRatio(d.ratio)}</text>`
  })
  s += `</svg>`
  return s
})()

// ---- Fig 3: trayectorias ----
const fig3 = (() => {
  const W = 660, H = 300, padL = 44, padR = 92, padT = 12, padB = 30
  const Y_MAX = 30
  const years = [2005, 2024]
  const x = yr => padL + (yr - years[0]) / (years[1] - years[0]) * (W - padL - padR)
  const y = v => padT + (1 - v / Y_MAX) * (H - padT - padB)
  let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Evolución de la participación china en el stock FDI, 2005 a 2024, Perú, Argentina, Brasil y Chile">`
  for (const t of [0, 10, 20, 30]) {
    s += `<line x1="${padL}" y1="${y(t)}" x2="${W - padR}" y2="${y(t)}" stroke="${C.grid}" stroke-width="1"/>`
    s += `<text x="${padL - 6}" y="${y(t) + 4}" text-anchor="end" class="ax">${t}%</text>`
  }
  for (const t of [2005, 2010, 2015, 2020, 2024]) {
    s += `<text x="${x(t)}" y="${H - padB + 16}" text-anchor="middle" class="ax">${t}</text>`
  }
  for (const serie3 of fig3Series) {
    const pts = serie3.points.map(p => `${x(p.year)},${y(p.share)}`).join(' ')
    s += `<polyline points="${pts}" fill="none" stroke="${serie3.color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`
    const last = serie3.points[serie3.points.length - 1]
    s += `<circle cx="${x(last.year)}" cy="${y(last.share)}" r="4" fill="${serie3.color}" stroke="#fff" stroke-width="2"/>`
    s += `<text x="${x(last.year) + 8}" y="${y(last.share) + 4}" class="lbl">${esc(serie3.name)} ${fmtPct(last.share)}</text>`
  }
  s += `</svg>`
  return s
})()

// ---- Fig 4: Surinam antes/después ----
const fig4 = (() => {
  const surRaw = resumen.find(r => r.iso3 === 'SUR')
  const rows = [
    { label: 'Como está en la base', v: surRaw.share_pct, color: C.muted },
    { label: 'Con el monto corregido', v: fig1Data.find(d => d.iso3 === 'SUR').share_pct, color: C.blue }
  ]
  const W = 660, rowH = 30, padL = 170, padR = 70, padT = 8, padB = 26
  const H = padT + rows.length * rowH + padB
  const scale = v => (v / 200) * (W - padL - padR)
  let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Surinam: participación aparente antes y después de corregir el monto de Zijin">`
  for (const t of [0, 100, 200]) {
    const gx = padL + scale(t)
    s += `<line x1="${gx}" y1="${padT}" x2="${gx}" y2="${H - padB}" stroke="${C.grid}" stroke-width="1"/>`
    s += `<text x="${gx}" y="${H - padB + 16}" text-anchor="middle" class="ax">${t}%</text>`
  }
  rows.forEach((r, i) => {
    const yy = padT + i * rowH + 5
    s += `<text x="${padL - 8}" y="${yy + 13}" text-anchor="end" class="lbl">${esc(r.label)}</text>`
    s += `<path d="${barPath(padL, yy, Math.max(scale(r.v), 2), 18)}" fill="${r.color}"/>`
    s += `<text x="${padL + scale(r.v) + 6}" y="${yy + 13}" class="val">${fmtPct(r.v)}</text>`
  })
  s += `</svg>`
  return s
})()

// ---- Tablas ----
const tablaFig1 = `<table>
  <thead><tr><th>País</th><th>Share 2024</th><th>Stock chino (MM US$)</th><th>Stock FDI total UNCTAD (MM US$)</th></tr></thead>
  <tbody>${fig1Data.map(d => `<tr><td>${ES_NAME[d.iso3]}${d.corrected ? '*' : ''}</td><td>${fmtPct(d.share_pct)}</td><td>${fmtMM(d.chinese_cum_musd)}</td><td>${fmtMM(d.unctad_stock_musd)}</td></tr>`).join('\n')}</tbody>
</table>`

const tablaFig2 = `<table>
  <thead><tr><th>País</th><th>ICLAC (MM US$)</th><th>Oficial CDIS (MM US$)</th><th>Ratio</th></tr></thead>
  <tbody>${fig2Main.map(d => `<tr><td>${ES_NAME[d.iso3]}${d.corrected ? '*' : ''}</td><td>${fmtMM(d.iclac_cum_musd)}</td><td>${fmtMM(d.cdis_oficial_musd)}</td><td>${fmtRatio(d.ratio)}</td></tr>`).join('\n')}</tbody>
</table>`

const tablaInvertidos = `<table>
  <thead><tr><th>País</th><th>ICLAC (MM US$)</th><th>Oficial CDIS (MM US$)</th></tr></thead>
  <tbody>${fig2Inverted.map(d => `<tr><td>${ES_NAME[d.iso3]}</td><td>${fmtMM(d.iclac_cum_musd)}</td><td>${fmtMM(d.cdis_oficial_musd)}</td></tr>`).join('\n')}</tbody>
</table>`

const bra = cdisResumen.find(r => r.iso3 === 'BRA')
const per = resumen.find(r => r.iso3 === 'PER')

// ---- HTML ----
const html = `<!DOCTYPE html>
<html lang="es">

<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Participación china en el stock FDI — ICLAC mapa_FDI</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
  <style>
    :root {
      --ink: #111111; --ink-soft: #2e2e2e; --muted: #808080; --line: #e8e8e8;
      --bg: #ffffff; --soft-bg: #fafafa; --red: #c8102e; --yellow: #f4b400;
      --green: #1a7f4b; --code-bg: #f5f5f5;
    }
    * { box-sizing: border-box; }
    html, body {
      margin: 0; padding: 0; background: var(--bg); color: var(--ink);
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
      font-size: 11pt; line-height: 1.65; -webkit-font-smoothing: antialiased;
      -webkit-print-color-adjust: exact; print-color-adjust: exact;
    }
    .page { max-width: 760px; margin: 0 auto; padding: 64px 48px; }
    header.cover { margin-bottom: 48px; }
    header.cover .eyebrow { text-transform: uppercase; font-size: 9pt; letter-spacing: 0.15em; color: var(--red); font-weight: 600; margin-bottom: 16px; }
    header.cover h1 { font-size: 26pt; line-height: 1.15; margin: 0 0 8px 0; font-weight: 700; letter-spacing: -0.015em; }
    header.cover h2 { font-size: 12pt; font-weight: 400; color: var(--muted); margin: 0 0 32px 0; }
    .meta { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; padding-top: 24px; border-top: 1px solid var(--line); }
    .meta .label { font-size: 8.5pt; text-transform: uppercase; letter-spacing: 0.1em; color: var(--muted); margin-bottom: 4px; font-weight: 500; }
    .meta .value { font-size: 10.5pt; font-weight: 500; }
    section { margin-bottom: 40px; }
    h3 { font-size: 13pt; font-weight: 700; margin: 0 0 20px 0; padding-bottom: 10px; letter-spacing: -0.005em; border-bottom: 1px solid var(--line); position: relative; }
    h3::after { content: ""; position: absolute; bottom: -1px; left: 0; width: 40px; height: 2px; background: var(--red); }
    h3 .num { color: var(--red); font-weight: 600; margin-right: 12px; }
    h4 { font-size: 11pt; font-weight: 600; margin: 28px 0 10px 0; }
    p { margin: 0 0 12px 0; color: var(--ink-soft); }
    ul, ol { margin: 0 0 12px 0; padding-left: 18px; }
    li { margin-bottom: 4px; color: var(--ink-soft); }
    li::marker { color: var(--muted); }
    strong { color: var(--ink); font-weight: 600; }
    code { font-family: 'JetBrains Mono', monospace; font-size: 9.2pt; background: var(--code-bg); padding: 1px 5px; border-radius: 3px; color: #9a2540; }
    table { width: 100%; border-collapse: collapse; margin: 14px 0 10px 0; font-size: 9.6pt; }
    th { text-align: left; color: var(--muted); font-weight: 500; padding: 9px 10px 9px 0; font-size: 8.2pt; text-transform: uppercase; letter-spacing: 0.06em; border-bottom: 1px solid var(--ink); vertical-align: bottom; }
    td { padding: 9px 10px 9px 0; border-bottom: 1px solid var(--line); color: var(--ink-soft); vertical-align: top; font-variant-numeric: tabular-nums; }
    tr td:first-child, tr th:first-child { padding-left: 0; }
    .callout { border-radius: 6px; padding: 14px 16px; margin: 16px 0; font-size: 10pt; border-left: 4px solid; }
    .callout .callout-title { font-weight: 700; font-size: 9pt; text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 6px; display: block; }
    .callout p:last-child { margin-bottom: 0; }
    .callout-danger { background: #fdf2f3; border-color: var(--red); }
    .callout-danger .callout-title { color: var(--red); }
    .callout-warn { background: #fdfaf0; border-color: var(--yellow); }
    .callout-warn .callout-title { color: #a07700; }
    .callout-info { background: var(--soft-bg); border-color: var(--muted); }
    .callout-info .callout-title { color: var(--ink); }
    .callout-ok { background: #f1f8f4; border-color: var(--green); }
    .callout-ok .callout-title { color: var(--green); }
    figure { margin: 20px 0 8px 0; }
    figure svg { width: 100%; height: auto; display: block; }
    figcaption { font-size: 9pt; color: var(--muted); margin-top: 8px; line-height: 1.5; }
    .legend { display: flex; gap: 18px; font-size: 9pt; color: var(--ink-soft); margin-bottom: 6px; flex-wrap: wrap; }
    .legend .key { display: inline-flex; align-items: center; gap: 6px; }
    .legend .dot { width: 10px; height: 10px; border-radius: 50%; display: inline-block; }
    .legend .bar { width: 14px; height: 10px; border-radius: 2px; display: inline-block; }
    svg .ax { font: 500 10px 'Inter', sans-serif; fill: #898781; }
    svg .lbl { font: 500 11px 'Inter', sans-serif; fill: #2e2e2e; }
    svg .val { font: 600 11px 'Inter', sans-serif; fill: #52514e; font-variant-numeric: tabular-nums; }
    footer { margin-top: 56px; padding-top: 20px; border-top: 1px solid var(--line); font-size: 9pt; color: var(--muted); }
    @media print { .page { padding: 0; max-width: none; } section { break-inside: avoid; } h3 { break-after: avoid; } table { break-inside: avoid; } figure { break-inside: avoid; } }
    @media (max-width: 640px) { .page { padding: 32px 20px; } .meta { grid-template-columns: repeat(2, 1fr); } }
  </style>
</head>

<body>
  <div class="page">

    <header class="cover">
      <div class="eyebrow">ICLAC · Repositorio Regional de Inversiones Chinas · mapa_FDI · Sprint 4</div>
      <h1>Participación china en el stock FDI</h1>
      <h2>Dos métricas nuevas construidas sobre el repositorio — análisis exploratorio</h2>
      <div class="meta">
        <div><div class="label">Fecha</div><div class="value">2026-07-04</div></div>
        <div><div class="label">Autor</div><div class="value">Felipe Soto J.</div></div>
        <div><div class="label">Fuentes</div><div class="value">Repositorio · UNCTAD · FMI</div></div>
        <div><div class="label">Estado</div><div class="value">Análisis interno</div></div>
      </div>
    </header>

    <section id="resumen">
      <h3><span class="num">★</span>Resumen ejecutivo</h3>
      <p>Construimos dos métricas que cruzan el repositorio con las estadísticas oficiales de inversión extranjera: <strong>(1)</strong> qué proporción del stock FDI total de cada país representa la inversión china documentada, y <strong>(2)</strong> cuánta más inversión china encuentra el rastreo proyecto-por-proyecto del repositorio que la estadística bilateral oficial. Tres resultados principales:</p>
      <ul>
        <li><strong>El repositorio encuentra entre 8 y 19 veces más inversión china que las cifras oficiales</strong> en las economías grandes de la región (Brasil ${fmtRatio(bra.ratio_iclac_vs_oficial)}, Perú 9,9×, Argentina 8,8×). La brecha cuantifica, país por país, el vacío de información que el repositorio existe para llenar.</li>
        <li><strong>La inversión china documentada equivale al ${fmtPct(per.share_pct)} del stock FDI total de Perú</strong> — la penetración más alta de la región, seguida de Argentina (11,8%) y Venezuela (9,8%).</li>
        <li><strong>La métrica detectó un probable error en la base:</strong> la inversión de Zijin en Surinam (id <code>0005115</code>) registra US$3.600 MM; la operación real fue ~US$360 MM. Corregirlo es una edición puntual (sección 05).</li>
      </ul>
      <div class="callout callout-info">
        <span class="callout-title">Estado</span>
        <p>Análisis exploratorio: las cifras aún no se muestran en la plataforma. Este informe es el insumo para decidir si estas métricas se integran como una vista nueva.</p>
      </div>
    </section>

    <section id="metodo">
      <h3><span class="num">01</span>Qué miden y con qué fuentes</h3>
      <ul>
        <li><strong>Métrica 1 — share del stock FDI total:</strong> stock chino acumulado según el repositorio (deduplicado por inversión, <strong>sin Construcción</strong> — igual que la metodología, que la excluye del total FDI) ÷ stock FDI total del país según <strong>UNCTAD</strong> (serie anual oficial, misma para los 13 países).</li>
        <li><strong>Métrica 2 — brecha contra la cifra oficial bilateral:</strong> el mismo stock chino del repositorio ÷ la posición de inversión "desde China" que cada país reporta al <strong>FMI</strong> (encuesta CDIS). Esta cifra oficial atribuye cada inversión a su contraparte <em>inmediata</em>: un proyecto chino que entra vía una holding en Islas Caimán queda registrado como inversión caimanesa, no china.</li>
      </ul>
    </section>

    <section id="share">
      <h3><span class="num">02</span>Share por país</h3>
      <figure>
        ${fig1}
        <figcaption><strong>Fig. 1</strong> — Inversión china documentada como % del stock FDI total de cada país, 2024. *Surinam ploteado con el monto corregido de Zijin (ver sección 05); con el valor actual de la base daría un share imposible de ${fmtPct(resumen.find(r => r.iso3 === 'SUR').share_pct)}.</figcaption>
      </figure>
      ${tablaFig1}
      <p>Perú lidera por lejos — coherente con el peso de la gran minería china (Las Bambas, Toromocho, Shougang). La cifra amerita contraste contra fuentes comparables (CGIT, CEPAL) antes de uso externo: el numerador suma montos de transacción, que no es lo mismo que el valor libro que mide UNCTAD (ver sección 06).</p>
    </section>

    <section id="brecha">
      <h3><span class="num">03</span>La brecha contra las cifras oficiales</h3>
      <div class="legend">
        <span class="key"><span class="dot" style="background:${C.muted}"></span> Posición oficial bilateral (FMI CDIS)</span>
        <span class="key"><span class="dot" style="background:${C.blue}"></span> Repositorio ICLAC</span>
      </div>
      <figure>
        ${fig2}
        <figcaption><strong>Fig. 2</strong> — Stock chino por país en 2024 (MM US$, escala logarítmica): registro oficial vs repositorio. El número a la derecha es el ratio. *Surinam con el monto corregido de Zijin.</figcaption>
      </figure>
      ${tablaFig2}
      <p>La lectura: <strong>la distancia entre los dos puntos es el aporte del repositorio.</strong> Las estadísticas oficiales subestiman la inversión china porque la registran por el país de la sociedad que firma (Hong Kong, Islas Caimán, Luxemburgo), no por quién controla en última instancia. El rastreo proyecto-por-proyecto no tiene ese problema — y la brecha resultante, de 8× a 19× en las economías grandes, es la versión sistemática y por país de la comparación que la metodología del proyecto ya hace contra las cifras agregadas de MOFCOM.</p>
      <h4>Tres países al revés</h4>
      <p>En Bolivia, Panamá y Uruguay la cifra oficial <em>supera</em> lo documentado en el repositorio:</p>
      ${tablaInvertidos}
      <p>Dos explicaciones posibles, a investigar: <strong>(a)</strong> inversiones que la prensa no cubrió y el repositorio no capturó; <strong>(b)</strong> dinero chino en holdings o zonas francas sin proyecto productivo detrás — el banco central lo registra, pero no corresponde a un proyecto mapeable. Panamá, hub financiero regional, es el candidato natural para la explicación (b).</p>
    </section>

    <section id="trayectorias">
      <h3><span class="num">04</span>Trayectorias 2005–2024</h3>
      <div class="legend">
        ${fig3Series.map(s => `<span class="key"><span class="dot" style="background:${s.color}"></span> ${s.name}</span>`).join('\n        ')}
      </div>
      <figure>
        ${fig3}
        <figcaption><strong>Fig. 3</strong> — Evolución del share sobre el stock FDI total. Perú salta con Las Bambas (2014) y se mantiene arriba. El share de Argentina retrocede desde ~2015: el numerador acumulado nunca baja, así que la caída refleja que el stock FDI total del país creció más rápido que la inversión china nueva. Brasil y Chile avanzan gradual.</figcaption>
      </figure>
    </section>

    <section id="surinam">
      <h3><span class="num">05</span>El caso Surinam: la métrica como control de calidad</h3>
      <figure>
        ${fig4}
        <figcaption><strong>Fig. 4</strong> — Share aparente de Surinam antes y después de corregir el monto de Zijin.</figcaption>
      </figure>
      <p>Al calcular la métrica, Surinam arrojó un share superior al 100% — imposible por construcción. La causa es un único registro: <strong>id <code>0005115</code>, Zijin, 2023, minería, US$3.600 MM</strong>. La operación real es la compra de la mina de oro Rosebel a IAMGOLD, cerrada en 2023 por <strong>~US$360 MM</strong> — el monto en la base tiene un cero de más.</p>
      <div class="callout callout-warn">
        <span class="callout-title">Corrección sugerida</span>
        <p>Inversión <code>0005115</code> (Zijin · Surinam · 2023): <strong>3.600 → 360</strong> (MM US$). Con la corrección, el share de Surinam queda en ${fmtPct(fig1Data.find(d => d.iso3 === 'SUR').share_pct)} — alto pero coherente con una economía pequeña cuyo stock FDI viene deprimido por desinversiones petroleras.</p>
      </div>
      <p>El episodio ilustra un beneficio lateral de estas métricas: <strong>funcionan como test de coherencia de la propia base</strong> — un monto fuera de escala se delata al dividirlo por el total del país.</p>
    </section>

    <section id="advertencias">
      <h3><span class="num">06</span>Advertencias metodológicas</h3>
      <ul>
        <li><strong>Naturalezas distintas:</strong> el numerador suma montos de transacción verificados; el stock de UNCTAD es valor libro con revalorizaciones (baja en crisis y devaluaciones). El ratio es una aproximación — práctica estándar en la literatura, pero se declara junto a la cifra.</li>
        <li><strong>Inversiones sin monto público</strong> quedan fuera del numerador (subestimación leve, se reporta el conteo).</li>
        <li><strong>Proyectos terminados</strong> se retiran del repositorio según la metodología, así que el numerador ya representa el stock sobreviviente — comparable con un stock.</li>
        <li>Las cifras usan la base actualmente publicada en la plataforma; al integrarse la base corregida en revisión, las series se recalculan automáticamente.</li>
      </ul>
    </section>

    <section id="proximos">
      <h3><span class="num">07</span>Próximos pasos</h3>
      <ol>
        <li>Corregir el monto de Zijin/Surinam en la base (sección 05).</li>
        <li>Contrastar Perú y Brasil contra CGIT y el monitor OFDI de CEPAL antes de cualquier uso externo de las cifras.</li>
        <li>Investigar los tres países invertidos (Bolivia, Panamá, Uruguay): ¿cobertura o dinero sin proyecto?</li>
        <li>Con los datos validados, decidir si estas métricas se integran a la plataforma como vista nueva.</li>
      </ol>
    </section>

    <footer>
      ICLAC · Repositorio Regional de Inversiones Chinas en América Latina · mapa_FDI · Sprint 4 · Participación china en el stock FDI · 2026-07-04.
      Fuentes: repositorio ICLAC (deduplicado, sin Construcción) · UNCTADstat (stock FDI inward) · FMI, Direct Investment Positions (ex CDIS).
    </footer>

  </div>
</body>

</html>
`

writeFileSync(OUTPUT, html, 'utf8')
console.log(`informe: ${OUTPUT}`)
console.log(`fig1: ${fig1Data.length} países · fig2: ${fig2Main.length} + ${fig2Inverted.length} invertidos · fig3: ${fig3Series.map(s => `${s.iso3}(${s.points.length})`).join(' ')}`)
