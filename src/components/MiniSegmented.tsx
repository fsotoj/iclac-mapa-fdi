// Tiny joined toggle for the sort / grouping controls in the list panel header.
// Shared by ProjectDocsCards and ProjectDocsTable so both list formats expose
// the same "Sort by" / "View" controls (Margareth UAT).
export default function MiniSegmented<T extends string>({
  items,
  value,
  onPick
}: {
  items: { value: T; label: string }[]
  value: T
  onPick: (v: T) => void
}) {
  return (
    <div className="flex overflow-hidden rounded border border-gray-300 text-[11px]">
      {items.map((it, i) => (
        <button
          key={it.value}
          type="button"
          onClick={() => onPick(it.value)}
          aria-pressed={value === it.value}
          className={`px-2 py-0.5 ${i > 0 ? 'border-l border-gray-300' : ''} ${
            value === it.value
              ? 'bg-gray-900 text-white hover:bg-brand-dark'
              : 'bg-white text-gray-600 hover:bg-brand hover:text-gray-900'
          }`}
        >
          {it.label}
        </button>
      ))}
    </div>
  )
}
