import { simulationKeywords } from '@/boids/vocabulary/keywords'
import {
  SimulationCommand,
  SimulationEvent,
} from '@/boids/vocabulary/schemas/simulation'
import { createChannel } from '@/lib/channels'
import {
  CommandHandlers,
  createSimulation,
} from '@/resources/shared/simulation/core'
import { defineResource } from 'braided'
import { TimeAPI } from '../shared/time'
import { CameraAPI } from './camera'
import { RendererResource } from './renderer'
import { RuntimeStoreResource } from './runtimeStore'
import { SharedEngineResource } from './sharedEngine'
import { WorkerTasksResource } from './workerTasks'
import { SimulationGateway } from './simulationGateway'

/**
 * Shared Simulation Resource
 *
 * Mirrors browserSimulation but delegates physics commands to worker
 * Handles local UI/rendering commands directly
 */
export const sharedSimulation = defineResource({
  dependencies: [
    'engine', // sharedEngine
    'workerTasks',
    'camera',
    'runtimeStore',
    'simulationGateway',
    'renderer',
    'time',
  ],
  start: ({
    engine,
    workerTasks,
    camera,
    runtimeStore,
    simulationGateway,
    renderer,
    time,
  }: {
    engine: SharedEngineResource
    workerTasks: WorkerTasksResource
    camera: CameraAPI
    runtimeStore: RuntimeStoreResource
    simulationGateway: SimulationGateway
    renderer: RendererResource
    time: TimeAPI
  }) => {
    const channel = createChannel<SimulationCommand, SimulationEvent>()

    const commandHandlers = {
      [simulationKeywords.commands.addBoid]: (command) => {
        engine.addBoid(command.boid)
      },
      [simulationKeywords.commands.removeBoid]: (command) => {
        engine.removeBoid(command.boidId)
      },
      [simulationKeywords.commands.pause]: (_command) => {
        workerTasks.dispatch('command', {
          command: { type: simulationKeywords.commands.pause },
        })
        time.pause()
      },
      [simulationKeywords.commands.resume]: (_command) => {
        workerTasks.dispatch('command', {
          command: { type: simulationKeywords.commands.resume },
        })
        time.resume()
      },
      [simulationKeywords.commands.step]: (_command) => {
        workerTasks.dispatch('command', {
          command: { type: simulationKeywords.commands.step },
        })
      },
      [simulationKeywords.commands.setTimeScale]: (command) => {
        time.setTimeScale(command.timeScale)
        workerTasks.dispatch('command', {
          command: {
            type: simulationKeywords.commands.setTimeScale,
            timeScale: command.timeScale,
          },
        })
      },
      [simulationKeywords.commands.updateParameters]: (command) => {
        runtimeStore.store.setState((current) => ({
          ...current,
          config: {
            ...current.config,
            parameters: {
              ...current.config.parameters,
              ...command.parameters,
            },
          },
        }))
        workerTasks.dispatch('command', {
          command: {
            type: simulationKeywords.commands.updateParameters,
            parameters: command.parameters,
          },
        })
      },

      [simulationKeywords.commands.spawnObstacle]: (command) => {
        console.log('[SharedSimulation] Forwarding spawnObstacle to worker')
        workerTasks.dispatch('command', {
          command: {
            type: simulationKeywords.commands.spawnObstacle,
            position: command.position,
            radius: command.radius,
          },
        })
      },
      [simulationKeywords.commands.spawnPredator]: (command) => {
        console.log('[SharedSimulation] Forwarding spawnPredator to worker')
        workerTasks.dispatch('command', {
          command: {
            type: simulationKeywords.commands.spawnPredator,
            position: command.position,
          },
        })
      },

      [simulationKeywords.commands.followBoid]: (command) => {
        camera.startFollowing(command.boidId)
      },
      [simulationKeywords.commands.stopFollowingBoid]: (_command) => {
        camera.stopFollowing()
      },
      [simulationKeywords.commands.toggleTrails]: (_command) => {
        runtimeStore.store.setState((current) => ({
          ...current,
          ui: {
            ...current.ui,
            visualSettings: {
              ...current.ui.visualSettings,
              trailsEnabled: !current.ui.visualSettings.trailsEnabled,
            },
          },
        }))
      },

      [simulationKeywords.commands.start]: (_command) => {
        if (!renderer.isRunning()) {
          renderer.start()
        }
      },
      [simulationKeywords.commands.setRendererMode]: (command) => {
        runtimeStore.store.setState((current) => ({
          ...current,
          ui: {
            ...current.ui,
            rendererMode: command.rendererMode,
          },
        }))

        renderer.setRendererMode(command.rendererMode)
      },
      [simulationKeywords.commands.toggleDebugMode]: (_command) => {
        runtimeStore.store.setState((current) => ({
          ...current,
          ui: {
            ...current.ui,
            debugMode: !current.ui.debugMode,
          },
        }))
      },
    } satisfies Partial<CommandHandlers>

    const simulation = createSimulation(
      { simulationChannel: channel },
      {
        onInitialize: () => {
          engine.initialize(channel)
        },
        onCommand: (command, resolve) => {
          const handler =
            commandHandlers[command.type as keyof typeof commandHandlers]
          if (!handler) {
            resolve({
              type: simulationKeywords.events.error,
              error: `No handler found for command: ${command.type}`,
              meta: command,
            })
            return
          }
          try {
            handler(command as never)
          } catch (error) {
            resolve({
              type: simulationKeywords.events.error,
              error: error instanceof Error ? error.message : 'Unknown error',
              meta: error,
            })
          }
        },
        onCleanup: () => {
          console.log('[SharedSimulation] Cleaned up')
        },
      }
    )

    simulation.initialize()

    channel.watch((event) => {
      simulationGateway.dispatch(event)
    })

    const commands = {
      start: () => {
        console.log('[BrowserSimulation] Starting')
        simulation.dispatch({ type: simulationKeywords.commands.start })
      },
      pause: () => {
        simulation.dispatch({ type: simulationKeywords.commands.pause })
      },
      resume: () => {
        simulation.dispatch({
          type: simulationKeywords.commands.resume,
        })
      },
      step: () => {
        simulation.dispatch({ type: simulationKeywords.commands.step })
      },
      setTimeScale: (timeScale: number) => {
        simulation.dispatch({
          type: simulationKeywords.commands.setTimeScale,
          timeScale,
        })
      },
    }

    const api = {
      commands,
      initialize: simulation.initialize,
      cleanup: simulation.cleanup,
      dispatchImmediate: simulation.dispatchImmediate,
      dispatch: simulation.dispatch,
      watch: channel.watch,
      isPaused: () => {
        return time.getState().isPaused
      },
    }

    return api
  },
  halt: ({ cleanup }) => {
    cleanup()
  },
})
