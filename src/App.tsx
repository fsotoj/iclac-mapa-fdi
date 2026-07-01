import { lazy, Suspense } from 'react'
import { Routes, Route } from 'react-router-dom'
import Layout from '@/components/Layout'
import MapView from '@/views/MapView'
import MethodologyView from '@/views/MethodologyView'
import DownloadsView from '@/views/DownloadsView'
import ContactView from '@/views/ContactView'

// Lazy: SankeyView pulls in echarts — keep it out of the initial (map) bundle.
const SankeyView = lazy(() => import('@/views/SankeyView'))

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<MapView />} />
        <Route
          path="sankey"
          element={
            <Suspense fallback={<div className="p-8 text-sm text-gray-600">…</div>}>
              <SankeyView />
            </Suspense>
          }
        />
        <Route path="methodology" element={<MethodologyView />} />
        <Route path="downloads" element={<DownloadsView />} />
        <Route path="contact" element={<ContactView />} />
      </Route>
    </Routes>
  )
}
