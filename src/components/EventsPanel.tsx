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

export function EventsPanel() {
  const runtimeController = useResource("runtimeController");
  const engine = useResource("engine");
  const config = useResource("config");
  const [eventLog, setEventLog] = useState<EventLogEntry[]>([]);
  const [maxEntries] = useState(50);

  useEffect(() => {
    // Subscribe to all events
    const unsubscribe = runtimeController.subscribe((event, effects) => {
      setEventLog((prev) => {
        const newEntry = {
          id: `event-${Date.now()}-${eventCounter++}`,
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
        padding: "16px",
        color: "#00ff88",
        fontSize: "11px",
        fontFamily: "monospace",
      }}
    >
      <h3 style={{ margin: "0 0 16px 0", color: "#00ff88", fontSize: "16px" }}>
        📡 Event Stream
      </h3>

      {/* Energy Status */}
      <div
        style={{
          marginBottom: "16px",
          padding: "12px",
          background: "#0a0a0a",
          borderRadius: "4px",
          border: "1px solid #333",
        }}
      >
        <div style={{ color: "#ffaa00", marginBottom: "8px", fontSize: "12px" }}>
          <strong>High Energy Predators:</strong>
        </div>
        <div style={{ color: "#aaa" }}>
          {predators.length} total | {highEnergyPredators.length} with ≥90 energy
        </div>
        {highEnergyPredators.length > 0 && (
          <div style={{ marginTop: "8px", fontSize: "10px" }}>
            {highEnergyPredators.map((p) => (
              <div key={p.id} style={{ color: "#ff6666" }}>
                {p.id}: {p.energy.toFixed(1)} energy
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Event Log */}
      <div style={{ fontSize: "10px" }}>
        <div style={{ marginBottom: "12px", fontSize: "12px", color: "#00ff88" }}>
          <strong>Recent Events ({eventLog.length}):</strong>
        </div>
        {eventLog.length === 0 && (
          <div style={{ color: "#666", marginTop: "8px", textAlign: "center", padding: "20px" }}>
            No events yet...
          </div>
        )}
        {eventLog.map((entry) => {
          const time = new Date(entry.timestamp).toLocaleTimeString();
          return (
            <div
              key={entry.id}
              style={{
                marginBottom: "8px",
                padding: "8px",
                background: "#0a0a0a",
                borderRadius: "4px",
                borderLeft: "3px solid #00ff88",
              }}
            >
              <div style={{ color: "#888", fontSize: "9px" }}>{time}</div>
              <div style={{ marginTop: "4px" }}>
                <strong style={{ color: "#00aaff" }}>Event:</strong>{" "}
                <span style={{ color: "#fff" }}>{entry.event.type}</span>
              </div>
              {Object.keys(entry.event).length > 1 && (
                <div
                  style={{ marginLeft: "8px", marginTop: "4px", color: "#aaa", fontSize: "9px" }}
                >
                  <pre style={{ margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                    {JSON.stringify(
                      Object.fromEntries(
                        Object.entries(entry.event).filter(([k]) => k !== "type")
                      ),
                      null,
                      2
                    )}
                  </pre>
                </div>
              )}
              {entry.effects.length > 0 && (
                <div style={{ marginTop: "6px" }}>
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

