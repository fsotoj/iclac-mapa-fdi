// Checkbox list for country / sector filters. Empty selection = all (every box
// checked); clicking one from "all" narrows to just it (same as clicking a node).
// Shared by the Sankey filter bar and the map's sidebar sections.
export default function CheckList({
  items,
  selected,
  onToggle,
  color,
  label
}: {
  items: string[]
  selected: string[]
  onToggle: (v: string) => void
  color?: (v: string) => string
  label?: (v: string) => string
}) {
  const all = selected.length === 0
  return (
    <div className="max-h-72 overflow-y-auto p-2">
      {items.map(it => {
        const active = all || selected.includes(it)
        return (
          <label key={it} className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-sm hover:bg-gray-50">
            <input type="checkbox" checked={active} onChange={() => onToggle(it)} className="shrink-0" />
            {color && (
              <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: color(it), opacity: active ? 1 : 0.4 }} />
            )}
            <span className="min-w-0 flex-1 truncate text-gray-800">{label ? label(it) : it}</span>
          </label>
        )
      })}
    </div>
  )
}
