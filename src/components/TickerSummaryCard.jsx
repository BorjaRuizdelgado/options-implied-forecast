import React from 'react'
import { fmt } from '../lib/format.js'

export default function TickerSummaryCard({
  symbol,
  name,
  price,
  changePct,
  onClick,
  variant = 'default',
  action,
}) {
  const positive = !Number.isFinite(changePct) || changePct >= 0
  const className =
    variant === 'watchlist'
      ? 'watchlist-card watchlist-card--saved'
      : `ticker-summary-card${variant === 'watchlist' ? ' ticker-summary-card--watchlist' : ''}`

  return (
    <div className={className}>
      <button className="trending-card ticker-summary-card__button" onClick={() => onClick(symbol)} type="button">
        <div className="ticker-summary-card__header">
          <span className="trending-card-symbol">{symbol}</span>
          {action ? <span className="ticker-summary-card__action">{action}</span> : null}
        </div>
        <span className="trending-card-name">{name || symbol}</span>
        {Number.isFinite(price) ? (
          <>
            <span className="trending-card-price">{fmt(price)}</span>
            <span className={`trending-card-change ${positive ? 'positive' : 'negative'}`}>
              {positive ? '+' : ''}
              {changePct.toFixed(2)}%
            </span>
          </>
        ) : (
          <span className="terminal-caption ticker-summary-card__fallback">Quote unavailable</span>
        )}
      </button>
    </div>
  )
}
