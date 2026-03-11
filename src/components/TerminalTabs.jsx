import React from "react";

export default function TerminalTabs({ tabs, activeTab, onChange }) {
  return (
    <div className="terminal-tabs" role="tablist" aria-label="Research sections">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          className={`terminal-tab${activeTab === tab.id ? " terminal-tab--active" : ""}`}
          onClick={() => onChange(tab.id)}
          role="tab"
          aria-selected={activeTab === tab.id}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
