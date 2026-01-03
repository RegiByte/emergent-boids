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
import { useResource } from "../systems/standard.ts";

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
);

type PopulationGraphProps = {
  compact?: boolean;
};

export function PopulationGraph({ compact = false }: PopulationGraphProps) {
  const { useStore: useRuntimeStore } = useResource("runtimeStore");
  const { useStore: useAnalyticsStore } = useResource("analyticsStore");
  const species = useRuntimeStore((state) => state.config.species);
  const analytics = useAnalyticsStore((state) => state.evolution.data);

  // Force re-render when analytics updates
  const [, setTick] = useState(0);

  // Get computed CSS colors from the document
  const getColor = (varName: string) => {
    if (typeof window === "undefined") return "#666";
    const style = getComputedStyle(document.documentElement);
    const value = style.getPropertyValue(varName).trim();
    return value || "#666";
  };

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
        📊 Collecting data... (snapshots appear every 3 seconds)
      </div>
    );
  }

  // Build labels (tick numbers or time)
  const labels = snapshots.map((snap) => snap.tick.toString());

  // Get all type IDs from species config
  const typeIds = Object.keys(species);

  // Build datasets for each species
  const datasets = typeIds.map((typeId) => {
    const typeConfig = species[typeId];
    return {
      label: typeConfig.name,
      data: snapshots.map((snap) => snap.populations[typeId] || 0),
      borderColor: typeConfig.baseGenome.visual.color,
      backgroundColor: typeConfig.baseGenome.visual.color + "40", // Add transparency
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
        display: compact ? false : true,
        position: "bottom" as const,
        align: "start" as const,
        labels: {
          color: getColor("--color-foreground"),
          font: {
            size: 8,
          },
          usePointStyle: true,
          padding: 8,
        },
      },
      title: {
        display: true,
        text: "Population Over Time",
        color: getColor("--color-foreground"),
        font: {
          size: 10,
          weight: "bold",
        },
        padding: {
          top: 0,
          bottom: 8,
        },
      },
      tooltip: {
        mode: "index",
        intersect: false,
        backgroundColor: getColor("--color-popover"),
        titleColor: getColor("--color-foreground"),
        bodyColor: getColor("--color-popover-foreground"),
        borderColor: getColor("--color-border"),
        borderWidth: 2,
        padding: 10,
        displayColors: true,
        callbacks: {
          title: (context) => {
            const tick = context[0].label;
            return `Tick ${tick}`;
          },
          label: (context) => {
            const label = context.dataset.label || "";
            const value = context.parsed.y;
            return `${label}: ${value}`;
          },
        },
      },
    },
    scales: {
      x: {
        display: !compact,
        title: {
          display: !compact,
          text: `Time (last ${snapshots.length} ticks)`,
          color: getColor("--color-muted-foreground"),
          font: {
            size: 9,
            family: "monospace",
          },
        },
        ticks: {
          color: getColor("--color-muted-foreground"),
          maxTicksLimit: compact ? 5 : 10,
          font: {
            size: 8,
            family: "monospace",
          },
        },
        grid: {
          color: getColor("--color-border"),
          drawOnChartArea: true,
        },
      },
      y: {
        display: true,
        max: 2000,
        title: {
          display: !compact,
          text: "Population",
          color: getColor("--color-muted-foreground"),
          font: {
            size: 9,
            family: "monospace",
          },
        },
        ticks: {
          color: getColor("--color-muted-foreground"),
          font: {
            size: 8,
            family: "monospace",
          },
          maxTicksLimit: 4,
        },
        grid: {
          color: getColor("--color-border"),
          drawOnChartArea: true,
        },
        beginAtZero: true,
      },
    },
    interaction: {
      mode: "nearest",
      axis: "x",
      intersect: false,
    },
  };

  return (
    <div className="h-full bg-background w-full rounded-md border border-border p-2 max-h-42">
      <Line data={chartData} options={options} />
    </div>
  );
}
