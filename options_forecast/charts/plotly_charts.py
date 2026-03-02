"""
options_forecast.charts.plotly_charts — Interactive Plotly charts for
the Streamlit UI.

Provides four chart builders:
  * ``build_forecast_chart``  — price history + projection fan
  * ``build_distribution_chart`` — implied PDF with percentile shading
  * ``build_iv_smile_chart``  — volatility smile
  * ``build_oi_chart``        — open interest & volume by strike
"""

from __future__ import annotations

from datetime import datetime, timedelta

import numpy as np
import pandas as pd
import plotly.graph_objects as go

from options_forecast.theme import (
    COLORS,
    PLOTLY_LAYOUT,
    plotly_axis_style,
)

# Shorter alias
C = COLORS


# ======================================================================
# 1. Forecast chart
# ======================================================================

def build_forecast_chart(
    ticker: str,
    expiry: str,
    spot: float,
    dist: dict,
    em: dict,
    pctiles: dict,
    mp: float,
    calls: pd.DataFrame,
    puts: pd.DataFrame,
    history: pd.DataFrame | None,
    days_to_expiry: float,
) -> go.Figure:
    """Price history + projection fan + key levels."""
    fig = go.Figure()
    dte_days = max(int(np.ceil(days_to_expiry)), 1)

    # -- Dates ---------------------------------------------------------
    hist_dates, hist_prices = _extract_history(history, dte_days)
    anchor = hist_dates[-1] if hist_dates else datetime.now()
    expiry_dt = datetime.strptime(expiry, "%Y-%m-%d")
    future_dates = _future_trading_dates(anchor, expiry_dt, dte_days)

    # -- Projection fan ------------------------------------------------
    _add_projection_fan(fig, pctiles, spot, anchor, future_dates)

    # -- Historical price line -----------------------------------------
    if hist_dates and hist_prices:
        fig.add_trace(go.Scatter(
            x=hist_dates, y=hist_prices,
            mode="lines",
            line=dict(color=C["accent"], width=2.5),
            name="Historical price",
            hovertemplate="<b>%{x|%b %d}</b><br>$%{y:,.2f}<extra></extra>",
        ))
        fig.add_trace(go.Scatter(
            x=[hist_dates[-1]], y=[hist_prices[-1]],
            mode="markers",
            marker=dict(color=C["accent"], size=8,
                        line=dict(color="white", width=1.5)),
            name=f"Current ${spot:,.2f}",
            hovertemplate=f"<b>Current Price</b><br>${spot:,.2f}<extra></extra>",
        ))

    # -- Key horizontal levels -----------------------------------------
    _add_key_levels(fig, spot, dist, mp, anchor)

    # -- Layout --------------------------------------------------------
    fig.update_layout(
        **PLOTLY_LAYOUT,
        title=dict(
            text=f"<b>{ticker}</b>  \u2014  Forecast to {expiry}",
            font=dict(size=17, color=C["text"]), x=0.01,
        ),
        xaxis=dict(**plotly_axis_style(), title=""),
        yaxis=dict(**plotly_axis_style(), title="Price ($)",
                   tickprefix="$", autorange=True),
        showlegend=True,
        legend=dict(
            bgcolor="rgba(247,245,240,0.90)",
            bordercolor=C["border_light"], borderwidth=1,
            font=dict(size=13),
            x=0.01, y=0.99, xanchor="left", yanchor="top",
        ),
        height=560,
        hovermode="x unified",
    )
    return fig


# ======================================================================
# 2. Distribution chart
# ======================================================================

def build_distribution_chart(
    dist: dict,
    spot: float,
    pctiles: dict,
    mp: float,
    calls: pd.DataFrame,
    puts: pd.DataFrame,
) -> go.Figure:
    """Implied probability density with percentile shading."""
    fig = go.Figure()

    K, pdf, cdf = dist["strikes"], dist["pdf"], dist["cdf"]
    if pdf.max() <= 0:
        fig.add_annotation(
            text="No distribution data", xref="paper", yref="paper",
            x=0.5, y=0.5, showarrow=False,
            font=dict(size=14, color=C["text_muted"]),
        )
        fig.update_layout(**PLOTLY_LAYOUT, height=340)
        return fig

    # 95% range for initial view
    p025 = K[np.searchsorted(cdf, 0.025)]
    p975 = K[min(np.searchsorted(cdf, 0.975), len(K) - 1)]

    # Shaded 95% band
    mask = (K >= p025) & (K <= p975)
    K_95, pdf_95 = K[mask], pdf[mask]
    if len(K_95) > 0:
        fig.add_trace(go.Scatter(
            x=np.concatenate([[K_95[0]], K_95, [K_95[-1]]]),
            y=np.concatenate([[0], pdf_95, [0]]),
            fill="toself", fillcolor="rgba(77,106,97,0.12)",
            line=dict(width=0), mode="lines",
            name="95% range", hoverinfo="skip",
        ))

    # PDF curve
    fig.add_trace(go.Scatter(
        x=K, y=pdf, mode="lines",
        line=dict(color=C["accent"], width=2),
        name="Implied density",
        hovertemplate="$%{x:,.2f}<br>Density: %{y:.4f}<extra></extra>",
    ))

    # Key vertical levels
    _add_distribution_levels(fig, spot, dist, mp, pctiles, pdf.max())

    layout_margins = {**PLOTLY_LAYOUT, "margin": dict(l=65, r=30, t=80, b=65)}
    fig.update_layout(
        **layout_margins,
        title=dict(text="<b>Implied Price Distribution</b>",
                   font=dict(size=16, color=C["text"]), x=0.01),
        xaxis=dict(**plotly_axis_style(), title="Price ($)", tickprefix="$",
                   range=[p025 * 0.98, p975 * 1.02]),
        yaxis=dict(**plotly_axis_style(), title="Probability Density",
                   showticklabels=False),
        showlegend=True,
        legend=dict(
            bgcolor="rgba(247,245,240,0.90)",
            bordercolor=C["border_light"], borderwidth=1,
            font=dict(size=12), orientation="h",
            x=0.5, xanchor="center", y=1.0, yanchor="bottom",
        ),
        height=360,
        hovermode="x unified",
    )
    return fig


# ======================================================================
# 3. IV smile chart
# ======================================================================

def build_iv_smile_chart(iv_df: pd.DataFrame, spot: float) -> go.Figure:
    """Interactive implied-volatility smile."""
    fig = go.Figure()

    if iv_df is None or iv_df.empty:
        fig.add_annotation(
            text="No IV data available", xref="paper", yref="paper",
            x=0.5, y=0.5, showarrow=False,
            font=dict(size=14, color=C["text_muted"]),
        )
        fig.update_layout(**PLOTLY_LAYOUT, height=300)
        return fig

    for opt_type, colour, label in [
        ("call", C["accent"], "Calls"),
        ("put", C["accent_warm"], "Puts"),
    ]:
        sub = iv_df[iv_df["type"] == opt_type]
        if sub.empty:
            continue
        fig.add_trace(go.Scatter(
            x=sub["strike"], y=sub["iv"] * 100,
            mode="markers+lines",
            marker=dict(color=colour, size=6),
            line=dict(color=colour, width=1.5),
            name=label,
            hovertemplate=(
                f"<b>{opt_type.title()}</b> $%{{x:,.0f}}<br>"
                "IV: %{y:.1f}%<extra></extra>"
            ),
        ))

    fig.add_vline(x=spot, line=dict(color=C["text"], width=2.5, dash="dash"),
                  opacity=0.6)
    fig.add_annotation(text=f"Spot ${spot:,.2f}", x=spot, y=1.05,
                       xref="x", yref="paper", showarrow=False,
                       font=dict(size=12, color=C["text_light"]))

    sm = {**PLOTLY_LAYOUT, "margin": dict(l=65, r=30, t=80, b=55)}
    fig.update_layout(
        **sm,
        title=dict(text="<b>Implied Volatility Smile</b>",
                   font=dict(size=16, color=C["text"]), x=0.01),
        xaxis=dict(**plotly_axis_style(), title="Strike ($)", tickprefix="$"),
        yaxis=dict(**plotly_axis_style(), title="Implied Volatility (%)",
                   ticksuffix="%"),
        showlegend=True,
        legend=dict(
            bgcolor="rgba(247,245,240,0.90)",
            bordercolor=C["border_light"], borderwidth=1,
            font=dict(size=12), orientation="h",
            x=0.5, xanchor="center", y=1.0, yanchor="bottom",
        ),
        height=360,
        hovermode="x unified",
    )
    return fig


# ======================================================================
# 4. OI / Volume chart
# ======================================================================

def build_oi_chart(
    calls: pd.DataFrame, puts: pd.DataFrame, spot: float,
) -> go.Figure:
    """Bar chart: open interest + volume at each strike."""
    fig = go.Figure()

    c = _prepare_oi(calls, "Call")
    p = _prepare_oi(puts, "Put")
    all_data = pd.concat([c, p], ignore_index=True)

    if all_data["total"].sum() == 0:
        fig.add_annotation(
            text="No open interest / volume data available",
            xref="paper", yref="paper", x=0.5, y=0.5, showarrow=False,
            font=dict(size=14, color=C["text_muted"]),
        )
        fig.update_layout(**PLOTLY_LAYOUT, height=340)
        return fig

    for opt_type, colour, df in [("Call", C["accent"], c),
                                  ("Put", C["accent_warm"], p)]:
        oi = df[df["openInterest"] > 0]
        vol = df[df["volume"] > 0]
        if not oi.empty:
            fig.add_trace(go.Bar(
                x=oi["strike"], y=oi["openInterest"],
                name=f"{opt_type}s OI", marker_color=colour, opacity=0.7,
                hovertemplate=(
                    f"<b>{opt_type}</b> $%{{x:,.0f}}<br>"
                    "OI: %{y:,.0f}<extra></extra>"
                ),
            ))
        if not vol.empty:
            fig.add_trace(go.Bar(
                x=vol["strike"], y=vol["volume"],
                name=f"{opt_type}s Vol", marker_color=colour, opacity=0.35,
                hovertemplate=(
                    f"<b>{opt_type}</b> $%{{x:,.0f}}<br>"
                    "Vol: %{y:,.0f}<extra></extra>"
                ),
            ))

    fig.add_vline(x=spot, line=dict(color=C["text"], width=2.5, dash="dash"),
                  opacity=0.6)
    fig.add_annotation(text=f"Spot ${spot:,.2f}", x=spot, y=1.05,
                       xref="x", yref="paper", showarrow=False,
                       font=dict(size=12, color=C["text_light"]))

    sm = {**PLOTLY_LAYOUT, "margin": dict(l=65, r=30, t=80, b=55)}
    fig.update_layout(
        **sm,
        title=dict(text="<b>Open Interest & Volume by Strike</b>",
                   font=dict(size=16, color=C["text"]), x=0.01),
        xaxis=dict(**plotly_axis_style(), title="Strike ($)", tickprefix="$"),
        yaxis=dict(**plotly_axis_style(), title="Contracts"),
        barmode="group",
        showlegend=True,
        legend=dict(
            bgcolor="rgba(247,245,240,0.90)",
            bordercolor=C["border_light"], borderwidth=1,
            font=dict(size=12), orientation="h",
            x=0.5, xanchor="center", y=1.0, yanchor="bottom",
        ),
        height=360,
        hovermode="x unified",
    )
    return fig


# ======================================================================
# Internal helpers
# ======================================================================

def _extract_history(
    history: pd.DataFrame | None, dte_days: int,
) -> tuple[list[datetime], list[float]]:
    """Extract dates and close prices from a history DataFrame."""
    if history is None or history.empty:
        return [], []

    max_hist = max(dte_days * 2, 30)
    hist = history.tail(max_hist)
    dates = [
        d.to_pydatetime().replace(tzinfo=None)
        if hasattr(d, "to_pydatetime") else d
        for d in hist.index
    ]
    return dates, hist["Close"].values.tolist()


def _future_trading_dates(
    anchor: datetime, expiry_dt: datetime, dte_days: int,
) -> list[datetime]:
    """Generate weekday-only dates from *anchor* until *expiry_dt*."""
    dates: list[datetime] = []
    d = anchor + timedelta(days=1)
    while len(dates) < dte_days and d <= expiry_dt + timedelta(days=1):
        if d.weekday() < 5:
            dates.append(d)
        d += timedelta(days=1)
    if not dates:
        dates = [anchor + timedelta(days=i + 1) for i in range(max(dte_days, 2))]
    return dates


def _add_projection_fan(
    fig: go.Figure,
    pctiles: dict,
    spot: float,
    anchor: datetime,
    future_dates: list[datetime],
) -> None:
    """Percentile bands expanding from spot to expiry."""
    if not future_dates:
        return

    n = len(future_dates)
    dates = [anchor] + future_dates

    def _interp(target: float) -> list[float]:
        return [spot + (target - spot) * (i / n) for i in range(n + 1)]

    p10 = pctiles.get(10, spot)
    p25 = pctiles.get(25, spot)
    p50 = pctiles.get(50, spot)
    p75 = pctiles.get(75, spot)
    p90 = pctiles.get(90, spot)

    b10, b25, b50, b75, b90 = (
        _interp(p10), _interp(p25), _interp(p50),
        _interp(p75), _interp(p90),
    )

    # 10-90 band
    fig.add_trace(go.Scatter(
        x=dates + dates[::-1], y=b90 + b10[::-1],
        fill="toself", fillcolor="rgba(77,106,97,0.08)",
        line=dict(width=0), mode="none",
        name="Likely range (80%)", hoverinfo="skip",
    ))
    # 25-75 band
    fig.add_trace(go.Scatter(
        x=dates + dates[::-1], y=b75 + b25[::-1],
        fill="toself", fillcolor="rgba(77,106,97,0.15)",
        line=dict(width=0), mode="none",
        name="Most likely range (50%)", hoverinfo="skip",
    ))
    # Median line
    fig.add_trace(go.Scatter(
        x=dates, y=b50, mode="lines",
        line=dict(color=C["accent"], width=2, dash="dash"),
        name=f"Median forecast ${p50:,.2f}",
        hovertemplate="<b>Median</b><br>$%{y:,.2f}<extra></extra>",
    ))
    # Margin annotations
    for label, val, colour in [
        ("90th", p90, C["green"]),  ("75th", p75, C["accent"]),
        ("50th", p50, C["accent"]), ("25th", p25, C["accent_warm"]),
        ("10th", p10, C["red"]),
    ]:
        fig.add_annotation(
            x=1.01, y=val, xref="paper", yref="y",
            text=f"{label}: ${val:,.0f}", showarrow=False,
            font=dict(size=13, color=colour), xanchor="left",
        )


def _add_key_levels(
    fig: go.Figure, spot: float, dist: dict, mp: float, anchor: datetime,
) -> None:
    """Spot / mean / max-pain horizontal lines + "now" divider."""
    fig.add_hline(y=spot,
                  line=dict(color=C["text"], width=2.5, dash="dash"),
                  opacity=0.75)
    fig.add_annotation(text=f"Spot ${spot:,.2f}", x=1.01, y=spot,
                       xref="paper", yref="y", xanchor="left",
                       font=dict(size=13, color=C["text"]), showarrow=False)

    fig.add_hline(y=dist["mean"],
                  line=dict(color=C["accent"], width=2.5, dash="dashdot"),
                  opacity=0.6)
    fig.add_annotation(text=f"Mean ${dist['mean']:,.2f}", x=1.01, y=dist["mean"],
                       xref="paper", yref="y", xanchor="left",
                       font=dict(size=13, color=C["accent"]), showarrow=False)

    if not np.isnan(mp) and abs(mp - spot) / spot < 0.25:
        fig.add_hline(y=mp,
                      line=dict(color=C["accent_warm"], width=2.5, dash="dot"),
                      opacity=0.6)
        fig.add_annotation(text=f"Max Pain ${mp:,.2f}", x=1.01, y=mp,
                           xref="paper", yref="y", xanchor="left",
                           font=dict(size=13, color=C["accent_warm"]),
                           showarrow=False)

    fig.add_vline(x=anchor, line=dict(color=C["border"], width=1.5),
                  opacity=0.6)
    fig.add_annotation(text="now", x=anchor, y=1.03,
                       xref="x", yref="paper",
                       font=dict(size=13, color=C["text_muted"]),
                       showarrow=False)


def _add_distribution_levels(
    fig: go.Figure, spot: float, dist: dict, mp: float,
    pctiles: dict, y_max: float,
) -> None:
    """Vertical key-level lines on the distribution chart."""
    levels = [
        ("Spot", spot, C["text"]),
        ("Mean", dist["mean"], C["accent"]),
    ]
    if not np.isnan(mp) and abs(mp - spot) / spot < 0.25:
        levels.append(("Max Pain", mp, C["accent_warm"]))

    levels.sort(key=lambda t: t[1])
    y_stagger = [1.12, 1.02, 0.92]

    for i, (lbl, val, colour) in enumerate(levels):
        dash = {"Spot": "dash", "Mean": "dashdot"}.get(lbl, "dot")
        opacity = 0.75 if lbl == "Spot" else 0.6
        fig.add_vline(x=val, line=dict(color=colour, width=2.5, dash=dash),
                      opacity=opacity)
        y_pos = y_max * (y_stagger[i] if i < len(y_stagger) else 0.82)
        fig.add_annotation(text=f"{lbl} ${val:,.2f}", x=val, y=y_pos,
                           xref="x", yref="y", showarrow=False,
                           font=dict(size=12, color=colour))

    p10, p25 = pctiles.get(10, spot), pctiles.get(25, spot)
    p75, p90 = pctiles.get(75, spot), pctiles.get(90, spot)
    for label, val, colour in [
        ("10th", p10, C["red"]),   ("25th", p25, C["accent_warm"]),
        ("75th", p75, C["accent"]), ("90th", p90, C["green"]),
    ]:
        fig.add_annotation(
            text=f"{label}<br>${val:,.0f}", x=val, y=0,
            xref="x", yref="y",
            showarrow=True, arrowhead=0, arrowwidth=1,
            arrowcolor=colour, ax=0, ay=30,
            font=dict(size=12, color=colour),
        )


def _prepare_oi(df: pd.DataFrame, opt_type: str) -> pd.DataFrame:
    """Normalise OI / volume columns for the OI chart."""
    d = df[["strike"]].copy()
    d["openInterest"] = pd.to_numeric(
        df["openInterest"], errors="coerce"
    ).fillna(0)
    d["volume"] = pd.to_numeric(
        df.get("volume", 0), errors="coerce"
    ).fillna(0)
    d["type"] = opt_type
    d["total"] = d["openInterest"] + d["volume"]
    return d
