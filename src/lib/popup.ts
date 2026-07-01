import type { Investment } from '@/types/data'
import { sectorColor } from './sectors'

const escape = (s: string | null | undefined): string => {
  if (s === null || s === undefined) return ''
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

const formatMoney = (n: number | null | undefined): string => {
  if (n === null || n === undefined) return '—'
  return `US$ ${n.toLocaleString('en-US')} MM`
}

type Lang = 'es' | 'en' | 'cn' | string

const labels = (lang: Lang) => {
  if (lang.startsWith('en')) {
    return {
      country: 'Country',
      year: 'Year',
      sector: 'Sector',
      type: 'Type',
      amount: 'Amount',
      location: 'Location',
      details: 'Details',
      research: 'Case studies',
      id: 'ID',
      open: 'Open',
      investor: 'Investor'
    }
  }
  if (lang.startsWith('cn') || lang.startsWith('zh')) {
    return {
      country: '国家',
      year: '年份',
      sector: '行业',
      type: '类型',
      amount: '金额',
      location: '地点',
      details: '详情',
      research: '案例研究',
      id: 'ID',
      open: '打开',
      investor: '投资者'
    }
  }
  return {
    country: 'País',
    year: 'Año',
    sector: 'Sector',
    type: 'Tipo',
    amount: 'Monto',
    location: 'Localidad',
    details: 'Detalles',
    research: 'Estudios',
    id: 'ID',
    open: 'Abrir',
    investor: 'Inversor'
  }
}

const sectorBadge = (color: string, area: string): string =>
  `<div style="display:flex;align-items:center;gap:6px">
    <span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:${color};flex-shrink:0"></span>
    <span style="font-size:10px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.03em">${escape(area)}</span>
  </div>`

export const buildInvestmentTooltip = (inv: Investment, lang: Lang): string => {
  const isEn = lang.startsWith('en')
  const area = isEn ? inv.area_en ?? inv.area_es : inv.area_es ?? inv.area_en
  const color = sectorColor(inv.area_en)

  return `<div style="font-family:system-ui,sans-serif;min-width:140px;max-width:220px">
    ${sectorBadge(color, area ?? '')}
    <div style="font-size:12px;color:#374151;margin-top:3px">${inv.year ?? '—'} · ${formatMoney(inv.investment_musd)}</div>
  </div>`
}

export const buildInvestmentPopup = (inv: Investment, lang: Lang): string => {
  const L = labels(lang)
  const isEn = lang.startsWith('en')
  const detail = isEn ? inv.detail_en ?? inv.detail_es : inv.detail_es ?? inv.detail_en
  const area = isEn ? inv.area_en ?? inv.area_es : inv.area_es ?? inv.area_en
  const color = sectorColor(inv.area_en)

  const bookIcon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="14" height="14" style="flex-shrink:0"><path fill="currentColor" d="M19 10h7v2h-7zm0 5h7v2h-7zm0 5h7v2h-7zM6 10h7v2H6zm0 5h7v2H6zm0 5h7v2H6z"/><path fill="currentColor" d="M28 5H4a2.002 2.002 0 0 0-2 2v18a2.002 2.002 0 0 0 2 2h24a2.002 2.002 0 0 0 2-2V7a2.002 2.002 0 0 0-2-2M4 7h11v18H4Zm13 18V7h11v18Z"/></svg>`

  const cases = inv.research_cases ?? []
  const research =
    cases.length > 0
      ? `<div style="margin-top:8px;padding-top:8px;border-top:1px solid #e5e7eb">
          <div style="font-size:10px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:6px">${L.research} (${cases.length})</div>
          <div style="display:flex;flex-wrap:wrap;gap:6px">
            ${cases
              .map((rc, i) => {
                const title = escape(rc.caso)
                const inner = `<span style="display:inline-flex;align-items:center;gap:4px;padding:3px 8px;border-radius:4px;background:#f3f4f6;color:#374151;font-size:11px;font-weight:500">${bookIcon}<span>${i + 1}</span></span>`
                if (rc.link) {
                  return `<a href="${escape(rc.link)}" target="_blank" rel="noopener" title="${title}" style="text-decoration:none;color:inherit">${inner}</a>`
                }
                return `<span title="${title}" style="opacity:0.7">${inner}</span>`
              })
              .join('')}
          </div>
        </div>`
      : ''

  const locationLine = inv.location
    ? `<div style="margin-top:2px;font-size:11px;color:#6b7280">${escape(inv.location)}</div>`
    : ''

  const geom = inv.geometry_type === 'line' ? `(${inv.coordinates.length} waypoints)` : ''

  return `<div style="font-family:system-ui,sans-serif;min-width:260px;max-width:320px">
    <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">
      <span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:${color}"></span>
      <span style="font-size:10px;font-weight:600;color:#6b7280;text-transform:uppercase">${escape(area)} ${geom}</span>
    </div>
    <div style="font-size:14px;font-weight:600;color:#111827;line-height:1.3">${escape(detail) || '—'}</div>
    ${locationLine}
    <table style="margin-top:8px;font-size:11px;color:#374151;border-collapse:collapse;width:100%">
      <tbody>
        <tr><td style="padding:2px 0;color:#6b7280;width:70px">${L.investor}</td><td style="padding:2px 0;font-weight:600">${escape(inv.investor) || '—'}</td></tr>
        <tr><td style="padding:2px 0;color:#6b7280">${L.year}</td><td style="padding:2px 0">${inv.year ?? '—'}</td></tr>
        <tr><td style="padding:2px 0;color:#6b7280">${L.type}</td><td style="padding:2px 0">${escape(inv.project_type)}</td></tr>
        <tr><td style="padding:2px 0;color:#6b7280">${L.amount}</td><td style="padding:2px 0;font-weight:600">${formatMoney(inv.investment_musd)}</td></tr>
      </tbody>
    </table>
    ${research}
  </div>`
}
