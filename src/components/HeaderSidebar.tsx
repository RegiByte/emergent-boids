import { GraphBar } from "./GraphBar";

type HeaderSidebarProps = {
  showGraphs?: boolean;
};

export function HeaderSidebar({ showGraphs = true }: HeaderSidebarProps) {
  return (
    <header className="flex items-center gap-2 border-b bg-card px-4 py-3 w-full">
      <div className="flex-1">
        <h1 className="text-lg font-bold text-primary">
          🐦 Emergent Boids: Predator/Prey Ecosystem
        </h1>
        <p className="text-xs text-muted-foreground">
          Simple rules → Complex dynamics
        </p>
      </div>
      {showGraphs && (
        <div className="max-w-[600px]">
          <GraphBar />
        </div>
      )}
      <div className="flex-1"></div>
    </header>
  );
}
