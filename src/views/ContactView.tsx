import { useTranslation } from 'react-i18next'

// El legado abría un formulario de Mailchimp (list-manage.com). Se reemplaza por
// un mailto directo. PENDIENTE CLIENTE (ver next_steps 2.6): confirmar que prefieren
// mailto en vez de reponer un formulario embebido, y validar la dirección.
const CONTACT_EMAIL = 'comunicaciones.iclac@gmail.com'

export default function ContactView() {
  const { t } = useTranslation()

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="mb-6 text-3xl font-semibold text-[#093b4d]">
        {t('contact.title')}
      </h1>

      <p className="mb-8 text-justify leading-relaxed text-gray-700">
        {t('contact.description')}
      </p>

      <a
        href={`mailto:${CONTACT_EMAIL}`}
        className="inline-flex items-center gap-2 rounded-md bg-[#093b4d] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#0c4d63]"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={1.5}
          stroke="currentColor"
          className="h-5 w-5"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75"
          />
        </svg>
        {t('contact.button')}
      </a>
      <p className="mt-2 text-xs text-gray-500">
        <a href={`mailto:${CONTACT_EMAIL}`} className="underline hover:text-gray-700">
          {CONTACT_EMAIL}
        </a>
      </p>
    </div>
  )
}
