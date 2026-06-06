import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { MapContainer, TileLayer, GeoJSON, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet.markercluster'
import { useTranslation } from 'react-i18next'
import type { Feature, Geometry } from 'geojson'
import type { LatLngExpression, Layer, LeafletMouseEvent, Path, PathOptions } from 'leaflet'
import type { CountryFeatureCollection, CountryProperties, Investment } from '@/types/data'
import { sectorColor } from '@/lib/sectors'
import { applyFilters, distinctCountries, distinctSectors, yearBounds } from '@/lib/filter'
import { useFilters } from '@/hooks/useFilters'
import FilterPanel from '@/components/FilterPanel'
import SectorLegend from '@/components/SectorLegend'
import ProjectDocsCards from '@/components/ProjectDocsCards'
import { buildDonutSvg, buildLegendHtml, tallyByArea, type SectorTally } from '@/lib/clusterDonut'
import { buildInvestmentPopup, buildInvestmentTooltip } from '@/lib/popup'

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

type MarkerWithArea = L.CircleMarker & { _area?: string | null }

const clusterIconCreate = (cluster: L.MarkerCluster): L.DivIcon => {
  const children = cluster.getAllChildMarkers() as unknown as MarkerWithArea[]
  const tallies = tallyByArea(children.map(m => m._area))
  const total = cluster.getChildCount()
  const size = total >= 100 ? 56 : total >= 20 ? 48 : 40
  const svg = buildDonutSvg(tallies, total, { size, innerRatio: 0.55 })
  return L.divIcon({
    html: `<div class="mapa-cluster-donut">${svg}</div>`,
    className: 'mapa-cluster-icon',
    iconSize: [size, size]
  })
}

type LocatableLayer = L.Layer & { openPopup: () => void }
type RegistryEntry = { layer: LocatableLayer; latlng: [number, number]; isPoint: boolean }

function InvestmentMarkers({
  investments,
  cluster,
  lang,
  target
}: {
  investments: Investment[]
  cluster: boolean
  lang: string
  target: LocateTarget | null
}) {
  const map = useMap()
  const registryRef = useRef<Map<string, RegistryEntry>>(new Map())
  const clusterRef = useRef<L.MarkerClusterGroup | null>(null)

  useEffect(() => {
    if (investments.length === 0) return

    const registry = registryRef.current
    registry.clear()
    const lineLayer = L.layerGroup()
    const clusterGroup = cluster
      ? L.markerClusterGroup({
          chunkedLoading: true,
          maxClusterRadius: 60,
          disableClusteringAtZoom: 9,
          showCoverageOnHover: true,
          polygonOptions: {
            fillColor: '#fbbf24',
            color: '#f59e0b',
            weight: 2,
            opacity: 0.8,
            fillOpacity: 0.15,
            dashArray: '4, 4'
          },
          iconCreateFunction: clusterIconCreate
        })
      : null
    const pointLayer: L.LayerGroup = clusterGroup ?? L.layerGroup()
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
        }) as MarkerWithArea
        marker._area = inv.area_en
        marker.bindTooltip(tooltipHtml, { sticky: true })
        marker.bindPopup(popupHtml, { maxWidth: 340, className: 'mapa-investment-popup' })
        pointLayer.addLayer(marker)
        registry.set(inv.id, { layer: marker, latlng: [lat, lng], isPoint: true })
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
        polyline.addTo(lineLayer)
        registry.set(inv.id, { layer: polyline, latlng: investmentCenter(inv), isPoint: false })
      }
    }
    clusterRef.current = clusterGroup

    if (clusterGroup) {
      clusterGroup.on('clustermouseover', (e: L.LeafletEvent) => {
        const c = (e as unknown as { layer: L.MarkerCluster }).layer
        const children = c.getAllChildMarkers() as unknown as MarkerWithArea[]
        const tallies: SectorTally[] = tallyByArea(children.map(m => m._area))
        const total = c.getChildCount()
        const donut = buildDonutSvg(tallies, total, { size: 140, innerRatio: 0.6, showLabel: false })
        const legend = buildLegendHtml(tallies, total)
        const html = `<div style="display:flex;align-items:center;gap:10px">${donut}<div>${legend}</div></div>`
        const iconEl = (c as unknown as { _icon?: HTMLElement })._icon
        if (iconEl) iconEl.classList.add('mapa-cluster-hovered')
        const tooltipOffset: [number, number] = [0, -(c.getChildCount() >= 100 ? 56 : c.getChildCount() >= 20 ? 48 : 40) / 2 - 10]
        c.bindTooltip(html, {
          sticky: false,
          direction: 'top',
          opacity: 1,
          offset: tooltipOffset,
          className: 'mapa-cluster-tooltip'
        }).openTooltip()
      })
      clusterGroup.on('clustermouseout', (e: L.LeafletEvent) => {
        const c = (e as unknown as { layer: L.MarkerCluster }).layer
        const iconEl = (c as unknown as { _icon?: HTMLElement })._icon
        if (iconEl) iconEl.classList.remove('mapa-cluster-hovered')
        c.closeTooltip()
        c.unbindTooltip()
      })
    }

    pointLayer.addTo(map)
    lineLayer.addTo(map)
    return () => {
      map.removeLayer(pointLayer)
      map.removeLayer(lineLayer)
      registry.clear()
      clusterRef.current = null
    }
  }, [investments, map, cluster, lang])

  // Locate: pan/zoom to the target investment and open its popup.
  useEffect(() => {
    if (!target) return
    const entry = registryRef.current.get(target.id)
    if (!entry) return
    const open = () => entry.layer.openPopup()
    if (entry.isPoint && clusterRef.current) {
      clusterRef.current.zoomToShowLayer(entry.layer as unknown as L.Marker, open)
    } else {
      map.flyTo(entry.latlng, Math.max(map.getZoom(), LOCATE_ZOOM))
      map.once('moveend', open)
    }
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
  const [cluster, setCluster] = useState(true)
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
  const filtered = useMemo(() => applyFilters(investments, filters), [investments, filters])

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

  const pointsCount = filtered.filter(i => i.geometry_type === 'point').length
  const linesCount = filtered.filter(i => i.geometry_type === 'line').length
  const showCards = filters.view === 'cards'

  const mapEl = (
    <>
      <MapContainer
        center={LATAM_CENTER}
        zoom={INITIAL_ZOOM}
        scrollWheelZoom
        preferCanvas
        className="h-full w-full"
      >
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
          <InvestmentMarkers investments={filtered} cluster={cluster} lang={i18n.language} target={target} />
        )}
        <InvalidateSize trigger={showCards} />
      </MapContainer>
      <SectorLegend sectors={sectors} />
    </>
  )

  return (
    <div className="flex h-[calc(100vh-7rem)] w-full">
      {!loading && !error && (
        <FilterPanel countries={countries} yearMin={yearMin} yearMax={yearMax} />
      )}
      <div className="relative flex flex-1 flex-col overflow-hidden">
        {!loading && !error && (
          <div className="flex shrink-0 items-center justify-between gap-3 border-b border-gray-200 bg-white px-3 py-2 text-sm">
            <div>
              {t('filter.investments_count', { count: filtered.length })}
              <span className="text-gray-500 ml-2">
                ({t('filter.points_lines', { points: pointsCount, lines: linesCount })})
              </span>
            </div>
            <div className="flex items-center gap-3">
              <label className="flex cursor-pointer items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={showCards}
                  onChange={e => setFilters({ view: e.target.checked ? 'cards' : 'map' })}
                />
                {t('view.cards')}
              </label>
              <label className="flex cursor-pointer items-center gap-1.5">
                <input type="checkbox" checked={cluster} onChange={e => setCluster(e.target.checked)} />
                {t('filter.cluster')}
              </label>
            </div>
          </div>
        )}

        {loading && <div className="p-4 text-sm">{t('common.loading')}</div>}
        {error && <div className="p-4 text-sm text-red-700">{error}</div>}

        {!loading && !error && (
          <div className="flex h-full flex-1">
            <div className="relative flex-1">{mapEl}</div>
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
