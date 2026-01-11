import { eventKeywords, simulationKeywords } from '@/boids/vocabulary/keywords'
import { CameraControls } from '@/components/CameraControls'
import { CanvasFrame } from '@/components/CanvasFrame'
import { ControlsSidebar, type SpawnMode } from '@/components/ControlsSidebar'
import { MissionControlHeader } from '@/components/MissionControlHeader'
import { Minimap } from '@/components/Minimap'
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from '@/components/ui/sidebar'
import { cn } from '@/lib/utils'
import { CanvasAPI } from '@/resources/browser/canvas.ts'
import {
  StandardSystem,
  SystemProvider,
  useResource,
  useSystem,
} from '@/systems/standard.ts'
import { IconAdjustmentsHorizontal } from '@tabler/icons-react'
import { useDebouncer } from '@tanstack/react-pacer'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { CameraMode } from '@/resources/browser/camera.ts'
import { iterateBoids } from '@/boids/iterators'

function SimulationView() {
  const runtimeController = useResource('runtimeController')
  const runtimeStore = useResource('runtimeStore')
  const { store: boidStore } = useResource('localBoidStore')
  const simulation = useResource('simulation')
  const canvas = useResource('canvas')
  const camera = useResource('camera')
  const renderer = useResource('renderer')
  const updateLoop = useResource('updateLoop')
  const webglRenderer = useResource('webglRenderer')
  const { useStore } = runtimeStore
  const sidebarOpen = useStore((state) => state.ui.sidebarOpen)
  const headerCollapsed = useStore((state) => state.ui.headerCollapsed)
  const config = useStore((state) => state.config)

  const atmosphereBase = useStore(
    (state) => state.ui.visualSettings.atmosphere.base
  )
  const atmosphereEvent = useStore(
    (state) => state.ui.visualSettings.atmosphere.activeEvent
  )

  const atmosphereSettings = useMemo(() => {
    if (atmosphereEvent) {
      return {
        trailAlpha: atmosphereEvent.settings.trailAlpha,
        fogColor: atmosphereEvent.settings.fogColor,
        fogIntensity:
          atmosphereEvent.settings.fogIntensity ?? atmosphereBase.fogIntensity,
        fogOpacity:
          atmosphereEvent.settings.fogOpacity ?? atmosphereBase.fogOpacity,
      }
    }
    return atmosphereBase
  }, [atmosphereBase, atmosphereEvent])
  const system = useSystem()
  const canvasAreaRef = useRef<HTMLDivElement>(null) // The parent flex container
  const canvasContainerRef = useRef<HTMLDivElement>(null) // The canvas wrapper
  const canvasElementRef = useRef<HTMLCanvasElement | null>(null)
  const [spawnMode, setSpawnMode] = useState<SpawnMode>('obstacle')
  const getParentDimensions = () => {
    if (canvasAreaRef.current) {
      const rect = canvasAreaRef.current.getBoundingClientRect()
      return {
        width: Math.floor(rect.width) - 4,
        height: Math.floor(rect.height) - 4,
      }
    }
    return {
      width: 0,
      height: 0,
    }
  }
  const updateCanvasDebouncer = useDebouncer(
    (
      canvas: CanvasAPI,
      webglRenderer: { resize: (w: number, h: number) => void }
    ) => {
      const { width, height } = getParentDimensions()
      canvas.resize(width, height)
      webglRenderer.resize(width, height)
    },
    {
      wait: 200,
      leading: false,
      trailing: true,
    }
  )

  useEffect(() => {
    if (
      canvas &&
      webglRenderer &&
      canvasContainerRef.current &&
      canvasAreaRef.current
    ) {
      const container = canvasContainerRef.current
      canvasElementRef.current = canvas.canvas

      let canvasWrapper = container.querySelector(
        '[data-canvas-wrapper]'
      ) as HTMLDivElement
      if (!canvasWrapper) {
        canvasWrapper = document.createElement('div')
        canvasWrapper.setAttribute('data-canvas-wrapper', 'true')
        canvasWrapper.style.position = 'absolute'
        canvasWrapper.style.inset = '0'
        canvasWrapper.style.width = '100%'
        canvasWrapper.style.height = '100%'
        container.appendChild(canvasWrapper)
      }

      if (!canvasWrapper.contains(canvas.canvas)) {
        canvasWrapper.appendChild(canvas.canvas)
      }
      if (!canvasWrapper.contains(webglRenderer.canvas)) {
        canvasWrapper.appendChild(webglRenderer.canvas)
      }

      requestAnimationFrame(() => {
        const { width, height } = getParentDimensions()
        if (width > 0 && height > 0) {
          canvas.resize(width, height)
          webglRenderer.resize(width, height)
        }
      })

      const findClosestBoidToScreen = (
        screenX: number,
        screenY: number,
        maxScreenDistance: number
      ): string | null => {
        let closestBoid: string | null = null
        let closestDistance = maxScreenDistance

        const worldPos = camera.screenToWorld(screenX, screenY)
        const searchRadiusWorld = maxScreenDistance / camera.zoom

        for (const boid of iterateBoids(boidStore.boids)) {
          const worldDx = boid.position.x - worldPos.x
          const worldDy = boid.position.y - worldPos.y
          const worldDistSq = worldDx * worldDx + worldDy * worldDy

          if (worldDistSq > searchRadiusWorld * searchRadiusWorld * 4) continue

          const boidScreen = camera.worldToScreen(
            boid.position.x,
            boid.position.y
          )
          const dx = boidScreen.x - screenX
          const dy = boidScreen.y - screenY
          const distance = Math.sqrt(dx * dx + dy * dy)

          if (distance < closestDistance) {
            closestDistance = distance
            closestBoid = boid.id
          }
        }

        return closestBoid
      }

      const handleCanvasClick = (e: MouseEvent) => {
        if (camera.isDragging) {
          return
        }

        const targetCanvas = e.currentTarget as HTMLCanvasElement
        const rect = targetCanvas.getBoundingClientRect()
        const screenX = e.clientX - rect.left
        const screenY = e.clientY - rect.top

        if (camera.mode.type === 'picker') {
          const targetBoidId = (
            camera.mode as Extract<CameraMode, { type: 'picker' }>
          ).targetBoidId
          if (targetBoidId) {
            camera.startFollowing(targetBoidId)
            toast.success('Following boid', {
              description: `ID: ${targetBoidId.slice(0, 8)}...`,
            })
          }
          return // Don't spawn obstacles/predators when in picker mode
        }

        const worldPos = camera.screenToWorld(screenX, screenY)
        const x = worldPos.x
        const y = worldPos.y

        if (spawnMode === 'obstacle') {
          simulation.dispatch({
            type: simulationKeywords.commands.spawnObstacle,
            position: { x, y },
            radius: 30, // Default radius
          })
          toast.success('Obstacle placed', {
            description: `Position: (${Math.round(x)}, ${Math.round(y)})`,
          })
        } else {
          simulation.dispatch({
            type: simulationKeywords.commands.spawnPredator,
            position: { x, y },
          })
          toast.success('Predator spawned', {
            description: `Position: (${Math.round(x)}, ${Math.round(y)})`,
          })
        }
      }

      let lastPickerUpdate = 0
      const PICKER_UPDATE_INTERVAL = 16 // ~60 FPS (16ms)

      const handleCanvasMouseMove = (e: MouseEvent) => {
        if (camera.mode.type !== 'picker') return

        const now = performance.now()
        if (now - lastPickerUpdate < PICKER_UPDATE_INTERVAL) return
        lastPickerUpdate = now

        const targetCanvas = e.currentTarget as HTMLCanvasElement
        const rect = targetCanvas.getBoundingClientRect()
        const screenX = e.clientX - rect.left
        const screenY = e.clientY - rect.top
        const worldPos = camera.screenToWorld(screenX, screenY)

        const closestBoidId = findClosestBoidToScreen(screenX, screenY, 80)

        camera.updatePickerTarget(closestBoidId, worldPos)
      }

      const handleCanvasMouseEnter = () => {
        camera.setMouseInCanvas(true)
      }

      const handleCanvasMouseLeave = () => {
        camera.setMouseInCanvas(false)
      }

      canvas.canvas.addEventListener('click', handleCanvasClick)
      canvas.canvas.addEventListener('mousemove', handleCanvasMouseMove)
      canvas.canvas.addEventListener('mouseenter', handleCanvasMouseEnter)
      canvas.canvas.addEventListener('mouseleave', handleCanvasMouseLeave)

      webglRenderer.canvas.addEventListener('click', handleCanvasClick)
      webglRenderer.canvas.addEventListener('mousemove', handleCanvasMouseMove)
      webglRenderer.canvas.addEventListener(
        'mouseenter',
        handleCanvasMouseEnter
      )
      webglRenderer.canvas.addEventListener(
        'mouseleave',
        handleCanvasMouseLeave
      )

      if (simulation && !simulation.isPaused()) {
        simulation.commands.start()
      }

      return () => {
        canvas.canvas.removeEventListener('click', handleCanvasClick)
        canvas.canvas.removeEventListener('mousemove', handleCanvasMouseMove)
        canvas.canvas.removeEventListener('mouseenter', handleCanvasMouseEnter)
        canvas.canvas.removeEventListener('mouseleave', handleCanvasMouseLeave)

        webglRenderer.canvas.removeEventListener('click', handleCanvasClick)
        webglRenderer.canvas.removeEventListener(
          'mousemove',
          handleCanvasMouseMove
        )
        webglRenderer.canvas.removeEventListener(
          'mouseenter',
          handleCanvasMouseEnter
        )
        webglRenderer.canvas.removeEventListener(
          'mouseleave',
          handleCanvasMouseLeave
        )
      }
    }
  }, [
    spawnMode,
    canvas,
    webglRenderer,
    runtimeController,
    camera,
    boidStore,
    updateLoop,
    renderer,
    simulation,
  ])

  const cameraMode = camera.useMode()

  useEffect(() => {
    if (canvasElementRef.current) {
      if (cameraMode.type === 'picker') {
        canvasElementRef.current.style.cursor = 'crosshair'
      } else if (spawnMode === 'obstacle') {
        canvasElementRef.current.style.cursor = 'crosshair'
      } else {
        canvasElementRef.current.style.cursor = 'pointer'
      }
    }
  }, [spawnMode, cameraMode])

  useEffect(() => {
    if (!canvas || !canvasAreaRef.current) return

    const resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0]

      if (entry) {
        const areaWidth = entry.contentRect.width
        const areaHeight = entry.contentRect.height

        const canvasWidth = Math.floor(areaWidth)
        const canvasHeight = Math.floor(areaHeight)

        if (canvasWidth > 0 && canvasHeight > 0) {
          updateCanvasDebouncer.maybeExecute(canvas, webglRenderer)
        }
      }
    })

    resizeObserver.observe(canvasAreaRef.current)

    return () => {
      resizeObserver.disconnect()
    }
  }, [canvas, webglRenderer, updateCanvasDebouncer])

  return (
    <SidebarProvider
      open={sidebarOpen}
      onOpenChange={(open) => {
        console.log('sidebar open changed', open)
        runtimeController.dispatch({
          type: eventKeywords.ui.sidebarToggled,
          open,
        })
      }}
    >
      <div
        style={
          {
            '--simulation-bg': config.world.backgroundColor,
          } as React.CSSProperties
        }
        className="flex h-screen w-screen overflow-hidden bg-background"
      >
        <ControlsSidebar
          spawnMode={spawnMode}
          onSpawnModeChange={setSpawnMode}
        />
        <SidebarInset className="flex flex-col">
          {/* Header with Sidebar Trigger and Graphs */}
          <AnimatePresence mode="wait">
            {!headerCollapsed ? (
              <motion.div
                key="header-expanded"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{
                  duration: 0.1,
                  ease: 'easeInOut',
                }}
                className="relative flex items-center gap-2 border-b bg-card px-4 py-3 w-full overflow-hidden"
              >
                <div className="group">
                  <label
                    className={cn(
                      'absolute left-2 top-2 px-1 py-1 inline-flex items-center justify-center gap-2',
                      'rounded-md group-hover:bg-slate-100/30 z-50'
                    )}
                  >
                    <SidebarTrigger
                      className={'p-2'}
                      icon={IconAdjustmentsHorizontal}
                    />
                    <span className="text-sm">Simulation Controls</span>
                  </label>
                </div>
                {system && (
                  <MissionControlHeader
                    showGraphs={true} // Always show graphs when header expanded
                    collapsed={false}
                    onToggleCollapse={() => {
                      runtimeController.dispatch({
                        type: eventKeywords.ui.headerToggled,
                        collapsed: true,
                      })
                    }}
                  />
                )}
              </motion.div>
            ) : null}
          </AnimatePresence>

          {/* Canvas Area */}
          <div
            ref={canvasAreaRef}
            data-testid="canvas-area"
            className={cn(
              'flex-1 flex items-center justify-center bg-(--simulation-bg) relative overflow-hidden'
            )}
            style={
              {
                '--simulation-fog-color': atmosphereSettings.fogColor,
              } as React.CSSProperties
            }
          >
            {/* Collapsed header elements - positioned inside canvas area */}
            {headerCollapsed && system && (
              <AnimatePresence mode="wait">
                <motion.div
                  key="header-collapsed"
                  initial={{ opacity: 1 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.1 }}
                  className="absolute inset-0 pointer-events-none z-50"
                >
                  {/* Expand Mission Control button */}
                  <div className="absolute top-0 right-4 pointer-events-auto">
                    <MissionControlHeader
                      showGraphs={false}
                      collapsed={true}
                      onToggleCollapse={() => {
                        runtimeController.dispatch({
                          type: eventKeywords.ui.headerToggled,
                          collapsed: false,
                        })
                      }}
                    />
                  </div>
                  {/* Sidebar trigger when header is collapsed */}
                  <div className="absolute left-2 top-2 pointer-events-auto group">
                    <label
                      className={cn(
                        'px-1 py-1 inline-flex items-center justify-center gap-2',
                        'rounded-md group-hover:bg-slate-100/30 bg-card/80 backdrop-blur-sm border border-primary/30'
                      )}
                    >
                      <SidebarTrigger
                        className={'p-2'}
                        icon={IconAdjustmentsHorizontal}
                      />
                      <span className="text-sm">Simulation Controls</span>
                    </label>
                  </div>
                </motion.div>
              </AnimatePresence>
            )}

            {!system && (
              <div className="text-primary text-lg">Loading system...</div>
            )}
            <div
              ref={canvasContainerRef}
              data-testid="canvas-container"
              className={cn(
                'relative w-full h-full border-2 border-(--simulation-fog-color) rounded-b-lg overflow-hidden'
              )}
            >
              <CanvasFrame
                fogIntensity={atmosphereSettings.fogIntensity}
                fogOpacity={atmosphereSettings.fogOpacity}
              />
              {/* Camera controls and minimap overlays */}
              {system && (
                <>
                  <CameraControls />
                  <Minimap backgroundColor={config.world.backgroundColor} />
                </>
              )}
            </div>
          </div>
        </SidebarInset>
      </div>
    </SidebarProvider>
  )
}

/**
 * Create a simple wrapper that overrides the default system used by the simulation view
 * by whathever system is passed in the context.
 *
 * By default, braided does not require a context to work though
 */
export function SimulationWrapper({ system }: { system: StandardSystem }) {
  return (
    <SystemProvider system={system}>
      <SimulationView />
    </SystemProvider>
  )
}

export default SimulationView
