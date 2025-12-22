import { Controls, type SpawnMode } from "./Controls";
import { EventsPanel } from "./EventsPanel";
import { PopulationStats } from "./PopulationStats";
import { PopulationGraph } from "./PopulationGraph";
import { EnergyGraph } from "./EnergyGraph";
import { BirthRatesGraph } from "./BirthRatesGraph";
import { DeathRatesGraph } from "./DeathRatesGraph";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "./ui/tabs";

type SimulationPanelProps = {
  spawnMode: SpawnMode;
  onSpawnModeChange: (_mode: SpawnMode) => void;
};

export function SimulationPanel({
  spawnMode,
  onSpawnModeChange,
}: SimulationPanelProps) {
  return (
    <div className="flex flex-col h-full bg-card border-l border-border">
      <Tabs defaultValue="controls" className="flex-1 flex flex-col">
        {/* Tab Headers */}
        <div className="border-b border-border bg-background/50 px-4 py-3">
          <TabsList variant="line" className="w-full justify-start gap-4">
            <TabsTrigger value="controls" className="gap-2">
              <span>🎛️</span>
              <span>Controls</span>
            </TabsTrigger>
            <TabsTrigger value="events" className="gap-2">
              <span>📡</span>
              <span>Events</span>
            </TabsTrigger>
            <TabsTrigger value="stats" className="gap-2">
              <span>📊</span>
              <span>Stats</span>
            </TabsTrigger>
            <TabsTrigger value="graphs" className="gap-2">
              <span>📈</span>
              <span>Graphs</span>
            </TabsTrigger>
          </TabsList>
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden">
          <TabsContent value="controls">
            <Controls
              spawnMode={spawnMode}
              onSpawnModeChange={onSpawnModeChange}
            />
          </TabsContent>

          <TabsContent value="events">
            <EventsPanel />
          </TabsContent>

          <TabsContent value="stats">
            <PopulationStats />
          </TabsContent>

          <TabsContent value="graphs">
            <div className="p-4 space-y-4">
              <PopulationGraph />
              <EnergyGraph />
              <BirthRatesGraph />
              <DeathRatesGraph />
            </div>
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}
