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

export function PopulationGraph() {
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

  // Get all type IDs from config
  const typeIds = Object.keys(config.types);

  // Build datasets for each species
  const datasets = typeIds.map((typeId) => {
    const typeConfig = config.types[typeId];
    return {
      label: typeConfig.name,
      data: snapshots.map((snap) => snap.populations[typeId] || 0),
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
        position: "top" as const,
        labels: {
          color: "#00ff88",
          font: {
            size: 12,
          },
          usePointStyle: true,
          padding: 15,
        },
      },
      title: {
        display: true,
        text: "Population Over Time",
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
            const value = context.parsed.y;
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
      },
      y: {
        display: true,
        title: {
          display: true,
          text: "Population",
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
        beginAtZero: true,
        max: 200, // Show up to 200 to see caps clearly
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
        <Line data={chartData} options={options} />
      </div>
      <div
        style={{
          marginTop: "12px",
          fontSize: "11px",
          color: "#666",
          textAlign: "center",
        }}
      >
        Showing last {snapshots.length} snapshots (~
        {Math.floor((snapshots.length * 3) / 60)} minutes)
      </div>
    </div>
  );
}

