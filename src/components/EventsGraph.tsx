import { useEffect, useState } from "react";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ChartOptions,
} from "chart.js";
import { Bar } from "react-chartjs-2";
import { useResource } from "../system";

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend
);

type EventsGraphProps = {
  compact?: boolean;
};

export function EventsGraph({ compact = false }: EventsGraphProps) {
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

  // Take last 50 snapshots (or all if less) - ~2.5 minutes of data
  // (fewer snapshots for bar chart readability)
  const snapshots = analytics.evolutionHistory.slice(-50);

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
        🔄 Collecting event data...
      </div>
    );
  }

  // Build labels (tick numbers)
  const labels = snapshots.map((snap) => snap.tick.toString());

  // Get all type IDs from species config
  const speciesIds = Object.keys(species);

  // Build datasets - TRUE GROUPED BARS
  // Strategy: Create one dataset per species per event type
  // Use different stacks for births vs deaths to group them separately

  const birthDatasets = speciesIds.map((typeId) => {
    const typeConfig = species[typeId];
    return {
      label: `${typeConfig.name} Births`,
      data: snapshots.map((snap) => snap.births[typeId] || 0),
      backgroundColor: typeConfig.color + "DD", // Bright for births
      borderColor: typeConfig.color,
      borderWidth: 1,
      stack: "births", // All births in one group
    };
  });

  const deathDatasets = speciesIds.map((typeId) => {
    const typeConfig = species[typeId];
    return {
      label: `${typeConfig.name} Deaths`,
      data: snapshots.map((snap) => snap.deaths[typeId] || 0), // Positive values
      backgroundColor: typeConfig.color + "50", // Dim for deaths
      borderColor: typeConfig.color + "AA",
      borderWidth: 1,
      stack: "deaths", // All deaths in separate group
    };
  });

  const chartData = {
    labels,
    datasets: [...birthDatasets, ...deathDatasets],
  };

  const options: ChartOptions<"bar"> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: !compact,
        position: "top" as const,
        labels: {
          color: getColor("--color-foreground"),
          font: {
            size: compact ? 8 : 11,
          },
          usePointStyle: true,
          padding: compact ? 6 : 10,
        },
      },
      title: {
        display: true,
        text: compact
          ? "Events"
          : "Birth & Death Rates (per 3-second interval)",
        color: getColor("--color-foreground"),
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
        backgroundColor: getColor("--color-popover"),
        titleColor: getColor("--color-foreground"),
        bodyColor: getColor("--color-popover-foreground"),
        borderColor: getColor("--color-border"),
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
            const value = Math.abs(context.parsed.y ?? 0); // Show absolute value
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
          text: "Time (ticks)",
          color: getColor("--color-muted-foreground"),
          font: {
            size: compact ? 9 : 12,
          },
        },
        ticks: {
          color: getColor("--color-muted-foreground"),
          maxTicksLimit: compact ? 5 : 10,
          font: {
            size: compact ? 8 : 10,
          },
        },
        grid: {
          color: getColor("--color-border"),
          drawOnChartArea: true,
        },
        stacked: false, // Don't stack X-axis (allows grouping)
      },
      y: {
        display: true,
        title: {
          display: !compact,
          text: "Events Count",
          color: getColor("--color-muted-foreground"),
          font: {
            size: compact ? 9 : 12,
          },
        },
        ticks: {
          color: getColor("--color-muted-foreground"),
          font: {
            size: compact ? 8 : 10,
          },
          maxTicksLimit: compact ? 4 : undefined,
        },
        grid: {
          color: getColor("--color-border"),
          drawOnChartArea: true,
        },
        stacked: false, // Don't stack Y-axis (allows grouping)
      },
    },
    interaction: {
      mode: "nearest",
      axis: "x",
      intersect: false,
    },
  };

  return (
    <div className="h-full w-full bg-background rounded-md border border-border p-2 max-h-42">
      <Bar data={chartData} options={options} />
    </div>
  );
}
