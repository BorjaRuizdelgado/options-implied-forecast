/**
 * Suggest options strategies that align with the entry setup analysis.
 *
 * Strikes are chosen from the actual chain near the entry/target/stop levels
 * so that the strategy and the entry setup tell a consistent story.
 */

function findStrikeNear(chain, price) {
  if (!chain?.length || !price) return null
  let best = null
  let bestDist = Infinity
  for (const opt of chain) {
    const dist = Math.abs(opt.strike - price)
    if (dist < bestDist && opt.mid > 0) {
      bestDist = dist
      best = opt
    }
  }
  return best
}

function fmt(n) {
  return Number(n).toFixed(2)
}

export function suggestStrategies(analysis, _research) {
  if (!analysis?.ivData?.length || !analysis?.spot) return []

  const spot = analysis.spot
  const entry = analysis.entry
  if (!entry) return []

  const puts = analysis.puts || []
  const calls = analysis.calls || []
  const bias = entry.bias || 'neutral'

  // IV stats
  const ivValues = analysis.ivData.filter((d) => d.iv > 0).map((d) => d.iv)
  const avgIV = ivValues.length ? ivValues.reduce((a, b) => a + b, 0) / ivValues.length : 0
  const ivPct = (avgIV * 100).toFixed(0)
  const ivLabel = avgIV > 0.4 ? 'elevated' : avgIV > 0.25 ? 'moderate' : 'low'

  const strategies = []

  // --- Bearish ---
  if (bias === 'bearish') {
    // Bear Put Spread: buy put near entry (resistance), sell put near target (support)
    const longPut = findStrikeNear(puts, entry.entry)
    const shortPut = findStrikeNear(puts, entry.target)
    if (longPut && shortPut && longPut.strike > shortPut.strike) {
      const cost = Math.max(0, longPut.mid - shortPut.mid)
      const width = longPut.strike - shortPut.strike
      const maxProfit = width - cost
      strategies.push({
        name: 'Bear Put Spread',
        description:
          `Buy the $${longPut.strike} put near resistance, sell the $${shortPut.strike} put near target support. ` +
          `Profits if the stock falls from the entry zone toward the target.`,
        legs: [
          { type: 'Put', strike: longPut.strike, action: 'Buy' },
          { type: 'Put', strike: shortPut.strike, action: 'Sell' },
        ],
        premium: `$${fmt(cost)} debit`,
        maxRisk: `$${fmt(cost)} per share (premium paid)`,
        rationale:
          `Entry setup is bearish — entry $${fmt(entry.entry)}, target $${fmt(entry.target)}, stop $${fmt(entry.stop)}. ` +
          `Spread width $${fmt(width)} captures the move to target. ` +
          `Max profit $${fmt(maxProfit)} if stock reaches $${shortPut.strike} by expiry. IV is ${ivLabel} (${ivPct}%).`,
      })
    }

    // Protective Put: hedge existing longs at target/support level
    const protPut = findStrikeNear(puts, entry.target)
    if (protPut) {
      strategies.push({
        name: 'Protective Put',
        description:
          `Buy the $${protPut.strike} put near the target support level to hedge an existing long position.`,
        legs: [{ type: 'Put', strike: protPut.strike, action: 'Buy' }],
        premium: `$${fmt(protPut.mid)} debit`,
        maxRisk: 'Limited to premium paid',
        rationale:
          `Bearish setup targets $${fmt(entry.target)}. This put protects below that level. ` +
          `If you hold shares, the put offsets losses below $${protPut.strike}. IV is ${ivLabel} (${ivPct}%).`,
      })
    }
  }

  // --- Bullish ---
  if (bias === 'bullish') {
    // Bull Call Spread: buy call near entry (support), sell call near target (resistance)
    const longCall = findStrikeNear(calls, entry.entry)
    const shortCall = findStrikeNear(calls, entry.target)
    if (longCall && shortCall && shortCall.strike > longCall.strike) {
      const cost = Math.max(0, longCall.mid - shortCall.mid)
      const width = shortCall.strike - longCall.strike
      const maxProfit = width - cost
      strategies.push({
        name: 'Bull Call Spread',
        description:
          `Buy the $${longCall.strike} call near support, sell the $${shortCall.strike} call near target resistance. ` +
          `Profits if the stock rises from the entry zone toward the target.`,
        legs: [
          { type: 'Call', strike: longCall.strike, action: 'Buy' },
          { type: 'Call', strike: shortCall.strike, action: 'Sell' },
        ],
        premium: `$${fmt(cost)} debit`,
        maxRisk: `$${fmt(cost)} per share (premium paid)`,
        rationale:
          `Entry setup is bullish — entry $${fmt(entry.entry)}, target $${fmt(entry.target)}, stop $${fmt(entry.stop)}. ` +
          `Spread width $${fmt(width)} captures the move to target. ` +
          `Max profit $${fmt(maxProfit)} if stock reaches $${shortCall.strike} by expiry. IV is ${ivLabel} (${ivPct}%).`,
      })
    }

    // Cash-Secured Put: sell put near entry/support, willing to own at that level
    const cspPut = findStrikeNear(puts, entry.entry)
    if (cspPut) {
      strategies.push({
        name: 'Cash-Secured Put',
        description:
          `Sell the $${cspPut.strike} put near the entry support level. Collect premium or buy shares at a discount if assigned.`,
        legs: [{ type: 'Put', strike: cspPut.strike, action: 'Sell' }],
        premium: `$${fmt(cspPut.mid)} credit`,
        maxRisk: `$${fmt(cspPut.strike - cspPut.mid)} per share if assigned`,
        rationale:
          `Bullish setup — willing to own near support $${fmt(entry.entry)}. ` +
          `If the stock stays above $${cspPut.strike} you keep the premium. ` +
          `Stop level is $${fmt(entry.stop)}, below which the thesis breaks. IV is ${ivLabel} (${ivPct}%).`,
      })
    }
  }

  // --- Neutral ---
  if (bias === 'neutral') {
    // Iron Condor: sell put at support, sell call at resistance
    const lvls = analysis.sr?.levels || []
    const nearSup = lvls.filter((l) => l.price < spot).sort((a, b) => b.price - a.price)[0]
    const nearRes = lvls.filter((l) => l.price > spot).sort((a, b) => a.price - b.price)[0]
    const supPrice = nearSup?.price || entry.stop
    const resPrice = nearRes?.price || entry.target

    const shortPut = findStrikeNear(puts, supPrice)
    const shortCall = findStrikeNear(calls, resPrice)
    if (shortPut && shortCall && shortCall.strike > shortPut.strike) {
      const premium = shortPut.mid + shortCall.mid
      strategies.push({
        name: 'Iron Condor',
        description:
          `Sell the $${shortPut.strike} put at support and the $${shortCall.strike} call at resistance, buy further OTM wings. ` +
          `Profits if the stock stays between support and resistance.`,
        legs: [
          { type: 'Put', strike: shortPut.strike, action: 'Sell' },
          { type: 'Call', strike: shortCall.strike, action: 'Sell' },
        ],
        premium: `$${fmt(premium)} credit`,
        maxRisk: 'Width of wings minus premium',
        rationale:
          `Neutral setup — no strong directional view. Support $${fmt(supPrice)}, resistance $${fmt(resPrice)}. ` +
          `Stock expected to stay in range. IV is ${ivLabel} (${ivPct}%), favoring premium selling.`,
      })
    }

    // Covered Call at resistance
    const ccCall = findStrikeNear(calls, resPrice)
    if (ccCall) {
      strategies.push({
        name: 'Covered Call',
        description:
          `Sell the $${ccCall.strike} call near resistance to generate income on existing shares.`,
        legs: [{ type: 'Call', strike: ccCall.strike, action: 'Sell' }],
        premium: `$${fmt(ccCall.mid)} credit`,
        maxRisk: `Capped upside above $${ccCall.strike}`,
        rationale:
          `Neutral bias — limited upside expected past resistance $${fmt(resPrice)}. ` +
          `Collect premium while holding. IV is ${ivLabel} (${ivPct}%).`,
      })
    }
  }

  return strategies
}
