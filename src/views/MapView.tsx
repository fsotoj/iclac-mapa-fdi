import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { MapContainer, TileLayer, GeoJSON, ZoomControl, useMap } from 'react-leaflet'
import L from 'leaflet'
import { useTranslation } from 'react-i18next'
import type { Feature, Geometry } from 'geojson'
import type { Layer, LeafletMouseEvent, Path, PathOptions } from 'leaflet'
import type { CountryFeatureCollection, CountryProperties, Investment, ResearchCase } from '@/types/data'
import { sectorColor } from '@/lib/sectors'
import { aggregateInvestments, applyFilters, distinctCountries, distinctSectors, yearBounds } from '@/lib/filter'
import { distinctCompanies, type InvestorMap } from '@/lib/sankey'
import { useFilters } from '@/hooks/useFilters'
import { useIsMobile } from '@/hooks/useMediaQuery'
import FilterPanel from '@/components/FilterPanel'
import SectorLegend from '@/components/SectorLegend'
import ProjectDocsCards from '@/components/ProjectDocsCards'
import ProjectDocsTable from '@/components/ProjectDocsTable'
import MiniSegmented from '@/components/MiniSegmented'
import ToolInfo from '@/components/ToolInfo'
import { MapIcon } from '@/components/icons'
import { buildDonutSvg, buildLegendHtml, tallyByArea, tallyMoneyByArea, type SectorTally } from '@/lib/clusterDonut'
import type { PieMetric } from '@/lib/filter'
import { buildInvestmentPopup, buildInvestmentTooltip } from '@/lib/popup'
import { dedupeById } from '@/lib/projectDocs'


// The paneable region is DERIVED from the geometry actually loaded (see regionOf),
// not hardcoded: the country scope is data (data/schema/countries.csv → build_borders.mjs
// → south-america.geojson), so adding Central America or the Caribbean must widen the
// frame on its own. Hardcoding lat 15 as the north edge would leave a newly added
// Guatemala (17.8) or Cuba (23.2) drawn but unreachable.
//
// The clamp is the one hand-set part, and it exists for remote islands: the Chile
// polygon reaches lng -109.4 (Isla de Pascua), which would stretch the minimum frame
// ~27° west and shrink the continent for a place with zero investments in the base
// (westernmost point: -82.6). Excluded on purpose — still drawn, just not paneable to.
// Everything else is a generous outer limit, not a boundary anyone should hit.
const REGION_CLAMP = L.latLngBounds([-60, -95], [33, -28])

// Used until the geojson lands (it is fetched, so the first render has no geometry).
const REGION_FALLBACK = L.latLngBounds([-57, -95], [15, -32])

// Geometry bounds ∩ clamp, padded so nothing sits glued to the edge.
const regionOf = (geo: CountryFeatureCollection | null): L.LatLngBounds => {
  if (!geo?.features.length) return REGION_FALLBACK
  const b = L.geoJSON(geo).getBounds()
  if (!b.isValid()) return REGION_FALLBACK
  return L.latLngBounds(
    [Math.max(b.getSouth(), REGION_CLAMP.getSouth()), Math.max(b.getWest(), REGION_CLAMP.getWest())],
    [Math.min(b.getNorth(), REGION_CLAMP.getNorth()), Math.min(b.getEast(), REGION_CLAMP.getEast())]
  )
}

// z8 ≈ a province / state in frame. Deliberately short of city-block detail: the
// coordinates in the base are of uneven precision, so letting people zoom to street
// level shows a exactitude the data does not have and reads as confusing.
const MAX_ZOOM = 8

// The totals box floats over the map's top-left corner and was covering Panama, the
// northern edge of the frame. Its height is MEASURED, not assumed: it wraps to two
// lines on narrow screens, and a hardcoded guess left Panama half under it on the
// 1536x730 notebook viewport. Fallback only for the first paint.
const FRAME_PADDING_TOP = 96
const FRAME_PADDING_BOTTOM = 16 // clears the Leaflet attribution strip

// Region framed in the space the floating chrome leaves free, worked out in projected
// pixels so the offset is exact — degrees do not map linearly to pixels in Mercator,
// and an approximation left the geometry 1px clear at 1536x730 and still covered at
// 1536x700.
//
// Why not fitBounds({paddingTopLeft}): once the viewport is taller in degrees than
// maxBounds — which happens on short screens, exactly where the problem showed up —
// Leaflet centers the view inside maxBounds and the padding is silently dropped
// (measured at 1536x730: geometry landed dead center, at y=75, with a 101px inset
// requested). Shifting the center itself survives that.
const framedView = (map: L.Map, bounds: L.LatLngBounds, top: number, bottom: number) => {
  const zoom = map.getBoundsZoom(bounds, false, L.point(0, top + bottom))
  const nw = map.project(bounds.getNorthWest(), zoom)
  const se = map.project(bounds.getSouthEast(), zoom)
  return {
    zoom,
    // Center pushed north by half the inset difference: that is what leaves the region
    // centered in the free area rather than in the whole map box.
    center: map.unproject(L.point((nw.x + se.x) / 2, (nw.y + se.y) / 2 - (top - bottom) / 2), zoom),
    // Same offset baked into the pan limits — maxBounds is what Leaflet falls back to
    // centering on, so an un-offset one would undo the frame.
    limit: L.latLngBounds(
      map.unproject(L.point(nw.x, nw.y - top), zoom),
      map.unproject(L.point(se.x, se.y + bottom), zoom)
    )
  }
}

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

// Capped by MAX_ZOOM anyway; kept equal so "locate" lands on the closest view the
// map allows instead of silently stopping short of its own promise.
const LOCATE_ZOOM = MAX_ZOOM

// Zoom floor + pan limits, both driven by the region bounds.
//
// The floor is computed, not hardcoded: the limit that matters is "the whole region
// fits", and which zoom level that is depends on the viewport — a fixed minZoom 3
// crops the region on short screens with no way to zoom back out. Recomputed on
// Leaflet's own resize event, which also covers invalidateSize() when the list panel
// opens and changes the map's width.
//
// Bounds arrive late (geojson fetch) and can widen later if the country scope grows,
// so limits are reapplied on every change.
//
// The frame is refitted on resize UNTIL the first user gesture. A one-shot fit is not
// enough: the map is fitted before the layout settles (list panel mounting, fonts,
// invalidateSize), and Leaflet keeps the center across a resize, so the reserved top
// space silently shrinks — that is what left Panama under the totals box at 1536x730
// even with padding. After the user drags or zooms, the view is theirs: no more refits.
function RegionLimits({ bounds, topInset }: { bounds: L.LatLngBounds; topInset: () => number }) {
  const map = useMap()
  const touched = useRef(false)
  useEffect(() => {
    const container = map.getContainer()
    const markTouched = () => {
      touched.current = true
    }
    // DOM-level, not Leaflet events: our own fitBounds fires zoomstart/movestart too.
    container.addEventListener('pointerdown', markTouched)
    container.addEventListener('wheel', markTouched, { passive: true })

    const apply = () => {
      const { zoom, center, limit } = framedView(map, bounds, topInset(), FRAME_PADDING_BOTTOM)
      map.setMaxBounds(limit.pad(0.15))
      map.setMinZoom(zoom)
      if (touched.current) return
      map.setView(center, zoom, { animate: false })
    }
    apply()
    map.on('resize', apply)
    return () => {
      map.off('resize', apply)
      container.removeEventListener('pointerdown', markTouched)
      container.removeEventListener('wheel', markTouched)
    }
  }, [map, bounds, topInset])
  return null
}

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
  const [investorMap, setInvestorMap] = useState<InvestorMap>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [target, setTarget] = useState<LocateTarget | null>(null)
  const { filters, setFilters } = useFilters()

  const handleLocate = useCallback((inv: Investment) => {
    setTarget({ id: inv.id, token: Date.now() })
  }, [])

  // Card action: isolate one investment (URL `id`). Toggle off if already focused;
  // on isolate also fly to it. applyFilters short-circuits on focusId.
  const handleIsolate = useCallback(
    (inv: Investment) => {
      if (filters.focusId === inv.id) {
        setFilters({ focusId: null })
      } else {
        setFilters({ focusId: inv.id })
        setTarget({ id: inv.id, token: Date.now() })
      }
    },
    [filters.focusId, setFilters]
  )

  useEffect(() => {
    Promise.all([
      fetch('/data/south-america.geojson').then(r => r.json()),
      fetch('/data/investments.json').then(r => {
        if (!r.ok) throw new Error(`investments.json fetch failed: ${r.status}`)
        return r.json()
      }),
      // research_cases lives in its own (tiny) file; join it back by id. Popups,
      // cards, table and search read inv.research_cases from the hydrated rows.
      fetch('/data/research.json').then(r => (r.ok ? r.json() : {})),
      // Canonical investor map: optional, unmapped names just fall back to raw.
      fetch('/data/investors_map.json').then(r => (r.ok ? r.json() : {}))
    ])
      .then(([g, inv, research, m]: [CountryFeatureCollection, Investment[], Record<string, ResearchCase[]>, InvestorMap]) => {
        for (const row of inv) row.research_cases = research[row.id] ?? []
        setGeo(g)
        setInvestments(inv)
        setInvestorMap(m)
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
  const investorsKey = filters.investors.join(',')
  const ownershipKey = filters.ownership.join(',')
  const filtered = useMemo(
    () => applyFilters(investments, filters, investorMap),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      investments,
      investorMap,
      countriesKey,
      filters.yearMin,
      filters.yearMax,
      typesKey,
      filters.construction,
      filters.research,
      sectorsKey,
      filters.query,
      investorsKey,
      ownershipKey,
      filters.focusId
    ]
  )
  // Company options: faceted — every filter except the investor facet itself
  // (and the isolation lens) narrows the list, so rows/values react to
  // country/year/sector/ownership. Selected companies never drop out.
  const allCompanies = useMemo(() => distinctCompanies(investments, investorMap), [investments, investorMap])
  const optionsScope = useMemo(
    () => applyFilters(investments, { ...filters, investors: [], focusId: null }, investorMap),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      investments,
      investorMap,
      countriesKey,
      filters.yearMin,
      filters.yearMax,
      typesKey,
      filters.construction,
      filters.research,
      sectorsKey,
      filters.query,
      ownershipKey
    ]
  )
  const companies = useMemo(() => {
    const scopedCompanies = distinctCompanies(optionsScope, investorMap)
    const present = new Set(scopedCompanies.map(c => c.id))
    const kept = allCompanies.filter(c => filters.investors.includes(c.id) && !present.has(c.id))
    return kept.length ? [...scopedCompanies, ...kept].sort((a, b) => a.name.localeCompare(b.name)) : scopedCompanies
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [optionsScope, investorMap, allCompanies, investorsKey])

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

  // From the full geometry, never the country-filtered one: the paneable region is
  // the universe the map can draw, and it must not shrink every time someone filters
  // down to one country.
  const region = useMemo(() => regionOf(geo), [geo])

  const agg = useMemo(() => aggregateInvestments(filtered), [filtered])
  const totalValue = useMemo(
    () => new Intl.NumberFormat('es-CL', { maximumFractionDigits: 0 }).format(agg.totalMusd),
    [agg.totalMusd]
  )
  // 'table'/'cards' = list open (default 'table', Margareth UAT). On phones the
  // panel is a full overlay, so it stays closed on load until the user opens it.
  const isMobile = useIsMobile()
  const [mobileListOpened, setMobileListOpened] = useState(false)
  const showList = filters.view !== 'map' && (!isMobile || mobileListOpened)
  const openList = () => {
    setMobileListOpened(true)
    if (filters.view === 'map') setFilters({ view: 'table' })
  }
  const closeList = () => {
    setMobileListOpened(false)
    setFilters({ view: 'map' })
  }

  // Height the floating totals box takes off the top of the map, read from the DOM:
  // it wraps to two lines on narrow screens, so assuming a number leaves the northern
  // edge of the region (Panama) under it. Stable identity — RegionLimits calls it on
  // every fit rather than closing over a value.
  const totalsRef = useRef<HTMLDivElement>(null)
  const topInset = useCallback(() => {
    const el = totalsRef.current
    return el ? el.offsetTop + el.offsetHeight + 12 : FRAME_PADDING_TOP
  }, [])

  const mapEl = (
    <>
      <MapContainer
        // Framed by bounds, not by a fixed center+zoom: with the floor computed from
        // the same region, "fully zoomed out" and "initial view" become the same
        // frame on every screen. A fixed zoom 3 left half the viewport on open ocean
        // (measured: lng -180..+45) on wide screens. RegionLimits refits once the
        // real geometry arrives; maxBounds is set there too, since it moves with it.
        bounds={REGION_FALLBACK}
        maxZoom={MAX_ZOOM}
        // Viscosity 0.7 rubber-bands the drag back instead of stopping it dead
        // against an invisible wall.
        maxBoundsViscosity={0.7}
        scrollWheelZoom
        preferCanvas
        zoomControl={false}
        className="h-full w-full"
      >
        <RegionLimits bounds={region} topInset={topInset} />
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
        <InvalidateSize trigger={showList} />
      </MapContainer>
      <SectorLegend sectors={sectors} />
    </>
  )

  return (
    <div className="relative flex h-full w-full">
      {!loading && !error && (
        <FilterPanel countries={countries} yearMin={yearMin} yearMax={yearMax} companies={companies} />
      )}
      <div className="relative flex flex-1 flex-col overflow-hidden">
        {loading && <div className="p-4 text-sm">{t('common.loading')}</div>}
        {error && <div className="p-4 text-sm text-red-700">{error}</div>}

        {!loading && !error && (
          <div className="relative flex h-full flex-1">
            {/* isolate traps Leaflet's control z-indexes (z~1000) inside the map
                box so the fichas overlay (sibling) can sit above them on mobile. */}
            <div className="relative isolate flex-1">
              {mapEl}
              {/* Totals + display control as ONE cluster: the toggle switches how
                  the map draws the very figures shown above it (count vs amount).
                  Display is not a filter — it never changes which investments are
                  shown — so it lives here, on the map, not in the filter panel. */}
              <div
                ref={totalsRef}
                className="absolute left-2 top-2 z-[800] max-w-[calc(100%-7.5rem)] rounded-lg border border-white/50 bg-white/95 text-xs shadow-md backdrop-blur-md sm:left-4 sm:top-4 sm:max-w-[calc(100%-9rem)] sm:text-sm"
              >
                <div className="px-2.5 py-1.5 sm:px-3">
                  <span className="font-medium">{t('filter.investments_count', { count: agg.count })}</span>
                  <span className="mx-2">·</span>
                  <span className="font-medium">{t('filter.total_value', { value: totalValue })}</span>
                  {agg.withoutAmount > 0 && (
                    <span className="ml-2 text-gray-500">
                      ({t('filter.without_amount', { count: agg.withoutAmount })})
                    </span>
                  )}
                  {/* Qué es este mapa y qué significan punto / vector / libro. Vive acá,
                      sobre el mapa que describe; el ícono del header es la presentación
                      del repositorio, no la ayuda de la vista. */}
                  <span className="ml-2 inline-flex align-middle">
                    <ToolInfo
                      icon={MapIcon}
                      title={t('about.map.title')}
                      text={t('about.map.body')}
                      note={t('common.citation_text')}
                    />
                  </span>
                  {filters.focusId !== null && (
                    <button
                      type="button"
                      onClick={() => setFilters({ focusId: null })}
                      title={t('filter.isolated_exit')}
                      className="ml-2 inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-gray-900 px-2 py-0.5 text-[11px] font-medium text-white hover:bg-brand-dark"
                    >
                      {t('filter.isolated')}
                      <span aria-hidden>×</span>
                    </button>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-1.5 border-t border-gray-200 px-2.5 py-1.5 sm:px-3">
                  <MiniSegmented
                    items={[
                      { value: 'points', label: t('filter.points') },
                      { value: 'aggregate', label: t('filter.aggregate') }
                    ]}
                    value={filters.pieByCountry ? 'aggregate' : 'points'}
                    onPick={v => setFilters({ pieByCountry: v === 'aggregate' })}
                  />
                  {/* Second level only in the aggregate state — no reserved space,
                      so the cluster stays one row while showing points. The chevron
                      marks it as a drill-down of "aggregate", not a peer control. */}
                  {filters.pieByCountry && (
                    <>
                      <span aria-hidden className="select-none px-0.5 text-gray-400">›</span>
                      <MiniSegmented
                        items={[
                          { value: 'count', label: t('filter.by_project') },
                          { value: 'money', label: t('filter.by_money') }
                        ]}
                        value={filters.pieMetric}
                        onPick={v => setFilters({ pieMetric: v })}
                      />
                    </>
                  )}
                </div>
              </div>
              {/* Opener only — while the list is open its own header title carries
                  the label + close, so the floating button would just duplicate it. */}
              {!showList && (
                <button
                  type="button"
                  onClick={openList}
                  title={t('view.cards')}
                  className="absolute right-2 top-2 z-[800] flex items-center gap-1.5 rounded-lg border border-white/50 bg-white/95 px-2.5 py-1.5 text-sm text-gray-700 shadow-md backdrop-blur-md transition hover:bg-brand hover:text-gray-900 sm:right-4 sm:top-4"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} className="h-4 w-4">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 5.25h16.5M3.75 9.75h16.5M3.75 14.25h16.5M3.75 18.75h16.5" />
                  </svg>
                  {t('view.cards')}
                </button>
              )}
            </div>
            {showList && (
              <aside
                className={`absolute inset-0 z-[840] w-full shrink-0 overflow-y-auto border-l border-gray-200 bg-gray-50 md:static md:z-auto ${
                  filters.view === 'table' ? 'md:w-[32rem]' : 'md:w-96'
                }`}
              >
                <div className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-gray-200 bg-gray-50 px-3 py-2">
                  <span className="text-sm font-semibold text-gray-800">{t('view.cards')}</span>
                  <div className="flex items-center gap-2">
                    {/* Fichas / Tabla format toggle (Margareth UAT: table-like view). */}
                    <div className="flex overflow-hidden rounded border border-gray-300 text-xs">
                      {(['cards', 'table'] as const).map((v, i) => (
                        <button
                          key={v}
                          type="button"
                          onClick={() => setFilters({ view: v })}
                          aria-pressed={filters.view === v}
                          className={`px-2 py-1 ${i > 0 ? 'border-l border-gray-300' : ''} ${
                            filters.view === v
                              ? 'bg-gray-900 text-white hover:bg-brand-dark'
                              : 'bg-white text-gray-700 hover:bg-brand hover:text-gray-900'
                          }`}
                        >
                          {t(v === 'cards' ? 'view.as_cards' : 'view.as_table')}
                        </button>
                      ))}
                    </div>
                    <button
                      type="button"
                      onClick={closeList}
                      aria-label={t('common.close')}
                      className="flex h-8 w-8 items-center justify-center rounded text-gray-600 hover:bg-brand hover:text-gray-900"
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-5 w-5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 6l12 12M18 6L6 18" />
                      </svg>
                    </button>
                  </div>
                </div>
                {filters.view === 'table' ? (
                  <ProjectDocsTable investments={filtered} lang={i18n.language} onLocate={handleLocate} />
                ) : (
                  <ProjectDocsCards
                    investments={filtered}
                    lang={i18n.language}
                    onLocate={handleLocate}
                    onIsolate={handleIsolate}
                    focusedId={filters.focusId}
                  />
                )}
              </aside>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
