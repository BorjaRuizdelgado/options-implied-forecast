import React, { useState } from "react";
import { DISCLAIMER_PATH, DONATE_PATH, tickerFromPath } from "../lib/routes.js";

export default function Header({ onAnalyse, loading, activeTicker, onNavigateDisclaimer, onNavigateDonate }) {
  const [ticker, setTicker] = useState(() => tickerFromPath(window.location.pathname) || "");
  const [menuOpen, setMenuOpen] = useState(false);

  function handleSubmit(e) {
    e.preventDefault();
    const val = ticker.trim().toUpperCase();
    if (val) {
      onAnalyse(val);
      setMenuOpen(false);
    }
  }

  return (
    <header className="app-header">
      <div className="app-header__inner">
        {/* Logo */}
        <a href="/" className="app-header__logo" onClick={(e) => { e.preventDefault(); window.location.href = "/"; }}>
          <span className="app-header__logo-mark">R</span>
          <span className="app-header__logo-text">Investing Tools</span>
        </a>

        {/* Search — always visible on desktop, toggleable on mobile */}
        <form
          className={`app-header__search${menuOpen ? " app-header__search--open" : ""}`}
          onSubmit={handleSubmit}
        >
          <div className="app-header__search-row">
            <input
              type="text"
              value={ticker}
              onChange={(e) => setTicker(e.target.value.toUpperCase())}
              placeholder="Ticker — e.g. AAPL, TSLA, SPY…"
              aria-label="Ticker symbol"
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck="false"
            />
            <button className="app-header__search-btn" type="submit" disabled={loading}>
              {loading ? "…" : "Analyse"}
            </button>
          </div>
        </form>

        {/* Right side nav */}
        <nav className="app-header__nav">
          <a
            href={DONATE_PATH}
            className="app-header__nav-link"
            onClick={(e) => { e.preventDefault(); onNavigateDonate(); }}
          >
            Support
          </a>
          <a
            href={DISCLAIMER_PATH}
            className="app-header__nav-link"
            onClick={(e) => { e.preventDefault(); onNavigateDisclaimer(); }}
          >
            Disclaimer
          </a>
        </nav>

        {/* Mobile hamburger — reveals search row */}
        <button
          className={`app-header__burger${menuOpen ? " app-header__burger--open" : ""}`}
          onClick={() => setMenuOpen((o) => !o)}
          aria-label={menuOpen ? "Close search" : "Open search"}
        >
          <span /><span /><span />
        </button>
      </div>
    </header>
  );
}
