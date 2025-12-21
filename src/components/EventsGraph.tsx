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

export function EventsGraph() {
  const { useStore } = useResource("runtimeStore");
  const config = useResource("config");
  const analytics = useStore((state) => state.analytics);

  // Force re-render when analytics updates
  const [, setTick] = useState(0);

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

  // Get all type IDs from config
  const typeIds = Object.keys(config.types);

  // Build datasets - TRUE GROUPED BARS
  // Strategy: Create one dataset per species per event type
  // Use different stacks for births vs deaths to group them separately
  
  const birthDatasets = typeIds.map((typeId) => {
    const typeConfig = config.types[typeId];
    return {
      label: `${typeConfig.name} Births`,
      data: snapshots.map((snap) => snap.births[typeId] || 0),
      backgroundColor: typeConfig.color + "DD", // Bright for births
      borderColor: typeConfig.color,
      borderWidth: 1,
      stack: "births", // All births in one group
    };
  });

  const deathDatasets = typeIds.map((typeId) => {
    const typeConfig = config.types[typeId];
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

  // Debug: Log total births and deaths to console
  const totalBirths = snapshots.reduce(
    (sum, snap) => sum + Object.values(snap.births).reduce((a, b) => a + b, 0),
    0
  );
  const totalDeaths = snapshots.reduce(
    (sum, snap) => sum + Object.values(snap.deaths).reduce((a, b) => a + b, 0),
    0
  );
  console.log(
    `📊 Events Graph: ${totalBirths} total births, ${totalDeaths} total deaths across ${snapshots.length} snapshots`
  );

  const options: ChartOptions<"bar"> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: "top" as const,
        labels: {
          color: "#00ff88",
          font: {
            size: 11,
          },
          usePointStyle: true,
          padding: 10,
        },
      },
      title: {
        display: true,
        text: "Birth & Death Rates (per 3-second interval)",
        color: "#00ff88",
        font: {
          size: 16,
          weight: "bold",
        },
        padding: {
          top: 10,
          bottom: 20,
        },
      },
      tooltip: {
        mode: "index",
        intersect: false,
        backgroundColor: "rgba(0, 0, 0, 0.9)",
        titleColor: "#00ff88",
        bodyColor: "#fff",
        borderColor: "#333",
        borderWidth: 1,
        padding: 12,
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
        display: true,
        title: {
          display: true,
          text: "Time (ticks)",
          color: "#888",
          font: {
            size: 12,
          },
        },
        ticks: {
          color: "#666",
          maxTicksLimit: 10,
          font: {
            size: 10,
          },
        },
        grid: {
          color: "#222",
          drawOnChartArea: true,
        },
        stacked: false, // Don't stack X-axis (allows grouping)
      },
      y: {
        display: true,
        title: {
          display: true,
          text: "Events Count",
          color: "#888",
          font: {
            size: 12,
          },
        },
        ticks: {
          color: "#666",
          font: {
            size: 10,
          },
        },
        grid: {
          color: "#222",
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
    <div
      style={{
        padding: "16px",
        background: "#0a0a0a",
        borderRadius: "8px",
        border: "1px solid #333",
        marginBottom: "16px",
      }}
    >
      <div style={{ height: "300px" }}>
        <Bar data={chartData} options={options} />
      </div>
      <div
        style={{
          marginTop: "12px",
          fontSize: "11px",
          color: "#666",
          textAlign: "center",
        }}
      >
        Births (bright) and Deaths (dim) grouped by species • Showing last{" "}
        {snapshots.length} intervals • Toggle legend to show/hide
      </div>
    </div>
  );
}

