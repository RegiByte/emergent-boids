import { simulationKeywords } from "@/boids/vocabulary/keywords";
import { throttle } from "@tanstack/pacer";
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

const isSpace = (key: string) => {
  return key === " " || key === "Space";
};

const spaceOrKey = (key: string) => {
  return isSpace(key) ? "space" : key;
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
    key: spaceOrKey(keys[0]),
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
      togglePause: () => {
        if (simulation.isPaused()) {
          console.log("[Shortcuts] Resuming simulation");
          simulation.dispatch({
            type: simulationKeywords.commands.resume,
          });
        } else {
          console.log("[Shortcuts] Pausing simulation");
          simulation.dispatch({
            type: simulationKeywords.commands.pause,
          });
        }
      },
      step: () => {
        console.log("[Shortcuts] Stepping simulation");
        simulation.dispatch({
          type: simulationKeywords.commands.step,
        });
      },
    };

    const throttledCommands = {
      toggleTrails: throttle(commands.toggleTrails, {
        wait: 100,
      }),
      toggleEnergyBar: throttle(commands.toggleEnergyBar, {
        wait: 100,
      }),
      toggleMatingHearts: throttle(commands.toggleMatingHearts, {
        wait: 100,
      }),
      toggleStanceSymbols: throttle(commands.toggleStanceSymbols, {
        wait: 100,
      }),
      toggleRenderMode: throttle(commands.toggleRenderMode, {
        wait: 100,
      }),
      togglePause: throttle(commands.togglePause, {
        wait: 100,
      }),
      step: throttle(commands.step, {
        wait: 100,
      }),
    };

    const shortcuts: Shortcut[] = [
      {
        keymaps: ["shift+t"],
        handler: () => throttledCommands.toggleTrails(),
      },
      {
        keymaps: ["shift+e"],
        handler: () => throttledCommands.toggleEnergyBar(),
      },
      {
        keymaps: ["shift+m"],
        handler: () => throttledCommands.toggleMatingHearts(),
      },
      {
        keymaps: ["shift+s"],
        handler: () => throttledCommands.toggleStanceSymbols(),
      },
      {
        keymaps: ["shift+r"],
        handler: () => throttledCommands.toggleRenderMode(),
      },
      {
        keymaps: ["space"],
        handler: () => throttledCommands.togglePause(),
      },
      {
        keymaps: ["ArrowRight"],
        handler: () => throttledCommands.step(),
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
      handleKeyPress: (event: KeyboardEvent) => {
        const length = event.key.length;
        console.log(
          `[Shortcuts] Handling key press ${spaceOrKey(event.key)} (${length})`
        );
        const shortcut = shortcuts.find((shortcut) => {
          return shortcut.keymaps.some((option) => {
            const result = evaluateKeymap(option);
            if (!result) {
              return false;
            }
            const { key, shift, ctrl, meta } = result;
            return (
              key.toLowerCase() === spaceOrKey(event.key).toLowerCase() &&
              shift === event.shiftKey &&
              ctrl === event.ctrlKey &&
              meta === event.metaKey
            );
          });
        });
        if (shortcut) {
          event.preventDefault();
          event.stopPropagation();
          shortcut.handler(event);
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
