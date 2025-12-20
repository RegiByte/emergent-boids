import { useState } from "react";
import { Controls, type SpawnMode } from "./Controls";
import { EventsPanel } from "./EventsPanel";
import { PopulationStats } from "./PopulationStats";

type SimulationPanelProps = {
  spawnMode: SpawnMode;
  onSpawnModeChange: (mode: SpawnMode) => void;
};

type TabId = "controls" | "events" | "stats";

export function SimulationPanel({ spawnMode, onSpawnModeChange }: SimulationPanelProps) {
  const [activeTab, setActiveTab] = useState<TabId>("controls");

  const tabs: { id: TabId; label: string; icon: string }[] = [
    { id: "controls", label: "Controls", icon: "🎛️" },
    { id: "events", label: "Events", icon: "📡" },
    { id: "stats", label: "Stats", icon: "📊" },
  ];

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        background: "#1a1a1a",
        borderLeft: "2px solid #333",
      }}
    >
      {/* Tab Headers */}
      <div
        style={{
          display: "flex",
          borderBottom: "2px solid #333",
          background: "#0a0a0a",
        }}
      >
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              flex: 1,
              padding: "16px 12px",
              background: activeTab === tab.id ? "#1a1a1a" : "transparent",
              color: activeTab === tab.id ? "#00ff88" : "#666",
              border: "none",
              borderBottom: activeTab === tab.id ? "3px solid #00ff88" : "3px solid transparent",
              cursor: "pointer",
              fontSize: "14px",
              fontWeight: "bold",
              transition: "all 0.2s",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "8px",
            }}
            onMouseEnter={(e) => {
              if (activeTab !== tab.id) {
                e.currentTarget.style.background = "#151515";
                e.currentTarget.style.color = "#999";
              }
            }}
            onMouseLeave={(e) => {
              if (activeTab !== tab.id) {
                e.currentTarget.style.background = "transparent";
                e.currentTarget.style.color = "#666";
              }
            }}
          >
            <span>{tab.icon}</span>
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          overflowX: "hidden",
        }}
      >
        {activeTab === "controls" && (
          <Controls spawnMode={spawnMode} onSpawnModeChange={onSpawnModeChange} />
        )}
        {activeTab === "events" && <EventsPanel />}
        {activeTab === "stats" && <PopulationStats />}
      </div>
    </div>
  );
}

