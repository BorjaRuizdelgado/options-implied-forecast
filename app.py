"""
app.py – Streamlit interactive UI for Options-Implied Price Forecast.

Run with:
    streamlit run app.py
"""

import streamlit as st
import numpy as np
from data_fetcher import MarketData, get_market_data
from analysis import (
    implied_distribution,
    expected_move,
    bull_bear_probabilities,
    percentile_levels,
    max_pain,
    iv_smile,
    support_resistance_levels,
    entry_analysis,
    put_call_ratio,
)
from charts import (
    build_forecast_chart,
    build_distribution_chart,
    build_iv_smile_chart,
    build_oi_chart,
    build_sr_chart,
)

# ======================================================================
# Theme
# ======================================================================
ACCENT = "#4d6a61"
ACCENT_WARM = "#c08050"
BG = "#f7f5f0"
TEXT = "#1c1c1c"
GREEN = "#3d7a5a"
RED = "#b05040"

st.set_page_config(
    page_title="Ruizdelgado - Forecast",
    page_icon="favicon.png",
    layout="wide",
    initial_sidebar_state="expanded",
)

# Inject custom CSS to match borjaruizdelgado.com palette
st.markdown(f"""
<style>
    /* ---- global ---- */
    .stApp {{
        background-color: {BG};
        color: {TEXT};
        font-family: 'DM Sans', 'Helvetica Neue', Helvetica, Arial, sans-serif;
    }}
    section[data-testid="stSidebar"] {{
        background-color: #efece5;
        border-right: 1px solid #d8d4cc;
    }}
    section[data-testid="stSidebar"] * {{
        color: {TEXT} !important;
    }}
    /* ---- headers ---- */
    h1, h2, h3 {{ color: {TEXT}; }}
    /* ---- metric cards ---- */
    [data-testid="stMetricLabel"] {{ font-size: 0.95rem; }}
    [data-testid="stMetricValue"] {{ color: {ACCENT}; font-weight: 600; font-size: 1.6rem; }}
    [data-testid="stMetricDelta"] {{ font-size: 0.9rem; }}
    /* ---- buttons & inputs ---- */
    .stButton > button {{
        background-color: {ACCENT};
        color: white;
        border: none;
        border-radius: 8px;
        padding: 0.5rem 1.2rem;
        font-weight: 500;
    }}
    .stButton > button:hover {{
        background-color: #3d5a51;
    }}
    div[data-baseweb="input"] > div {{
        border-color: #d8d4cc !important;
    }}
    /* ---- info/success boxes ---- */
    .stAlert {{ border-radius: 8px; }}
    /* ---- divider ---- */
    hr {{ border-color: #d8d4cc; }}
    /* ---- expander triangle ---- */
    .streamlit-expanderHeader {{ font-weight: 500; }}
</style>
""", unsafe_allow_html=True)


# ======================================================================
# Sidebar – inputs
# ======================================================================

with st.sidebar:
    st.markdown(f"## Options Forecast")
    st.caption("Predict where the market thinks a stock is heading, using real options data.")

    ticker_input = st.text_input(
        "Ticker symbol",
        value="AAPL",
        placeholder="e.g. AAPL, TSLA, SPY, BTC, ETH …",
        help="Enter any US stock/ETF ticker, or BTC / ETH for crypto options (via Deribit).",
    ).strip().upper()

    analyse_btn = st.button("Analyse", width="stretch")


# ======================================================================
# State management
# ======================================================================

if "last_ticker" not in st.session_state:
    st.session_state["last_ticker"] = None
if "market" not in st.session_state:
    st.session_state["market"] = None

should_run = analyse_btn or (
    ticker_input and ticker_input != st.session_state.get("last_ticker")
    and st.session_state.get("last_ticker") is not None
)


# ======================================================================
# Landing state
# ======================================================================

if not ticker_input:
    st.title("Options-Implied Price Forecast")
    st.info("Enter a ticker symbol in the sidebar and click **Analyse** to get started.")
    st.stop()


# ======================================================================
# Fetch + cache data
# ======================================================================

@st.cache_data(ttl=300, show_spinner=False)
def fetch_data(ticker: str):
    """Fetch serializable market metadata for a ticker. Cached 5 min."""
    market = get_market_data(ticker)
    spot = market.spot_price
    expirations = [e for e in market.expirations if market.days_to_expiry(e) >= 1]
    r = MarketData.risk_free_rate()
    # Return only pickle-safe types; MarketData stored in session_state
    return spot, expirations, r


# Initial fetch on button click or first load
if analyse_btn or st.session_state.get("last_ticker") != ticker_input:
    try:
        with st.spinner(f"Fetching data for **{ticker_input}** …"):
            spot, expirations, r = fetch_data(ticker_input)
            market = get_market_data(ticker_input)  # lightweight; kept in session
        if not expirations:
            # Detect if this is a crypto symbol without options
            from crypto_fetcher import CryptoMarketData, _LIKELY_CRYPTO
            base = CryptoMarketData._strip_suffix(ticker_input)
            if base in _LIKELY_CRYPTO:
                supported = ", ".join(sorted(
                    c for c in _LIKELY_CRYPTO
                    if CryptoMarketData.is_crypto(c)
                ))
                st.error(
                    f"No crypto options available for **{ticker_input}**. "
                    f"Deribit currently lists options for: **{supported}**."
                )
            else:
                st.error(f"No options data available for **{ticker_input}**.")
            st.stop()
        st.session_state["last_ticker"] = ticker_input
        st.session_state["market"] = market
        st.session_state["spot"] = spot
        st.session_state["expirations"] = expirations
        st.session_state["r"] = r
    except Exception as e:
        st.error(f"Could not load data for **{ticker_input}**: {e}")
        st.stop()

# Guard: make sure we have data
if st.session_state.get("market") is None:
    st.title("Options-Implied Price Forecast")
    st.info("Enter a ticker symbol in the sidebar and click **Analyse** to get started.")
    st.stop()

market = st.session_state["market"]
spot = st.session_state["spot"]
expirations = st.session_state["expirations"]
r = st.session_state["r"]


# ======================================================================
# Expiry selector
# ======================================================================

with st.sidebar:
    st.markdown("### Expiration")

    exp_labels = []
    for e in expirations:
        dte_val = market.days_to_expiry(e)
        exp_labels.append(f"{e}  ({int(dte_val)}d)")

    exp_idx = st.selectbox(
        "Expiration date",
        range(len(expirations)),
        format_func=lambda i: exp_labels[i],
        help="Choose the options expiration date to analyse.",
    )
    expiry = expirations[exp_idx]
    dte = market.days_to_expiry(expiry)


# ======================================================================
# Run analysis
# ======================================================================

@st.cache_data(ttl=300, show_spinner=False)
def run_analysis(ticker: str, expiry: str, spot: float, r: float, dte: float):
    """Run the full analysis pipeline for one expiry."""
    m = get_market_data(ticker)
    chain = m.options_chain(expiry)
    calls, puts = chain["calls"], chain["puts"]

    T = dte / 365.0
    dist = implied_distribution(calls, spot, r, T, puts=puts)
    em = expected_move(calls, puts, spot)
    probs = bull_bear_probabilities(dist, spot)
    pctiles = percentile_levels(dist)
    mp = max_pain(calls, puts)
    iv_df = iv_smile(calls, puts, spot)

    hist_days = min(max(int(dte), 30), 200)
    history = m.historical_prices(hist_days)

    # New: support/resistance, entry analysis, put/call ratio
    sr = support_resistance_levels(history, calls, puts, spot)
    entry = entry_analysis(dist, em, probs, pctiles, sr, spot)
    pcr = put_call_ratio(calls, puts)

    return dist, em, probs, pctiles, mp, iv_df, calls, puts, history, sr, entry, pcr


try:
    with st.spinner("Running analysis …"):
        dist, em, probs, pctiles, mp, iv_df, calls, puts, history, sr, entry_info, pcr = run_analysis(
            ticker_input, expiry, spot, r, dte
        )
except ValueError as e:
    st.error(f"Analysis failed for **{expiry}**: {e}")
    st.stop()
except Exception as e:
    st.error(f"Unexpected error: {e}")
    st.stop()


# ======================================================================
# Helper – horizontal label strip rendered below a chart
# ======================================================================

def _inject_tooltip_css() -> None:
    """Inject CSS for the ? hover tooltip used in label strips. Call once per page."""
    st.markdown("""
    <style>
    .tip-wrap{position:relative;display:inline-block}
    .tip-icon{
        display:inline-flex;align-items:center;justify-content:center;
        width:13px;height:13px;border-radius:50%;
        background:#b8b4ac;color:#fff;
        font-size:0.58rem;font-weight:700;cursor:default;
        margin-left:4px;vertical-align:middle;line-height:1;
        flex-shrink:0;
    }
    .tip-box{
        visibility:hidden;opacity:0;
        background:#2f2f2f;color:#f0efeb;
        font-size:0.72rem;font-weight:400;line-height:1.45;
        padding:7px 11px;border-radius:7px;
        width:190px;text-align:left;
        position:absolute;bottom:135%;left:50%;transform:translateX(-50%);
        z-index:9999;transition:opacity 0.15s;
        pointer-events:none;white-space:normal;
        box-shadow:0 2px 8px rgba(0,0,0,0.22);
    }
    .tip-wrap:hover .tip-box{visibility:visible;opacity:1}
    </style>
    """, unsafe_allow_html=True)


def _label_strip(items) -> None:
    """
    Render a row of labelled values as styled HTML below a chart.
    items: list of (label, value, hex_colour) or (label, value, hex_colour, tooltip_text)
    """
    parts = []
    for row in items:
        label, value, colour = row[0], row[1], row[2]
        tip = row[3] if len(row) >= 4 else ""
        tip_html = (
            f'<span class="tip-wrap">'
            f'<span class="tip-icon">?</span>'
            f'<span class="tip-box">{tip}</span>'
            f'</span>'
        ) if tip else ""
        parts.append(
            f'<div style="display:inline-block;margin-right:2.5rem;">'
            f'<span style="font-size:0.8rem;color:#9a9a9a;text-transform:uppercase;'
            f'letter-spacing:0.05em;display:block;margin-bottom:2px">{label}{tip_html}</span>'
            f'<span style="font-size:1.1rem;font-weight:600;color:{colour}">{value}</span>'
            f'</div>'
        )
    st.markdown(
        f'<div style="padding:0.6rem 0 1rem 0;border-top:1px solid #d8d4cc;">' + "".join(parts) + "</div>",
        unsafe_allow_html=True,
    )


# ======================================================================
# Header
# ======================================================================

st.markdown(f"# {ticker_input}")
st.caption(f"Current price: **${spot:,.2f}** · Expiry: **{expiry}** ({int(dte)} days)")
_inject_tooltip_css()


# ======================================================================
# KPI row
# ======================================================================

c1, c2, c3, c4, c5 = st.columns(5)

mean_chg = (dist["mean"] - spot) / spot * 100
c1.metric("Expected Price", f"${dist['mean']:,.2f}",
           delta=f"{mean_chg:+.1f}%",
           delta_color="normal",
           help="Options-implied expected price at expiry, derived from the Breeden-Litzenberger probability distribution.")

c2_move_delta = round(dist['mean'] - spot, 2)
c2.metric("Expected Move", f"±{em['move_pct']:.1f}%",
           delta=c2_move_delta,
           delta_color="normal",
           help="Market-implied ±1 standard deviation price range. Delta shows implied mean change vs spot (mean − spot).")

c3.metric("P(above spot)", f"{probs['prob_above']*100:.1f}%",
           help="Implied probability the price will be above the current spot price at expiry.")

c4.metric("P(below spot)", f"{probs['prob_below']*100:.1f}%",
           help="Implied probability the price will be below the current spot price at expiry.")

mp_display = f"${mp:,.2f}" if not np.isnan(mp) else "N/A"
c5.metric("Max Pain", mp_display,
           help="Strike price where the most options expire worthless, causing maximum pain to option holders. Often acts as a price magnet near expiry.")


# Pre-compute entry/sentiment display values used later in the page
bias_label = entry_info["bias"].title()

pcr_vol_display = f"{pcr['pcr_vol']:.2f}" if not np.isnan(pcr['pcr_vol']) else "N/A"
pcr_oi_display  = f"{pcr['pcr_oi']:.2f}"  if not np.isnan(pcr['pcr_oi'])  else "N/A"

rr_display = f"{entry_info['risk_reward']:.1f}×" if not np.isnan(entry_info['risk_reward']) else "N/A"


# ======================================================================
# Main chart
# ======================================================================

st.plotly_chart(
    build_forecast_chart(
        ticker=ticker_input,
        expiry=expiry,
        spot=spot,
        dist=dist,
        em=em,
        pctiles=pctiles,
        mp=mp,
        calls=calls,
        puts=puts,
        history=history,
        days_to_expiry=dte,
    ),
    width="stretch",
    config={"displayModeBar": True, "scrollZoom": True},
)

_label_strip([
    ("Spot",       f"${spot:,.2f}",          "#1c1c1c", "Current market price of the asset."),
    ("Mean",       f"${dist['mean']:,.2f}",   "#4d6a61", "Options-implied expected price at expiry, weighted by the probability distribution."),
    ("Max Pain",   mp_display,                "#c08050", "Strike where the most options expire worthless. Often acts as a gravitational target near expiry."),
    ("Range low",  f"${em['lower']:,.2f}",    "#b05040", "Lower bound of the 1-std-dev expected move (~68% confidence interval)."),
    ("Range high", f"${em['upper']:,.2f}",    "#3d7a5a", "Upper bound of the 1-std-dev expected move (~68% confidence interval)."),
])


# ======================================================================
# Distribution chart
# ======================================================================

st.plotly_chart(
    build_distribution_chart(
        dist=dist,
        spot=spot,
        pctiles=pctiles,
        mp=mp,
        calls=calls,
        puts=puts,
    ),
    width="stretch",
    config={"displayModeBar": True, "scrollZoom": True},
)

_label_strip([
    ("10th pct",  f"${pctiles.get(10, 0):,.2f}",  "#b05040", "10% chance price is at or below this level by expiry."),
    ("25th pct",  f"${pctiles.get(25, 0):,.2f}",  "#c08050", "25% chance price is at or below this level by expiry."),
    ("50th pct",  f"${pctiles.get(50, 0):,.2f}",  "#4d6a61", "Median — equal chance price ends above or below this level by expiry."),
    ("75th pct",  f"${pctiles.get(75, 0):,.2f}",  "#4d6a61", "75% chance price is at or below this level by expiry."),
    ("90th pct",  f"${pctiles.get(90, 0):,.2f}",  "#3d7a5a", "90% chance price is at or below this level by expiry."),
])


# ======================================================================
# S/R + Entry Setup chart
# ======================================================================

st.plotly_chart(
    build_sr_chart(
        ticker=ticker_input,
        history=history,
        spot=spot,
        sr=sr,
        entry_info=entry_info,
    ),
    width="stretch",
    config={"displayModeBar": True, "scrollZoom": True},
)

_rr = f"{entry_info['risk_reward']:.1f}\u00d7" if not np.isnan(entry_info['risk_reward']) else "N/A"
_bias_colour = "#3d7a5a" if entry_info['bias'] == "bullish" else "#b05040" if entry_info['bias'] == "bearish" else "#1c1c1c"
_label_strip([
    ("Bias",          bias_label,                         _bias_colour,  "Directional lean derived from S/R positioning and the options probability distribution."),
    ("Spot",          f"${spot:,.2f}",                    "#1c1c1c",     "Current market price of the asset."),
    ("Entry",         f"${entry_info['entry']:,.2f}",      "#c08050",    "Suggested entry price based on the nearest support or resistance level."),
    ("Stop",          f"${entry_info['stop']:,.2f}",       "#b05040",    "Suggested stop-loss level to cap downside if the trade goes against you."),
    ("Target",        f"${entry_info['target']:,.2f}",     "#3d7a5a",    "Suggested profit target based on the opposing S/R level."),
    ("R/R",           _rr,                                 "#4d6a61",    "Risk-to-reward ratio: target distance ÷ stop distance. A ratio above 2× is generally considered favourable."),
    ("Put/Call (Vol)", pcr_vol_display,                    "#555555",    "Ratio of put volume to call volume. Above 1 signals more bearish hedging; below 1 signals more bullish positioning."),
    ("Sentiment",     pcr['sentiment'].title(),            "#555555",    "Market sentiment implied by the Put/Call ratio — Bullish, Bearish, or Neutral."),
])


# ======================================================================
# Secondary charts
# ======================================================================

col_iv, col_oi = st.columns(2)

with col_iv:
    st.plotly_chart(
        build_iv_smile_chart(iv_df, spot),
        width="stretch",
        config={"displayModeBar": False},
    )

with col_oi:
    st.plotly_chart(
        build_oi_chart(calls, puts, spot),
        width="stretch",
        config={"displayModeBar": False},
    )


# ======================================================================
# Percentile table
# ======================================================================

with st.expander("Percentile Breakdown", expanded=False):
    st.markdown(
        "Percentiles show where the market implies the price will land. "
        "For example, the 25th percentile means there is roughly a 25% chance "
        "the price will be **at or below** that level by expiry."
    )
    pct_rows = []
    for p, val in sorted(pctiles.items()):
        chg = (val - spot) / spot * 100
        pct_rows.append({"Percentile": f"{p}th", "Price": f"${val:,.2f}", "Change from spot": f"{chg:+.1f}%"})
    st.table(pct_rows)


# ======================================================================
# Distribution stats
# ======================================================================

with st.expander("Distribution Details", expanded=False):
    s1, s2, s3, s4 = st.columns(4)
    s1.metric("Mean", f"${dist['mean']:,.2f}")
    s2.metric("Median", f"${dist['median']:,.2f}")
    s3.metric("Std Dev", f"${dist['std']:,.2f}")
    s4.metric("Skewness", f"{dist['skew']:+.3f}")
    st.caption(
        "The implied distribution is derived from market option prices using the "
        "Breeden-Litzenberger identity. It represents the market's risk-neutral "
        "probability assessment for the underlying's price at expiry."
    )


# ======================================================================
# Entry Setup details
# ======================================================================

with st.expander("Entry Setup Details", expanded=False):
    st.markdown(
        "These levels are derived from the options-implied distribution, "
        "historical price pivots, high open-interest gamma walls and moving averages. "
        "They are informational — always apply your own risk management."
    )
    for note in entry_info["notes"]:
        st.markdown(f"- {note}")

    sr_rows = []
    for level in sorted(sr["levels"], key=lambda l: l["price"]):
        sr_rows.append({
            "Price": f"${level['price']:,.2f}",
            "Type":  level["type"].title(),
            "Source": level["source"].replace("_", " ").title(),
            "Strength": "★" * level["strength"],
        })
    if sr_rows:
        st.markdown("#### Key Levels")
        st.table(sr_rows)

    ma = sr.get("moving_avgs", {})
    ma_rows = [
        {"MA": f"MA{p}", "Value": f"${v:,.2f}" if v is not None else "N/A"}
        for p, v in sorted(ma.items())
    ]
    if ma_rows:
        st.markdown("#### Moving Averages")
        st.table(ma_rows)


# ======================================================================
# Put/Call Ratio details
# ======================================================================

with st.expander("Put/Call Ratio", expanded=False):
    st.markdown(
        "The Put/Call Ratio (PCR) measures relative options activity. "
        "A PCR **above 1.2** is broadly bearish sentiment; **below 0.7** is broadly bullish."
    )
    p1, p2, p3, p4 = st.columns(4)
    p1.metric("PCR (Volume)",    pcr_vol_display)
    p2.metric("PCR (OI)",        pcr_oi_display)
    p3.metric("Call Volume",     f"{int(pcr['call_volume']):,}")
    p4.metric("Put Volume",      f"{int(pcr['put_volume']):,}")
    p1b, p2b = st.columns(2)
    p1b.metric("Call OI",        f"{int(pcr['call_oi']):,}")
    p2b.metric("Put OI",         f"{int(pcr['put_oi']):,}")
    st.caption(f"Sentiment signal: **{pcr['sentiment'].title()}**")


# ======================================================================
# How it works
# ======================================================================

st.divider()
st.caption(
    "This tool shows what is already priced into traded options — it does not predict the future."
)
