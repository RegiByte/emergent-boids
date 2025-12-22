import { useEffect, useState } from "react";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  ChartOptions,
} from "chart.js";
import { Line } from "react-chartjs-2";
import { useResource } from "../system";

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
);

type EnergyGraphProps = {
  compact?: boolean;
};

export function EnergyGraph({ compact = false }: EnergyGraphProps) {
  const { useStore } = useResource("runtimeStore");
  const species = useStore((state) => state.config.species);
  const analytics = useStore((state) => state.analytics);

  // Force re-render when analytics updates
  const [, setTick] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setTick((prev) => prev + 1);
    }, 3000); // Update every 3 seconds (matches snapshot interval)

    return () => clearInterval(interval);
  }, []);

  // Take last 100 snapshots (or all if less) - ~5 minutes of data
  const snapshots = analytics.evolutionHistory.slice(-100);

  if (snapshots.length === 0) {
    return (
      <div
        style={{
          padding: "20px",
          textAlign: "center",
          color: "#666",
          fontSize: "14px",
        }}
      >
        ⚡ Collecting energy data...
      </div>
    );
  }

  // Build labels (tick numbers)
  const labels = snapshots.map((snap) => snap.tick.toString());

  // Get all type IDs from species config
  const typeIds = Object.keys(species);

  // Build datasets for each species
  const datasets = typeIds.map((typeId) => {
    const typeConfig = species[typeId];
    return {
      label: typeConfig.name,
      data: snapshots.map((snap) => snap.avgEnergy[typeId] || 0),
      borderColor: typeConfig.color,
      backgroundColor: typeConfig.color + "40", // Add transparency
      borderWidth: 2,
      pointRadius: 0, // Hide points for cleaner look
      pointHoverRadius: 4,
      tension: 0.1, // Slight curve
    };
  });

  const chartData = {
    labels,
    datasets,
  };

  const options: ChartOptions<"line"> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: !compact,
        position: "top" as const,
        labels: {
          color: "hsl(var(--primary))",
          font: {
            size: compact ? 9 : 12,
          },
          usePointStyle: true,
          padding: compact ? 8 : 15,
        },
      },
      title: {
        display: true,
        text: compact ? "Energy" : "Average Energy Over Time",
        color: "hsl(var(--primary))",
        font: {
          size: compact ? 11 : 16,
          weight: "bold",
        },
        padding: {
          top: compact ? 4 : 10,
          bottom: compact ? 8 : 20,
        },
      },
      tooltip: {
        mode: "index",
        intersect: false,
        backgroundColor: "hsl(var(--popover))",
        titleColor: "hsl(var(--primary))",
        bodyColor: "hsl(var(--popover-foreground))",
        borderColor: "hsl(var(--border))",
        borderWidth: 1,
        padding: compact ? 8 : 12,
        displayColors: true,
        callbacks: {
          title: (context) => {
            const tick = context[0].label;
            return `Tick ${tick}`;
          },
          label: (context) => {
            const label = context.dataset.label || "";
            const value = context.parsed.y;
            return `${label}: ${value?.toFixed(1) ?? 0} energy`;
          },
        },
      },
    },
    scales: {
      x: {
        display: !compact,
        title: {
          display: !compact,
          text: "Time (ticks)",
          color: "hsl(var(--muted-foreground))",
          font: {
            size: compact ? 9 : 12,
          },
        },
        ticks: {
          color: "hsl(var(--muted-foreground))",
          maxTicksLimit: compact ? 5 : 10,
          font: {
            size: compact ? 8 : 10,
          },
        },
        grid: {
          color: "hsl(var(--border))",
          drawOnChartArea: true,
        },
      },
      y: {
        display: true,
        title: {
          display: !compact,
          text: "Average Energy",
          color: "hsl(var(--muted-foreground))",
          font: {
            size: compact ? 9 : 12,
          },
        },
        ticks: {
          color: "hsl(var(--muted-foreground))",
          font: {
            size: compact ? 8 : 10,
          },
          maxTicksLimit: compact ? 4 : undefined,
        },
        grid: {
          color: "hsl(var(--border))",
          drawOnChartArea: true,
        },
        beginAtZero: true,
        max: 150, // Max energy (predators have 150 max)
      },
    },
    interaction: {
      mode: "nearest",
      axis: "x",
      intersect: false,
    },
  };

  if (compact) {
    return (
      <div className="h-full w-full bg-slate-100/40 rounded-md border border-border p-2 max-h-42">
        <Line data={chartData} options={options} />
      </div>
    );
  }

  return (
    <div className="p-4 bg-card rounded-lg border border-border mb-4">
      <div style={{ height: "300px" }}>
        <Line data={chartData} options={options} />
      </div>
      <div className="mt-3 text-xs text-muted-foreground text-center">
        Energy trends help identify starvation patterns and resource imbalances
      </div>
    </div>
  );
}
