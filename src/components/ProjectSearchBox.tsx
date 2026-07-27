import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useFilters } from '@/hooks/useFilters'

// Search box for the project list, shared by ProjectDocsCards and ProjectDocsTable
// so both list formats search the same way (Margareth UAT). The query itself lives
// in the URL filters and is applied in applyFilters, so the list components only
// need to render this — they already receive the filtered rows.

const SearchIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-4 w-4 shrink-0">
    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 10.5a6.5 6.5 0 11-13 0 6.5 6.5 0 0113 0z" />
  </svg>
)

export default function ProjectSearchBox() {
  const { t } = useTranslation()
  const { filters, setFilters } = useFilters()
  const query = filters.query

  // Debounced: type into a local draft, commit to the URL filter after a pause.
  const [draft, setDraft] = useState(query)
  useEffect(() => setDraft(query), [query])
  useEffect(() => {
    const id = setTimeout(() => {
      if (draft !== query) setFilters({ query: draft })
    }, 250)
    return () => clearTimeout(id)
  }, [draft, query, setFilters])

  const clear = () => {
    setDraft('')
    setFilters({ query: '' })
  }

  return (
    <div className="flex items-center gap-2 rounded border border-gray-300 px-2 py-1 text-gray-500 focus-within:border-brand">
      <SearchIcon />
      <input
        type="text"
        value={draft}
        onChange={e => setDraft(e.target.value)}
        placeholder={t('list.search')}
        className="min-w-0 flex-1 bg-transparent text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none"
      />
      {draft && (
        <button
          type="button"
          onClick={clear}
          className="shrink-0 text-gray-400 hover:text-brand-dark"
          aria-label={t('common.clear')}
        >
          ×
        </button>
      )}
    </div>
  )
}
