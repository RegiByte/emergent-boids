import { useEffect, useState } from "react";
import { useResource } from "../system";
import { AllEffect, AllEvent } from "../vocabulary/keywords";

type EventLogEntry = {
  id: string;
  timestamp: number;
  event: AllEvent;
  effects: AllEffect[];
};

let eventCounter = 0;

export function DebugPanel() {
  const runtimeController = useResource("runtimeController");
  const engine = useResource("engine");
  const [eventLog, setEventLog] = useState<EventLogEntry[]>([]);
  const [maxEntries] = useState(20);
  const config = useResource("config");

  useEffect(() => {
    // Subscribe to all events
    const unsubscribe = runtimeController.subscribe((event, effects) => {
      setEventLog((prev) => {
        const newEntry = {
          id: `event-${Date.now()}-${eventCounter++}`, // Unique ID
          timestamp: Date.now(),
          event,
          effects,
        };
        return [newEntry, ...prev].slice(0, maxEntries);
      });
    });

    return () => unsubscribe();
  }, [runtimeController, maxEntries]);

  // Count predators with high energy
  const predators = engine.boids.filter((b) => {
    const typeConfig = config.types[b.typeId];
    return typeConfig && typeConfig.role === "predator";
  });

  const highEnergyPredators = predators.filter((p) => p.energy >= 90);

  return (
    <div
      style={{
        position: "fixed",
        top: "10px",
        right: "10px",
        width: "400px",
        maxHeight: "80vh",
        background: "rgba(0, 0, 0, 0.9)",
        border: "2px solid #00ff88",
        borderRadius: "8px",
        padding: "12px",
        color: "#00ff88",
        fontSize: "11px",
        fontFamily: "monospace",
        overflowY: "auto",
        zIndex: 1000,
      }}
    >
      <h3 style={{ margin: "0 0 8px 0", color: "#ff0000" }}>🐛 Debug Panel</h3>

      {/* Energy Status */}
      <div
        style={{
          marginBottom: "12px",
          padding: "8px",
          background: "#1a1a1a",
          borderRadius: "4px",
        }}
      >
        <div style={{ color: "#ffaa00" }}>
          Predators: {predators.length} | High Energy (≥90):{" "}
          {highEnergyPredators.length}
        </div>
        {highEnergyPredators.length > 0 && (
          <div style={{ marginTop: "4px", fontSize: "10px" }}>
            {highEnergyPredators.map((p) => (
              <div key={p.id}>
                {p.id}: {p.energy.toFixed(1)} energy
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Event Log */}
      <div style={{ fontSize: "10px" }}>
        <strong>Recent Events ({eventLog.length}):</strong>
        {eventLog.length === 0 && (
          <div style={{ color: "#666", marginTop: "8px" }}>
            No events yet...
          </div>
        )}
        {eventLog.map((entry) => {
          const time = new Date(entry.timestamp).toLocaleTimeString();
          return (
            <div
              key={entry.id}
              style={{
                marginTop: "8px",
                padding: "6px",
                background: "#1a1a1a",
                borderRadius: "4px",
                borderLeft: "3px solid #00ff88",
              }}
            >
              <div style={{ color: "#888" }}>{time}</div>
              <div style={{ marginTop: "2px" }}>
                <strong style={{ color: "#00aaff" }}>Event:</strong>{" "}
                {entry.event.type}
              </div>
              {Object.keys(entry.event).length > 1 && (
                <div
                  style={{ marginLeft: "8px", color: "#aaa", fontSize: "9px" }}
                >
                  {JSON.stringify(
                    Object.fromEntries(
                      Object.entries(entry.event).filter(([k]) => k !== "type")
                    ),
                    null,
                    2
                  )}
                </div>
              )}
              {entry.effects.length > 0 && (
                <div style={{ marginTop: "4px" }}>
                  <strong style={{ color: "#ff00ff" }}>
                    Effects ({entry.effects.length}):
                  </strong>
                  {entry.effects.map((effect, i) => (
                    <div
                      key={i}
                      style={{
                        marginLeft: "8px",
                        marginTop: "2px",
                        color: "#ddd",
                      }}
                    >
                      • {effect.type}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
