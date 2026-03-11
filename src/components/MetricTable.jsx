import React from "react";
import Tooltip from "./Tooltip.jsx";
import { fmt, fmtPct, fmtRatio, fmtCompact } from "../lib/format.js";

function formatMetric(metric) {
  if (metric.value == null || Number.isNaN(metric.value)) return "N/A";
  if (metric.kind === "pct") return fmtPct(metric.value);
  if (metric.kind === "pct-whole") return `${Number(metric.value).toFixed(1)}%`;
  if (metric.kind === "money") return fmt(metric.value);
  if (metric.kind === "compact-money") return fmtCompact(metric.value);
  return fmtRatio(metric.value);
}

export default function MetricTable({ title, metrics = [] }) {
  const visible = metrics.filter((metric) => metric.value != null && !Number.isNaN(metric.value));
  if (!visible.length) return null;

  return (
    <section className="terminal-section">
      <div className="section-heading">
        <h2>{title}</h2>
      </div>
      <div className="terminal-card">
        <table className="data-table">
          <thead>
            <tr>
              <th>Metric</th>
              <th>Value</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((metric) => (
              <tr key={metric.label}>
                <td>
                  <span className="metric-table-label">
                    {metric.label}
                    {metric.tip && <Tooltip text={metric.tip} />}
                  </span>
                </td>
                <td>{formatMetric(metric)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
