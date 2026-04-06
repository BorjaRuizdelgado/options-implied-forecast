/**
 * /api/search — ticker autocomplete via Yahoo Finance search API.
 */

import { fetchYF } from '../yahoo.js'
import { cachedJsonResp, logError } from '../utils.js'

/**
 * Search Yahoo Finance for tickers matching a query string.
 * Returns up to 8 results with symbol, name, type, and exchange.
 */
export async function handleSearch(query) {
  try {
    const data = await fetchYF(
      `/v1/finance/search?q=${encodeURIComponent(query)}&quotesCount=8&newsCount=0&listsCount=0&enableFuzzyQuery=true`,
    )
    const quotes = (data?.quotes || [])
      .filter((q) => q.symbol && q.quoteType !== 'OPTION' && q.quoteType !== 'FUTURE')
      .slice(0, 8)
      .map((q) => ({
        symbol: q.symbol,
        name: q.shortname || q.longname || q.symbol,
        type: q.quoteType || 'EQUITY',
        exchange: q.exchDisp || q.exchange || '',
      }))

    return cachedJsonResp({ results: quotes }, 300)
  } catch (err) {
    logError('/api/search', err, { ticker: query })
    return cachedJsonResp({ results: [] }, 60)
  }
}
