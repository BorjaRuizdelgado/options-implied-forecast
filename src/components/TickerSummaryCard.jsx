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
  const className = `ticker-summary-card${variant === 'watchlist' ? ' ticker-summary-card--watchlist' : ''}`

  return (
    <div className={className}>
      {action ? <div className="ticker-summary-card__action">{action}</div> : null}
      <button className="trending-card ticker-summary-card__button" onClick={() => onClick(symbol)} type="button">
        <div className="ticker-summary-card__header">
          <span className="trending-card-symbol">{symbol}</span>
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
