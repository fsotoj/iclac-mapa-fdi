// Tab icons for the two tools. They travel: the same glyph marks the nav tab and heads
// that tool's explanation panel, so a reader who opens the panel knows which tool it
// belongs to. Line-only, `currentColor`, 1.8 stroke — same build as the header icons.
type IconProps = { className?: string }

export function MapIcon({ className = 'h-4 w-4' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className={className} aria-hidden>
      <path strokeLinejoin="round" d="M9 4 3 6.5v13L9 17l6 2.5 6-2.5v-13L15 6.5 9 4Z" />
      <path strokeLinejoin="round" d="M9 4v13M15 6.5v13" />
    </svg>
  )
}

export function TrendsIcon({ className = 'h-4 w-4' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className={className} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 17.5l5.5-5.5 3.5 3 8-8" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.5 7H20v4.5" />
    </svg>
  )
}
