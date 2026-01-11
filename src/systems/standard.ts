import { localBoidStore } from '@/resources/browser/localBoidStore.ts'
import { frameRater } from '@/resources/shared/frameRater.ts'
import { sharedMemoryManager } from '@/resources/shared/sharedMemoryManager.ts'
import { createSystemHooks, createSystemManager } from 'braided-react'
import { analytics } from '../resources/browser/analytics.ts'
import { analyticsStore } from '../resources/browser/analyticsStore.ts'
import { atlases } from '../resources/browser/atlases.ts'
import { atmosphere } from '../resources/browser/atmosphere.ts'
import { camera } from '../resources/browser/camera.ts'
import { canvas } from '../resources/browser/canvas.ts'
import { engine } from '../resources/browser/engine.ts'
import { profileStore } from '../resources/browser/profileStore.ts'
import { renderer } from '../resources/browser/renderer.ts'
import { simulationGateway } from '../resources/browser/simulationController.ts'
import { runtimeStore } from '../resources/browser/runtimeStore.ts'
import { webglRenderer } from '../resources/browser/webglRenderer.ts'
import { profiler } from '../resources/shared/profiler.ts'
import { randomness } from '../resources/shared/randomness.ts'
import { time } from '../resources/shared/time.ts'
import { timer } from '../resources/shared/timer.ts'
import { StartedSystem } from 'braided'
import { updateLoopResource } from '@/resources/browser/updateLoop.ts'
import { shortcuts } from '@/resources/browser/shortcuts.ts'
import { browserSimulation } from '@/resources/browser/simulation.ts'
import { createSystemConfigResource } from '@/resources/shared/config.ts'

export const systemConfig = {
  config: createSystemConfigResource({
    renderMode: 'canvas',
    usesSharedMemory: false,
  }),
  time,
  timer,
  canvas,
  camera,
  engine,
  atlases,
  profiler,
  renderer,
  analytics,
  shortcuts,
  atmosphere,
  randomness,
  frameRater,
  updateLoop: updateLoopResource,
  simulation: browserSimulation,
  profileStore,
  runtimeStore,
  webglRenderer,
  analyticsStore,
  localBoidStore,
  runtimeController: simulationGateway,
  sharedMemoryManager,
}

export type StandardSystem = StartedSystem<typeof systemConfig>

export const manager = createSystemManager(systemConfig)
export const { useResource, useSystem, SystemProvider } =
  createSystemHooks(manager)
