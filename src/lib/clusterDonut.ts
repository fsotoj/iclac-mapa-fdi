import { sectorColor } from './sectors'

export type SectorTally = {
  area: string
  count: number
}

const polarToCartesian = (cx: number, cy: number, r: number, angleDeg: number): [number, number] => {
  const a = ((angleDeg - 90) * Math.PI) / 180
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)]
}

const arcPath = (cx: number, cy: number, rOuter: number, rInner: number, startDeg: number, endDeg: number): string => {
  const [x1, y1] = polarToCartesian(cx, cy, rOuter, endDeg)
  const [x2, y2] = polarToCartesian(cx, cy, rOuter, startDeg)
  const [x3, y3] = polarToCartesian(cx, cy, rInner, startDeg)
  const [x4, y4] = polarToCartesian(cx, cy, rInner, endDeg)
  const largeArc = endDeg - startDeg <= 180 ? 0 : 1
  return [
    `M ${x1} ${y1}`,
    `A ${rOuter} ${rOuter} 0 ${largeArc} 0 ${x2} ${y2}`,
    `L ${x3} ${y3}`,
    `A ${rInner} ${rInner} 0 ${largeArc} 1 ${x4} ${y4}`,
    'Z'
  ].join(' ')
}

export const buildDonutSvg = (
  tallies: SectorTally[],
  totalCount: number,
  opts: { size: number; innerRatio?: number; showLabel?: boolean; bg?: string; centerLabel?: string }
): string => {
  const { size, innerRatio = 0.55, showLabel = true, bg = '#ffffff', centerLabel } = opts
  const cx = size / 2
  const cy = size / 2
  const rOuter = size / 2 - 2
  const rInner = rOuter * innerRatio

  if (tallies.length === 0) return ''
  const total = tallies.reduce((a, b) => a + b.count, 0) || 1

  let angle = 0
  const arcs: string[] = []
  for (const t of tallies) {
    const sweep = (t.count / total) * 360
    const end = angle + sweep
    if (sweep >= 359.99) {
      arcs.push(
        `<circle cx="${cx}" cy="${cy}" r="${rOuter}" fill="${sectorColor(t.area)}" stroke="none"/>` +
          `<circle cx="${cx}" cy="${cy}" r="${rInner}" fill="${bg}" stroke="none"/>`
      )
    } else {
      arcs.push(
        `<path d="${arcPath(cx, cy, rOuter, rInner, angle, end)}" fill="${sectorColor(t.area)}" stroke="none"/>`
      )
    }
    angle = end
  }

  const labelText = centerLabel ?? String(totalCount)
  const label = showLabel
    ? `<text x="${cx}" y="${cy}" text-anchor="middle" dominant-baseline="central" font-size="${Math.max(
        9,
        size * (centerLabel ? 0.22 : 0.3)
      )}" font-family="system-ui, sans-serif" font-weight="700" fill="#fff" stroke="#000" stroke-width="${(
        size * 0.04
      ).toFixed(2)}" paint-order="stroke" stroke-linejoin="round">${labelText}</text>`
    : ''

  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" overflow="visible" style="overflow:visible" xmlns="http://www.w3.org/2000/svg">
    <circle cx="${cx}" cy="${cy}" r="${rOuter}" fill="${bg}" stroke="rgba(0,0,0,0.15)" stroke-width="1"/>
    ${arcs.join('')}
    ${label}
  </svg>`
}

export const buildLegendHtml = (
  tallies: SectorTally[],
  totalCount: number,
  fmtValue: (n: number) => string = n => String(n)
): string => {
  const total = tallies.reduce((a, b) => a + b.count, 0) || 1
  const rows = tallies
    .slice()
    .sort((a, b) => b.count - a.count)
    .map(t => {
      const pct = ((t.count / total) * 100).toFixed(0)
      return `<div style="display:flex;align-items:center;gap:6px;font-size:11px;line-height:1.4">
        <span style="display:inline-block;width:10px;height:10px;background:${sectorColor(t.area)};border-radius:2px"></span>
        <span style="flex:1">${t.area}</span>
        <span style="color:#666">${fmtValue(t.count)} · ${pct}%</span>
      </div>`
    })
    .join('')
  return `<div style="min-width:200px">
    <div style="font-weight:600;margin-bottom:4px;font-size:12px">${totalCount} inversiones</div>
    ${rows}
  </div>`
}

export const tallyByArea = (areas: (string | null | undefined)[]): SectorTally[] => {
  const map = new Map<string, number>()
  for (const a of areas) {
    const k = a ?? 'Otros'
    map.set(k, (map.get(k) ?? 0) + 1)
  }
  return [...map.entries()].map(([area, count]) => ({ area, count }))
}

/** Tally sector money: sum of investment_musd per sector (null amounts → 0). */
export const tallyMoneyByArea = (
  invs: { area_en: string | null; investment_musd: number | null }[]
): SectorTally[] => {
  const map = new Map<string, number>()
  for (const i of invs) {
    const k = i.area_en ?? 'Otros'
    map.set(k, (map.get(k) ?? 0) + (i.investment_musd ?? 0))
  }
  return [...map.entries()].map(([area, count]) => ({ area, count }))
}
