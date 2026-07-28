// Once per visit, not once per browser: the presentation is a description of the
// repository, and a returning reader in the same session already saw it. Reopening it is
// the header's "Acerca de" button, which owns the state — hence this lives outside the
// modal, in its own module (a component file that also exports a helper breaks Fast
// Refresh, and CI lints that as an error).
const SEEN_KEY = 'iclac.landing.seen'

// Memoised per page load: StrictMode double-invokes state initialisers in dev, so an
// un-memoised read+write would burn the flag on the first pass and answer "already seen"
// on the second — the modal would never open.
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
