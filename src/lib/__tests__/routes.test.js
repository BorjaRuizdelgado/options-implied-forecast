import { describe, it, expect } from 'vitest'
import {
  tabFromPath,
  tickerFromPath,
  isReservedPath,
  isComparePath,
  compareTickersFromPath,
} from '../routes.js'

// ---------------------------------------------------------------------------
// tabFromPath
// ---------------------------------------------------------------------------

describe('tabFromPath', () => {
  it('returns null for bare ticker paths (the overview URL)', () => {
    // /NVDA has no tab segment — represents the overview page.
    // The caller must default to "overview" when null is returned.
    expect(tabFromPath('/NVDA')).toBeNull()
    expect(tabFromPath('/AAPL')).toBeNull()
  })

  it('returns the tab name for full ticker/tab paths', () => {
    expect(tabFromPath('/NVDA/technicals')).toBe('technicals')
    expect(tabFromPath('/NVDA/overview')).toBe('overview')
    expect(tabFromPath('/AAPL/value')).toBe('value')
    expect(tabFromPath('/AAPL/quality')).toBe('quality')
    expect(tabFromPath('/AAPL/risk')).toBe('risk')
    expect(tabFromPath('/AAPL/business')).toBe('business')
    expect(tabFromPath('/AAPL/options')).toBe('options')
    expect(tabFromPath('/AAPL/fundamentals')).toBe('fundamentals')
  })

  it('returns null for the root path', () => {
    expect(tabFromPath('/')).toBeNull()
    expect(tabFromPath('')).toBeNull()
  })

  it('decodes percent-encoded tab names', () => {
    expect(tabFromPath('/AAPL/options%20forecasting')).toBe('options forecasting')
  })

  // Regression: back button from /NVDA/technicals to /NVDA must resolve to overview.
  // The popstate handler in App.jsx should use `tabFromPath(pathname) || 'overview'`
  // so that a null result correctly activates the overview tab instead of leaving
  // the previous tab active.
  it('regression: tabFromPath returns null for /TICKER so callers fall back to overview', () => {
    const resolveActiveTab = (pathname) => tabFromPath(pathname) || 'overview'

    // Navigating back from /NVDA/technicals → /NVDA should give overview
    expect(resolveActiveTab('/NVDA')).toBe('overview')
    // Going to a specific tab should still work
    expect(resolveActiveTab('/NVDA/technicals')).toBe('technicals')
    expect(resolveActiveTab('/NVDA/value')).toBe('value')
    // Root path also defaults to overview
    expect(resolveActiveTab('/')).toBe('overview')
  })
})

// ---------------------------------------------------------------------------
// tickerFromPath
// ---------------------------------------------------------------------------

describe('tickerFromPath', () => {
  it('extracts the ticker from a bare ticker path', () => {
    expect(tickerFromPath('/NVDA')).toBe('NVDA')
    expect(tickerFromPath('/aapl')).toBe('AAPL')
  })

  it('extracts the ticker from a ticker/tab path', () => {
    expect(tickerFromPath('/NVDA/technicals')).toBe('NVDA')
    expect(tickerFromPath('/AAPL/overview')).toBe('AAPL')
  })

  it('returns null for reserved paths', () => {
    expect(tickerFromPath('/disclaimer')).toBeNull()
    expect(tickerFromPath('/donate')).toBeNull()
    expect(tickerFromPath('/contact')).toBeNull()
    expect(tickerFromPath('/watchlist')).toBeNull()
  })

  it('returns null for compare paths', () => {
    expect(tickerFromPath('/compare')).toBeNull()
    expect(tickerFromPath('/compare/AAPL/MSFT')).toBeNull()
  })

  it('returns null for the root path', () => {
    expect(tickerFromPath('/')).toBeNull()
    expect(tickerFromPath('')).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// isReservedPath / isComparePath
// ---------------------------------------------------------------------------

describe('isReservedPath', () => {
  it('marks known special paths as reserved', () => {
    expect(isReservedPath('/disclaimer')).toBe(true)
    expect(isReservedPath('/donate')).toBe(true)
    expect(isReservedPath('/contact')).toBe(true)
    expect(isReservedPath('/watchlist')).toBe(true)
    expect(isReservedPath('/compare')).toBe(true)
    expect(isReservedPath('/compare/AAPL/MSFT')).toBe(true)
  })

  it('does not mark ticker paths as reserved', () => {
    expect(isReservedPath('/NVDA')).toBe(false)
    expect(isReservedPath('/AAPL/technicals')).toBe(false)
  })
})

describe('isComparePath', () => {
  it('returns true for /compare and sub-paths', () => {
    expect(isComparePath('/compare')).toBe(true)
    expect(isComparePath('/compare/AAPL')).toBe(true)
    expect(isComparePath('/compare/AAPL/MSFT')).toBe(true)
  })

  it('returns false for other paths', () => {
    expect(isComparePath('/NVDA')).toBe(false)
    expect(isComparePath('/disclaimer')).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// compareTickersFromPath
// ---------------------------------------------------------------------------

describe('compareTickersFromPath', () => {
  it('extracts tickers from a compare path', () => {
    expect(compareTickersFromPath('/compare/AAPL/MSFT')).toEqual(['AAPL', 'MSFT'])
    expect(compareTickersFromPath('/compare/NVDA')).toEqual(['NVDA'])
  })

  it('returns empty array for non-compare paths', () => {
    expect(compareTickersFromPath('/NVDA')).toEqual([])
    expect(compareTickersFromPath('/')).toEqual([])
  })

  it('uppercases decoded tickers', () => {
    expect(compareTickersFromPath('/compare/aapl/msft')).toEqual(['AAPL', 'MSFT'])
  })
})
