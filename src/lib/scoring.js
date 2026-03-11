function clamp(value, min = 0, max = 100) {
  return Math.min(max, Math.max(min, value));
}

function safeNumber(value) {
  return Number.isFinite(value) ? value : null;
}

export function averageScore(parts) {
  const valid = parts.map(safeNumber).filter((value) => value != null);
  if (valid.length === 0) return null;
  return valid.reduce((sum, value) => sum + value, 0) / valid.length;
}

export function countValidScores(parts) {
  return parts.map(safeNumber).filter((value) => value != null).length;
}

export function softenScore(score, floor = 8, ceiling = 92) {
  if (!Number.isFinite(score)) return null;
  return floor + (score / 100) * (ceiling - floor);
}

export function scoreLowBetter(value, good, bad) {
  if (!Number.isFinite(value)) return null;
  if (value <= good) return 100;
  if (value >= bad) return 0;
  return clamp(100 * ((bad - value) / (bad - good)));
}

export function scoreHighBetter(value, bad, good) {
  if (!Number.isFinite(value)) return null;
  if (value <= bad) return 0;
  if (value >= good) return 100;
  return clamp(100 * ((value - bad) / (good - bad)));
}

export function scoreRangeBetter(value, lowGood, highGood, lowBad, highBad) {
  if (!Number.isFinite(value)) return null;
  if (value >= lowGood && value <= highGood) return 100;
  if (value < lowGood) {
    if (value <= lowBad) return 0;
    return clamp(100 * ((value - lowBad) / (lowGood - lowBad)));
  }
  if (value >= highBad) return 0;
  return clamp(100 * ((highBad - value) / (highBad - highGood)));
}

export function labelFromScore(score, bands = [35, 55, 75]) {
  if (!Number.isFinite(score)) return "Unavailable";
  if (score < bands[0]) return "Weak";
  if (score < bands[1]) return "Mixed";
  if (score < bands[2]) return "Good";
  return "Strong";
}

export function opportunityLabel(score) {
  if (!Number.isFinite(score)) return "Unavailable";
  if (score < 35) return "Unattractive";
  if (score < 55) return "Watchlist";
  if (score < 75) return "Interesting";
  return "High-conviction";
}

export function valuationLabel(score) {
  if (!Number.isFinite(score)) return "Unavailable";
  if (score < 35) return "Expensive";
  if (score < 60) return "Fair";
  return "Undervalued";
}
