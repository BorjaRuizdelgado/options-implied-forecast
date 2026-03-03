import { useState, useCallback } from "react";
import { fetchOptions, fetchChain, fetchHistory, fetchRate, daysToExpiry } from "../lib/fetcher.js";
import {
  impliedDistribution,
  expectedMove,
  bullBearProbabilities,
  percentileLevels,
  maxPain,
  ivSmile,
  supportResistanceLevels,
  entryAnalysis,
  putCallRatio,
} from "../lib/analysis.js";

/**
 * Custom hook that owns all data-fetching and analysis state.
 *
 * Returns everything the UI needs to render: loading/error flags,
 * ticker metadata, the selected expiry, and the full analysis object.
 */
export default function useOptionsAnalysis() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [ticker, setTicker] = useState(null);
  const [spot, setSpot] = useState(null);
  const [expirations, setExpirations] = useState(null);
  const [selectedExpiry, setSelectedExpiry] = useState(null);
  const [analysis, setAnalysis] = useState(null);

  // ---- Internal: run analysis for one expiry ----

  const runAnalysis = useCallback(async (tickerVal, expiry, spotVal, r) => {
    setLoading(true);
    setError(null);

    try {
      const dte = daysToExpiry(expiry.date);
      const histDays = Math.min(Math.max(Math.floor(dte), 30), 200);

      const [chainData, histData] = await Promise.all([
        fetchChain(tickerVal, expiry.timestamp),
        fetchHistory(tickerVal, histDays),
      ]);

      const { calls, puts } = chainData;
      const T = dte / 365;

      const dist = impliedDistribution(calls, spotVal, r, T, puts);
      const em = expectedMove(calls, puts, spotVal);
      const probs = bullBearProbabilities(dist, spotVal);
      const pctiles = percentileLevels(dist);
      const mp = maxPain(calls, puts);
      const ivData = ivSmile(calls, puts, spotVal);
      const sr = supportResistanceLevels(histData.bars, calls, puts, spotVal);
      const entry = entryAnalysis(dist, em, probs, pctiles, sr, spotVal);
      const pcr = putCallRatio(calls, puts);

      setAnalysis({
        dist,
        em,
        probs,
        pctiles,
        mp,
        ivData,
        calls,
        puts,
        history: histData.bars,
        sr,
        entry,
        pcr,
        dte,
        expiry: expiry.date,
        r,
        spot: spotVal,
      });
    } catch (err) {
      setError(`Analysis failed: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }, []);

  // ---- Public: initial analyse (fetch expirations + first chain) ----

  const handleAnalyse = useCallback(async (tickerInput) => {
    setLoading(true);
    setError(null);
    setAnalysis(null);

    try {
      const [optData, rateData] = await Promise.all([
        fetchOptions(tickerInput),
        fetchRate(),
      ]);

      if (!optData.expirations?.length) {
        throw new Error(`No options data available for ${tickerInput}`);
      }

      const validExps = optData.expirations.filter(
        (e) => daysToExpiry(e.date) >= 1,
      );
      if (validExps.length === 0) {
        throw new Error(`No valid expirations for ${tickerInput}`);
      }

      const resolvedTicker = optData.ticker || tickerInput;
      setTicker(resolvedTicker);
      setSpot(optData.price);
      setExpirations(validExps);
      setSelectedExpiry(validExps[0]);

      await runAnalysis(resolvedTicker, validExps[0], optData.price, rateData.rate);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [runAnalysis]);

  // ---- Public: change expiry ----

  const handleExpiryChange = useCallback(
    async (timestampStr) => {
      const match = expirations?.find((e) => String(e.timestamp) === timestampStr);
      if (!match) return;
      setSelectedExpiry(match);
      if (ticker && spot != null && analysis) {
        await runAnalysis(ticker, match, spot, analysis.r);
      }
    },
    [ticker, spot, analysis, expirations, runAnalysis],
  );

  return {
    loading,
    error,
    ticker,
    spot,
    expirations,
    selectedExpiry,
    analysis,
    handleAnalyse,
    handleExpiryChange,
  };
}
