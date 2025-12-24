import { useState } from "react";
import { useResource } from "../system";
import { eventKeywords } from "../boids/vocabulary/keywords";
import {
  exportCurrentStats,
  exportEvolutionCSV,
  copyToClipboard,
} from "../utils/exportData";

export type SpawnMode = "obstacle" | "predator";

type ControlsProps = {
  spawnMode: SpawnMode;
  onSpawnModeChange: (mode: SpawnMode) => void;
};

export function Controls({ spawnMode, onSpawnModeChange }: ControlsProps) {
  const { useStore: useRuntimeStore } = useResource("runtimeStore");
  const { useStore: useAnalyticsStore } = useResource("analyticsStore");
  const runtimeStore = useRuntimeStore((state) => state);
  const { config, simulation } = runtimeStore;
  const analytics = useAnalyticsStore((state) => state.evolution.data);
  const runtimeController = useResource("runtimeController");
  const engine = useResource("engine");
  const speciesIds = Object.keys(config.species);
  const [activeTab, setActiveTab] = useState(speciesIds[0] || "explorer");

  const activeSpecies = config.species[activeTab];

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "16px",
        padding: "20px",
      }}
    >
      {/* Species Tabs */}
      <div style={{ display: "flex", gap: "4px", flexWrap: "wrap" }}>
        {speciesIds.map((typeId) => {
          const species = config.species[typeId];
          return (
            <button
              key={typeId}
              onClick={() => setActiveTab(typeId)}
              style={{
                padding: "8px 12px",
                background: activeTab === typeId ? species.color : "#2a2a2a",
                color: activeTab === typeId ? "#000" : "#aaa",
                border: "none",
                borderRadius: "4px",
                cursor: "pointer",
                fontSize: "12px",
                fontWeight: "bold",
                transition: "all 0.2s",
              }}
            >
              {species.name}
            </button>
          );
        })}
      </div>

      {/* Per-Type Controls */}
      {activeSpecies && (
        <div
          style={{
            padding: "12px",
            background: "#222",
            borderRadius: "4px",
            border: `2px solid ${activeSpecies.color}`,
          }}
        >
          <h4
            style={{
              margin: "0 0 12px 0",
              color: activeSpecies.color,
              fontSize: "14px",
            }}
          >
            {activeSpecies.name} Settings
          </h4>

          <ControlSlider
            label="Separation"
            value={activeSpecies.movement.separationWeight}
            min={0}
            max={3}
            step={0.1}
            onChange={(value) =>
              runtimeController.dispatch({
                type: eventKeywords.controls.typeConfigChanged,
                typeId: activeTab,
                field: "separationWeight",
                value,
              })
            }
          />

          <ControlSlider
            label="Alignment"
            value={activeSpecies.movement.alignmentWeight}
            min={0}
            max={3}
            step={0.1}
            onChange={(value) =>
              runtimeController.dispatch({
                type: eventKeywords.controls.typeConfigChanged,
                typeId: activeTab,
                field: "alignmentWeight",
                value,
              })
            }
          />

          <ControlSlider
            label="Cohesion"
            value={activeSpecies.movement.cohesionWeight}
            min={0}
            max={3}
            step={0.1}
            onChange={(value) =>
              runtimeController.dispatch({
                type: eventKeywords.controls.typeConfigChanged,
                typeId: activeTab,
                field: "cohesionWeight",
                value,
              })
            }
          />

          <ControlSlider
            label="Max Speed"
            value={activeSpecies.movement.maxSpeed}
            min={1}
            max={10}
            step={0.5}
            onChange={(value) =>
              runtimeController.dispatch({
                type: eventKeywords.controls.typeConfigChanged,
                typeId: activeTab,
                field: "maxSpeed",
                value,
              })
            }
          />

          <ControlSlider
            label="Max Force"
            value={activeSpecies.movement.maxForce}
            min={0.01}
            max={0.5}
            step={0.01}
            onChange={(value) =>
              runtimeController.dispatch({
                type: eventKeywords.controls.typeConfigChanged,
                typeId: activeTab,
                field: "maxForce",
                value,
              })
            }
          />
        </div>
      )}

      {/* Global Controls */}
      <div
        style={{
          padding: "12px",
          background: "#222",
          borderRadius: "4px",
        }}
      >
        <h4
          style={{
            margin: "0 0 12px 0",
            color: "#00ff88",
            fontSize: "14px",
          }}
        >
          Global Settings
        </h4>

        <ControlSlider
          label="Perception Radius"
          value={config.parameters.perceptionRadius}
          min={10}
          max={150}
          step={5}
          onChange={(value) =>
            runtimeController.dispatch({
              type: eventKeywords.controls.perceptionRadiusChanged,
              value,
            })
          }
        />

        <ControlSlider
          label="Obstacle Avoidance"
          value={config.parameters.obstacleAvoidanceWeight}
          min={0}
          max={5}
          step={0.1}
          onChange={(value) =>
            runtimeController.dispatch({
              type: eventKeywords.controls.obstacleAvoidanceChanged,
              value,
            })
          }
        />
      </div>

      {/* Spawn Mode Section */}
      <div
        style={{
          padding: "12px",
          background: "#222",
          borderRadius: "4px",
        }}
      >
        <h4
          style={{
            margin: "0 0 8px 0",
            color: "#00ff88",
            fontSize: "14px",
          }}
        >
          Canvas Click Mode
        </h4>
        <div style={{ display: "flex", gap: "8px" }}>
          <button
            onClick={() => onSpawnModeChange("obstacle")}
            style={{
              flex: 1,
              padding: "8px",
              background: spawnMode === "obstacle" ? "#ff4444" : "#333",
              color: "white",
              border:
                spawnMode === "obstacle"
                  ? "2px solid #ff6666"
                  : "2px solid #444",
              borderRadius: "4px",
              cursor: "pointer",
              fontSize: "12px",
              fontWeight: "bold",
            }}
          >
            🚧 Obstacle
          </button>
          <button
            onClick={() => onSpawnModeChange("predator")}
            style={{
              flex: 1,
              padding: "8px",
              background: spawnMode === "predator" ? "#ff0000" : "#333",
              color: "white",
              border:
                spawnMode === "predator"
                  ? "2px solid #ff3333"
                  : "2px solid #444",
              borderRadius: "4px",
              cursor: "pointer",
              fontSize: "12px",
              fontWeight: "bold",
            }}
          >
            🦅 Predator
          </button>
        </div>
        <p style={{ margin: "8px 0 0 0", color: "#888", fontSize: "11px" }}>
          {spawnMode === "obstacle"
            ? "Click canvas to place obstacles"
            : "Click canvas to spawn predators"}
        </p>
      </div>

      {/* Obstacles Section */}
      <div
        style={{
          padding: "12px",
          background: "#222",
          borderRadius: "4px",
        }}
      >
        <h4
          style={{
            margin: "0 0 8px 0",
            color: "#ff4444",
            fontSize: "14px",
          }}
        >
          Obstacles ({simulation.obstacles.length})
        </h4>
        <button
          onClick={() =>
            runtimeController.dispatch({
              type: eventKeywords.obstacles.cleared,
            })
          }
          style={{
            width: "100%",
            padding: "8px",
            background: "#ff4444",
            color: "white",
            border: "none",
            borderRadius: "4px",
            cursor: "pointer",
            fontSize: "14px",
            fontWeight: "bold",
          }}
        >
          Clear All Obstacles
        </button>
      </div>

      {/* Data Export Section */}
      <div
        style={{
          padding: "12px",
          background: "#222",
          borderRadius: "4px",
          border: "2px solid #00ff88",
        }}
      >
        <h4
          style={{
            margin: "0 0 12px 0",
            color: "#00ff88",
            fontSize: "14px",
          }}
        >
          📊 Data Export
        </h4>

        {/* Current Stats Export */}
        <button
          onClick={() => {
            const json = exportCurrentStats(engine, runtimeStore);
            copyToClipboard(json, "Current Stats (JSON)");
          }}
          style={{
            width: "100%",
            padding: "10px",
            background: "#00ff88",
            color: "#000",
            border: "none",
            borderRadius: "4px",
            cursor: "pointer",
            fontSize: "13px",
            fontWeight: "bold",
            marginBottom: "8px",
          }}
        >
          📋 Copy Current Stats (JSON)
        </button>

        {/* Evolution History Export */}
        <button
          onClick={() => {
            const csv = exportEvolutionCSV(analytics.evolutionHistory);
            copyToClipboard(csv, "Evolution Data (CSV)");
          }}
          style={{
            width: "100%",
            padding: "10px",
            background: "#00aaff",
            color: "#000",
            border: "none",
            borderRadius: "4px",
            cursor: "pointer",
            fontSize: "13px",
            fontWeight: "bold",
          }}
        >
          📈 Copy Evolution Data (CSV)
        </button>

        {/* Info Text */}
        <p
          style={{
            margin: "12px 0 0 0",
            color: "#888",
            fontSize: "11px",
            lineHeight: "1.4",
          }}
        >
          Current Stats: Instant snapshot (JSON)
          <br />
          Evolution: {analytics.evolutionHistory.length} snapshots (CSV)
        </p>
      </div>
    </div>
  );
}

type ControlSliderProps = {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
};

function ControlSlider({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: ControlSliderProps) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "4px",
        marginBottom: "12px",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          fontSize: "14px",
        }}
      >
        <label style={{ color: "#aaa" }}>{label}</label>
        <span style={{ color: "#00ff88", fontWeight: "bold" }}>
          {value.toFixed(2)}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        style={{
          width: "100%",
          accentColor: "#00ff88",
        }}
      />
    </div>
  );
}
