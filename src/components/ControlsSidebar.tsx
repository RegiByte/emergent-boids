import { useState } from "react";
import { useResource } from "@/system";
import { eventKeywords } from "@/boids/vocabulary/keywords";
import {
  exportCurrentStats,
  exportEvolutionCSV,
  copyToClipboard,
} from "@/utils/exportData";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Kbd } from "@/components/ui/kbd";
import {
  IconSettings,
  IconDna,
  IconAdjustments,
  IconClick,
  IconDatabase,
  IconRefresh,
  IconCopy,
  IconActivity,
  IconChartBar,
  IconChartLine,
} from "@tabler/icons-react";
import { toast } from "sonner";
import { generateRandomSeed } from "@/lib/seededRandom";
import { EventsPanel } from "./EventsPanel";
import { PopulationStats } from "./PopulationStats";
import { PopulationGraph } from "./PopulationGraph";
import { EnergyGraph } from "./EnergyGraph";
import { BirthRatesGraph } from "./BirthRatesGraph";
import { DeathRatesGraph } from "./DeathRatesGraph";

export type SpawnMode = "obstacle" | "predator";

type ControlsSidebarProps = {
  spawnMode: SpawnMode;
  onSpawnModeChange: (mode: SpawnMode) => void;
};

export function ControlsSidebar({
  spawnMode,
  onSpawnModeChange,
}: ControlsSidebarProps) {
  const { useStore: useRuntimeStore } = useResource("runtimeStore");
  const { useStore: useAnalyticsStore } = useResource("analyticsStore");
  const runtimeStore = useRuntimeStore((state) => state);
  const { config, simulation } = runtimeStore;
  const analytics = useAnalyticsStore((state) => state.evolution.data);
  const runtimeController = useResource("runtimeController");
  const engine = useResource("engine");
  const randomness = useResource("randomness");
  const speciesIds = Object.keys(config.species);
  const [activeTab, setActiveTab] = useState<
    "controls" | "species" | "events" | "stats" | "graphs"
  >("controls");
  const [activeSpecies, setActiveSpecies] = useState(
    speciesIds[0] || "explorer"
  );
  const [seedInput, setSeedInput] = useState(config.randomSeed || "");

  const species = config.species[activeSpecies];

  return (
    <Sidebar
      collapsible="offExamples"
      variant="inset"
      className="bg-background"
    >
      <SidebarContent>
        {/* Tab Navigation */}
        <SidebarGroup>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                onClick={() => setActiveTab("controls")}
                isActive={activeTab === "controls"}
                tooltip="Controls"
              >
                <IconSettings className="size-4" />
                <span>Controls</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton
                onClick={() => setActiveTab("species")}
                isActive={activeTab === "species"}
                tooltip="Species"
              >
                <IconDna className="size-4" />
                <span>Species</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton
                onClick={() => setActiveTab("events")}
                isActive={activeTab === "events"}
                tooltip="Events"
              >
                <IconActivity className="size-4" />
                <span>Events</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton
                onClick={() => setActiveTab("stats")}
                isActive={activeTab === "stats"}
                tooltip="Stats"
              >
                <IconChartBar className="size-4" />
                <span>Stats</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton
                onClick={() => setActiveTab("graphs")}
                isActive={activeTab === "graphs"}
                tooltip="Graphs"
              >
                <IconChartLine className="size-4" />
                <span>Graphs</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>

        <Separator />

        {/* Controls Tab */}
        {activeTab === "controls" && (
          <>
            {/* Global Settings */}
            <SidebarGroup className="px-0">
              <SidebarGroupLabel>
                <IconAdjustments className="size-4 mr-2" />
                Global Settings
              </SidebarGroupLabel>
              <SidebarGroupContent className="px-4 space-y-4">
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <Label className="text-xs">Perception Radius</Label>
                    <span className="text-xs font-mono text-primary">
                      {config.parameters.perceptionRadius.toFixed(0)}
                    </span>
                  </div>
                  <Slider
                    value={[config.parameters.perceptionRadius]}
                    onValueChange={(values) => {
                      const value = Array.isArray(values) ? values[0] : values;
                      runtimeController.dispatch({
                        type: eventKeywords.controls.perceptionRadiusChanged,
                        value,
                      });
                    }}
                    min={10}
                    max={150}
                    step={5}
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <Label className="text-xs">Obstacle Avoidance</Label>
                    <span className="text-xs font-mono text-primary">
                      {config.parameters.obstacleAvoidanceWeight.toFixed(2)}
                    </span>
                  </div>
                  <Slider
                    value={[config.parameters.obstacleAvoidanceWeight]}
                    onValueChange={(values) => {
                      const value = Array.isArray(values) ? values[0] : values;
                      runtimeController.dispatch({
                        type: eventKeywords.controls.obstacleAvoidanceChanged,
                        value,
                      });
                    }}
                    min={0}
                    max={5}
                    step={0.1}
                  />
                </div>
              </SidebarGroupContent>
            </SidebarGroup>

            <Separator />

            {/* Canvas Mode */}
            <SidebarGroup className="px-0">
              <SidebarGroupLabel>
                <IconClick className="size-4 mr-2" />
                Canvas Click Mode
              </SidebarGroupLabel>
              <SidebarGroupContent className="px-4 space-y-3">
                <div className="flex gap-2">
                  <Button
                    variant={spawnMode === "obstacle" ? "default" : "outline"}
                    size="sm"
                    className="flex-1"
                    onClick={() => {
                      onSpawnModeChange("obstacle");
                      toast.info("Mode: Place Obstacles");
                    }}
                  >
                    🚧 Obstacle
                  </Button>
                  <Button
                    variant={spawnMode === "predator" ? "default" : "outline"}
                    size="sm"
                    className="flex-1"
                    onClick={() => {
                      onSpawnModeChange("predator");
                      toast.info("Mode: Spawn Predators");
                    }}
                  >
                    🦅 Predator
                  </Button>
                </div>

                <div className="text-xs text-muted-foreground space-y-1">
                  <div className="flex items-center gap-2">
                    <Kbd>Space</Kbd>
                    <span>Toggle mode</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Kbd>Esc</Kbd>
                    <span>Clear obstacles</span>
                  </div>
                </div>

                <Card className="bg-muted/50">
                  <CardHeader className="p-3">
                    <CardTitle className="text-xs flex items-center justify-between">
                      <span>Obstacles</span>
                      <Badge variant="secondary">
                        {simulation.obstacles.length}
                      </Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-3 pt-0">
                    <Button
                      variant="destructive"
                      size="sm"
                      className="w-full"
                      onClick={() => {
                        runtimeController.dispatch({
                          type: eventKeywords.obstacles.cleared,
                        });
                        toast.success("All obstacles cleared");
                      }}
                    >
                      Clear All
                    </Button>
                  </CardContent>
                </Card>
              </SidebarGroupContent>
            </SidebarGroup>

            <Separator />

            {/* Data Export */}
            <SidebarGroup className="px-0">
              <SidebarGroupLabel>
                <IconDatabase className="size-4 mr-2" />
                Data Export
              </SidebarGroupLabel>
              <SidebarGroupContent className="px-4 space-y-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full justify-start"
                  onClick={() => {
                    const json = exportCurrentStats(engine, runtimeStore);
                    copyToClipboard(json, "Current Stats (JSON)");
                    toast.success("Stats copied to clipboard!");
                  }}
                >
                  📋 Copy Current Stats
                </Button>

                <Button
                  variant="outline"
                  size="sm"
                  className="w-full justify-start"
                  onClick={() => {
                    const csv = exportEvolutionCSV(analytics.evolutionHistory);
                    copyToClipboard(csv, "Evolution Data (CSV)");
                    toast.success("Evolution data copied!");
                  }}
                >
                  📈 Copy Evolution Data
                </Button>

                <p className="text-xs text-muted-foreground">
                  {analytics.evolutionHistory.length} snapshots collected
                </p>
              </SidebarGroupContent>
            </SidebarGroup>

            <Separator />

            {/* Random Seed */}
            <SidebarGroup className="px-0">
              <SidebarGroupLabel>🎲 Random Seed</SidebarGroupLabel>
              <SidebarGroupContent className="px-4 space-y-3">
                <div className="space-y-2">
                  <Label className="text-xs">Current Seed</Label>
                  <div className="flex gap-2">
                    <Input
                      value={seedInput}
                      onChange={(e) => setSeedInput(e.target.value)}
                      placeholder="Enter seed..."
                      className="flex-1 text-xs font-mono"
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && seedInput.trim()) {
                          randomness.setSeed(seedInput.trim());
                          toast.success(`Seed set to: ${seedInput.trim()}`);
                        }
                      }}
                    />
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => {
                        if (config.randomSeed) {
                          navigator.clipboard.writeText(config.randomSeed);
                          toast.success("Seed copied to clipboard!");
                        }
                      }}
                      title="Copy seed"
                    >
                      <IconCopy className="size-4" />
                    </Button>
                  </div>
                </div>

                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={() => {
                      if (seedInput.trim()) {
                        randomness.setSeed(seedInput.trim());
                        toast.success(`Seed applied: ${seedInput.trim()}`);
                      } else {
                        toast.error("Please enter a seed");
                      }
                    }}
                  >
                    Apply Seed
                  </Button>
                  <Button
                    variant="default"
                    size="sm"
                    className="flex-1"
                    onClick={() => {
                      const newSeed = generateRandomSeed();
                      setSeedInput(newSeed);
                      randomness.setSeed(newSeed);
                      toast.success("Random seed generated!");
                    }}
                  >
                    <IconRefresh className="size-4 mr-1" />
                    Random
                  </Button>
                </div>

                <div className="text-xs text-muted-foreground space-y-1">
                  <p>
                    <strong>Active:</strong>{" "}
                    <code className="text-primary">
                      {config.randomSeed || "default-seed"}
                    </code>
                  </p>
                  <p className="text-[10px] leading-tight">
                    Same seed = reproducible simulation. Share seeds with others
                    for identical results!
                  </p>
                </div>
              </SidebarGroupContent>
            </SidebarGroup>
          </>
        )}

        {/* Species Tab */}
        {activeTab === "species" && (
          <>
            {/* Species Selector */}
            <SidebarGroup className="px-0">
              <SidebarGroupLabel>Select Species</SidebarGroupLabel>
              <SidebarGroupContent className="px-4">
                <div className="flex flex-wrap gap-2">
                  {speciesIds.map((typeId) => {
                    const sp = config.species[typeId];
                    return (
                      <Button
                        key={typeId}
                        variant={
                          activeSpecies === typeId ? "default" : "outline"
                        }
                        size="sm"
                        onClick={() => setActiveSpecies(typeId)}
                        style={{
                          backgroundColor:
                            activeSpecies === typeId
                              ? sp.visual.color
                              : undefined,
                          borderColor: sp.visual.color,
                          color: activeSpecies === typeId ? "#000" : undefined,
                        }}
                      >
                        {sp.name}
                      </Button>
                    );
                  })}
                </div>
              </SidebarGroupContent>
            </SidebarGroup>

            <Separator />

            {/* Species Settings */}
            {species && (
              <SidebarGroup className="px-0">
                <SidebarGroupLabel style={{ color: species.visual.color }}>
                  {species.name} Settings
                </SidebarGroupLabel>
                <SidebarGroupContent className="px-4">
                  <Accordion defaultValue={["movement"]}>
                    <AccordionItem value="movement">
                      <AccordionTrigger>Movement</AccordionTrigger>
                      <AccordionContent className="space-y-4 px-2">
                        <div className="space-y-2">
                          <div className="flex justify-between items-center">
                            <Label className="text-xs">Separation</Label>
                            <span className="text-xs font-mono text-primary">
                              {species.movement.separationWeight.toFixed(2)}
                            </span>
                          </div>
                          <Slider
                            value={[species.movement.separationWeight]}
                            onValueChange={(values) => {
                              const value = Array.isArray(values)
                                ? values[0]
                                : values;
                              runtimeController.dispatch({
                                type: eventKeywords.controls.typeConfigChanged,
                                typeId: activeSpecies,
                                field: "separationWeight",
                                value,
                              });
                            }}
                            min={0}
                            max={3}
                            step={0.1}
                          />
                        </div>

                        <div className="space-y-2">
                          <div className="flex justify-between items-center">
                            <Label className="text-xs">Alignment</Label>
                            <span className="text-xs font-mono text-primary">
                              {species.movement.alignmentWeight.toFixed(2)}
                            </span>
                          </div>
                          <Slider
                            value={[species.movement.alignmentWeight]}
                            onValueChange={(values) => {
                              const value = Array.isArray(values)
                                ? values[0]
                                : values;
                              runtimeController.dispatch({
                                type: eventKeywords.controls.typeConfigChanged,
                                typeId: activeSpecies,
                                field: "alignmentWeight",
                                value,
                              });
                            }}
                            min={0}
                            max={3}
                            step={0.1}
                          />
                        </div>

                        <div className="space-y-2">
                          <div className="flex justify-between items-center">
                            <Label className="text-xs">Cohesion</Label>
                            <span className="text-xs font-mono text-primary">
                              {species.movement.cohesionWeight.toFixed(2)}
                            </span>
                          </div>
                          <Slider
                            value={[species.movement.cohesionWeight]}
                            onValueChange={(values) => {
                              const value = Array.isArray(values)
                                ? values[0]
                                : values;
                              runtimeController.dispatch({
                                type: eventKeywords.controls.typeConfigChanged,
                                typeId: activeSpecies,
                                field: "cohesionWeight",
                                value,
                              });
                            }}
                            min={0}
                            max={3}
                            step={0.1}
                          />
                        </div>

                        <div className="space-y-2">
                          <div className="flex justify-between items-center">
                            <Label className="text-xs">Max Speed</Label>
                            <span className="text-xs font-mono text-primary">
                              {species.movement.maxSpeed.toFixed(2)}
                            </span>
                          </div>
                          <Slider
                            value={[species.movement.maxSpeed]}
                            onValueChange={(values) => {
                              const value = Array.isArray(values)
                                ? values[0]
                                : values;
                              runtimeController.dispatch({
                                type: eventKeywords.controls.typeConfigChanged,
                                typeId: activeSpecies,
                                field: "maxSpeed",
                                value,
                              });
                            }}
                            min={1}
                            max={10}
                            step={0.5}
                          />
                        </div>

                        <div className="space-y-2">
                          <div className="flex justify-between items-center">
                            <Label className="text-xs">Max Force</Label>
                            <span className="text-xs font-mono text-primary">
                              {species.movement.maxForce.toFixed(3)}
                            </span>
                          </div>
                          <Slider
                            value={[species.movement.maxForce]}
                            onValueChange={(values) => {
                              const value = Array.isArray(values)
                                ? values[0]
                                : values;
                              runtimeController.dispatch({
                                type: eventKeywords.controls.typeConfigChanged,
                                typeId: activeSpecies,
                                field: "maxForce",
                                value,
                              });
                            }}
                            min={0.01}
                            max={0.5}
                            step={0.01}
                          />
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  </Accordion>
                </SidebarGroupContent>
              </SidebarGroup>
            )}
          </>
        )}

        {/* Events Tab */}
        {activeTab === "events" && (
          <SidebarGroup className="px-0">
            <SidebarGroupContent className="px-0">
              <EventsPanel />
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {/* Stats Tab */}
        {activeTab === "stats" && (
          <SidebarGroup className="px-0">
            <SidebarGroupContent className="px-0">
              <PopulationStats />
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {/* Graphs Tab */}
        {activeTab === "graphs" && (
          <SidebarGroup className="px-0">
            <SidebarGroupContent className="px-4 space-y-4">
              <PopulationGraph />
              <EnergyGraph />
              <BirthRatesGraph />
              <DeathRatesGraph />
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>
    </Sidebar>
  );
}
