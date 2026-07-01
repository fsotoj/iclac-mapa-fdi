import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { MapContainer, TileLayer, GeoJSON, ZoomControl, useMap } from 'react-leaflet'
import L from 'leaflet'
import { useTranslation } from 'react-i18next'
import type { Feature, Geometry } from 'geojson'
import type { LatLngExpression, Layer, LeafletMouseEvent, Path, PathOptions } from 'leaflet'
import type { CountryFeatureCollection, CountryProperties, Investment } from '@/types/data'
import { sectorColor } from '@/lib/sectors'
import { aggregateInvestments, applyFilters, distinctCountries, distinctSectors, yearBounds } from '@/lib/filter'
import { useFilters } from '@/hooks/useFilters'
import FilterPanel from '@/components/FilterPanel'
import SectorLegend from '@/components/SectorLegend'
import ProjectDocsCards from '@/components/ProjectDocsCards'
import { buildDonutSvg, buildLegendHtml, tallyByArea, tallyMoneyByArea, type SectorTally } from '@/lib/clusterDonut'
import type { PieMetric } from '@/lib/filter'
import { buildInvestmentPopup, buildInvestmentTooltip } from '@/lib/popup'
import { dedupeById } from '@/lib/projectDocs'

const LATAM_CENTER: LatLngExpression = [-15, -60]
const INITIAL_ZOOM = 3

const baseCountryStyle: PathOptions = {
  fillColor: '#d4d4d8',
  weight: 1,
  color: '#52525b',
  fillOpacity: 0.2
}

const hoverCountryStyle: PathOptions = {
  fillColor: '#a1a1aa',
  weight: 2,
  color: '#27272a',
  fillOpacity: 0.4
}

type LocatableLayer = L.Layer & { openPopup: () => void }
type RegistryEntry = { layer: LocatableLayer; latlng: [number, number] }

const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

// Per-axis median of investment coords — used as the country donut anchor.
// Median (not mean) resists outliers from swapped lat/lng rows in source data.
const medianCenter = (items: Investment[]): [number, number] => {
  const centers = items.map(investmentCenter)
  return [median(centers.map(c => c[0])), median(centers.map(c => c[1]))]
}

const donutSize = (total: number): number => (total >= 100 ? 56 : total >= 20 ? 48 : 40)

const musdFormatter = new Intl.NumberFormat('es-CL', { maximumFractionDigits: 0 })
const fmtMusd = (n: number): string => `US$ ${musdFormatter.format(n)} MM`

// Compact center label for money mode. investment_musd is in millions USD →
// multiply to real USD and let Intl format per locale (es "billón" ≠ en "billion",
// zh uses 亿). Avoids hardcoding an ambiguous "B".
const INTL_LOCALE: Record<string, string> = { es: 'es', en: 'en', cn: 'zh' }
const compactCache = new Map<string, Intl.NumberFormat>()
const compactUsd = (mm: number, lang: string): string => {
  const loc = INTL_LOCALE[lang] ?? 'en'
  let fmt = compactCache.get(loc)
  if (!fmt) {
    fmt = new Intl.NumberFormat(loc, { notation: 'compact', maximumFractionDigits: 1 })
    compactCache.set(loc, fmt)
  }
  return fmt.format(mm * 1e6)
}

function InvestmentMarkers({
  investments,
  pieByCountry,
  pieMetric,
  lang,
  target
}: {
  investments: Investment[]
  pieByCountry: boolean
  pieMetric: PieMetric
  lang: string
  target: LocateTarget | null
}) {
  const map = useMap()
  const registryRef = useRef<Map<string, RegistryEntry>>(new Map())

  useEffect(() => {
    if (investments.length === 0) return

    const registry = registryRef.current
    registry.clear()
    const group = L.layerGroup()

    if (pieByCountry) {
      const groups = new Map<string, Investment[]>()
      for (const inv of investments) {
        const k = inv.country ?? 'Otros'
        const arr = groups.get(k) ?? []
        arr.push(inv)
        groups.set(k, arr)
      }

      for (const [country, items] of groups) {
        // Dedup by Id_Investment: multi-location rows repeat the same investment
        // and would inflate the sector tally and the center count.
        const unique = dedupeById(items)
        // Slices/legend follow the selected metric; donut size + center label
        // stay = number of investments (stable identity across metrics).
        const tallies: SectorTally[] =
          pieMetric === 'money' ? tallyMoneyByArea(unique) : tallyByArea(unique.map(i => i.area_en))
        const total = unique.length
        const size = donutSize(total)
        // Center: investment count (count mode) or compact money total (money mode).
        const centerLabel =
          pieMetric === 'money' ? compactUsd(tallies.reduce((a, b) => a + b.count, 0), lang) : undefined
        const svg = buildDonutSvg(tallies, total, { size, innerRatio: 0, centerLabel })
        const marker = L.marker(medianCenter(unique), {
          icon: L.divIcon({
            html: `<div class="mapa-cluster-donut">${svg}</div>`,
            className: 'mapa-cluster-icon',
            iconSize: [size, size]
          })
        })
        const donutBig = buildDonutSvg(tallies, total, { size: 140, innerRatio: 0.6, showLabel: false })
        const legend = buildLegendHtml(tallies, total, pieMetric === 'money' ? fmtMusd : undefined)
        const html = `<div style="display:flex;align-items:center;gap:10px">${donutBig}<div><div style="font-weight:700;margin-bottom:4px;font-size:13px">${country}</div>${legend}</div></div>`
        marker.bindTooltip(html, {
          direction: 'top',
          opacity: 1,
          offset: [0, -size / 2 - 10],
          className: 'mapa-cluster-tooltip'
        })
        group.addLayer(marker)
      }
    } else {
      const svgRenderer = L.svg()
      for (const inv of investments) {
        const color = sectorColor(inv.area_en)
        const tooltipHtml = buildInvestmentTooltip(inv, lang)
        const popupHtml = buildInvestmentPopup(inv, lang)

        if (inv.geometry_type === 'point') {
          const [lat, lng] = inv.coordinates
          const marker = L.circleMarker([lat, lng], {
            radius: 4,
            color,
            fillColor: color,
            fillOpacity: 0.7,
            weight: 1,
            opacity: 0.9
          })
          marker.bindTooltip(tooltipHtml, { sticky: true })
          marker.bindPopup(popupHtml, { maxWidth: 340, className: 'mapa-investment-popup' })
          group.addLayer(marker)
          registry.set(inv.id, { layer: marker, latlng: [lat, lng] })
        } else {
          const polyline = L.polyline(inv.coordinates, {
            color,
            weight: 3,
            opacity: 0.9,
            dashArray: '5, 5',
            renderer: svgRenderer
          })
          polyline.bindTooltip(tooltipHtml, { sticky: true })
          polyline.bindPopup(popupHtml, { maxWidth: 340, className: 'mapa-investment-popup' })
          group.addLayer(polyline)
          registry.set(inv.id, { layer: polyline, latlng: investmentCenter(inv) })
        }
      }
    }

    group.addTo(map)
    return () => {
      map.removeLayer(group)
      registry.clear()
    }
  }, [investments, map, pieByCountry, pieMetric, lang])

  // Locate: pan/zoom to the target investment and open its popup.
  useEffect(() => {
    if (!target) return
    const entry = registryRef.current.get(target.id)
    if (!entry) return
    map.flyTo(entry.latlng, Math.max(map.getZoom(), LOCATE_ZOOM))
    map.once('moveend', () => entry.layer.openPopup())
  }, [target, map])

  return null
}

type LocateTarget = { id: string; token: number }

const LOCATE_ZOOM = 9

function InvalidateSize({ trigger }: { trigger: unknown }) {
  const map = useMap()
  useEffect(() => {
    const id = requestAnimationFrame(() => map.invalidateSize())
    return () => cancelAnimationFrame(id)
  }, [trigger, map])
  return null
}

const investmentCenter = (inv: Investment): [number, number] =>
  inv.geometry_type === 'point' ? inv.coordinates : inv.coordinates[Math.floor(inv.coordinates.length / 2)]

export default function MapView() {
  const { t, i18n } = useTranslation()
  const [geo, setGeo] = useState<CountryFeatureCollection | null>(null)
  const [investments, setInvestments] = useState<Investment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [target, setTarget] = useState<LocateTarget | null>(null)
  const { filters, setFilters } = useFilters()

  const handleLocate = useCallback((inv: Investment) => {
    setTarget({ id: inv.id, token: Date.now() })
  }, [])

  useEffect(() => {
    Promise.all([
      fetch('/data/south-america.geojson').then(r => r.json()),
      fetch('/data/investments.json').then(r => {
        if (!r.ok) throw new Error(`investments.json fetch failed: ${r.status}`)
        return r.json()
      })
    ])
      .then(([g, inv]: [CountryFeatureCollection, Investment[]]) => {
        setGeo(g)
        setInvestments(inv)
        setLoading(false)
      })
      .catch(err => {
        console.error(err)
        setError(String(err))
        setLoading(false)
      })
  }, [])

  const countries = useMemo(() => distinctCountries(investments), [investments])
  const sectors = useMemo(() => distinctSectors(investments), [investments])
  const [yearMin, yearMax] = useMemo(() => yearBounds(investments), [investments])
  // Key only on fields applyFilters reads. view/pie* live in the same filters
  // object but don't change the result set; without this, every cards toggle
  // produces a new `filtered` ref and rebuilds every map marker (visible lag).
  const countriesKey = filters.countries.join(',')
  const typesKey = filters.types.join(',')
  const sectorsKey = filters.sectors.join(',')
  const filtered = useMemo(
    () => applyFilters(investments, filters),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      investments,
      countriesKey,
      filters.yearMin,
      filters.yearMax,
      typesKey,
      filters.includeConstruction,
      filters.research,
      sectorsKey,
      filters.query
    ]
  )

  const filteredGeo = useMemo<CountryFeatureCollection | null>(() => {
    if (!geo) return null
    if (filters.countries.length === 0) return geo
    return {
      ...geo,
      features: geo.features.filter(f => {
        const name = f.properties?.name ?? f.properties?.NAME
        return name ? filters.countries.includes(name) : false
      })
    }
  }, [geo, filters.countries])

  const onEachFeature = (feature: Feature<Geometry, CountryProperties>, layer: Layer) => {
    layer.on({
      mouseover: (e: LeafletMouseEvent) => (e.target as Path).setStyle(hoverCountryStyle),
      mouseout: (e: LeafletMouseEvent) => (e.target as Path).setStyle(baseCountryStyle),
      click: () => {
        const name = feature.properties?.name ?? feature.properties?.NAME ?? 'unknown'
        console.log('clicked country:', name)
      }
    })
  }

  const agg = useMemo(() => aggregateInvestments(filtered), [filtered])
  const totalValue = useMemo(
    () => new Intl.NumberFormat('es-CL', { maximumFractionDigits: 0 }).format(agg.totalMusd),
    [agg.totalMusd]
  )
  const showCards = filters.view === 'cards'

  const mapEl = (
    <>
      <MapContainer
        center={LATAM_CENTER}
        zoom={INITIAL_ZOOM}
        scrollWheelZoom
        preferCanvas
        zoomControl={false}
        className="h-full w-full"
      >
        <ZoomControl position="bottomleft" />
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
        />
        {filteredGeo && (
          <GeoJSON
            key={filters.countries.join(',') || 'all'}
            data={filteredGeo}
            style={baseCountryStyle}
            onEachFeature={onEachFeature}
          />
        )}
        {filtered.length > 0 && (
          <InvestmentMarkers
            investments={filtered}
            pieByCountry={filters.pieByCountry}
            pieMetric={filters.pieMetric}
            lang={i18n.language}
            target={target}
          />
        )}
        <InvalidateSize trigger={showCards} />
      </MapContainer>
      <SectorLegend sectors={sectors} />
    </>
  )

  return (
    <div className="flex h-full w-full">
      {!loading && !error && (
        <FilterPanel countries={countries} yearMin={yearMin} yearMax={yearMax} />
      )}
      <div className="relative flex flex-1 flex-col overflow-hidden">
        {loading && <div className="p-4 text-sm">{t('common.loading')}</div>}
        {error && <div className="p-4 text-sm text-red-700">{error}</div>}

        {!loading && !error && (
          <div className="flex h-full flex-1">
            <div className="relative flex-1">
              {mapEl}
              <div className="absolute left-4 top-4 z-[800] rounded-lg border border-white/50 bg-white/95 px-3 py-1.5 text-sm shadow-md backdrop-blur-md">
                <span className="font-medium">{t('filter.investments_count', { count: agg.count })}</span>
                <span className="mx-2">·</span>
                <span className="font-medium">{t('filter.total_value', { value: totalValue })}</span>
                {agg.withoutAmount > 0 && (
                  <span className="ml-2 text-gray-500">
                    ({t('filter.without_amount', { count: agg.withoutAmount })})
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={() => setFilters({ view: showCards ? 'map' : 'cards' })}
                aria-pressed={showCards}
                title={t('view.cards')}
                className={`absolute right-4 top-4 z-[800] flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-sm shadow-md transition ${
                  showCards
                    ? 'border-gray-900 bg-gray-900 text-white'
                    : 'border-white/50 bg-white/95 text-gray-700 backdrop-blur-md hover:bg-white'
                }`}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} className="h-4 w-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 5.25h16.5M3.75 9.75h16.5M3.75 14.25h16.5M3.75 18.75h16.5" />
                </svg>
                {t('view.cards')}
              </button>
            </div>
            {showCards && (
              <aside className="w-80 shrink-0 overflow-y-auto border-l border-gray-200 bg-gray-50">
                <ProjectDocsCards investments={filtered} lang={i18n.language} onLocate={handleLocate} />
              </aside>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
