import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { fetchScreener, fetchSearch } from '../lib/fetcher.js'
import { fmt } from '../lib/format.js'
import {
  COLLECTIONS,
  SORT_OPTIONS,
  filterStocks,
  extractSectors,
  rangePosition,
  marketCapLabel,
} from '../lib/screener.js'

const PAGE_SIZE = 60

function ScreenerCard({ stock, onClick, watchlist }) {
  const pos = rangePosition(stock.price, stock.fiftyTwoWeekLow, stock.fiftyTwoWeekHigh)
  const changeCls = stock.changePct > 0 ? 'positive' : stock.changePct < 0 ? 'negative' : ''
  const inWatchlist = watchlist?.has(stock.ticker)

  return (
    <div className="screener-card" role="button" tabIndex={0} onClick={() => onClick(stock.ticker)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(stock.ticker) } }}>
      <div className="screener-card__head">
        <div className="screener-card__symbol-row">
          <span className="screener-card__symbol">{stock.ticker}</span>
          {stock.sector && <span className="screener-card__sector">{stock.sector}</span>}
        </div>
        {watchlist && (
          <button
            className={`screener-card__star${inWatchlist ? ' screener-card__star--active' : ''}`}
            onClick={(e) => {
              e.stopPropagation()
              inWatchlist ? watchlist.remove(stock.ticker) : watchlist.add(stock.ticker)
            }}
            aria-label={inWatchlist ? 'Remove from watchlist' : 'Add to watchlist'}
          >
            {inWatchlist ? '★' : '☆'}
          </button>
        )}
      </div>
      <div className="screener-card__name">{stock.name}</div>
      <div className="screener-card__price-row">
        <span className="screener-card__price">{fmt(stock.price)}</span>
        {stock.changePct != null && (
          <span className={`screener-card__change ${changeCls}`}>
            {stock.changePct > 0 ? '+' : ''}
            {stock.changePct.toFixed(2)}%
          </span>
        )}
      </div>
      <div className="screener-card__metrics">
        <div className="screener-card__metric">
          <span className="screener-card__metric-label">P / E</span>
          <span className="screener-card__metric-value">
            {stock.trailingPE != null ? stock.trailingPE.toFixed(1) : '—'}
          </span>
        </div>
        <div className="screener-card__metric">
          <span className="screener-card__metric-label">Mkt Cap</span>
          <span className="screener-card__metric-value">{marketCapLabel(stock.marketCap)}</span>
        </div>
        <div className="screener-card__metric">
          <span className="screener-card__metric-label">Div Yield</span>
          <span className="screener-card__metric-value">
            {stock.dividendYield != null ? `${stock.dividendYield.toFixed(2)}%` : '—'}
          </span>
        </div>
      </div>
      {pos != null && (
        <div className="screener-card__range">
          <div className="screener-card__range-labels">
            <span>{fmt(stock.fiftyTwoWeekLow)}</span>
            <span className="screener-card__range-title">52 W</span>
            <span>{fmt(stock.fiftyTwoWeekHigh)}</span>
          </div>
          <div className="screener-card__range-bar">
            <div className="screener-card__range-fill" style={{ '--pos': `${pos}%` }} />
          </div>
        </div>
      )}
    </div>
  )
}

export default function ScreenerPage({ onAnalyse, watchlist }) {
  const [stocks, setStocks] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [activeCollection, setActiveCollection] = useState('all')
  const [activeSectors, setActiveSectors] = useState(new Set())
  const [sortBy, setSortBy] = useState('marketCap')
  const [sortDir, setSortDir] = useState('desc')
  const [searchText, setSearchText] = useState('')
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
  const [apiResults, setApiResults] = useState([])
  const [apiSearching, setApiSearching] = useState(false)
  const searchTimerRef = useRef(null)

  useEffect(() => {
    let cancelled = false
    fetchScreener()
      .then((data) => {
        if (!cancelled) setStocks(data.stocks || [])
      })
      .catch((err) => {
        if (!cancelled) setError(err.message)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [])

  const sectors = useMemo(() => extractSectors(stocks), [stocks])

  // Collection counts for badges
  const collectionCounts = useMemo(() => {
    const map = {}
    for (const col of COLLECTIONS) {
      map[col.id] = col.id === 'all' ? stocks.length : stocks.filter(col.filter).length
    }
    return map
  }, [stocks])

  // Only show collections that have at least 1 match
  const visibleCollections = useMemo(
    () => COLLECTIONS.filter((col) => col.id === 'all' || collectionCounts[col.id] > 0),
    [collectionCounts],
  )

  const filtered = useMemo(() => {
    let result = filterStocks(stocks, { collection: activeCollection, sectors: activeSectors, sortBy, sortDir })
    if (searchText.trim()) {
      const q = searchText.trim().toLowerCase()
      result = result.filter(
        (s) =>
          s.ticker.toLowerCase().includes(q) ||
          (s.name && s.name.toLowerCase().includes(q)) ||
          (s.sector && s.sector.toLowerCase().includes(q)),
      )
    }
    return result
  }, [stocks, activeCollection, activeSectors, sortBy, sortDir, searchText])

  // When search text changes and local results are sparse, also search the Yahoo API
  useEffect(() => {
    clearTimeout(searchTimerRef.current)
    const q = searchText.trim()
    if (!q || q.length < 2) {
      setApiResults([])
      setApiSearching(false)
      return
    }
    // Only hit the API if local results are thin
    if (filtered.length > 5) {
      setApiResults([])
      return
    }
    setApiSearching(true)
    searchTimerRef.current = setTimeout(async () => {
      try {
        const data = await fetchSearch(q)
        const localTickers = new Set(filtered.map((s) => s.ticker))
        const extra = (data.results || []).filter((r) => !localTickers.has(r.symbol))
        setApiResults(extra)
      } catch {
        setApiResults([])
      } finally {
        setApiSearching(false)
      }
    }, 350)
    return () => clearTimeout(searchTimerRef.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchText, filtered.length])

  // Reset visible count when filters change
  useEffect(() => { setVisibleCount(PAGE_SIZE) }, [activeCollection, activeSectors, sortBy, sortDir, searchText])

  const paginatedResults = useMemo(() => filtered.slice(0, visibleCount), [filtered, visibleCount])
  const hasMore = visibleCount < filtered.length

  const loadMore = useCallback(() => {
    setVisibleCount((n) => n + PAGE_SIZE)
  }, [])

  function toggleSector(sector) {
    setActiveSectors((prev) => {
      const next = new Set(prev)
      if (next.has(sector)) next.delete(sector)
      else next.add(sector)
      return next
    })
  }

  function handleSort(id) {
    if (sortBy === id) {
      setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'))
    } else {
      setSortBy(id)
      setSortDir('desc')
    }
  }

  if (loading) {
    return (
      <div className="screener">
        <div className="screener-hero">
          <h1 className="screener-hero__title">Discover</h1>
          <p className="screener-hero__subtitle">Fetching live stock data…</p>
        </div>
        <div className="screener-grid screener-grid--loading">
          {Array.from({ length: 12 }, (_, i) => (
            <div key={i} className="screener-card screener-card--skeleton">
              <div className="skeleton-line skeleton-line--short" />
              <div className="skeleton-line" />
              <div className="skeleton-line skeleton-line--short" />
              <div className="skeleton-line" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="screener">
        <div className="screener-hero">
          <h1 className="screener-hero__title">Discover</h1>
          <p className="screener-hero__subtitle">Something went wrong — {error}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="screener">
      <div className="screener-hero">
        <h1 className="screener-hero__title">Discover</h1>
        <p className="screener-hero__subtitle">Browse {stocks.length.toLocaleString()} stocks and ETFs. Use search, collections, and filters to find what you&rsquo;re looking for.</p>
      </div>

      {/* Search bar */}
      <div className="screener-search">
        <input
          type="text"
          className="screener-search__input"
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          placeholder="Filter by name, ticker, or sector…"
          aria-label="Filter stocks"
          autoComplete="off"
          spellCheck="false"
        />
        {searchText && (
          <button className="screener-search__clear" onClick={() => setSearchText('')} aria-label="Clear search">
            ✕
          </button>
        )}
      </div>

      {/* Collections */}
      <div className="screener-collections">
        {visibleCollections.map((col) => (
          <button
            key={col.id}
            className={`screener-collection${activeCollection === col.id ? ' screener-collection--active' : ''}`}
            onClick={() => setActiveCollection(col.id)}
          >
            <span className="screener-collection__icon">{col.icon}</span>
            <span className="screener-collection__label">{col.label}</span>
            <span className="screener-collection__count">{collectionCounts[col.id]}</span>
            <span className="screener-collection__tagline">{col.tagline}</span>
          </button>
        ))}
      </div>

      {/* Sector filters */}
      {sectors.length > 0 && (
        <div className="screener-filters">
          <button
            className={`overlay-pill${activeSectors.size === 0 ? ' overlay-pill--active' : ''}`}
            onClick={() => setActiveSectors(new Set())}
          >
            All Sectors
          </button>
          {sectors.map((s) => (
            <button
              key={s}
              className={`overlay-pill${activeSectors.has(s) ? ' overlay-pill--active' : ''}`}
              onClick={() => toggleSector(s)}
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {/* Sort + count */}
      <div className="screener-toolbar">
        <div className="screener-sort">
          {SORT_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              className={`screener-sort__btn${sortBy === opt.id ? ' screener-sort__btn--active' : ''}`}
              onClick={() => handleSort(opt.id)}
            >
              {opt.label}
              {sortBy === opt.id && (
                <span className="screener-sort__arrow">{sortDir === 'desc' ? ' ↓' : ' ↑'}</span>
              )}
            </button>
          ))}
        </div>
        <span className="screener-count">
          Showing {Math.min(visibleCount, filtered.length)} of {filtered.length}
          {filtered.length !== stocks.length ? ` (${stocks.length} total)` : ''}
        </span>
      </div>

      {/* Results */}
      {filtered.length === 0 && apiResults.length === 0 && !apiSearching ? (
        <div className="screener-empty">
          <p className="screener-empty__text">
            {searchText
              ? `No results for "${searchText}" — try a different name or ticker.`
              : 'No stocks match these filters — try a different collection or broaden the sectors.'}
          </p>
        </div>
      ) : (
        <>
          {filtered.length > 0 && (
            <div className="screener-grid">
              {paginatedResults.map((s) => (
                <ScreenerCard key={s.ticker} stock={s} onClick={onAnalyse} watchlist={watchlist} />
              ))}
            </div>
          )}
          {hasMore && (
            <div className="screener-load-more">
              <button className="screener-load-more__btn" onClick={loadMore}>
                Show more ({filtered.length - visibleCount} remaining)
              </button>
            </div>
          )}

          {/* API search results for tickers not in the screener */}
          {searchText.trim() && (apiResults.length > 0 || apiSearching) && (
            <div className="screener-api-results">
              <div className="screener-api-results__header">
                {apiSearching
                  ? 'Searching for more matches…'
                  : `${apiResults.length} more result${apiResults.length !== 1 ? 's' : ''} from search`}
              </div>
              {apiResults.map((r) => (
                <button
                  key={r.symbol}
                  className="screener-api-result"
                  onClick={() => onAnalyse(r.symbol)}
                >
                  <span className="screener-api-result__symbol">{r.symbol}</span>
                  <span className="screener-api-result__name">{r.name}</span>
                  <span className="screener-api-result__type">{r.type === 'EQUITY' ? 'Stock' : r.type === 'ETF' ? 'ETF' : r.type}</span>
                  <span className="screener-api-result__exchange">{r.exchange}</span>
                  <span className="screener-api-result__action">Analyse →</span>
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
