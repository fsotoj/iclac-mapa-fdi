import { useState } from 'react'
import { useTranslation } from 'react-i18next'

// El legado abría un formulario de Mailchimp (list-manage.com). Se reemplaza por un
// formulario propio (resuelve next_steps 2.6 / U6).
//
// Por qué NO Netlify Forms, que era la opción obvia: en los planes por créditos los
// envíos consumen del pool compartido de la cuenta y, si se agota, Netlify pausa
// TODOS los proyectos — no solo este. Un formulario de contacto público es justo
// donde llega el spam, así que el modo de falla es "el mapa se cae por spam".
//
// Web3Forms recibe el POST y reenvía por correo a la dirección con la que se generó
// la clave. El destinatario NO se configura acá: está atado a VITE_WEB3FORMS_KEY.
// Cambiar de buzón = clave nueva (ver .env.example).
const ENDPOINT = 'https://api.web3forms.com/submit'
const ACCESS_KEY = import.meta.env.VITE_WEB3FORMS_KEY as string | undefined

// Fallback visible cuando el envío falla, y única salida si no hay clave configurada.
const CONTACT_EMAIL = 'comunicaciones.iclac@gmail.com'

type Status = 'idle' | 'sending' | 'ok' | 'error'

const inputClass =
  'w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-[#377F83] focus:outline-none focus:ring-1 focus:ring-[#377F83]'

export default function ContactView() {
  const { t, i18n } = useTranslation()
  const [status, setStatus] = useState<Status>('idle')

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!ACCESS_KEY) return
    setStatus('sending')
    const form = new FormData(e.currentTarget)
    const payload = {
      access_key: ACCESS_KEY,
      // Asunto y remitente arman el correo del lado de Web3Forms; replyto hace que
      // "Responder" vaya a quien escribió y no al robot.
      subject: `[Repositorio ICLAC] ${form.get('name')}`,
      from_name: 'Repositorio ICLAC',
      replyto: form.get('email'),
      name: form.get('name'),
      email: form.get('email'),
      organization: form.get('organization'),
      message: form.get('message'),
      locale: i18n.language,
      botcheck: form.get('botcheck')
    }
    try {
      const res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(payload)
      })
      // Un 200 con success:false es un rechazo (clave inválida, honeypot); tratarlo
      // como éxito dejaría al usuario creyendo que escribió y a nadie leyéndolo.
      const data = await res.json().catch(() => null)
      if (!res.ok || !data?.success) throw new Error(data?.message ?? `HTTP ${res.status}`)
      setStatus('ok')
    } catch {
      setStatus('error')
    }
  }

  const header = <h1 className="mb-6 text-3xl font-semibold text-[#093b4d]">{t('contact.title')}</h1>

  const mailtoLine = (
    <p className="mt-2 text-xs text-gray-500">
      {t('contact.form.or_email')}{' '}
      <a href={`mailto:${CONTACT_EMAIL}`} className="underline hover:text-gray-700">
        {CONTACT_EMAIL}
      </a>
    </p>
  )

  if (status === 'ok') {
    return (
      <div className="mx-auto max-w-3xl px-6 py-10">
        {header}
        <div className="rounded-md border border-[#377F83]/40 bg-[#377F83]/10 p-4">
          <p className="text-sm font-medium text-[#093b4d]">{t('contact.form.ok_title')}</p>
          <p className="mt-1 text-sm text-gray-700">{t('contact.form.ok_body')}</p>
        </div>
        <button
          type="button"
          onClick={() => setStatus('idle')}
          className="mt-4 text-sm font-medium text-[#377F83] hover:underline"
        >
          {t('contact.form.send_another')}
        </button>
      </div>
    )
  }

  // Sin clave el formulario mentiría: aceptaría datos que no van a ninguna parte.
  // Mejor degradar al correo directo, que es lo que hacía la vista antes.
  if (!ACCESS_KEY) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-10">
        {header}
        <p className="mb-8 text-justify leading-relaxed text-gray-700">{t('contact.description_mailto')}</p>
        <a
          href={`mailto:${CONTACT_EMAIL}`}
          className="inline-flex items-center gap-2 rounded-md bg-[#093b4d] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#0c4d63]"
        >
          {CONTACT_EMAIL}
        </a>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      {header}

      <p className="mb-8 text-justify leading-relaxed text-gray-700">{t('contact.description')}</p>

      <form onSubmit={onSubmit} className="space-y-4">
        {/* Honeypot: invisible para personas, tentador para bots. Web3Forms descarta el
            envío si viene con contenido. aria-hidden + tabIndex para que ningún lector
            de pantalla lo anuncie ni lo alcance el tabulador. */}
        <p className="hidden" aria-hidden>
          <label>
            {t('contact.form.bot')}
            <input name="botcheck" tabIndex={-1} autoComplete="off" />
          </label>
        </p>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="cf-name" className="mb-1 block text-sm font-medium text-gray-700">
              {t('contact.form.name')} <span className="text-red-600">*</span>
            </label>
            <input id="cf-name" name="name" type="text" required autoComplete="name" className={inputClass} />
          </div>
          <div>
            <label htmlFor="cf-email" className="mb-1 block text-sm font-medium text-gray-700">
              {t('contact.form.email')} <span className="text-red-600">*</span>
            </label>
            <input id="cf-email" name="email" type="email" required autoComplete="email" className={inputClass} />
          </div>
        </div>

        <div>
          <label htmlFor="cf-org" className="mb-1 block text-sm font-medium text-gray-700">
            {t('contact.form.organization')}
          </label>
          <input id="cf-org" name="organization" type="text" autoComplete="organization" className={inputClass} />
        </div>

        <div>
          <label htmlFor="cf-msg" className="mb-1 block text-sm font-medium text-gray-700">
            {t('contact.form.message')} <span className="text-red-600">*</span>
          </label>
          <textarea id="cf-msg" name="message" required rows={6} className={inputClass} />
        </div>

        {status === 'error' && (
          <div className="rounded-md border border-red-300 bg-red-50 p-3">
            <p className="text-sm text-red-800">
              {t('contact.form.error')}{' '}
              <a href={`mailto:${CONTACT_EMAIL}`} className="font-medium underline">
                {CONTACT_EMAIL}
              </a>
            </p>
          </div>
        )}

        <div className="pt-1">
          <button
            type="submit"
            disabled={status === 'sending'}
            className="inline-flex items-center gap-2 rounded-md bg-[#093b4d] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#0c4d63] disabled:cursor-not-allowed disabled:opacity-60"
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
            {status === 'sending' ? t('contact.form.sending') : t('contact.form.send')}
          </button>
          {mailtoLine}
        </div>
      </form>
    </div>
  )
}
