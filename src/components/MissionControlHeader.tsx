import { cn } from "@/lib/utils";
import { GraphBar } from "./GraphBar";
import { ProfileSelector } from "./ProfileSelector";
import { IconChevronDown, IconChevronUp } from "@tabler/icons-react";
import { motion } from "motion/react";

type MissionControlHeaderProps = {
  showGraphs?: boolean;
  collapsed: boolean;
  onToggleCollapse: () => void;
};

export function MissionControlHeader({
  showGraphs = true,
  collapsed,
  onToggleCollapse,
}: MissionControlHeaderProps) {
  if (collapsed) {
    // Show only the expand button when collapsed
    return (
      <motion.div
        initial={{ y: 0, opacity: 1 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: -20, opacity: 0 }}
        transition={{ duration: 0.1, ease: "easeOut" }}
        className="z-60"
      >
        <motion.button
          onClick={onToggleCollapse}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          className="bg-card border border-primary/30 rounded-b-lg px-3 py-1.5 shadow-lg hover:bg-primary/10 transition-colors flex items-center gap-1"
          title="Expand Mission Control"
        >
          <IconChevronDown size={16} className="text-primary" />
          <span className="text-xs text-primary font-mono">
            Show Mission Control
          </span>
        </motion.button>
      </motion.div>
    );
  }

  return (
    <header className="relative flex items-center gap-2 border-b bg-card px-4 py-3 w-full">
      <div className="flex-1 flex flex-col items-center gap-4">
        <div>
          <h1 className="text-lg font-bold text-primary">
            🐦 Emergent Boids: Predator/Prey Ecosystem
          </h1>
          <p className="text-xs text-muted-foreground">
            Simple rules → Complex dynamics
          </p>
        </div>
        {/* Profile Selector */}
        <ProfileSelector />
      </div>
      {showGraphs && (
        <div className="max-w-[600px]">
          <GraphBar />
        </div>
      )}
      <div className="flex-1"></div>

      {/* Collapse button at bottom-right of header */}
      <motion.button
        onClick={onToggleCollapse}
        whileHover={{ scale: 1.1, rotate: 180 }}
        whileTap={{ scale: 0.9 }}
        transition={{ duration: 0.2 }}
        className={cn(
          "absolute bottom-0 right-4 transform translate-y-1/2",
          "bg-card border border-primary/30 rounded-full p-2 shadow-lg hover:bg-primary/10 transition-colors z-60"
        )}
        title="Collapse Mission Control"
      >
        <IconChevronUp size={16} className="text-primary" />
      </motion.button>
    </header>
  );
}
