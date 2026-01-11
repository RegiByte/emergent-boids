import { findBoidWhere, iterateBoids } from '@/boids/iterators.ts'
import { Boid, BoidsById } from '@/boids/vocabulary/schemas/entities.ts'
import { stanceKeywords } from '@/boids/vocabulary/keywords.ts'
import { BoidStance } from '@/boids/vocabulary/schemas/primitives.ts'
import {
  getActivePositions,
  getActiveVelocities,
  getActiveEnergy,
  getActiveHealth,
  getActiveStanceFlags,
  getActiveStanceEnteredAtFrame,
  unpackStanceFlags,
  SharedBoidViews,
} from '@/lib/sharedMemory.ts'
import { createUpdateLoop } from '@/lib/updateLoop.ts'
import { sharedMemoryKeywords } from '@/lib/workerTasks/vocabulary.ts'
import {
  renderFrame,
  type RenderContext,
} from '@/resources/browser/rendering/pipeline.ts'
import { defineResource, StartedResource } from 'braided'
import { profilerKeywords } from '../../boids/vocabulary/keywords.ts'
import { SystemConfigResource } from '../shared/config.ts'
import { FrameRaterAPI } from '../shared/frameRater.ts'
import type { Profiler } from '../shared/profiler.ts'
import {
  BoidsPhysicsMemory,
  SharedMemoryManager,
} from '../shared/sharedMemoryManager.ts'
import type { TimeResource } from '../shared/time.ts'
import type { AtlasesResult } from './atlases.ts'
import { CameraAPI } from './camera.ts'
import { CanvasAPI } from './canvas.ts'
import { getBoidPhysics, LocalBoidStoreResource } from './localBoidStore.ts'
import type { RuntimeStoreResource } from './runtimeStore.ts'

export type Renderer = {
  drawFrame: (realDeltaMs: number, fps?: number) => void
  cleanup: () => void
}

const createRenderFrameContext = ({
  canvas,
  camera,
  runtimeStore,
  time,
  profiler,
  boids,
  boidsPhysicsMemory,
  atlases,
  usesSharedMemory,
}: {
  canvas: CanvasAPI
  camera: CameraAPI
  runtimeStore: RuntimeStoreResource
  time: TimeResource
  profiler: Profiler | undefined
  boids: BoidsById
  boidsPhysicsMemory: BoidsPhysicsMemory
  atlases: AtlasesResult
  usesSharedMemory: boolean
}) => {
  const { ctx, width, height } = canvas
  const { simulation, ui, config } = runtimeStore.store.getState()
  const timeState = time.getState()
  const speciesConfigs = config.species

  const { base, activeEvent } = ui.visualSettings.atmosphere
  const atmosphereSettings = activeEvent?.settings || base

  const frameBoids = {} as BoidsById
  const allBoidsWithFreshData = {} as BoidsById
  const framePhysics = boidsPhysicsMemory.views as unknown as SharedBoidViews
  const physicsToIndex = {} as Record<string, number>
  const activePositions = usesSharedMemory
    ? getActivePositions(framePhysics)
    : null
  const activeVelocities = usesSharedMemory
    ? getActiveVelocities(framePhysics)
    : null

  const activeEnergy = usesSharedMemory ? getActiveEnergy(framePhysics) : null
  const activeHealth = usesSharedMemory ? getActiveHealth(framePhysics) : null
  const activeStanceFlags = usesSharedMemory
    ? getActiveStanceFlags(framePhysics)
    : null

  const activeStanceEnteredAtFrame = usesSharedMemory
    ? getActiveStanceEnteredAtFrame(framePhysics)
    : null

  const numberToStance: Record<number, BoidStance> = {
    0: stanceKeywords.flocking,
    1: stanceKeywords.fleeing,
    2: stanceKeywords.hunting,
    3: stanceKeywords.eating,
    4: stanceKeywords.mating,
    5: stanceKeywords.seeking_mate,
    6: stanceKeywords.idle,
  }

  for (const boid of iterateBoids(boids)) {
    const index = boid.index
    const position = {
      x: boid.position.x,
      y: boid.position.y,
    }
    const velocity = {
      x: boid.velocity.x,
      y: boid.velocity.y,
    }

    if (usesSharedMemory && activePositions && activeVelocities) {
      position.x = activePositions[index * 2 + 0]
      position.y = activePositions[index * 2 + 1]
      velocity.x = activeVelocities[index * 2 + 0]
      velocity.y = activeVelocities[index * 2 + 1]
    }

    let energy = boid.energy
    let health = boid.health
    let stance = boid.stance
    let seekingMate = boid.seekingMate
    let stanceEnteredAtFrame = boid.stanceEnteredAtFrame

    if (
      usesSharedMemory &&
      activeEnergy &&
      activeHealth &&
      activeStanceFlags &&
      activeStanceEnteredAtFrame
    ) {
      energy = activeEnergy[index]
      health = activeHealth[index]
      const flags = unpackStanceFlags(activeStanceFlags[index])
      stance = numberToStance[flags.stance] ?? boid.stance
      seekingMate = flags.seekingMate

      stanceEnteredAtFrame = activeStanceEnteredAtFrame[index]
    }

    allBoidsWithFreshData[boid.id] = {
      ...boid,
      position,
      velocity,
      energy,
      health,
      stance,
      seekingMate,
      stanceEnteredAtFrame,
    }

    if (camera.isInViewport(position.x, position.y, 100)) {
      frameBoids[boid.id] = allBoidsWithFreshData[boid.id]
      physicsToIndex[boid.id] = boid.index
    }
  }

  return {
    ctx,
    width,
    height,
    backgroundColor: config.world.backgroundColor,
    boids: frameBoids,
    allBoids: allBoidsWithFreshData,
    obstacles: simulation.obstacles,
    deathMarkers: simulation.deathMarkers,
    foodSources: simulation.foodSources,
    visualSettings: {
      trailsEnabled: ui.visualSettings.trailsEnabled,
      energyBarsEnabled: ui.visualSettings.energyBarsEnabled,
      matingHeartsEnabled: ui.visualSettings.matingHeartsEnabled,
      stanceSymbolsEnabled: ui.visualSettings.stanceSymbolsEnabled,
      deathMarkersEnabled: ui.visualSettings.deathMarkersEnabled,
      headerCollapsed: ui.headerCollapsed,
      foodSourcesEnabled: ui.visualSettings.foodSourcesEnabled,
      healthBarsEnabled: ui.visualSettings.healthBarsEnabled,
      atmosphere: {
        trailAlpha: atmosphereSettings.trailAlpha,
      },
    },
    timeState,
    simulationTick: Math.floor(timeState.simulationElapsedSeconds),
    simulationFrame: timeState.simulationFrame,
    profiler,
    camera,
    atlases,
    bufferViews: framePhysics,
    speciesConfigs,
  } satisfies RenderContext
}

export const renderer = defineResource({
  dependencies: {
    required: [
      'canvas',
      'camera',
      'runtimeStore',
      'time',
      'webglRenderer',
      'atlases',
      'localBoidStore',
      'sharedMemoryManager',
      'frameRater',
      'config',
    ],
    optional: ['profiler'],
  },
  start: ({
    canvas,
    camera,
    runtimeStore,
    time,
    webglRenderer,
    profiler,
    atlases,
    localBoidStore,
    sharedMemoryManager,
    frameRater,
    config,
  }: {
    canvas: CanvasAPI
    camera: CameraAPI
    runtimeStore: RuntimeStoreResource
    time: TimeResource
    webglRenderer: {
      render: (context?: RenderContext) => void
      canvas: HTMLCanvasElement
    }
    profiler: Profiler | undefined
    atlases: AtlasesResult
    localBoidStore: LocalBoidStoreResource
    sharedMemoryManager: SharedMemoryManager
    frameRater: FrameRaterAPI
    config: SystemConfigResource
  }) => {
    const renderExecutor = frameRater.variable('render', {
      targetFPS: 30,
      smoothingWindow: 10,
      maxDeltaMs: 100,
    })

    const updateLoop = createUpdateLoop({
      onUpdate: (_deltaMs, _scaledDeltaMs, clockDeltaMs) => {
        drawFrame(clockDeltaMs, Math.round(renderExecutor.getMetrics().fps))
        renderExecutor.recordFrame(clockDeltaMs)
      },
      onStart: () => {},
      onStop: () => {},
      onPause: () => {},
      getDefaultTimestep: () => {
        return 60 / 1000
      },
      getTimeScale: () => {
        return time.getState().timeScale
      },
      onStep: (_deltaTime, _scaledDeltaMs) => {},
    })

    const boidsPhysicsMemory = sharedMemoryManager.get(
      sharedMemoryKeywords.boidsPhysics
    )
    const boidStore = localBoidStore.store
    const cameraFollowExecutor = frameRater.throttled('cameraFollow', {
      intervalMs: 1000 / 50, // 30Hz
    })
    const usesSharedMemory = config.getConfig().usesSharedMemory

    let cachedFollowedBoid: { id: string; boid: Boid } | null = null

    const initialMode = runtimeStore.store.getState().ui.rendererMode
    if (initialMode === 'webgl') {
      canvas.canvas.style.display = 'none'
      webglRenderer.canvas.style.display = 'block'
    } else {
      canvas.canvas.style.display = 'block'
      webglRenderer.canvas.style.display = 'none'
    }

    const prepareRenderContext = () => {
      profiler?.start(profilerKeywords.renderer.createRenderContext)
      const renderContext = createRenderFrameContext({
        canvas,
        camera,
        runtimeStore,
        time,
        profiler,
        boids: boidStore.boids,
        boidsPhysicsMemory,
        atlases,
        usesSharedMemory: config.getConfig().usesSharedMemory,
      })
      profiler?.end(profilerKeywords.renderer.createRenderContext)
      return renderContext
    }

    const drawFrame = (realDeltaMs: number, fps = 0) => {
      const timeState = time.getState()
      const renderContext = prepareRenderContext()
      profiler?.start(profilerKeywords.renderer.draw)
      const { ui } = runtimeStore.store.getState()
      if (ui.rendererMode === 'webgl') {
        webglRenderer.render(renderContext)
      } else {
        renderFrame(renderContext, fps)
      }
      profiler?.end(profilerKeywords.renderer.draw)

      if (
        !timeState.isPaused &&
        cameraFollowExecutor.shouldExecute(realDeltaMs)
      ) {
        updateCamera()
        cameraFollowExecutor.recordExecution()
      }
    }

    const updateCamera = () => {
      if (camera.mode.type === 'following') {
        const followedBoidId = camera.mode.boidId

        if (!cachedFollowedBoid || cachedFollowedBoid.id !== followedBoidId) {
          const followedBoid = findBoidWhere(
            boidStore.boids,
            (boid) => boid.id === followedBoidId
          )
          if (followedBoid) {
            cachedFollowedBoid = {
              id: followedBoidId,
              boid: followedBoid,
            }
          } else {
            cachedFollowedBoid = null
          }
        }

        if (cachedFollowedBoid) {
          let position = cachedFollowedBoid.boid.position

          if (usesSharedMemory) {
            const boidPhysics = getBoidPhysics(
              cachedFollowedBoid.boid.index,
              boidsPhysicsMemory.views as unknown as SharedBoidViews
            )
            if (boidPhysics) {
              position = boidPhysics.position
            }
          }

          camera.updateFollowPosition(position.x, position.y)
        } else {
          camera.stopFollowing()
          cachedFollowedBoid = null
        }
      } else {
        cachedFollowedBoid = null
      }
    }

    const cleanup = () => {}

    const setRendererMode = (mode: 'canvas' | 'webgl') => {
      if (mode === 'webgl') {
        canvas.canvas.style.display = 'none'
        webglRenderer.canvas.style.display = 'block'
      } else {
        canvas.canvas.style.display = 'block'
        webglRenderer.canvas.style.display = 'none'
      }
    }

    const api = {
      start: () => updateLoop.start(),
      stop: () => updateLoop.stop(),
      isRunning: () => updateLoop.isRunning(),
      drawFrame,
      cleanup,
      setRendererMode,
    }

    return api
  },
  halt: (renderer: Renderer & { cleanup?: () => void }) => {
    if (renderer.cleanup) {
      renderer.cleanup()
    }
  },
})

export type RendererResource = StartedResource<typeof renderer>
