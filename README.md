# Options-Implied Price Forecast

> See what the options market is pricing in — interactive forecast charts derived from real options data.

[![License: MIT](https://img.shields.io/badge/license-MIT-green)](LICENSE)

## What It Does

Reads live option chains and derives a **probability distribution** for a stock's or cryptocurrency's future price at a given expiration. It answers:

- What price range does the market expect?
- What is the probability the stock goes up or down?
- Where is options activity concentrated?

It does **not** predict the future — it shows what is already priced into traded options contracts.

### Multi-Expiry Weighted Mode

By default the analysis blends **all option chains expiring up to the selected date**, weighted by proximity:

$$w_i = \frac{1}{\sqrt{DTE_i}}$$

Nearer-term expirations carry more weight because they reflect the market's most current and liquid pricing. The merged implied PDF, expected move, max-pain, put/call ratio, and support/resistance levels all benefit from the broader data.

You can toggle this off in the sidebar to use **only the single selected expiry chain** — useful when you want to isolate a specific expiration's signal.

## Quick Start

```bash
npm install
npm run dev        # local dev server with hot reload
```

Open the URL shown in your terminal (usually `http://localhost:5173`). Enter any US stock ticker (e.g. AAPL, TSLA, SPY) or crypto ticker (BTC, ETH, SOL, XRP, DOGE) and pick an expiration date.

## Deploy

The app runs on **Cloudflare Pages** with a Worker that proxies Yahoo Finance (stocks) and Bybit (crypto options).

```bash
npm run deploy     # builds + deploys via wrangler
```

## Data Sources

- **Stocks / ETFs** — Yahoo Finance (via cookie+crumb auth proxy)
- **Crypto** — Bybit public API for options (BTC, ETH, SOL, XRP, DOGE), Yahoo Finance for price history. Other crypto tickers fall back to Yahoo Finance.

## Methodology

The **Breeden-Litzenberger identity** states that the risk-neutral probability density of the underlying price at expiration is:

$$f(K) = e^{rT} \frac{\partial^2 C}{\partial K^2}$$

where $C(K)$ is the call price at strike $K$, $r$ is the risk-free rate, and $T$ is time to expiration.

In practice:

1. Select OTM puts ($K < S$) and OTM calls ($K \geq S$).
2. Convert OTM puts to equivalent call prices via put-call parity.
3. Fit a smooth cubic spline to the combined call-price curve.
4. Take the second derivative analytically and normalise to get a proper density.

When **multi-expiry weighting** is enabled (the default), steps 1–4 are repeated for every available chain up to the selected date. Each resulting PDF is resampled onto a common strike grid and blended using inverse-square-root-of-DTE weights. The same weighting is applied to expected move, max-pain, and put/call ratio. Support/resistance levels pool open interest from all contributing chains.

## Limitations

- Uses **risk-neutral** probabilities, not real-world forecasts.
- Yahoo Finance data can be delayed or stale for illiquid options.
- Wide bid-ask spreads on far OTM options add noise to the distribution tails.
- The analysis is a snapshot — it changes as options prices update.
- Crypto options via Bybit cover BTC, ETH, SOL, XRP, and DOGE. Other crypto tickers fall back to Yahoo Finance which may have limited options data.

## Contributing

Bug fixes, features, and improvements are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE)
