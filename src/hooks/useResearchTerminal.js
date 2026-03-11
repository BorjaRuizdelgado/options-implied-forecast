import { useState, useCallback, useEffect, useRef } from "react";
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
  expiryWeights,
  mergeDistributions,
  mergeExpectedMoves,
  mergeMaxPain,
  mergeIvSmiles,
  mergePutCallRatios,
} from "../lib/analysis.js";
import { deriveValuation } from "../lib/valuation.js";
import { deriveQuality } from "../lib/quality.js";
import { deriveRisk } from "../lib/risk.js";
import { deriveBusiness } from "../lib/business.js";
import { deriveOpportunity, deriveOptionsSentiment, deriveSignals } from "../lib/signals.js";
import { tickerFromPath } from "../lib/routes.js";

function deriveResearch(fundamentals, analysis, spot) {
  const valuation = deriveValuation(fundamentals, spot);
  const quality = deriveQuality(fundamentals);
  const risk = deriveRisk(fundamentals, analysis);
  const options = deriveOptionsSentiment(analysis, spot);
  const opportunity = deriveOpportunity(
    valuation,
    quality,
    risk,
    options,
    valuation.analystUpsidePct
  );
  const signals = deriveSignals({
    valuation,
    quality,
    risk,
    options,
    analystUpsidePct: valuation.analystUpsidePct,
  });
  const business = deriveBusiness(fundamentals);
  const fundamentalsHasData = Boolean(
    fundamentals &&
    Object.entries(fundamentals).some(([key, value]) => {
      if (key === "statements") {
        return Boolean(value?.income?.length || value?.balance?.length || value?.cashflow?.length);
      }
      return value != null;
    })
  );
  const availability = {
    overview: true,
    value: Boolean(valuation?.hasData),
    quality: Boolean(quality?.hasData),
    risk: Boolean(risk?.hasData),
    business: Boolean(business?.hasData),
    options: Boolean(analysis),
    fundamentals: fundamentalsHasData,
  };

  return {
    opportunity,
    valuation,
    quality,
    risk,
    options,
    business,
    signals,
    availability,
  };
}

export default function useResearchTerminal() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [ticker, setTicker] = useState(null);
  const [spot, setSpot] = useState(null);
  const [expirations, setExpirations] = useState(null);
  const [selectedExpiry, setSelectedExpiry] = useState(null);
  const [analysis, setAnalysis] = useState(null);
  const [fundamentals, setFundamentals] = useState(null);
  const [research, setResearch] = useState(null);
  const [weighted, setWeighted] = useState(true);

  const runSingleChain = useCallback(async (tickerVal, expiry, spotVal, r) => {
    const dte = daysToExpiry(expiry.date);
    const histDays = 300;

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

    return {
      dist, em, probs, pctiles, mp, ivData,
      calls, puts, history: histData.bars, sr, entry, pcr,
      dte, expiry: expiry.date, r, spot: spotVal,
      chainsUsed: 1, chainDtes: [dte], chainWeights: [1],
    };
  }, []);

  const runWeightedChains = useCallback(async (tickerVal, expiry, spotVal, r, allExpirations) => {
    const targetDte = daysToExpiry(expiry.date);
    const histDays = 300;

    const eligibleExps = allExpirations.filter(
      (e) => daysToExpiry(e.date) <= targetDte + 0.01 && daysToExpiry(e.date) >= 1,
    );

    let chainsToFetch;
    if (eligibleExps.length <= 8) {
      chainsToFetch = eligibleExps;
    } else {
      const first = eligibleExps[0];
      const last = eligibleExps[eligibleExps.length - 1];
      const middle = eligibleExps.slice(1, -1);
      const step = Math.ceil(middle.length / 6);
      const sampled = middle.filter((_, i) => i % step === 0).slice(0, 6);
      chainsToFetch = [first, ...sampled, last];
    }

    const [histData, ...chainResults] = await Promise.all([
      fetchHistory(tickerVal, histDays),
      ...chainsToFetch.map((e) => fetchChain(tickerVal, e.timestamp)),
    ]);

    const perChain = [];
    const dtes = [];

    for (let i = 0; i < chainResults.length; i++) {
      const { calls, puts } = chainResults[i];
      const dte = daysToExpiry(chainsToFetch[i].date);
      const T = dte / 365;

      try {
        const dist = impliedDistribution(calls, spotVal, r, T, puts);
        const em = expectedMove(calls, puts, spotVal);
        const mp = maxPain(calls, puts);
        const ivData = ivSmile(calls, puts, spotVal);
        const pcr = putCallRatio(calls, puts);
        perChain.push({ dist, em, mp, ivData, pcr, calls, puts, dte });
        dtes.push(dte);
      } catch {
        // Skip chains with too few strikes
      }
    }

    if (perChain.length === 0) {
      throw new Error("No expiration chains had enough data for analysis");
    }

    const weights = expiryWeights(dtes);
    const dist = mergeDistributions(perChain.map((c) => c.dist), weights);
    const em = mergeExpectedMoves(perChain.map((c) => c.em), weights, spotVal);
    const mp = mergeMaxPain(perChain.map((c) => c.mp), weights);
    const ivData = mergeIvSmiles(perChain.map((c) => c.ivData));
    const pcr = mergePutCallRatios(perChain.map((c) => c.pcr), weights);

    const probs = bullBearProbabilities(dist, spotVal);
    const pctiles = percentileLevels(dist);

    const allCalls = perChain.flatMap((c) => c.calls);
    const allPuts = perChain.flatMap((c) => c.puts);
    const sr = supportResistanceLevels(histData.bars, allCalls, allPuts, spotVal);
    const entry = entryAnalysis(dist, em, probs, pctiles, sr, spotVal);

    return {
      dist, em, probs, pctiles, mp, ivData,
      calls: allCalls, puts: allPuts, history: histData.bars, sr, entry, pcr,
      dte: targetDte, expiry: expiry.date, r, spot: spotVal,
      chainsUsed: perChain.length, chainDtes: dtes, chainWeights: weights,
    };
  }, []);

  const runAnalysis = useCallback(async (tickerVal, expiry, spotVal, r, allExpirations, useWeighted, fundData) => {
    setLoading(true);
    setError(null);

    try {
      const result = useWeighted
        ? await runWeightedChains(tickerVal, expiry, spotVal, r, allExpirations)
        : await runSingleChain(tickerVal, expiry, spotVal, r);
      setAnalysis(result);
      setResearch(deriveResearch(fundData || fundamentals, result, spotVal));
    } catch (err) {
      setError(`Analysis failed: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }, [fundamentals, runSingleChain, runWeightedChains]);

  const handleAnalyse = useCallback(async (tickerInput) => {
    setLoading(true);
    setError(null);
    setAnalysis(null);
    setFundamentals(null);
    setResearch(null);

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
      setFundamentals(optData.fundamentals || null);
      setExpirations(validExps);
      setSelectedExpiry(validExps[0]);

      const path = `/${encodeURIComponent(resolvedTicker)}`;
      if (window.location.pathname !== path) {
        window.history.pushState(null, "", path);
      }

      await runAnalysis(
        resolvedTicker,
        validExps[0],
        optData.price,
        rateData.rate,
        validExps,
        weighted,
        optData.fundamentals || null
      );
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [runAnalysis, weighted]);

  const didAutoRun = useRef(false);
  useEffect(() => {
    if (didAutoRun.current) return;
    const urlTicker = tickerFromPath(window.location.pathname);
    if (urlTicker) {
      didAutoRun.current = true;
      handleAnalyse(urlTicker);
    }
  }, [handleAnalyse]);

  useEffect(() => {
    const onPop = () => {
      const urlTicker = tickerFromPath(window.location.pathname);
      if (!window.location.pathname.replace(/\/$/, "") || window.location.pathname === "/") {
        setTicker(null);
        setSpot(null);
        setExpirations(null);
        setSelectedExpiry(null);
        setAnalysis(null);
        setFundamentals(null);
        setResearch(null);
        setError(null);
        setLoading(false);
        return;
      }

      if (urlTicker && (!ticker || ticker.toUpperCase() !== urlTicker)) {
        handleAnalyse(urlTicker);
      }
    };

    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [handleAnalyse, ticker]);

  const handleExpiryChange = useCallback(
    async (timestampStr) => {
      const match = expirations?.find((e) => String(e.timestamp) === timestampStr);
      if (!match) return;
      setSelectedExpiry(match);
      if (ticker && spot != null && analysis && expirations) {
        await runAnalysis(ticker, match, spot, analysis.r, expirations, weighted, fundamentals);
      }
    },
    [ticker, spot, analysis, expirations, runAnalysis, weighted, fundamentals],
  );

  const handleWeightedToggle = useCallback(
    async (newVal) => {
      const val = typeof newVal === "boolean" ? newVal : !weighted;
      setWeighted(val);
      if (ticker && selectedExpiry && spot != null && analysis && expirations) {
        await runAnalysis(ticker, selectedExpiry, spot, analysis.r, expirations, val, fundamentals);
      }
    },
    [ticker, selectedExpiry, spot, analysis, expirations, runAnalysis, weighted, fundamentals],
  );

  return {
    loading,
    error,
    ticker,
    spot,
    expirations,
    selectedExpiry,
    analysis,
    fundamentals,
    research,
    weighted,
    handleAnalyse,
    handleExpiryChange,
    handleWeightedToggle,
  };
}
