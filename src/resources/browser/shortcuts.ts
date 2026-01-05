import { simulationKeywords } from "@/boids/vocabulary/keywords";
import { defineResource } from "braided";
import { RuntimeStoreResource } from "./runtimeStore";
import { SimulationResource } from "./simulation";

const shortcutModifiers = {
  shift: "shift",
  ctrl: "ctrl",
  meta: "meta",
};
type Modifiers = keyof typeof shortcutModifiers;

type Keymap =
  | `${Modifiers}+${string}`
  | `${Modifiers}+${Modifiers}+${string}`
  | string;

type Shortcut = {
  keymaps: Keymap[];
  handler: (event: KeyboardEvent) => void;
};

const evaluateKeymap = (keymap: string) => {
  const tokens = keymap.split("+");
  const modifiers = tokens.filter(
    (key) => shortcutModifiers[key as keyof typeof shortcutModifiers]
  );
  const keys = tokens.filter(
    (key) => !shortcutModifiers[key as keyof typeof shortcutModifiers]
  );
  if (keys.length === 0) {
    console.warn(`Invalid keymap: ${keymap} - Expected at least one key`);
    return null;
  }
  if (keys.length !== tokens.length - modifiers.length) {
    console.warn(`Invalid keymap: ${keymap} - Expected only one key`);
    return null;
  }
  return {
    key: keys[0],
    shift: modifiers.includes("shift"),
    ctrl: modifiers.includes("ctrl"),
    meta: modifiers.includes("meta"),
  };
};

export const shortcuts = defineResource({
  dependencies: ["simulation", "runtimeStore"],
  start: ({
    simulation,
    runtimeStore,
  }: {
    simulation: SimulationResource;
    runtimeStore: RuntimeStoreResource;
  }) => {
    const commands = {
      toggleTrails: () => {
        console.log("[Shortcuts] Toggling trails");
        simulation.dispatch({
          type: simulationKeywords.commands.toggleTrails,
        });
      },
      toggleEnergyBar: () => {
        console.log("[Shortcuts] Toggling energy bar");
        simulation.dispatch({
          type: simulationKeywords.commands.toggleEnergyBar,
        });
      },
      toggleMatingHearts: () => {
        console.log("[Shortcuts] Toggling mating hearts");
        simulation.dispatch({
          type: simulationKeywords.commands.toggleMatingHearts,
        });
      },
      toggleStanceSymbols: () => {
        console.log("[Shortcuts] Toggling stance symbols");
        simulation.dispatch({
          type: simulationKeywords.commands.toggleStanceSymbols,
        });
      },
      toggleRenderMode: () => {
        const currentMode = runtimeStore.store.getState().ui.rendererMode;
        const newMode = currentMode === "canvas" ? "webgl" : "canvas";
        console.log(
          `[Shortcuts] Toggling render mode: ${currentMode}->${newMode}`
        );
        simulation.dispatch({
          type: simulationKeywords.commands.setRendererMode,
          rendererMode: newMode,
        });
      },
      pause: () => {
        console.log("[Shortcuts] Pausing simulation");
        simulation.dispatch({
          type: simulationKeywords.commands.pause,
        });
      },
    };

    const shortcuts: Shortcut[] = [
      {
        keymaps: ["shift+t"],
        handler: commands.toggleTrails,
      },
      {
        keymaps: ["shift+e"],
        handler: commands.toggleEnergyBar,
      },
      {
        keymaps: ["shift+m"],
        handler: commands.toggleMatingHearts,
      },
      {
        keymaps: ["shift+s"],
        handler: commands.toggleStanceSymbols,
      },
      {
        keymaps: ["shift+r"],
        handler: commands.toggleRenderMode,
      },
      {
        keymaps: ["space"],
        handler: commands.pause,
      },
    ];

    const api = {
      initialize: () => {
        console.log("[Shortcuts] Initializing");
        document.addEventListener("keydown", api.handleKeyPress);
      },
      cleanup: () => {
        document.removeEventListener("keydown", api.handleKeyPress);
      },
      handleKeyPress: (e: KeyboardEvent) => {
        console.log(`[Shortcuts] Handling key press ${e.key ?? "[unknown]"}`);
        const shortcut = shortcuts.find((shortcut) => {
          return shortcut.keymaps.some((option) => {
            const result = evaluateKeymap(option);
            if (!result) {
              return false;
            }
            const { key, shift, ctrl, meta } = result;
            return (
              key.toLowerCase() === e.key.toLowerCase() &&
              shift === e.shiftKey &&
              ctrl === e.ctrlKey &&
              meta === e.metaKey
            );
          });
        });
        if (shortcut) {
          shortcut.handler(e);
        }
      },
    };

    api.initialize();

    return api;
  },
  halt: ({ cleanup }) => {
    cleanup();
  },
});
