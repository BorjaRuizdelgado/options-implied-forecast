/**
 * prefetch.js — Trigger light dynamic imports during browser idle time.
 * Chart-heavy pages are intentionally left out so Plotly is fetched only
 * when the user opens a charting section.
 */

const chunks = [
  () => import('../components/FundamentalsPanel.jsx'),
  () => import('../components/NewsPage.jsx'),
  () => import('../components/WatchlistPage.jsx'),
  () => import('../components/ScreenerPage.jsx'),
  () => import('../components/DisclaimerPage.jsx'),
  () => import('../components/DonationsPage.jsx'),
  () => import('../components/ContactPage.jsx'),
]

let prefetched = false

export function prefetchLazyChunks() {
  if (prefetched) return
  prefetched = true

  const schedule =
    typeof requestIdleCallback === 'function'
      ? (fn) => requestIdleCallback(fn, { timeout: 3000 })
      : (fn) => setTimeout(fn, 2000)

  chunks.forEach((load) => {
    schedule(() => {
      load().catch(() => {
        /* chunk may already be cached or offline — ignore */
      })
    })
  })
}
