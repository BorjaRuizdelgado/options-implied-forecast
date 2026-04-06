import { describe, it, expect } from 'vitest'
import { COLLECTIONS } from '../screener.js'

// ---------------------------------------------------------------------------
// COLLECTIONS — basic structure
// ---------------------------------------------------------------------------

describe('COLLECTIONS', () => {
  it('has at least 5 collections', () => {
    expect(COLLECTIONS.length).toBeGreaterThanOrEqual(5)
  })

  it('every collection has required fields', () => {
    for (const c of COLLECTIONS) {
      expect(c).toHaveProperty('id')
      expect(c).toHaveProperty('label')
      expect(c).toHaveProperty('tagline')
      expect(c).toHaveProperty('icon')
      expect(typeof c.filter).toBe('function')
    }
  })

  it('has unique ids', () => {
    const ids = COLLECTIONS.map((c) => c.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('includes an "all" collection that accepts everything', () => {
    const all = COLLECTIONS.find((c) => c.id === 'all')
    expect(all).toBeDefined()
    expect(all.filter({})).toBe(true)
    expect(all.filter({ marketCap: 0 })).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// smallcap collection (replaced the old midcap)
// ---------------------------------------------------------------------------

describe('smallcap collection', () => {
  const smallcap = COLLECTIONS.find((c) => c.id === 'smallcap')

  it('exists and is named Small Caps', () => {
    expect(smallcap).toBeDefined()
    expect(smallcap.label).toBe('Small Caps')
  })

  it('accepts stocks with market cap between 100M and 10B', () => {
    expect(smallcap.filter({ marketCap: 500e6 })).toBe(true)
    expect(smallcap.filter({ marketCap: 5e9 })).toBe(true)
    expect(smallcap.filter({ marketCap: 100e6 })).toBe(true)
  })

  it('rejects stocks outside the range', () => {
    expect(smallcap.filter({ marketCap: 50e6 })).toBe(false)
    expect(smallcap.filter({ marketCap: 10e9 })).toBe(false)
    expect(smallcap.filter({ marketCap: 200e9 })).toBe(false)
  })

  it('rejects stocks with null market cap', () => {
    expect(smallcap.filter({ marketCap: null })).toBe(false)
    expect(smallcap.filter({})).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// largecap collection
// ---------------------------------------------------------------------------

describe('largecap collection', () => {
  const large = COLLECTIONS.find((c) => c.id === 'largecap')

  it('exists', () => {
    expect(large).toBeDefined()
  })

  it('accepts stocks with market cap >= 200B', () => {
    expect(large.filter({ marketCap: 200e9 })).toBe(true)
    expect(large.filter({ marketCap: 3e12 })).toBe(true)
  })

  it('rejects stocks below 200B', () => {
    expect(large.filter({ marketCap: 100e9 })).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// value collection
// ---------------------------------------------------------------------------

describe('value collection', () => {
  const value = COLLECTIONS.find((c) => c.id === 'value')

  it('exists', () => {
    expect(value).toBeDefined()
  })

  it('accepts stocks with low P/E and positive EPS', () => {
    expect(value.filter({ trailingPE: 10, eps: 5 })).toBe(true)
  })

  it('rejects stocks with high P/E', () => {
    expect(value.filter({ trailingPE: 20, eps: 5 })).toBe(false)
  })

  it('rejects stocks with negative eps', () => {
    expect(value.filter({ trailingPE: 10, eps: -1 })).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// etf collection
// ---------------------------------------------------------------------------

describe('etf collection', () => {
  const etf = COLLECTIONS.find((c) => c.id === 'etf')

  it('exists', () => {
    expect(etf).toBeDefined()
  })

  it('accepts ETF-type stocks', () => {
    expect(etf.filter({ quoteType: 'ETF' })).toBe(true)
  })

  it('rejects non-ETF stocks', () => {
    expect(etf.filter({ quoteType: 'EQUITY' })).toBe(false)
    expect(etf.filter({})).toBe(false)
  })
})
