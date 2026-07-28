import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

// The suggested citation, set as a quotation rather than a footnote: it is something the
// reader takes away, not context. The copy button matters more than the styling — the
// text runs three lines and selecting it by hand inside a scrolling dialog is fiddly.
export default function Citation({ text }: { text: string }) {
  const { t } = useTranslation()
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!copied) return
    const id = setTimeout(() => setCopied(false), 2000)
    return () => clearTimeout(id)
  }, [copied])

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      // navigator.clipboard needs a secure context and can be blocked by policy.
      // The textarea route still works there, so the button never silently fails.
      const ta = document.createElement('textarea')
      ta.value = text
      ta.setAttribute('readonly', '')
      ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0'
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      ta.remove()
    }
    setCopied(true)
  }

  return (
    <div className="mt-5 border-t border-gray-100 pt-4">
      <div className="mb-2 flex items-center justify-between gap-3">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">{t('common.citation')}</span>
        <button
          type="button"
          onClick={copy}
          className="flex shrink-0 items-center gap-1.5 rounded border border-gray-300 px-2 py-1 text-[11px] font-medium text-gray-600 transition-colors hover:border-brand-dark hover:text-brand-dark"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-3.5 w-3.5">
            {copied ? (
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 12.5l5 5L20 6.5" />
            ) : (
              <>
                <rect x="9" y="9" width="11" height="11" rx="2" />
                <path d="M15 5.5A1.5 1.5 0 0 0 13.5 4h-8A1.5 1.5 0 0 0 4 5.5v8A1.5 1.5 0 0 0 5.5 15" />
              </>
            )}
          </svg>
          <span aria-live="polite">{copied ? t('common.copied') : t('common.copy')}</span>
        </button>
      </div>
      <p className="border-l-[3px] border-[#377F83] pl-3 text-[12px] italic leading-relaxed text-gray-600">{text}</p>
    </div>
  )
}
