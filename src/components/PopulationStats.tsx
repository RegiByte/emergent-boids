import { useState, useEffect } from "react";
import { useResource } from "../system";
import { eventKeywords } from "../vocabulary/keywords";

export function PopulationStats() {
  const engine = useResource("engine");
  const { useStore } = useResource("runtimeStore");
  const species = useStore((state) => state.config.species);
  const { subscribe } = useResource("runtimeController");
  const simulation = useStore((state) => state.simulation);
  const parameters = useStore((state) => state.config.parameters);

  // Force re-render every 500ms to update stats in real-time
  const [, setTick] = useState(0);

  useEffect(() => {
    const unsubscribe = subscribe((event) => {
      if (event.type === eventKeywords.time.passage) {
        setTick((prev) => (prev > 500 ? 0 : prev + 1));
      }
    });

    return () => unsubscribe();
  }, [subscribe]);

  // Calculate statistics
  const allBoids = engine.boids;

  // Separate by role
  const prey = allBoids.filter((b) => {
    const typeConfig = species[b.typeId];
    return typeConfig && typeConfig.role === "prey";
  });

  const predators = allBoids.filter((b) => {
    const typeConfig = species[b.typeId];
    return typeConfig && typeConfig.role === "predator";
  });

  // Group prey by type
  const preyBySpecies: Record<string, typeof prey> = {};
  prey.forEach((boid) => {
    if (!preyBySpecies[boid.typeId]) {
      preyBySpecies[boid.typeId] = [];
    }
    preyBySpecies[boid.typeId].push(boid);
  });

  // Calculate averages
  const calcAvg = (arr: number[]) =>
    arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;

  const preyEnergies = prey.map((b) => b.energy);
  const predatorEnergies = predators.map((b) => b.energy);
  const preyAges = prey.map((b) => b.age);
  const predatorAges = predators.map((b) => b.age);

  const avgPreyEnergy = calcAvg(preyEnergies);
  const avgPredatorEnergy = calcAvg(predatorEnergies);
  const avgPreyAge = calcAvg(preyAges);
  const avgPredatorAge = calcAvg(predatorAges);

  // Calculate stance distribution
  const preyStances = {
    flocking: prey.filter((b) => b.stance === "flocking").length,
    seeking_mate: prey.filter((b) => b.stance === "seeking_mate").length,
    mating: prey.filter((b) => b.stance === "mating").length,
    fleeing: prey.filter((b) => b.stance === "fleeing").length,
  };

  const predatorStances = {
    hunting: predators.filter((b) => b.stance === "hunting").length,
    seeking_mate: predators.filter((b) => b.stance === "seeking_mate").length,
    mating: predators.filter((b) => b.stance === "mating").length,
    idle: predators.filter((b) => b.stance === "idle").length,
    eating: predators.filter((b) => b.stance === "eating").length,
  };

  return (
    <div
      style={{
        padding: "16px",
        color: "#00ff88",
      }}
    >
      <h3 style={{ margin: "0 0 16px 0", color: "#00ff88", fontSize: "16px" }}>
        📊 Population Statistics
      </h3>

      {/* Overall Population */}
      <StatSection title="Overall Population">
        <StatRow label="Total Boids" value={allBoids.length} color="#00ff88" />
        <StatRow label="Prey" value={prey.length} color="#00aaff" />
        <StatRow label="Predators" value={predators.length} color="#ff0000" />
        <StatRow
          label="Prey:Predator Ratio"
          value={
            predators.length > 0
              ? (prey.length / predators.length).toFixed(2)
              : "∞"
          }
          color="#ffaa00"
        />
      </StatSection>

      {/* Prey Statistics */}
      <StatSection title="Prey Statistics">
        <StatRow
          label="Avg Energy"
          value={avgPreyEnergy.toFixed(1)}
          color="#00aaff"
          max={60}
          current={avgPreyEnergy}
        />
        <StatRow
          label="Avg Age"
          value={`${avgPreyAge.toFixed(1)}s`}
          color="#00aaff"
          max={60}
          current={avgPreyAge}
        />
        <StatRow
          label="Min Energy"
          value={
            preyEnergies.length > 0
              ? Math.min(...preyEnergies).toFixed(1)
              : "N/A"
          }
          color="#666"
        />
        <StatRow
          label="Max Energy"
          value={
            preyEnergies.length > 0
              ? Math.max(...preyEnergies).toFixed(1)
              : "N/A"
          }
          color="#666"
        />
      </StatSection>

      {/* Prey Stances */}
      <StatSection title="Prey Stances">
        <StanceRow
          label="🐦 Flocking"
          value={preyStances.flocking}
          total={prey.length}
          color="#00aaff"
        />
        <StanceRow
          label="💕 Seeking Mate"
          value={preyStances.seeking_mate}
          total={prey.length}
          color="#ff69b4"
        />
        <StanceRow
          label="❤️ Mating"
          value={preyStances.mating}
          total={prey.length}
          color="#ff1493"
        />
        <StanceRow
          label="😱 Fleeing"
          value={preyStances.fleeing}
          total={prey.length}
          color="#ffaa00"
        />
      </StatSection>

      {/* Prey by Species */}
      <StatSection title="Prey by Type">
        {Object.entries(preyBySpecies).map(([typeId, boids]) => {
          const speciesConfig = species[typeId];
          if (!speciesConfig) return null;

          const energies = boids.map((b) => b.energy);
          const ages = boids.map((b) => b.age);
          const avgEnergy = calcAvg(energies);
          const avgAge = calcAvg(ages);

          return (
            <div
              key={typeId}
              style={{
                marginBottom: "12px",
                padding: "8px",
                background: "#0a0a0a",
                borderRadius: "4px",
                borderLeft: `3px solid ${speciesConfig.color}`,
              }}
            >
              <div
                style={{
                  color: speciesConfig.color,
                  fontWeight: "bold",
                  marginBottom: "6px",
                  fontSize: "13px",
                }}
              >
                {speciesConfig.name} ({boids.length})
              </div>
              <div style={{ fontSize: "11px", color: "#aaa" }}>
                <div>
                  Avg Energy:{" "}
                  <span style={{ color: "#fff" }}>{avgEnergy.toFixed(1)}</span>
                </div>
                <div>
                  Avg Age:{" "}
                  <span style={{ color: "#fff" }}>{avgAge.toFixed(1)}s</span>
                </div>
              </div>
            </div>
          );
        })}
        {Object.keys(preyBySpecies).length === 0 && (
          <div
            style={{
              color: "#666",
              fontSize: "12px",
              textAlign: "center",
              padding: "12px",
            }}
          >
            No prey alive
          </div>
        )}
      </StatSection>

      {/* Predator Statistics */}
      <StatSection title="Predator Statistics">
        <StatRow
          label="Avg Energy"
          value={avgPredatorEnergy.toFixed(1)}
          color="#ff0000"
          max={150}
          current={avgPredatorEnergy}
        />
        <StatRow
          label="Avg Age"
          value={`${avgPredatorAge.toFixed(1)}s`}
          color="#ff0000"
          max={20}
          current={avgPredatorAge}
        />
        <StatRow
          label="Min Energy"
          value={
            predatorEnergies.length > 0
              ? Math.min(...predatorEnergies).toFixed(1)
              : "N/A"
          }
          color="#666"
        />
        <StatRow
          label="Max Energy"
          value={
            predatorEnergies.length > 0
              ? Math.max(...predatorEnergies).toFixed(1)
              : "N/A"
          }
          color="#666"
        />
        <StatRow
          label="High Energy (≥90)"
          value={predators.filter((p) => p.energy >= 90).length}
          color="#ff6666"
        />
      </StatSection>

      {/* Predator Stances */}
      <StatSection title="Predator Stances">
        <StanceRow
          label="🎯 Hunting"
          value={predatorStances.hunting}
          total={predators.length}
          color="#ff0000"
        />
        <StanceRow
          label="💕 Seeking Mate"
          value={predatorStances.seeking_mate}
          total={predators.length}
          color="#ff69b4"
        />
        <StanceRow
          label="❤️ Mating"
          value={predatorStances.mating}
          total={predators.length}
          color="#ff1493"
        />
        <StanceRow
          label="💤 Idle"
          value={predatorStances.idle}
          total={predators.length}
          color="#666"
        />
        <StanceRow
          label="🍖 Eating"
          value={predatorStances.eating}
          total={predators.length}
          color="#ff8800"
        />
      </StatSection>

      {/* Environment */}
      <StatSection title="Environment">
        <StatRow
          label="Obstacles"
          value={simulation.obstacles.length}
          color="#ff4444"
        />
        <StatRow
          label="Perception Radius"
          value={parameters.perceptionRadius}
          color="#888"
        />
        <StatRow label="Max Boids" value={parameters.maxBoids} color="#888" />
      </StatSection>
    </div>
  );
}

type StatSectionProps = {
  title: string;
  children: React.ReactNode;
};

function StatSection({ title, children }: StatSectionProps) {
  return (
    <div
      style={{
        marginBottom: "20px",
        padding: "12px",
        background: "#0a0a0a",
        borderRadius: "6px",
        border: "1px solid #333",
      }}
    >
      <h4
        style={{
          margin: "0 0 12px 0",
          color: "#00ff88",
          fontSize: "14px",
          borderBottom: "1px solid #333",
          paddingBottom: "8px",
        }}
      >
        {title}
      </h4>
      {children}
    </div>
  );
}

type StatRowProps = {
  label: string;
  value: string | number;
  color: string;
  max?: number;
  current?: number;
};

function StatRow({ label, value, color, max, current }: StatRowProps) {
  const showBar = max !== undefined && current !== undefined;
  const percentage = showBar ? Math.min((current / max) * 100, 100) : 0;

  return (
    <div style={{ marginBottom: "8px" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          fontSize: "12px",
          marginBottom: showBar ? "4px" : "0",
        }}
      >
        <span style={{ color: "#aaa" }}>{label}</span>
        <span style={{ color, fontWeight: "bold" }}>{value}</span>
      </div>
      {showBar && (
        <div
          style={{
            width: "100%",
            height: "4px",
            background: "#1a1a1a",
            borderRadius: "2px",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              width: `${percentage}%`,
              height: "100%",
              background: color,
              transition: "width 0.3s ease",
            }}
          />
        </div>
      )}
    </div>
  );
}

type StanceRowProps = {
  label: string;
  value: number;
  total: number;
  color: string;
};

function StanceRow({ label, value, total, color }: StanceRowProps) {
  const percentage = total > 0 ? (value / total) * 100 : 0;

  return (
    <div style={{ marginBottom: "8px" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          fontSize: "12px",
          marginBottom: "4px",
        }}
      >
        <span style={{ color: "#aaa" }}>{label}</span>
        <span style={{ color, fontWeight: "bold" }}>
          {value} ({percentage.toFixed(0)}%)
        </span>
      </div>
      <div
        style={{
          width: "100%",
          height: "4px",
          background: "#1a1a1a",
          borderRadius: "2px",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${percentage}%`,
            height: "100%",
            background: color,
            transition: "width 0.3s ease",
          }}
        />
      </div>
    </div>
  );
}
