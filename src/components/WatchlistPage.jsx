import React, { useState, useEffect } from 'react'
import TickerSummaryCard from './TickerSummaryCard.jsx'

export default function WatchlistPage({ watchlist, onAnalyse }) {
  const [quotes, setQuotes] = useState([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!watchlist.tickers.length) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setQuotes([])
      return
    }

    let cancelled = false
    setLoading(true)

    fetch(`/api/quotes?tickers=${encodeURIComponent(watchlist.tickers.join(','))}`)
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) setQuotes(data.quotes || [])
      })
      .catch(() => {
        if (!cancelled) setQuotes([])
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [watchlist.tickers])

  return (
    <div style={{ textAlign: 'center' }}>
      <h1>Watchlist</h1>
      <p className="subtitle">Your saved tickers. Click to analyse.</p>

      {watchlist.tickers.length === 0 && (
        <div className="watchlist-empty">
          <p>No tickers in your watchlist yet.</p>
          <p>Search for a ticker and click the star to add it.</p>
        </div>
      )}

      {loading && watchlist.tickers.length > 0 && (
        <div className="loading">
          <div className="spinner" />
          <span>Fetching quotes...</span>
        </div>
      )}

      {!loading && watchlist.tickers.length > 0 && (
        <div className="watchlist-grid watchlist-grid--saved">
          {watchlist.tickers.map((ticker) => {
            const q = quotes.find((x) => x.ticker === ticker || x.symbol === ticker)
            return (
              <TickerSummaryCard
                key={ticker}
                variant="watchlist"
                symbol={ticker}
                name={q?.name}
                price={q?.price}
                changePct={q?.changePct}
                onClick={onAnalyse}
                action={
                  <button
                    className="watchlist-card__remove"
                    onClick={(e) => {
                      e.stopPropagation()
                      watchlist.remove(ticker)
                    }}
                    title="Remove from watchlist"
                    type="button"
                  >
                    &times;
                  </button>
                }
              />
            )
          })}
        </div>
      )}
    </div>
  )
}
