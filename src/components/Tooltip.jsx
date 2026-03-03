import React from "react";

/**
 * Small "?" icon that shows a tooltip on hover.
 * Used in KPI cards, label strips, and anywhere a brief explanation is needed.
 */
export default function Tooltip({ text }) {
  if (!text) return null;
  return (
    <span className="tip-wrap">
      <span className="tip-icon">?</span>
      <span className="tip-box">{text}</span>
    </span>
  );
}
