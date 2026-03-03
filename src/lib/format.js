/**
 * Shared formatting helpers used across components.
 */

/** Format a number as a dollar amount, e.g. "$1,234.56". Returns "N/A" for invalid values. */
export function fmt(val) {
  if (val == null || isNaN(val)) return "N/A";
  return `$${Number(val).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/** Format a number to 2 decimal places, e.g. "1.23". Returns "N/A" for NaN. */
export function fmtDecimal(v) {
  return isNaN(v) ? "N/A" : v.toFixed(2);
}

/** Format an integer with locale grouping, e.g. "1,234". */
export function fmtInt(v) {
  return Number(v).toLocaleString();
}

/** Capitalise the first letter of a string. */
export function capitalize(s) {
  if (!s) return "";
  return s.charAt(0).toUpperCase() + s.slice(1);
}
