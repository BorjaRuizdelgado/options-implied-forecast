import { describe, it, expect } from 'vitest'
import {
  isCrypto,
  isBybitSupported,
  isDeribitSupported,
  normalizeTicker,
  stripCryptoSuffix,
} from '../tickers.js'

// ---------------------------------------------------------------------------
// stripCryptoSuffix
// ---------------------------------------------------------------------------

describe('stripCryptoSuffix', () => {
  it('strips -USD suffix', () => {
    expect(stripCryptoSuffix('BTC-USD')).toBe('BTC')
    expect(stripCryptoSuffix('ETH-USD')).toBe('ETH')
  })

  it('strips -USDT suffix', () => {
    expect(stripCryptoSuffix('BTC-USDT')).toBe('BTC')
  })

  it('strips plain USD suffix', () => {
    expect(stripCryptoSuffix('BTCUSD')).toBe('BTC')
  })

  it('leaves stock tickers unchanged', () => {
    expect(stripCryptoSuffix('AAPL')).toBe('AAPL')
    expect(stripCryptoSuffix('MSFT')).toBe('MSFT')
  })

  it('is case-insensitive', () => {
    expect(stripCryptoSuffix('btc-usd')).toBe('BTC')
  })
})

// ---------------------------------------------------------------------------
// isCrypto
// ---------------------------------------------------------------------------

describe('isCrypto', () => {
  it('returns true for known crypto tickers', () => {
    expect(isCrypto('BTC')).toBe(true)
    expect(isCrypto('ETH')).toBe(true)
    expect(isCrypto('SOL')).toBe(true)
    expect(isCrypto('DOGE')).toBe(true)
    expect(isCrypto('AVAX')).toBe(true)
    expect(isCrypto('MATIC')).toBe(true)
  })

  it('returns true for suffixed forms', () => {
    expect(isCrypto('BTC-USD')).toBe(true)
    expect(isCrypto('ETH-USDT')).toBe(true)
  })

  it('returns false for stocks', () => {
    expect(isCrypto('AAPL')).toBe(false)
    expect(isCrypto('TSLA')).toBe(false)
    expect(isCrypto('SPY')).toBe(false)
    expect(isCrypto('COIN')).toBe(false)
  })

  it('is case-insensitive', () => {
    expect(isCrypto('btc')).toBe(true)
    expect(isCrypto('eth-usd')).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// isBybitSupported
// ---------------------------------------------------------------------------

describe('isBybitSupported', () => {
  it('returns true for Bybit-listed coins', () => {
    expect(isBybitSupported('BTC')).toBe(true)
    expect(isBybitSupported('ETH')).toBe(true)
    expect(isBybitSupported('SOL')).toBe(true)
    expect(isBybitSupported('XRP')).toBe(true)
    expect(isBybitSupported('DOGE')).toBe(true)
  })

  it('returns false for coins not on Bybit options', () => {
    expect(isBybitSupported('AVAX')).toBe(false)
    expect(isBybitSupported('MATIC')).toBe(false)
    expect(isBybitSupported('ADA')).toBe(false)
  })

  it('returns false for stocks', () => {
    expect(isBybitSupported('AAPL')).toBe(false)
  })

  it('works with suffixed tickers', () => {
    expect(isBybitSupported('BTC-USD')).toBe(true)
    expect(isBybitSupported('ETH-USDT')).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// isDeribitSupported
// ---------------------------------------------------------------------------

describe('isDeribitSupported', () => {
  it('returns true for Deribit-listed coins', () => {
    expect(isDeribitSupported('BTC')).toBe(true)
    expect(isDeribitSupported('ETH')).toBe(true)
    expect(isDeribitSupported('SOL')).toBe(true)
  })

  it('returns false for coins not on Deribit options', () => {
    expect(isDeribitSupported('XRP')).toBe(false)
    expect(isDeribitSupported('DOGE')).toBe(false)
    expect(isDeribitSupported('AVAX')).toBe(false)
    expect(isDeribitSupported('ADA')).toBe(false)
  })

  it('returns false for stocks', () => {
    expect(isDeribitSupported('AAPL')).toBe(false)
  })

  it('works with suffixed tickers', () => {
    expect(isDeribitSupported('BTC-USD')).toBe(true)
    expect(isDeribitSupported('ETH-USDT')).toBe(true)
    expect(isDeribitSupported('XRP-USD')).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// normalizeTicker
// ---------------------------------------------------------------------------

describe('normalizeTicker', () => {
  it('uppercases stock tickers', () => {
    expect(normalizeTicker('aapl')).toBe('AAPL')
    expect(normalizeTicker('msft')).toBe('MSFT')
  })

  it('strips suffix and returns base for crypto', () => {
    expect(normalizeTicker('BTC-USD')).toBe('BTC')
    expect(normalizeTicker('eth-usd')).toBe('ETH')
    expect(normalizeTicker('SOL')).toBe('SOL')
  })

  it('handles mixed-case crypto with suffix', () => {
    expect(normalizeTicker('btcUSD')).toBe('BTC')
  })
})
