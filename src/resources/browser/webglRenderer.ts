/**
 * WebGL Renderer - Main Entry Point
 *
 * NOTE: This file is being modularized! See src/resources/webgl/ for the new architecture.
 * The modular components are available in:
 * - webgl/atlases/ - Texture atlas generation
 * - webgl/drawCommands/ - REGL draw commands
 * - webgl/dataPreparation/ - Instance data preparation
 * - webgl/utils/ - Shared utilities
 *
 * This file currently contains the full implementation for backward compatibility.
 * Future work: Gradually migrate to use the modular components.
 */

import { defineResource, StartedResource } from 'braided'
import REGL from 'regl'
import type {
  Boid,
  FoodSource,
} from '../../boids/vocabulary/schemas/entities.ts'
import type { BoidEngine } from './engine.ts'
import type { CameraAPI } from './camera.ts'
import type { CanvasAPI } from './canvas.ts'
import type { RuntimeStoreResource } from './runtimeStore.ts'
import type { AtlasesResult } from './atlases.ts'
import { toRgb } from '../../lib/colors.ts'
import type { RenderContext } from './rendering/pipeline.ts'

import {
  createEmojiTexture,
  createFontTexture,
  createShapeTexture,
  createObstacleTexture,
  logShapeAtlasDebugInfo,
  createBodyPartsTexture,
  logBodyPartsAtlasDebugInfo,
  prepareShapeBoidData as prepareShapeBoidDataModular,
  prepareBodyPartsData as prepareBodyPartsDataModular,
  prepareTriangleBoidData,
  prepareFoodData,
  prepareFoodEmojiData,
  prepareObstacleData,
  prepareTrailData,
  collectTrailBatches,
  prepareEnergyBarData,
  prepareHealthBarData,
  prepareSelectionData,
  prepareStanceSymbolData,
  layoutText,
  createShapeBoidsDrawCommand,
  createBodyPartsDrawCommand,
  createTriangleBoidsDrawCommand,
  createFoodDrawCommand,
  createFoodEmojiDrawCommand,
  createObstacleDrawCommand,
  createTrailsDrawCommand,
  createEnergyBarsDrawCommand,
  createHealthBarsDrawCommand,
  createSelectionCirclesDrawCommand,
  createStanceSymbolsDrawCommand,
  createTextDrawCommand,
  createDebugCollisionCirclesDrawCommand,
  prepareDebugCollisionCirclesData,
} from './webgl'
import { LocalBoidStoreResource } from './localBoidStore.ts'
import { iterateBoids } from '@/boids/iterators.ts'
import { countBoidsByRole } from '@/boids/filters.ts'

export type WebGLRenderer = {
  render: (context?: RenderContext) => void
  resize: (width: number, height: number) => void
}

export const webglRenderer = defineResource({
  dependencies: {
    required: [
      'canvas',
      'camera',
      'runtimeStore',
      'time',
      'atlases',
      'localBoidStore',
    ],
    optional: [],
  },
  start: ({
    canvas,
    camera,
    runtimeStore,
    time,
    atlases,
    localBoidStore,
  }: {
    canvas: CanvasAPI
    engine: BoidEngine
    camera: CameraAPI
    runtimeStore: RuntimeStoreResource
    time: { getState: () => { simulationFrame: number } }
    atlases: AtlasesResult
    localBoidStore: LocalBoidStoreResource
  }) => {
    const boidsStore = localBoidStore.store
    const webglCanvas = document.createElement('canvas')
    webglCanvas.width = canvas.width
    webglCanvas.height = canvas.height
    webglCanvas.classList.add(
      'absolute',
      'top-[50%]',
      'left-[50%]',
      'translate-x-[-50%]',
      'translate-y-[-50%]'
    )
    webglCanvas.style.display = 'none' // Hidden by default (Canvas renderer is default)

    const wheelHandler = (e: WheelEvent) => {
      e.preventDefault()

      const rect = webglCanvas.getBoundingClientRect()
      const mouseScreenX = e.clientX - rect.left
      const mouseScreenY = e.clientY - rect.top

      const worldBeforeZoom = camera.screenToWorld(mouseScreenX, mouseScreenY)

      const zoomFactor = 1.01
      const oldZoom = camera.zoom
      const newZoom =
        e.deltaY > 0 ? camera.zoom / zoomFactor : camera.zoom * zoomFactor
      camera.setZoom(newZoom)

      if (camera.zoom !== oldZoom) {
        const worldAfterZoom = camera.screenToWorld(mouseScreenX, mouseScreenY)

        const dx = worldBeforeZoom.x - worldAfterZoom.x
        const dy = worldBeforeZoom.y - worldAfterZoom.y

        camera.panTo(camera.x + dx, camera.y + dy)
      }
    }
    webglCanvas.addEventListener('wheel', wheelHandler, { passive: false })

    const eventHandlerCleanup = () => {
      webglCanvas.removeEventListener('wheel', wheelHandler)
    }

    const regl = REGL({
      canvas: webglCanvas,
      extensions: ['ANGLE_instanced_arrays'],
      attributes: {
        alpha: true,
        premultipliedAlpha: false, // Match blend function expectations
      },
    })

    const emojiAtlas = atlases.emoji
    if (!emojiAtlas) {
      console.error('Failed to get emoji atlas from resource')
    }
    const emojiTexture = emojiAtlas
      ? createEmojiTexture(regl, emojiAtlas)
      : null

    const fontAtlas = atlases.font
    if (!fontAtlas) {
      console.error('Failed to get font atlas from resource')
    }
    const fontTexture = fontAtlas ? createFontTexture(regl, fontAtlas) : null

    const shapeAtlas = atlases.shapes
    if (!shapeAtlas) {
      console.error('Failed to get shape atlas from resource')
    } else {
      logShapeAtlasDebugInfo(shapeAtlas)
    }
    const shapeTexture = shapeAtlas
      ? createShapeTexture(regl, shapeAtlas)
      : null

    const bodyPartsAtlas = atlases.bodyParts
    if (!bodyPartsAtlas) {
      console.error('Failed to get body parts atlas from resource')
    } else {
      logBodyPartsAtlasDebugInfo(bodyPartsAtlas)
    }
    const bodyPartsTexture = bodyPartsAtlas
      ? createBodyPartsTexture(regl, bodyPartsAtlas)
      : null

    const obstacleAtlas = atlases.obstacle
    if (!obstacleAtlas) {
      console.error('Failed to get obstacle atlas from resource')
    }
    const obstacleTexture = obstacleAtlas
      ? createObstacleTexture(regl, obstacleAtlas)
      : null

    const drawShapeBoids =
      shapeTexture && shapeAtlas
        ? createShapeBoidsDrawCommand(regl, shapeTexture, shapeAtlas)
        : null

    const drawBodyParts =
      bodyPartsTexture && bodyPartsAtlas
        ? createBodyPartsDrawCommand(regl, bodyPartsTexture, bodyPartsAtlas)
        : null

    const drawBoids = createTriangleBoidsDrawCommand(regl)

    const drawFood = createFoodDrawCommand(regl)

    const drawFoodEmojis =
      emojiTexture && emojiAtlas
        ? createFoodEmojiDrawCommand(regl, emojiTexture, emojiAtlas.cellSize)
        : null

    const drawObstacles = obstacleTexture
      ? createObstacleDrawCommand(regl, obstacleTexture)
      : null

    const prepareBoidData = prepareTriangleBoidData

    const prepareShapeBoidData = (boids: Boid[]) => {
      const { config } = runtimeStore.store.getState()
      return prepareShapeBoidDataModular(boids, config.species, shapeAtlas)
    }

    const prepareBodyPartsData = (boids: Boid[]) => {
      const { config } = runtimeStore.store.getState()
      return prepareBodyPartsDataModular(boids, config.species, bodyPartsAtlas)
    }

    const drawTrails = createTrailsDrawCommand(regl)

    const drawEnergyBars = createEnergyBarsDrawCommand(regl)

    const drawHealthBars = createHealthBarsDrawCommand(regl)

    const drawSelectionCircles = createSelectionCirclesDrawCommand(regl)

    const drawStanceSymbols =
      emojiTexture && emojiAtlas
        ? createStanceSymbolsDrawCommand(
            regl,
            emojiTexture,
            emojiAtlas.cellSize
          )
        : null

    const drawText =
      fontTexture && fontAtlas
        ? createTextDrawCommand(regl, fontTexture, fontAtlas.cellSize)
        : null

    const drawDebugCollisionCircles =
      createDebugCollisionCirclesDrawCommand(regl)

    const render = (renderContext?: RenderContext) => {
      regl.poll()

      const { ui, simulation, config } = runtimeStore.store.getState()
      const { visualSettings } = ui

      const boidsToRender = renderContext?.boids ?? boidsStore.boids
      const allBoidsToCount = renderContext?.allBoids ?? boidsStore.boids
      const foodToRender = renderContext?.foodSources ?? simulation.foodSources

      const bgColor = toRgb(config.world.backgroundColor)
      regl.clear({
        color: [bgColor[0] / 255, bgColor[1] / 255, bgColor[2] / 255, 1.0],
        depth: 1,
      })

      const transform = camera.getTransformMatrix()

      if (visualSettings.foodSourcesEnabled && foodToRender.length > 0) {
        const visibleFood = foodToRender.filter((food: FoodSource) =>
          camera.isInViewport(food.position.x, food.position.y, 50)
        )

        if (visibleFood.length > 0) {
          const foodData = prepareFoodData(visibleFood)
          drawFood({
            ...foodData,
            transform,
          })

          if (drawFoodEmojis && emojiAtlas) {
            const foodEmojiData = prepareFoodEmojiData(visibleFood, emojiAtlas)
            if (foodEmojiData && foodEmojiData.count > 0) {
              drawFoodEmojis({
                ...foodEmojiData,
                transform,
              })
            }
          }
        }
      }

      if (drawObstacles && simulation.obstacles.length > 0) {
        const visibleObstacles = simulation.obstacles.filter((obstacle) =>
          camera.isInViewport(
            obstacle.position.x,
            obstacle.position.y,
            obstacle.radius + 50
          )
        )

        if (visibleObstacles.length > 0) {
          const obstacleData = prepareObstacleData(visibleObstacles)
          drawObstacles({
            ...obstacleData,
            transform,
          })
        }
      }

      const visibleBoids: Boid[] = []
      for (const boid of iterateBoids(boidsToRender)) {
        if (camera.isInViewport(boid.position.x, boid.position.y, 100)) {
          visibleBoids.push(boid)
        }
      }

      if (visualSettings.trailsEnabled && visibleBoids.length > 0) {
        const { config } = runtimeStore.store.getState()
        const trailBatches = collectTrailBatches(
          visibleBoids,
          config.species,
          config.world.width,
          config.world.height
        )

        for (const batch of trailBatches) {
          if (batch.segments.length > 0) {
            const trailData = prepareTrailData(batch)
            drawTrails({
              ...trailData,
              transform,
            })
          }
        }
      }

      if (visibleBoids.length > 0) {
        if (drawShapeBoids) {
          const boidData = prepareShapeBoidData(visibleBoids)
          drawShapeBoids({
            ...boidData,
            transform,
          })
        } else {
          const boidData = prepareBoidData(visibleBoids)
          drawBoids({
            ...boidData,
            transform,
          })
        }
      }

      if (drawBodyParts && visibleBoids.length > 0) {
        const bodyPartsData = prepareBodyPartsData(visibleBoids)
        if (bodyPartsData && bodyPartsData.count > 0) {
          drawBodyParts({
            ...bodyPartsData,
            transform,
          })
        }
      }

      if (ui.debugMode && visibleBoids.length > 0) {
        const collisionData = prepareDebugCollisionCirclesData(visibleBoids)
        drawDebugCollisionCircles({
          ...collisionData,
          transform,
        })
      }

      if (visibleBoids.length > 0) {
        const { config, ui } = runtimeStore.store.getState()
        const energyBarData = prepareEnergyBarData(
          visibleBoids,
          config.species,
          ui.visualSettings.energyBarsEnabled
        )

        if (energyBarData.count > 0) {
          drawEnergyBars({
            ...energyBarData,
            transform,
            layerType: 0,
          })
          drawEnergyBars({
            ...energyBarData,
            transform,
            layerType: 1,
          })
        }
      }

      if (visibleBoids.length > 0) {
        const { ui } = runtimeStore.store.getState()
        const healthBarData = prepareHealthBarData(
          visibleBoids,
          ui.visualSettings.healthBarsEnabled
        )

        if (healthBarData.count > 0) {
          drawHealthBars({
            ...healthBarData,
            transform,
            layerType: 0,
          })
          drawHealthBars({
            ...healthBarData,
            transform,
            layerType: 1,
          })
        }
      }

      if (drawStanceSymbols && emojiAtlas) {
        const { ui } = runtimeStore.store.getState()
        const timeState = time.getState()
        const stanceSymbolData = prepareStanceSymbolData(
          allBoidsToCount, // All boids with fresh stance data (not just visible)
          emojiAtlas,
          timeState.simulationFrame,
          ui.visualSettings.stanceSymbolsEnabled
        )
        if (stanceSymbolData && stanceSymbolData.count > 0) {
          drawStanceSymbols({
            ...stanceSymbolData,
            transform,
          })
        }
      }

      const selectionData = prepareSelectionData(camera, allBoidsToCount)
      if (selectionData.count > 0) {
        drawSelectionCircles({
          ...selectionData,
          transform,
        })
      }

      if (drawText && fontAtlas) {
        const { config } = runtimeStore.store.getState()

        const counts = countBoidsByRole(allBoidsToCount, config.species)
        const predatorCount = counts.predator
        const preyCount = counts.prey
        const totalCount = Object.keys(allBoidsToCount).length

        const fps = 60 // TODO: Get actual FPS

        const isSmallScreen = webglCanvas.width < 600
        const lineHeight = isSmallScreen ? 16 : 20
        const startingX = isSmallScreen ? 10 : 25
        const startingY = isSmallScreen ? 20 : 33

        const greenColor = [0, 1, 0.533] // #00ff88
        const redColor = [1, 0, 0] // #ff0000

        const lines = [
          { text: `FPS: ${Math.round(fps)}`, color: greenColor },
          {
            text: `Total: ${totalCount}`,
            color: greenColor,
          },
          { text: `Prey: ${preyCount}`, color: greenColor },
          { text: `Predators: ${predatorCount}`, color: redColor },
        ]

        lines.forEach((line, index) => {
          if (!fontAtlas) return
          const textData = layoutText(
            line.text,
            startingX,
            startingY + lineHeight * index,
            line.color[0],
            line.color[1],
            line.color[2],
            1.0,
            fontAtlas
          )

          if (textData && textData.count > 0) {
            drawText({
              ...textData,
              resolution: [webglCanvas.width, webglCanvas.height],
            })
          }
        })
      }
    }

    const resize = (width: number, height: number) => {
      webglCanvas.width = width
      webglCanvas.height = height

      regl.poll()
    }

    const cleanup = () => {
      eventHandlerCleanup()
    }

    return {
      render,
      resize,
      canvas: webglCanvas, // Expose canvas for mounting
      cleanup, // Expose cleanup for halt
    } satisfies WebGLRenderer & {
      canvas: HTMLCanvasElement
      cleanup: () => void
    }
  },
  halt: (
    resource: WebGLRenderer & {
      canvas?: HTMLCanvasElement
      cleanup?: () => void
    }
  ) => {
    if (resource.cleanup) {
      resource.cleanup()
    }

    if (resource.canvas?.parentNode) {
      resource.canvas.remove()
    }
  },
})

export type WebGLRendererResource = StartedResource<typeof webglRenderer>
