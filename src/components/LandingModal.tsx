import { useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import i18n from '@/i18n'
import type { LocaleCode } from '@/types/data'
import InfoModal from './InfoModal'

// The three columns are shown at once, as in the legacy landing: the repository is a
// trilingual product and the presentation states that before anyone touches the switch.
// The legacy filled each header with a colour block, two of them oranges that appear
// nowhere else in this app. A rule over a #093b4d title reuses the heading treatment of
// Metodología/Datos, and leaves the map behind the columns visible.
const COLUMNS: { code: LocaleCode; rule: string }[] = [
  { code: 'es', rule: '#093b4d' },
  { code: 'cn', rule: '#377F83' },
  { code: 'en', rule: '#00A89C' }
]

// Once per visit, not once per browser: the text is a presentation of the repository, and
// a returning reader in the same session already saw it. Reopening it is the header's
// "Acerca de" button, which owns the state — hence this is exported.
const SEEN_KEY = 'iclac.landing.seen'

// Memoised per page load, outside React: StrictMode double-invokes state initialisers in
// dev, so an un-memoised read+write would burn the flag on the first pass and answer
// "already seen" on the second — the modal would never open.
let firstVisit: boolean | null = null
export const consumeFirstVisit = () => {
  if (firstVisit === null) {
    try {
      firstVisit = !sessionStorage.getItem(SEEN_KEY)
      if (firstVisit) sessionStorage.setItem(SEEN_KEY, '1')
    } catch {
      firstVisit = false // storage blocked (private mode): never auto-open
    }
  }
  return firstVisit
}

export default function LandingModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { pathname } = useLocation()

  // The button names the map, so it goes there when the reader landed somewhere else
  // (Metodología, Datos). On the map or Tendencias it is just a dismiss.
  const enter = () => {
    onClose()
    if (pathname !== '/' && pathname !== '/sankey') navigate('/')
  }

  return (
    <InfoModal
      open={open}
      onClose={onClose}
      label={t('landing.title')}
      /* El trazo va ampliado y centrado: encajarlo entero lo dejaba chico y pegado a la
         izquierda, con Sudamérica fuera del eje del panel. Alto fijo en px (no bg-contain)
         para que el encuadre no dependa de cuánto crece el panel con el texto. Es la marca
         de la presentación del Repositorio: los paneles de herramienta van sin fondo. */
      panelClass="max-w-5xl bg-white bg-[url('/icons/America.png')] bg-[length:auto_760px] bg-[position:50%_-70px] bg-no-repeat md:bg-[length:auto_1000px] md:bg-[position:50%_-190px]"
    >
      <>
        {/* pt-12: la × flota sobre la esquina y pisaba el filete de la tercera columna.
            Dos filas + `md:contents` en cada columna: así los tres títulos comparten una
            sola fila y miden lo mismo aunque uno ocupe una línea y otro dos, y los cuerpos
            arrancan parejos. `grid-flow-col` es obligatorio: al aplanar las columnas el
            orden del DOM queda h2,p,h2,p,h2,p, y el llenado por filas metería el primer
            cuerpo en la fila de los títulos. En móvil no hay nada que emparejar, la
            columna vuelve a ser un bloque normal. */}
        <div className="grid gap-6 p-6 pt-12 sm:p-8 sm:pt-12 md:auto-cols-fr md:grid-flow-col md:grid-rows-[auto_1fr] md:gap-y-0">
          {COLUMNS.map(({ code, rule }) => {
            // All three bundles are loaded eagerly in i18n.ts, so the fixed t() is sync.
            const tl = i18n.getFixedT(code)
            return (
              <div key={code} lang={code === 'cn' ? 'zh' : code} className="md:contents">
                <h2
                  className="mb-3 flex items-center justify-center border-y-[3px] px-2 py-2.5 text-center text-[13px] font-semibold leading-snug text-[#093b4d]"
                  style={{ borderColor: rule }}
                >
                  {tl('landing.title')}
                </h2>
                <p className="text-justify text-xs leading-relaxed text-gray-700">{tl('landing.body')}</p>
              </div>
            )
          })}
        </div>

        <div className="flex justify-center px-6 pb-8">
          <button
            type="button"
            onClick={enter}
            className="bg-gray-900 px-6 py-3 text-xs font-bold text-white transition-colors hover:bg-brand-dark"
          >
            {t('landing.see_map')}
          </button>
        </div>
      </>
    </InfoModal>
  )
}
