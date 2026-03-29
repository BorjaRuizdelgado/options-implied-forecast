import React from 'react'
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import WatchlistPage from '../WatchlistPage.jsx'

describe('WatchlistPage', () => {
  it('renders saved watchlist items as larger centered clickable cards', () => {
    const html = renderToStaticMarkup(
      React.createElement(WatchlistPage, {
        watchlist: { tickers: ['AAPL'], remove: () => {} },
        onAnalyse: () => {},
      }),
    )

    expect(html).toContain('watchlist-grid watchlist-grid--saved')
    expect(html).toContain('watchlist-card watchlist-card--saved')
    expect(html).toContain('watchlist-card__remove')
    expect(html).toContain('type="button"')
  })
})
