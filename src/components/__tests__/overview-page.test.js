import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

vi.mock('../EarningsCalendar.jsx', () => ({ default: () => null }))
vi.mock('../ScenarioCard.jsx', () => ({ default: () => null }))
vi.mock('../ReasonList.jsx', () => ({ default: () => null }))

import OverviewPage, { buildOverviewScoreReasons } from '../OverviewPage.jsx'

describe('buildOverviewScoreReasons', () => {
  it('includes a technical explanation when the technical score is shown', () => {
    const reasons = buildOverviewScoreReasons({
      opportunity: { hasData: true, score: 71 },
      valuation: { hasData: true, score: 66, reasons: [{ tone: 'positive', detail: 'Cheap vs peers.' }] },
      quality: { hasData: true, score: 62, reasons: [{ tone: 'positive', detail: 'Margins remain solid.' }] },
      risk: { hasData: true, score: 54, reasons: [{ tone: 'neutral', detail: 'Balance sheet is manageable.' }] },
      technicals: {
        hasData: true,
        score: 68,
        reasons: [{ tone: 'positive', detail: 'MACD crossed above signal line recently.' }],
      },
      options: { score: 57, reasons: [{ tone: 'neutral', detail: 'Expected move is moderate.' }] },
    })

    expect(reasons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          title: 'Technicals Score',
          detail: 'MACD crossed above signal line recently.',
        }),
      ]),
    )
    expect(reasons).toHaveLength(6)
  })
})

describe('OverviewPage', () => {
  it('renders score-card tooltips in the overview score grid', () => {
    const html = renderToStaticMarkup(
      React.createElement(OverviewPage, {
        ticker: 'NVDA',
        spot: 100,
        fundamentals: { longName: 'NVIDIA', currency: 'USD', exchange: 'NASDAQ' },
        research: {
          opportunity: { hasData: true, score: 72, label: 'Interesting' },
          valuation: { hasData: true, score: 64, label: 'Fair', reasons: [] },
          quality: { hasData: true, score: 70, label: 'Good', reasons: [] },
          risk: { hasData: true, score: 52, label: 'Mixed', safetyScore: 52, reasons: [] },
          technicals: { hasData: true, score: 68, label: 'Good', reasons: [] },
          options: { score: 59, label: 'Balanced', reasons: [] },
          signals: [],
        },
        analysis: {},
      }),
    )

    expect(html).toContain('Composite Scores')
    expect(html).toContain('Technicals')
    expect((html.match(/\?/g) || []).length).toBeGreaterThanOrEqual(6)
  })
})
