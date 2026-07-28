import { useState, type ComponentType } from 'react'
import { useTranslation } from 'react-i18next'
import InfoModal from './InfoModal'
import Citation from './Citation'

// The "(?)" beside a tool's figures, and the panel it opens. A modal rather than the
// small HelpTip popover: this text runs several paragraphs and describes the whole view,
// not one control. Plain white, no map watermark — that decoration marks the
// repository's own presentation, and these are help for the tool in front of you.
export default function ToolInfo({
  icon: Icon,
  title,
  text,
  note
}: {
  icon: ComponentType<{ className?: string }>
  title: string
  text: string
  note?: string
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={title}
        title={title}
        className={`flex h-4 w-4 items-center justify-center rounded-full border text-[10px] font-semibold leading-none transition-colors ${
          open
            ? 'border-[#093b4d] bg-[#093b4d] text-white'
            : 'border-gray-400 text-gray-500 hover:border-brand-dark hover:text-brand-dark'
        }`}
      >
        ?
      </button>

      <InfoModal open={open} onClose={() => setOpen(false)} label={title}>
        <div className="p-6 pt-12 sm:p-8 sm:pt-12">
          <div className="mb-4 flex items-center gap-2.5 border-b-[3px] border-[#093b4d] pb-3 pr-8 text-[#093b4d]">
            <Icon className="h-6 w-6 shrink-0" />
            <h2 className="text-base font-semibold leading-snug">{title}</h2>
          </div>
          <div className="space-y-3 text-justify text-[13px] leading-relaxed text-gray-700">
            {text.split('\n').filter(Boolean).map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </div>
          {note && <Citation text={note} />}
          <div className="mt-6 flex justify-center">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="bg-gray-900 px-6 py-2.5 text-xs font-bold text-white transition-colors hover:bg-brand-dark"
            >
              {t('common.close')}
            </button>
          </div>
        </div>
      </InfoModal>
    </>
  )
}
