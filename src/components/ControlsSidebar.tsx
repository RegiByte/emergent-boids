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
} from "@tabler/icons-react";
import { toast } from "sonner";

export type SpawnMode = "obstacle" | "predator";

type ControlsSidebarProps = {
  spawnMode: SpawnMode;
  onSpawnModeChange: (mode: SpawnMode) => void;
};

export function ControlsSidebar({
  spawnMode,
  onSpawnModeChange,
}: ControlsSidebarProps) {
  const { useStore } = useResource("runtimeStore");
  const runtimeStore = useStore((state) => state);
  const { config, simulation } = runtimeStore;
  const analytics = useStore((state) => state.analytics);
  const runtimeController = useResource("runtimeController");
  const engine = useResource("engine");
  const speciesIds = Object.keys(config.species);
  const [activeTab, setActiveTab] = useState<"controls" | "species">(
    "controls"
  );
  const [activeSpecies, setActiveSpecies] = useState(speciesIds[0] || "explorer");

  const species = config.species[activeSpecies];

  return (
    <Sidebar collapsible="offExamples" variant="inset">
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
          </SidebarMenu>
        </SidebarGroup>

        <Separator />

        {/* Controls Tab */}
        {activeTab === "controls" && (
          <>
            {/* Global Settings */}
            <SidebarGroup>
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
            <SidebarGroup>
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
            <SidebarGroup>
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
          </>
        )}

        {/* Species Tab */}
        {activeTab === "species" && (
          <>
            {/* Species Selector */}
            <SidebarGroup>
              <SidebarGroupLabel>Select Species</SidebarGroupLabel>
              <SidebarGroupContent className="px-4">
                <div className="flex flex-wrap gap-2">
                  {speciesIds.map((typeId) => {
                    const sp = config.species[typeId];
                    return (
                      <Button
                        key={typeId}
                        variant={activeSpecies === typeId ? "default" : "outline"}
                        size="sm"
                        onClick={() => setActiveSpecies(typeId)}
                        style={{
                          backgroundColor:
                            activeSpecies === typeId ? sp.color : undefined,
                          borderColor: sp.color,
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
              <SidebarGroup>
                <SidebarGroupLabel
                  style={{ color: species.color }}
                >
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
                              const value = Array.isArray(values) ? values[0] : values;
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
                              const value = Array.isArray(values) ? values[0] : values;
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
                              const value = Array.isArray(values) ? values[0] : values;
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
                              const value = Array.isArray(values) ? values[0] : values;
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
                              const value = Array.isArray(values) ? values[0] : values;
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
      </SidebarContent>
    </Sidebar>
  );
}

