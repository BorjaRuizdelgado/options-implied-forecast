"""
analysis.py – Core maths: Breeden-Litzenberger implied distribution,
expected move, and summary statistics.
"""

import numpy as np
import pandas as pd
from scipy.interpolate import CubicSpline


# ======================================================================
# Breeden-Litzenberger implied probability distribution
# ======================================================================

def implied_distribution(
    calls: pd.DataFrame,
    spot: float,
    r: float,
    T: float,
    n_points: int = 500,
    strike_range: tuple[float, float] | None = None,
    puts: pd.DataFrame | None = None,
) -> dict:
    """
    Compute the risk-neutral probability density from option prices
    using the Breeden-Litzenberger identity:

        f(K) = e^{rT}  d²C / dK²

    Uses **OTM options** for best results: OTM puts (K < spot) are
    converted to equivalent call prices via put-call parity, then
    merged with OTM calls (K ≥ spot) to build a clean call-price
    curve across all strikes.

    Parameters
    ----------
    calls : DataFrame with 'strike' and 'mid' columns.
    spot  : current underlying price.
    r     : annualised risk-free rate.
    T     : time to expiry in years.
    n_points : resolution of the output grid.
    strike_range : (lo, hi) strike bounds; defaults to ±40 % of spot.
    puts  : DataFrame with 'strike' and 'mid' columns (optional but
            strongly recommended for accuracy).

    Returns
    -------
    dict with keys:
        strikes  – 1-D array of strike prices
        pdf      – probability density (same length)
        cdf      – cumulative probability
        mean     – expected price
        median   – 50th-percentile price
        std      – standard deviation of distribution
        skew     – skewness (negative = left-leaning)
    """

    discount = np.exp(-r * T)
    forward = spot / discount  # forward price

    # --- Build a synthetic call-price curve from OTM options -----------
    #   • K ≥ spot  →  use OTM call mid-prices directly
    #   • K < spot  →  convert OTM put prices via put-call parity:
    #                   C(K) = P(K) + S - K·e^{-rT}
    rows: list[tuple[float, float]] = []

    # OTM calls (strike ≥ spot)
    otm_calls = calls[calls["strike"] >= spot * 0.98].copy()
    for _, row in otm_calls.iterrows():
        if row["mid"] > 0:
            rows.append((float(row["strike"]), float(row["mid"])))

    # OTM puts → synthetic call prices (strike < spot)
    if puts is not None:
        otm_puts = puts[puts["strike"] <= spot * 1.02].copy()
        for _, row in otm_puts.iterrows():
            if row["mid"] > 0:
                k = float(row["strike"])
                # Put-call parity: C = P + S - K·e^{-rT}
                synthetic_c = float(row["mid"]) + spot - k * discount
                if synthetic_c > 0:
                    rows.append((k, synthetic_c))

    if not rows:
        raise ValueError("No usable option prices found")

    # Deduplicate strikes (prefer OTM data when overlapping)
    strike_price = {}
    for k, p in rows:
        if k not in strike_price or (k >= spot and p > 0):
            strike_price[k] = p
    strikes_sorted = sorted(strike_price.keys())
    strikes_raw = np.array(strikes_sorted)
    prices_raw = np.array([strike_price[k] for k in strikes_sorted])

    # Require at least 6 strikes for a cubic spline
    if len(strikes_raw) < 6:
        raise ValueError("Too few liquid strikes to build a distribution")

    # --- Ensure monotonically decreasing call prices -------------------
    prices_raw = _enforce_monotone_decreasing(strikes_raw, prices_raw)

    # --- Build smooth spline ------------------------------------------
    spline = CubicSpline(strikes_raw, prices_raw, bc_type="natural")

    if strike_range:
        lo, hi = strike_range
    else:
        lo = max(strikes_raw[0], spot * 0.60)
        hi = min(strikes_raw[-1], spot * 1.40)
    K = np.linspace(lo, hi, n_points)

    # --- Second derivative → PDF --------------------------------------
    pdf = (1.0 / discount) * spline(K, 2)  # e^{rT} · C''(K)
    pdf = np.maximum(pdf, 0.0)

    # Normalise
    total = np.trapezoid(pdf, K)
    if total > 0:
        pdf /= total

    # --- CDF ----------------------------------------------------------
    cdf = np.cumsum(pdf) * (K[1] - K[0])
    cdf = np.clip(cdf, 0, 1)

    # --- Summary statistics -------------------------------------------
    mean = np.trapezoid(K * pdf, K)
    var = np.trapezoid((K - mean) ** 2 * pdf, K)
    std = np.sqrt(max(var, 0))
    skew = np.trapezoid(((K - mean) / std) ** 3 * pdf, K) if std > 0 else 0.0

    # Median: K where CDF ≈ 0.5
    idx_median = np.searchsorted(cdf, 0.5)
    idx_median = min(idx_median, len(K) - 1)
    median = K[idx_median]

    return {
        "strikes": K,
        "pdf": pdf,
        "cdf": cdf,
        "mean": mean,
        "median": median,
        "std": std,
        "skew": skew,
    }


# ======================================================================
# Expected move from ATM straddle
# ======================================================================

def expected_move(calls: pd.DataFrame, puts: pd.DataFrame, spot: float) -> dict:
    """
    Estimate the expected move implied by the at-the-money straddle.

    Returns dict with keys:
        atm_strike, call_price, put_price, straddle, move_abs, move_pct,
        upper, lower
    """
    atm_k = _nearest_strike(calls, spot)

    call_row = calls.loc[calls["strike"] == atm_k].iloc[0]
    put_row = puts.loc[puts["strike"] == atm_k].iloc[0]

    c_price = call_row["mid"]
    p_price = put_row["mid"]
    straddle = c_price + p_price

    # Rule of thumb: expected move ≈ 85 % of straddle price
    move = straddle * 0.85

    return {
        "atm_strike": atm_k,
        "call_price": c_price,
        "put_price": p_price,
        "straddle": straddle,
        "move_abs": move,
        "move_pct": move / spot * 100,
        "upper": spot + move,
        "lower": spot - move,
    }


# ======================================================================
# Probability of finishing above / below spot
# ======================================================================

def bull_bear_probabilities(dist: dict, spot: float) -> dict:
    """
    From the implied distribution, compute:
        prob_above – probability of finishing above current spot
        prob_below – probability of finishing below current spot
    """
    K = dist["strikes"]
    cdf = dist["cdf"]

    idx = np.searchsorted(K, spot)
    idx = min(idx, len(cdf) - 1)
    prob_below = cdf[idx]
    prob_above = 1.0 - prob_below

    return {"prob_above": prob_above, "prob_below": prob_below}


# ======================================================================
# Percentile price levels
# ======================================================================

def percentile_levels(dist: dict, percentiles: list[float] | None = None) -> dict:
    """
    Return strike prices at the given percentiles of the implied
    distribution.
    """
    if percentiles is None:
        percentiles = [10, 25, 50, 75, 90]

    K = dist["strikes"]
    cdf = dist["cdf"]
    levels = {}
    for p in percentiles:
        idx = np.searchsorted(cdf, p / 100.0)
        idx = min(idx, len(K) - 1)
        levels[p] = K[idx]
    return levels


# ======================================================================
# Max-pain calculation
# ======================================================================

def max_pain(calls: pd.DataFrame, puts: pd.DataFrame) -> float:
    """
    The strike at which the total dollar value of all outstanding
    options expires worthless (i.e. causes maximum pain to holders).
    """
    strikes = sorted(set(calls["strike"]).intersection(set(puts["strike"])))
    if not strikes:
        return np.nan

    pain = []
    for k in strikes:
        c_oi = calls.loc[calls["strike"] == k, "openInterest"].values
        p_oi = puts.loc[puts["strike"] == k, "openInterest"].values
        c_oi = c_oi[0] if len(c_oi) else 0
        p_oi = p_oi[0] if len(p_oi) else 0

        # Total intrinsic value that expires ITM for all other strikes
        total = 0.0
        for s in strikes:
            c_oi_s = calls.loc[calls["strike"] == s, "openInterest"].values
            p_oi_s = puts.loc[puts["strike"] == s, "openInterest"].values
            c_oi_s = c_oi_s[0] if len(c_oi_s) else 0
            p_oi_s = p_oi_s[0] if len(p_oi_s) else 0

            # If underlying settles at k, calls with strike < k are ITM
            if s < k:
                total += (k - s) * c_oi_s
            # Puts with strike > k are ITM
            if s > k:
                total += (s - k) * p_oi_s
        pain.append((k, total))

    # Strike with the minimum total payout
    pain.sort(key=lambda x: x[1])
    return pain[0][0]


# ======================================================================
# IV smile data
# ======================================================================

def iv_smile(calls: pd.DataFrame, puts: pd.DataFrame, spot: float) -> pd.DataFrame:
    """
    Build a tidy DataFrame of strike vs IV for calls and puts,
    useful for plotting the volatility smile.
    """
    rows = []
    for _, row in calls.iterrows():
        if row["impliedVolatility"] > 0:
            rows.append({
                "strike": row["strike"],
                "iv": row["impliedVolatility"],
                "moneyness": row["strike"] / spot,
                "type": "call",
            })
    for _, row in puts.iterrows():
        if row["impliedVolatility"] > 0:
            rows.append({
                "strike": row["strike"],
                "iv": row["impliedVolatility"],
                "moneyness": row["strike"] / spot,
                "type": "put",
            })
    return pd.DataFrame(rows)


# ======================================================================
# Helpers
# ======================================================================

def _nearest_strike(df: pd.DataFrame, target: float) -> float:
    idx = (df["strike"] - target).abs().idxmin()
    return df.loc[idx, "strike"]


def _enforce_monotone_decreasing(strikes, prices):
    """
    Call prices must be non-increasing in strike (no-arbitrage).
    Enforce by walking right-to-left and capping.
    """
    p = prices.copy()
    for i in range(len(p) - 2, -1, -1):
        if p[i] < p[i + 1]:
            p[i] = p[i + 1]
    return p


# ======================================================================
# Support & Resistance levels
# ======================================================================

def support_resistance_levels(
    history: "pd.DataFrame | None",
    calls: pd.DataFrame,
    puts: pd.DataFrame,
    spot: float,
    n_levels: int = 6,
    pivot_window: int = 5,
) -> dict:
    """
    Compute support and resistance levels from three sources:

      1. Simple moving averages (20, 50, 200-day)
      2. Historical pivot highs/lows (swing points in OHLC data)
      3. Gamma walls – strikes with the heaviest combined options OI
         (large OI clusters act as price magnets / barriers)

    Returns
    -------
    dict with:
        levels       – list of dicts [{price, type, source, strength}]
                       type  : "support" | "resistance"
                       source: "MA20" | "MA50" | "MA200" | "pivot" | "gamma_wall"
                       strength: 1–3  (higher = more significant)
        moving_avgs  – {20: float|None, 50: float|None, 200: float|None}
        gamma_walls  – sorted list of high-OI strikes near spot
    """
    levels: list[dict] = []

    # ---- 1. Moving averages ------------------------------------------
    moving_avgs: dict[int, float | None] = {20: None, 50: None, 200: None}
    if history is not None and not history.empty and "Close" in history.columns:
        closes = history["Close"].values
        for period in [20, 50, 200]:
            if len(closes) >= period:
                ma = float(closes[-period:].mean())
                moving_avgs[period] = ma
                sr_type = "support" if ma < spot else "resistance"
                strength = 1 if period == 20 else (2 if period == 50 else 3)
                levels.append({"price": ma, "type": sr_type,
                                "source": f"MA{period}", "strength": strength})

        # ---- 2. Pivot highs / lows -----------------------------------
        highs = history["High"].values if "High" in history.columns else closes
        lows  = history["Low"].values  if "Low"  in history.columns else closes
        n = len(closes)
        pw = min(pivot_window, max(n // 10, 1))
        pivot_highs, pivot_lows = [], []
        for i in range(pw, n - pw):
            if all(highs[i] >= highs[i - pw:i]) and all(highs[i] >= highs[i + 1:i + pw + 1]):
                pivot_highs.append(float(highs[i]))
            if all(lows[i] <= lows[i - pw:i]) and all(lows[i] <= lows[i + 1:i + pw + 1]):
                pivot_lows.append(float(lows[i]))

        def _cluster(prices, tol=0.015):
            if not prices:
                return []
            prices = sorted(set(prices))
            clusters, current = [], [prices[0]]
            for p in prices[1:]:
                if (p - current[0]) / current[0] < tol:
                    current.append(p)
                else:
                    clusters.append(float(np.mean(current)))
                    current = [p]
            clusters.append(float(np.mean(current)))
            return clusters

        for ph in sorted(_cluster(pivot_highs), key=lambda x: abs(x - spot)):
            if abs(ph - spot) / spot < 0.20:
                sr_type = "resistance" if ph >= spot else "support"
                levels.append({"price": ph, "type": sr_type,
                                "source": "pivot", "strength": 2})

        for pl in sorted(_cluster(pivot_lows), key=lambda x: abs(x - spot)):
            if abs(pl - spot) / spot < 0.20:
                sr_type = "support" if pl <= spot else "resistance"
                levels.append({"price": pl, "type": sr_type,
                                "source": "pivot", "strength": 2})

    # ---- 3. Gamma walls (high-OI options strikes) --------------------
    gamma_walls: list[float] = []
    oi_frames = []
    for df in [calls, puts]:
        if "openInterest" in df.columns:
            tmp = df[["strike", "openInterest"]].copy()
            tmp["openInterest"] = pd.to_numeric(
                tmp["openInterest"], errors="coerce"
            ).fillna(0)
            oi_frames.append(tmp)

    if oi_frames:
        combined_oi = (
            pd.concat(oi_frames)
            .groupby("strike")["openInterest"]
            .sum()
            .reset_index()
        )
        top_oi = combined_oi.nlargest(10, "openInterest")
        for _, row in top_oi.iterrows():
            k = float(row["strike"])
            if abs(k - spot) / spot < 0.25:
                gamma_walls.append(k)
                sr_type = "resistance" if k > spot else "support"
                levels.append({"price": k, "type": sr_type,
                                "source": "gamma_wall", "strength": 3})

    # ---- Deduplicate: merge levels within 0.75% of each other --------
    def _merge_levels(raw_levels, tol=0.0075):
        if not raw_levels:
            return []
        sorted_ls = sorted(raw_levels, key=lambda x: x["price"])
        merged, i = [], 0
        while i < len(sorted_ls):
            group = [sorted_ls[i]]
            j = i + 1
            while (j < len(sorted_ls) and
                   abs(sorted_ls[j]["price"] - sorted_ls[i]["price"])
                   / sorted_ls[i]["price"] < tol):
                group.append(sorted_ls[j])
                j += 1
            best = max(group, key=lambda x: x["strength"])
            rep_price = float(np.mean([g["price"] for g in group]))
            merged.append({**best, "price": rep_price})
            i = j
        return merged

    levels = _merge_levels(levels)

    # Keep at most n_levels on each side of spot
    below = sorted([l for l in levels if l["price"] < spot],
                   key=lambda x: x["price"], reverse=True)[:n_levels]
    above = sorted([l for l in levels if l["price"] > spot],
                   key=lambda x: x["price"])[:n_levels]

    return {
        "levels": below + above,
        "moving_avgs": moving_avgs,
        "gamma_walls": sorted(gamma_walls),
    }


# ======================================================================
# Entry analysis
# ======================================================================

def entry_analysis(
    dist: dict,
    em: dict,
    probs: dict,
    pctiles: dict,
    sr: dict,
    spot: float,
) -> dict:
    """
    Generate entry-point recommendations from options data and S/R.

    Bias is determined by the implied probability skew and the
    distribution mean relative to spot.  Entry / stop / target levels
    are anchored to the nearest S/R levels and distribution percentiles.

    Returns
    -------
    dict with keys:
        bias        – "bullish" | "bearish" | "neutral"
        bias_score  – float in [−1, +1]
        entry       – suggested entry price
        stop        – suggested stop-loss price
        target      – suggested price target
        risk_reward – reward / risk ratio (float, or nan)
        notes       – list of human-readable insight strings
    """
    notes: list[str] = []

    # ---- Bias score --------------------------------------------------
    mean_pct    = (dist["mean"] - spot) / spot * 100
    prob_above  = probs["prob_above"]
    skew        = dist["skew"]

    # Combine probability signal, mean bias and skew
    raw = (prob_above - 0.5) * 2                    # −1 to +1
    raw += np.clip(mean_pct / 5.0, -0.3, 0.3)      # mean deviation
    # Apply skew as a small penalty: negative skew -> more bearish (decrease raw)
    raw += skew * 0.05
    bias_score = float(np.clip(raw, -1.0, 1.0))

    if bias_score > 0.12:
        bias = "bullish"
    elif bias_score < -0.12:
        bias = "bearish"
    else:
        bias = "neutral"

    notes.append(f"Implied probability above spot: {prob_above*100:.1f}%")
    notes.append(
        f"Options-implied mean: ${dist['mean']:,.2f} ({mean_pct:+.1f}% vs spot)"
    )
    if skew < -0.3:
        notes.append("Negative skew — market pricing left-tail / downside risk")
    elif skew > 0.3:
        notes.append("Positive skew — market pricing in upside potential")

    # ---- Nearest S/R levels ------------------------------------------
    levels      = sr.get("levels", [])
    supports    = sorted([l["price"] for l in levels if l["price"] < spot],
                         reverse=True)
    resistances = sorted([l["price"] for l in levels if l["price"] > spot])

    nearest_sup = supports[0]    if supports    else spot * 0.97
    next_sup    = supports[1]    if len(supports) > 1 else spot * 0.94
    nearest_res = resistances[0] if resistances else spot * 1.03
    next_res    = resistances[1] if len(resistances) > 1 else spot * 1.06

    # ---- Build entry plan --------------------------------------------
    if bias == "bullish":
        entry  = nearest_sup
        stop   = next_sup * 0.995
        target = pctiles.get(75, nearest_res)
        notes.append(f"Bullish setup — enter near support ${nearest_sup:,.2f}")
        notes.append(f"Stop just below next support: ${stop:,.2f}")
        notes.append(f"Target (75th pct / resistance): ${target:,.2f}")

    elif bias == "bearish":
        entry  = nearest_res
        stop   = next_res * 1.005
        target = pctiles.get(25, nearest_sup)
        notes.append(f"Bearish setup — enter at resistance ${nearest_res:,.2f}")
        notes.append(f"Stop just above next resistance: ${stop:,.2f}")
        notes.append(f"Target (25th pct / support): ${target:,.2f}")

    else:
        entry  = spot
        stop   = nearest_sup * 0.99
        target = nearest_res
        notes.append("Neutral — no strong directional signal from options market")
        notes.append(
            f"Key levels — support: ${nearest_sup:,.2f}, "
            f"resistance: ${nearest_res:,.2f}"
        )

    # ---- Risk / Reward -----------------------------------------------
    reward = abs(target - entry)
    risk   = abs(entry - stop)
    rr     = round(reward / risk, 2) if risk > 0 else float("nan")
    if not np.isnan(rr):
        notes.append(f"Risk/reward: {rr:.1f}×")

    notes.append(
        f"Expected move (±{em['move_pct']:.1f}%): "
        f"${em['lower']:,.2f} – ${em['upper']:,.2f}"
    )

    return {
        "bias":        bias,
        "bias_score":  bias_score,
        "entry":       float(entry),
        "stop":        float(stop),
        "target":      float(target),
        "risk_reward": rr,
        "notes":       notes,
    }


# ======================================================================
# Put/Call ratio
# ======================================================================

def put_call_ratio(calls: pd.DataFrame, puts: pd.DataFrame) -> dict:
    """
    Compute the put/call ratio by volume and by open interest.

    PCR > 1.2  → broadly bearish sentiment
    PCR < 0.7  → broadly bullish sentiment
    """
    def _sum(df, col):
        return pd.to_numeric(
            df.get(col, pd.Series([0], dtype=float)), errors="coerce"
        ).fillna(0).sum()

    c_vol = _sum(calls, "volume")
    p_vol = _sum(puts,  "volume")
    c_oi  = _sum(calls, "openInterest")
    p_oi  = _sum(puts,  "openInterest")

    pcr_vol = float(p_vol / c_vol) if c_vol > 0 else float("nan")
    pcr_oi  = float(p_oi  / c_oi)  if c_oi  > 0 else float("nan")

    if not np.isnan(pcr_vol):
        sentiment = "bearish" if pcr_vol > 1.2 else ("bullish" if pcr_vol < 0.7 else "neutral")
    else:
        sentiment = "unknown"

    return {
        "pcr_vol":      pcr_vol,
        "pcr_oi":       pcr_oi,
        "put_volume":   float(p_vol),
        "call_volume":  float(c_vol),
        "put_oi":       float(p_oi),
        "call_oi":      float(c_oi),
        "sentiment":    sentiment,
    }
