import { describe, it, expect } from 'vitest'
import {
  scoreHighBetter,
  scoreLowBetter,
  scoreRangeBetter,
  averageScore,
  softenScore,
  labelFromScore,
  opportunityLabel,
  valuationLabel,
  metricSentiment,
  buildFundamentalsScore,
} from '../scoring.js'

// ---------------------------------------------------------------------------
// scoreHighBetter
// ---------------------------------------------------------------------------

describe('scoreHighBetter', () => {
  it('returns null for non-finite values', () => {
    expect(scoreHighBetter(NaN, 0, 100)).toBeNull()
    expect(scoreHighBetter(Infinity, 0, 100)).toBeNull()
    expect(scoreHighBetter(-Infinity, 0, 100)).toBeNull()
    expect(scoreHighBetter(undefined, 0, 100)).toBeNull()
    expect(scoreHighBetter(null, 0, 100)).toBeNull()
  })

  it('returns 0 at or below bad threshold', () => {
    expect(scoreHighBetter(10, 10, 50)).toBe(0)
    expect(scoreHighBetter(5, 10, 50)).toBe(0)
  })

  it('returns 100 at or above good threshold', () => {
    expect(scoreHighBetter(50, 10, 50)).toBe(100)
    expect(scoreHighBetter(80, 10, 50)).toBe(100)
  })

  it('returns linear value between bad and good', () => {
    // midpoint of 10..50 -> 50
    expect(scoreHighBetter(30, 10, 50)).toBe(50)
    // quarter way -> 25
    expect(scoreHighBetter(20, 10, 50)).toBe(25)
  })
})

// ---------------------------------------------------------------------------
// scoreLowBetter
// ---------------------------------------------------------------------------

describe('scoreLowBetter', () => {
  it('returns null for non-finite values', () => {
    expect(scoreLowBetter(NaN, 10, 50)).toBeNull()
    expect(scoreLowBetter(Infinity, 10, 50)).toBeNull()
    expect(scoreLowBetter(undefined, 10, 50)).toBeNull()
  })

  it('returns 100 at or below good threshold', () => {
    expect(scoreLowBetter(10, 10, 50)).toBe(100)
    expect(scoreLowBetter(5, 10, 50)).toBe(100)
  })

  it('returns 0 at or above bad threshold', () => {
    expect(scoreLowBetter(50, 10, 50)).toBe(0)
    expect(scoreLowBetter(60, 10, 50)).toBe(0)
  })

  it('returns linear value between good and bad', () => {
    // midpoint of 10..50 -> 50
    expect(scoreLowBetter(30, 10, 50)).toBe(50)
  })
})

// ---------------------------------------------------------------------------
// scoreRangeBetter
// ---------------------------------------------------------------------------

describe('scoreRangeBetter', () => {
  // Range: lowBad=0, lowGood=20, highGood=80, highBad=100
  it('returns 100 inside ideal range', () => {
    expect(scoreRangeBetter(50, 20, 80, 0, 100)).toBe(100)
    expect(scoreRangeBetter(20, 20, 80, 0, 100)).toBe(100)
    expect(scoreRangeBetter(80, 20, 80, 0, 100)).toBe(100)
  })

  it('returns 0 outside extreme bounds', () => {
    expect(scoreRangeBetter(0, 20, 80, 0, 100)).toBe(0)
    expect(scoreRangeBetter(-5, 20, 80, 0, 100)).toBe(0)
    expect(scoreRangeBetter(100, 20, 80, 0, 100)).toBe(0)
    expect(scoreRangeBetter(110, 20, 80, 0, 100)).toBe(0)
  })

  it('returns linear value between boundaries', () => {
    // midpoint between lowBad=0 and lowGood=20 -> 10 -> 50%
    expect(scoreRangeBetter(10, 20, 80, 0, 100)).toBe(50)
    // midpoint between highGood=80 and highBad=100 -> 90 -> 50%
    expect(scoreRangeBetter(90, 20, 80, 0, 100)).toBe(50)
  })

  it('returns null for non-finite', () => {
    expect(scoreRangeBetter(NaN, 20, 80, 0, 100)).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// averageScore
// ---------------------------------------------------------------------------

describe('averageScore', () => {
  it('handles mixed null/number arrays', () => {
    expect(averageScore([80, null, 60])).toBe(70)
    expect(averageScore([100, null, null, 50])).toBe(75)
  })

  it('returns null for all-null array', () => {
    expect(averageScore([null, null, null])).toBeNull()
  })

  it('returns null for empty array', () => {
    expect(averageScore([])).toBeNull()
  })

  it('returns value for single-element array', () => {
    expect(averageScore([42])).toBe(42)
  })

  it('filters out NaN and Infinity', () => {
    expect(averageScore([NaN, 60, Infinity])).toBe(60)
  })
})

// ---------------------------------------------------------------------------
// softenScore
// ---------------------------------------------------------------------------

describe('softenScore', () => {
  it('compresses 0 to floor (8)', () => {
    expect(softenScore(0)).toBe(8)
  })

  it('compresses 100 to ceiling (92)', () => {
    expect(softenScore(100)).toBe(92)
  })

  it('compresses 50 to midpoint of [8, 92]', () => {
    expect(softenScore(50)).toBe(50)
  })

  it('output is always within [8, 92] for valid input', () => {
    for (const v of [0, 10, 25, 50, 75, 90, 100]) {
      const s = softenScore(v)
      expect(s).toBeGreaterThanOrEqual(8)
      expect(s).toBeLessThanOrEqual(92)
    }
  })

  it('returns null for non-finite input', () => {
    expect(softenScore(NaN)).toBeNull()
    expect(softenScore(Infinity)).toBeNull()
    expect(softenScore(-Infinity)).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// labelFromScore
// ---------------------------------------------------------------------------

describe('labelFromScore', () => {
  it('returns "Weak" for score < 35', () => {
    expect(labelFromScore(0)).toBe('Weak')
    expect(labelFromScore(34)).toBe('Weak')
    expect(labelFromScore(34.9)).toBe('Weak')
  })

  it('returns "Mixed" for 35 <= score < 55', () => {
    expect(labelFromScore(35)).toBe('Mixed')
    expect(labelFromScore(45)).toBe('Mixed')
    expect(labelFromScore(54.9)).toBe('Mixed')
  })

  it('returns "Good" for 55 <= score < 75', () => {
    expect(labelFromScore(55)).toBe('Good')
    expect(labelFromScore(65)).toBe('Good')
    expect(labelFromScore(74.9)).toBe('Good')
  })

  it('returns "Strong" for score >= 75', () => {
    expect(labelFromScore(75)).toBe('Strong')
    expect(labelFromScore(100)).toBe('Strong')
  })

  it('returns "Unavailable" for non-finite', () => {
    expect(labelFromScore(NaN)).toBe('Unavailable')
    expect(labelFromScore(Infinity)).toBe('Unavailable')
    expect(labelFromScore(null)).toBe('Unavailable')
    expect(labelFromScore(undefined)).toBe('Unavailable')
  })
})

// ---------------------------------------------------------------------------
// No NaN in any output
// ---------------------------------------------------------------------------

describe('no NaN propagation', () => {
  it('scoring functions never return NaN', () => {
    const inputs = [0, 50, 100, -10, 200, NaN, null, undefined, Infinity, -Infinity]
    for (const v of inputs) {
      const sh = scoreHighBetter(v, 10, 90)
      const sl = scoreLowBetter(v, 10, 90)
      const sr = scoreRangeBetter(v, 20, 80, 0, 100)
      const sf = softenScore(v)

      for (const result of [sh, sl, sr, sf]) {
        if (result !== null) {
          expect(Number.isNaN(result)).toBe(false)
        }
      }
    }
  })

  it('averageScore never returns NaN', () => {
    expect(Number.isNaN(averageScore([NaN, NaN]))).toBe(false)
    const result = averageScore([NaN, NaN])
    expect(result).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// opportunityLabel
// ---------------------------------------------------------------------------

describe('opportunityLabel', () => {
  it('returns Unattractive for score < 35', () => {
    expect(opportunityLabel(10)).toBe('Unattractive')
    expect(opportunityLabel(34.9)).toBe('Unattractive')
  })
  it('returns Watchlist for 35-54', () => {
    expect(opportunityLabel(35)).toBe('Watchlist')
    expect(opportunityLabel(54.9)).toBe('Watchlist')
  })
  it('returns Interesting for 55-74', () => {
    expect(opportunityLabel(55)).toBe('Interesting')
    expect(opportunityLabel(74.9)).toBe('Interesting')
  })
  it('returns High-conviction for >= 75', () => {
    expect(opportunityLabel(75)).toBe('High-conviction')
    expect(opportunityLabel(100)).toBe('High-conviction')
  })
  it('returns Unavailable for non-finite', () => {
    expect(opportunityLabel(null)).toBe('Unavailable')
    expect(opportunityLabel(NaN)).toBe('Unavailable')
    expect(opportunityLabel(undefined)).toBe('Unavailable')
  })
})

// ---------------------------------------------------------------------------
// valuationLabel
// ---------------------------------------------------------------------------

describe('valuationLabel', () => {
  it('returns Expensive for score < 35', () => {
    expect(valuationLabel(20)).toBe('Expensive')
  })
  it('returns Fair for 35-59', () => {
    expect(valuationLabel(50)).toBe('Fair')
  })
  it('returns Undervalued for >= 60', () => {
    expect(valuationLabel(60)).toBe('Undervalued')
    expect(valuationLabel(95)).toBe('Undervalued')
  })
  it('returns Unavailable for non-finite', () => {
    expect(valuationLabel(null)).toBe('Unavailable')
    expect(valuationLabel(NaN)).toBe('Unavailable')
  })
})

// ---------------------------------------------------------------------------
// metricSentiment
// ---------------------------------------------------------------------------

describe('metricSentiment', () => {
  it('returns null for null/NaN values', () => {
    expect(metricSentiment('trailingPE', null)).toBeNull()
    expect(metricSentiment('trailingPE', NaN)).toBeNull()
    expect(metricSentiment('trailingPE', 'hello')).toBeNull()
  })

  it('scores PE correctly', () => {
    expect(metricSentiment('trailingPE', 12)).toBe('positive')
    expect(metricSentiment('trailingPE', 35)).toBe('negative')
    expect(metricSentiment('trailingPE', 20)).toBeNull()
    expect(metricSentiment('forwardPE', 12)).toBe('positive')
  })

  it('scores cashflow/income positive when > 0', () => {
    expect(metricSentiment('freeCashflow', 1e9)).toBe('positive')
    expect(metricSentiment('freeCashflow', -1e9)).toBe('negative')
    expect(metricSentiment('netIncome', 500)).toBe('positive')
  })

  it('scores growth positive when > 0', () => {
    expect(metricSentiment('revenueGrowth', 0.1)).toBe('positive')
    expect(metricSentiment('earningsGrowth', -0.05)).toBe('negative')
  })

  it('scores debtToEquity low is better', () => {
    expect(metricSentiment('debtToEquity', 40)).toBe('positive')
    expect(metricSentiment('debtToEquity', 200)).toBe('negative')
    expect(metricSentiment('debtToEquity', 100)).toBeNull()
  })

  it('returns null for unknown keys', () => {
    expect(metricSentiment('unknownMetric', 42)).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// buildFundamentalsScore
// ---------------------------------------------------------------------------

describe('buildFundamentalsScore', () => {
  it('returns hasData:false when fewer than 3 valid metrics', () => {
    const result = buildFundamentalsScore({})
    expect(result.hasData).toBe(false)
    expect(result.score).toBeNull()
    expect(result.label).toBe('Unavailable')
  })

  it('returns hasData:true with enough fundamentals', () => {
    const f = {
      forwardPE: 18,
      profitMargins: 0.2,
      returnOnEquity: 0.2,
      debtToEquity: 40,
      currentRatio: 2.0,
    }
    const result = buildFundamentalsScore(f)
    expect(result.hasData).toBe(true)
    expect(typeof result.score).toBe('number')
    expect(['Strong', 'Mixed', 'Weak']).toContain(result.label)
    expect(['positive', 'negative', 'neutral']).toContain(result.tone)
  })

  it('score is finite and within softened range', () => {
    const f = {
      forwardPE: 18, profitMargins: 0.2, returnOnEquity: 0.2,
      debtToEquity: 40, currentRatio: 2.0, beta: 1.0,
    }
    const { score } = buildFundamentalsScore(f)
    expect(Number.isFinite(score)).toBe(true)
    expect(score).toBeGreaterThan(0)
    expect(score).toBeLessThanOrEqual(100)
  })
})
