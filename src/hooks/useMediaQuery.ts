import { useEffect, useState } from 'react'

// Subscribes to a CSS media query. Initial value reads synchronously (lazy
// initializer) so components mount in the correct state — no flash of the
// desktop layout on a phone before the first effect runs.
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(query).matches
  )

  useEffect(() => {
    const mql = window.matchMedia(query)
    const onChange = () => setMatches(mql.matches)
    onChange()
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [query])

  return matches
}

// < md (Tailwind default breakpoint 768px). One place to change the phone cutoff.
export const useIsMobile = (): boolean => useMediaQuery('(max-width: 767px)')
