/**
 * Functional Rendering Pipeline
 *
 * Breaks down rendering into composable, pure-ish functions.
 * Each function takes a RenderContext and draws one aspect of the simulation.
 */

import { countBoidsByRole } from '@/boids/filters.ts'
import { iterateBoids } from '@/boids/iterators.ts'
import {
  getWoundedTint,
  shouldShowHealthBar,
} from '@/boids/lifecycle/health.ts'
import { cameraKeywords } from '@/boids/vocabulary/keywords.ts'
import { adjustColorBrightness, hexToRgba, toRgb } from '@/lib/colors.ts'
import { shapeSizeParamFromBaseSize } from '@/lib/shapeSizing.ts'
import { SharedBoidViews } from '@/lib/sharedMemory.ts'
import type {
  BoidsById,
  DeathMarker,
  FoodSource,
  Obstacle,
} from '../../../boids/vocabulary/schemas/entities.ts'
import type { SpeciesConfig } from '../../../boids/vocabulary/schemas/species.ts'
import type { Profiler } from '../../shared/profiler.ts'
import type { TimeState } from '../../shared/time.ts'
import type { AtlasesResult } from '../atlases.ts'
import type { CameraAPI, CameraMode } from '../camera.ts'
import { getBodyPartRenderer, getShapeRenderer } from './shapes.ts'

/**
 * Render Context - All data needed for rendering
 */
export type RenderContext = {
  ctx: CanvasRenderingContext2D
  width: number
  height: number
  backgroundColor: string // World background color from profile
  boids: BoidsById // Visible boids (for rendering)
  allBoids: BoidsById // All boids in world (for stats)
  obstacles: Obstacle[]
  deathMarkers: DeathMarker[]
  foodSources: FoodSource[]
  bufferViews: SharedBoidViews
  speciesConfigs: Record<string, SpeciesConfig>
  visualSettings: {
    trailsEnabled: boolean
    energyBarsEnabled: boolean
    healthBarsEnabled: boolean // NEW: Health bars toggle
    matingHeartsEnabled: boolean
    stanceSymbolsEnabled: boolean
    deathMarkersEnabled: boolean
    headerCollapsed: boolean
    foodSourcesEnabled: boolean
    atmosphere: {
      trailAlpha: number
    }
  }
  timeState: TimeState // Time state for pause overlay and speed indicator
  simulationFrame: number // NEW -
  camera: CameraAPI // Camera for coordinate transforms
  simulationTick: number // NEW -
  profiler?: Profiler
  atlases: AtlasesResult
}

/**
 * Level of Detail (LOD) Configuration
 *
 */
type LODConfig = {
  renderBodyParts: boolean // Render eyes, fins, tails, etc.
  renderStanceSymbols: boolean // Render stance emojis
  renderMatingHearts: boolean // Render mating hearts
  trailSkipMod: number // Modulo for trail updates (3 = every 3rd boid)
}

/**
 * Calculate LOD settings based on total boid count
 * Gracefully degrades visual quality to maintain performance
 *
 * Session 72B: Adjusted thresholds after physics slowdown (30 UPS)
 * Physics at 30 UPS provides much better performance, so we can keep
 * full quality at much higher boid counts before degrading visuals.
 */
const calculateLOD = (boidCount: number): LODConfig => {
  if (boidCount < 2500) {
    return {
      renderBodyParts: true,
      renderStanceSymbols: true,
      renderMatingHearts: true,
      trailSkipMod: 1, // Render all trails - no blinking!
    }
  }

  if (boidCount < 3500) {
    return {
      renderBodyParts: false, // Disable body parts (eyes, fins, etc)
      renderStanceSymbols: false, // Disable stance emojis
      renderMatingHearts: false, // Disable mating hearts
      trailSkipMod: 1, // Still render all trails (no blinking)
    }
  }

  return {
    renderBodyParts: false,
    renderStanceSymbols: false,
    renderMatingHearts: false,
    trailSkipMod: 2, // Only skip trails at very high counts
  }
}

/**
 * Clear canvas with atmosphere-controlled background
 */
export const renderBackground = (rc: RenderContext): void => {
  rc.profiler?.start('render.clear')
  rc.ctx.fillStyle = hexToRgba(
    rc.backgroundColor,
    rc.visualSettings.atmosphere.trailAlpha
  )
  rc.ctx.fillRect(0, 0, rc.width, rc.height)
  rc.profiler?.end('render.clear')
}

/**
 * Render obstacles with hazard pattern
 */
export const renderObstacles = (rc: RenderContext): void => {
  rc.profiler?.start('render.obstacles')
  for (const obstacle of rc.obstacles) {
    const { x, y } = obstacle.position
    const radius = obstacle.radius

    rc.ctx.save()

    rc.ctx.beginPath()
    rc.ctx.arc(x, y, radius, 0, Math.PI * 2)
    rc.ctx.clip()

    const stripeWidth = 8
    const numStripes = Math.ceil((radius * 2 + radius * 2) / stripeWidth)

    for (let i = -numStripes; i < numStripes; i++) {
      rc.ctx.fillStyle = i % 2 === 0 ? '#000000' : '#FFD700'
      rc.ctx.fillRect(
        x - radius * 2 + i * stripeWidth,
        y - radius * 2,
        stripeWidth,
        radius * 4
      )
    }

    rc.ctx.restore()

    rc.ctx.strokeStyle = '#FFD700' // Yellow border
    rc.ctx.lineWidth = 3
    rc.ctx.shadowColor = '#FFD700'
    rc.ctx.shadowBlur = 10
    rc.ctx.beginPath()
    rc.ctx.arc(x, y, radius, 0, Math.PI * 2)
    rc.ctx.stroke()

    rc.ctx.shadowBlur = 0

    if (radius > 20) {
      rc.ctx.font = `${radius * 0.8}px Arial`
      rc.ctx.textAlign = 'center'
      rc.ctx.textBaseline = 'middle'
      rc.ctx.fillStyle = '#FFD700'
      rc.ctx.strokeStyle = '#000000'
      rc.ctx.lineWidth = 2
      rc.ctx.strokeText('⚠', x, y)
      rc.ctx.fillText('⚠', x, y)
    }
  }
  rc.profiler?.end('render.obstacles')
}

/**
 * Render death markers
 */
export const renderDeathMarkers = (rc: RenderContext): void => {
  rc.profiler?.start('render.deathMarkers')
  if (!rc.visualSettings.deathMarkersEnabled || rc.deathMarkers.length === 0) {
    rc.profiler?.end('render.deathMarkers')
    return
  }

  for (const marker of rc.deathMarkers) {
    const speciesConfig = rc.speciesConfigs[marker.typeId]
    if (!speciesConfig) continue

    const strengthRatio = marker.strength / 5.0 // Max strength is 5.0
    const tickRatio = marker.remainingFrames / marker.maxLifetimeFrames

    const opacity = Math.max(0.3, tickRatio)

    const baseSize = 20
    const fontSize = baseSize + strengthRatio * 10 // 20-30px
    const circleRadius = 12 + strengthRatio * 8 // 12-20px

    const glowIntensity = 8 + strengthRatio * 12 // 8-20px blur

    rc.ctx.save()

    rc.ctx.globalAlpha = opacity * 0.4 * strengthRatio
    rc.ctx.fillStyle = speciesConfig.baseGenome.visual.color
    rc.ctx.shadowColor = speciesConfig.baseGenome.visual.color
    rc.ctx.shadowBlur = glowIntensity
    rc.ctx.beginPath()
    rc.ctx.arc(
      marker.position.x,
      marker.position.y,
      circleRadius,
      0,
      Math.PI * 2
    )
    rc.ctx.fill()

    rc.ctx.shadowColor = 'rgba(0, 0, 0, 0.8)'
    rc.ctx.shadowBlur = 8
    rc.ctx.globalAlpha = opacity
    rc.ctx.font = `${fontSize}px Arial`
    rc.ctx.textAlign = 'center'
    rc.ctx.textBaseline = 'middle'
    rc.ctx.fillText('💀', marker.position.x, marker.position.y)

    rc.ctx.restore()
  }
  rc.profiler?.end('render.deathMarkers')
}

/**
 * Render food sources
 */
export const renderFoodSources = (rc: RenderContext): void => {
  rc.profiler?.start('render.foodSources')
  if (!rc.visualSettings.foodSourcesEnabled || rc.foodSources.length === 0) {
    rc.profiler?.end('render.foodSources')
    return
  }

  for (const food of rc.foodSources) {
    if (food.energy <= 0) continue

    const energyRatio = food.energy / food.maxEnergy // 0.0 to 1.0

    const radius = 12 + energyRatio * 14

    const opacity = Math.max(0.5, energyRatio)

    const color = food.sourceType === 'prey' ? '#4CAF50' : '#F44336'

    rc.ctx.save()
    rc.ctx.globalAlpha = opacity

    rc.ctx.strokeStyle = color
    rc.ctx.lineWidth = 2.5
    rc.ctx.shadowColor = color
    rc.ctx.shadowBlur = 8
    rc.ctx.beginPath()
    rc.ctx.arc(food.position.x, food.position.y, radius, 0, Math.PI * 2)
    rc.ctx.stroke()

    const emoji = food.sourceType === 'prey' ? '🌿' : '🥩'
    const fontSize = 20 + energyRatio * 10 // 18-28px (larger)
    rc.ctx.shadowColor = 'rgba(0, 0, 0, 0.8)'
    rc.ctx.shadowBlur = 6
    rc.ctx.font = `${fontSize}px Arial`
    rc.ctx.textAlign = 'center'
    rc.ctx.textBaseline = 'middle'
    rc.ctx.fillStyle = '#ffffff' // White fill for better visibility
    rc.ctx.fillText(emoji, food.position.x, food.position.y)

    rc.ctx.restore()
  }
  rc.profiler?.end('render.foodSources')
}

type TrailSegment = {
  x1: number
  y1: number
  x2: number
  y2: number
}
type TrailBatch = {
  segments: TrailSegment[]
  lineWidth: number
}

let trailBatchCache: Map<string, TrailBatch> | null = null

/**
 * Render boid trails (batched for performance)
 */
export const renderTrails = (rc: RenderContext): void => {
  if (!rc.visualSettings.trailsEnabled) {
    return
  }

  rc.profiler?.start('render.trails.collect')

  if (!trailBatchCache) {
    trailBatchCache = new Map()
  }

  for (const batch of trailBatchCache.values()) {
    batch.segments.length = 0 // Clear in-place
  }

  const trailBatches = trailBatchCache

  const lod = calculateLOD(Object.keys(rc.allBoids).length)

  for (const boid of iterateBoids(rc.boids)) {
    if (boid.index % lod.trailSkipMod !== 0) continue

    const speciesConfig = rc.speciesConfigs[boid.typeId]
    if (!speciesConfig || boid.positionHistory.length <= 1) continue

    const shouldRenderTrail = speciesConfig.visualConfig?.trail ?? true
    if (!shouldRenderTrail) continue

    const energyRatio = boid.energy / boid.phenotype.maxEnergy
    const baseAlpha = 0.3 + energyRatio * 0.5

    const color = speciesConfig.visualConfig.trailColor || boid.phenotype.color
    const [r, g, b] = toRgb(color)
    const lineWidth = speciesConfig.role === 'predator' ? 2 : 1.5

    for (let i = 0; i < boid.positionHistory.length - 1; i++) {
      const pos1 = boid.positionHistory[i]
      const pos2 = boid.positionHistory[i + 1]

      const dx = Math.abs(pos2.x - pos1.x)
      const dy = Math.abs(pos2.y - pos1.y)
      const maxJump = Math.min(rc.width, rc.height) / 2

      if (dx > maxJump || dy > maxJump) {
        continue
      }

      const segmentRatio = i / boid.positionHistory.length
      const alpha = baseAlpha * segmentRatio

      const quantizedAlpha = Math.round(alpha * 10) / 10

      const batchKey = `${r},${g},${b}|${quantizedAlpha}|${lineWidth}`

      let batch = trailBatches.get(batchKey)
      if (!batch) {
        batch = { segments: [], lineWidth }
        trailBatches.set(batchKey, batch)
      }

      batch.segments.push({
        x1: pos1.x,
        y1: pos1.y,
        x2: pos2.x,
        y2: pos2.y,
      })
    }
  }

  rc.profiler?.end('render.trails.collect')

  rc.profiler?.start('render.trails.draw')

  rc.ctx.lineCap = 'round'
  rc.ctx.lineJoin = 'round'

  for (const [batchKey, batch] of trailBatches) {
    const [colorPart, alphaPart] = batchKey.split('|')
    const [r, g, b] = colorPart.split(',').map(Number)
    const alpha = parseFloat(alphaPart)

    rc.ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`
    rc.ctx.lineWidth = batch.lineWidth

    rc.ctx.beginPath()
    for (const seg of batch.segments) {
      rc.ctx.moveTo(seg.x1, seg.y1)
      rc.ctx.lineTo(seg.x2, seg.y2)
    }
    rc.ctx.stroke()
  }

  rc.profiler?.end('render.trails.draw')
}

/**
 * Render boid bodies with species-specific shapes and body parts
 */
export const renderBoidBodies = (rc: RenderContext): void => {
  rc.profiler?.start('render.boids')

  const lod = calculateLOD(Object.keys(rc.allBoids).length)

  for (const boid of iterateBoids(rc.boids)) {
    const angle = Math.atan2(boid.velocity.y, boid.velocity.x)
    const speciesConfig = rc.speciesConfigs[boid.typeId]
    if (!speciesConfig) {
      continue
    }

    rc.ctx.save()
    rc.ctx.translate(boid.position.x, boid.position.y)
    rc.ctx.rotate(angle)

    const shape = speciesConfig.visualConfig?.shape || 'circle'
    const baseSize = boid.phenotype.baseSize // == collisionRadius
    const shapeSize = shapeSizeParamFromBaseSize(shape, baseSize)

    const energyRatio = boid.energy / boid.phenotype.maxEnergy
    const dynamicColor = adjustColorBrightness(
      boid.phenotype.color, // Use individual genome color, not species color
      energyRatio
    )

    const bodyParts = speciesConfig.baseGenome?.visual?.bodyParts || []
    const hasGlow = bodyParts.some(
      (part: { type: string }) => part.type === 'glow'
    )

    if (hasGlow) {
      rc.ctx.shadowBlur = baseSize * 0.8
      rc.ctx.shadowColor = dynamicColor
    }

    rc.ctx.fillStyle = dynamicColor
    rc.ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)'
    rc.ctx.lineWidth = 1

    const shapeRenderer = getShapeRenderer(shape, rc.atlases)
    shapeRenderer(rc.ctx, shapeSize) // Renderer handles fill/stroke internally

    if (hasGlow) {
      rc.ctx.shadowBlur = 0
    }

    if (lod.renderBodyParts && bodyParts.length > 0) {
      const tailColor =
        speciesConfig.visualConfig?.tailColor || boid.phenotype.color

      for (const part of bodyParts) {
        const partType = part.type
        if (partType === 'glow') continue // Already handled above

        const partRenderer = getBodyPartRenderer(partType)
        if (partRenderer) {
          const partColor =
            partType === 'tail' ? tailColor : boid.phenotype.color
          partRenderer({
            ctx: rc.ctx,
            atlas: rc.atlases.bodyParts,
            boidSize: baseSize,
            color: partColor,
            bodyParts: [part],
          })
        }
      }
    }

    const woundedTint = getWoundedTint(boid)
    if (woundedTint) {
      const originalAlpha = rc.ctx.globalAlpha || 1
      rc.ctx.globalAlpha = woundedTint.alpha
      rc.ctx.fillStyle = woundedTint.color
      rc.ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)' // Subtle outline for wounded
      rc.ctx.lineWidth = 1
      shapeRenderer(rc.ctx, shapeSize) // Renderer handles fill/stroke internally
      rc.ctx.globalAlpha = originalAlpha
    }

    rc.ctx.save()
    rc.ctx.strokeStyle = 'rgba(255, 0, 0, 0.5)' // Red semi-transparent
    rc.ctx.lineWidth = 1
    rc.ctx.setLineDash([3, 3]) // Dashed line
    const collisionRadius = boid.phenotype.collisionRadius
    rc.ctx.beginPath()
    rc.ctx.arc(0, 0, collisionRadius, 0, Math.PI * 2)
    rc.ctx.stroke()
    rc.ctx.setLineDash([]) // Reset dash
    rc.ctx.restore()

    rc.ctx.restore()
  }

  rc.profiler?.end('render.boids')
}

/**
 * Render stance symbols above boids
 *
 * Shows stance symbol for 3-4 seconds after stance change, then fades out.
 * This keeps the UI engaging without constant visual clutter.
 */
export const renderStanceSymbols = (rc: RenderContext): void => {
  if (!rc.visualSettings.stanceSymbolsEnabled) {
    return
  }

  const lod = calculateLOD(Object.keys(rc.allBoids).length)
  if (!lod.renderStanceSymbols) {
    return
  }

  for (const boid of iterateBoids(rc.boids)) {
    const speciesConfig = rc.speciesConfigs[boid.typeId]
    if (!speciesConfig) continue

    const framesSinceChange = rc.simulationFrame - boid.stanceEnteredAtFrame
    const DISPLAY_DURATION = 120 // Show for 4 seconds (120 frames at 30 FPS)
    const FADE_START = 60 // Start fading at 2 seconds (60 frames at 30 FPS)

    if (framesSinceChange > DISPLAY_DURATION) {
      continue
    }

    const stance = boid.stance
    let stanceSymbol = ''
    let stanceColor = '#fff'

    if (speciesConfig.role === 'predator') {
      switch (stance) {
        case 'hunting':
          stanceSymbol = '😈'
          stanceColor = '#ff0000'
          break
        case 'seeking_mate':
          stanceSymbol = '💕'
          stanceColor = '#ff69b4'
          break
        case 'mating':
          stanceSymbol = '❤️'
          stanceColor = '#ff1493'
          break
        case 'idle':
          stanceSymbol = '💤'
          stanceColor = '#666'
          break
        case 'eating':
          stanceSymbol = '🍔'
          stanceColor = '#ff8800'
          break
      }
    } else {
      switch (stance) {
        case 'flocking':
          stanceSymbol = '🐦'
          stanceColor = '#00aaff'
          break
        case 'seeking_mate':
          stanceSymbol = '💕'
          stanceColor = '#ff69b4'
          break
        case 'mating':
          stanceSymbol = '❤️'
          stanceColor = '#ff1493'
          break
        case 'fleeing':
          stanceSymbol = '😱'
          stanceColor = '#ffaa00'
          break
        case 'eating':
          stanceSymbol = '🌿'
          stanceColor = '#4CAF50'
          break
      }
    }

    if (stanceSymbol) {
      let alpha = 1.0
      if (framesSinceChange > FADE_START) {
        const fadeProgress =
          (framesSinceChange - FADE_START) / (DISPLAY_DURATION - FADE_START)
        alpha = 1.0 - fadeProgress
      }

      rc.ctx.save()
      rc.ctx.globalAlpha = alpha
      rc.ctx.fillStyle = stanceColor
      rc.ctx.font = 'bold 12px monospace'
      rc.ctx.textAlign = 'center'
      rc.ctx.textBaseline = 'bottom'
      const yOffset = speciesConfig.role === 'predator' ? -15 : -12
      rc.ctx.fillText(stanceSymbol, boid.position.x, boid.position.y + yOffset)
      rc.ctx.restore()
    }
  }
}

/**
 * Render energy bars above boids
 */
export const renderEnergyBars = (rc: RenderContext): void => {
  for (const boid of iterateBoids(rc.boids)) {
    const speciesConfig = rc.speciesConfigs[boid.typeId]
    if (!speciesConfig) continue

    const showEnergyBar =
      speciesConfig.role === 'predator' || rc.visualSettings.energyBarsEnabled

    if (!showEnergyBar) continue

    const energyPercent = boid.energy / boid.phenotype.maxEnergy
    const barWidth = 22
    const barHeight = 3
    const barX = boid.position.x - barWidth / 2
    const barY = boid.position.y - 20

    rc.ctx.fillStyle = '#333'
    rc.ctx.fillRect(barX, barY, barWidth, barHeight)

    const energyColor =
      speciesConfig.role === 'predator' ? '#ff0000' : '#00ff88'
    rc.ctx.fillStyle = energyColor
    rc.ctx.fillRect(barX, barY, barWidth * energyPercent, barHeight)

    rc.ctx.strokeStyle = '#666'
    rc.ctx.lineWidth = 1
    rc.ctx.strokeRect(barX, barY, barWidth, barHeight)
  }
}

/**
 * Render health bars above boids (only when damaged)
 */
export const renderHealthBars = (rc: RenderContext): void => {
  if (!rc.visualSettings.healthBarsEnabled) return

  for (const boid of iterateBoids(rc.boids)) {
    if (!shouldShowHealthBar(boid)) continue

    const healthPercent = boid.health / boid.phenotype.maxHealth
    const barWidth = 22
    const barHeight = 3
    const barX = boid.position.x - barWidth / 2
    const barY = boid.position.y - 20 // Above the boid, well above energy bar

    rc.ctx.fillStyle = '#222'
    rc.ctx.fillRect(barX, barY, barWidth, barHeight)

    let healthColor: string
    if (healthPercent > 0.7) {
      healthColor = '#00ff00' // Green (healthy)
    } else if (healthPercent > 0.4) {
      healthColor = '#ffff00' // Yellow (wounded)
    } else {
      healthColor = '#ff0000' // Red (critical)
    }

    rc.ctx.fillStyle = healthColor
    rc.ctx.fillRect(barX, barY, barWidth * healthPercent, barHeight)

    rc.ctx.strokeStyle = '#666'
    rc.ctx.lineWidth = 1
    rc.ctx.strokeRect(barX, barY, barWidth, barHeight)
  }
}

/**
 * Render mating hearts between paired boids
 */
export const renderMatingHearts = (rc: RenderContext): void => {
  if (!rc.visualSettings.matingHeartsEnabled) {
    return
  }

  const lod = calculateLOD(Object.keys(rc.allBoids).length)
  if (!lod.renderMatingHearts) {
    return
  }

  rc.profiler?.start('render.matingHearts')

  const drawnMatingPairs = new Set<string>()

  for (const boid of iterateBoids(rc.boids)) {
    if (boid.stance === 'mating' && boid.mateId) {
      const pairId = [boid.id, boid.mateId].sort().join('-')

      if (drawnMatingPairs.has(pairId)) continue
      drawnMatingPairs.add(pairId)

      const mate = rc.boids[boid.mateId]
      if (!mate) continue

      let dx = mate.position.x - boid.position.x
      let dy = mate.position.y - boid.position.y

      if (Math.abs(dx) > rc.width / 2) {
        dx = dx > 0 ? dx - rc.width : dx + rc.width
      }

      if (Math.abs(dy) > rc.height / 2) {
        dy = dy > 0 ? dy - rc.height : dy + rc.height
      }

      let midX = boid.position.x + dx / 2
      let midY = boid.position.y + dy / 2

      if (midX < 0) midX += rc.width
      if (midX > rc.width) midX -= rc.width
      if (midY < 0) midY += rc.height
      if (midY > rc.height) midY -= rc.height

      const time = rc.timeState.simulationElapsedMs / 1000
      const bobOffset = Math.sin(time * 3) * 4 // Bob 4px up/down

      rc.ctx.save()
      rc.ctx.font = '12px Arial'
      rc.ctx.textAlign = 'center'
      rc.ctx.textBaseline = 'middle'

      rc.ctx.shadowBlur = 8
      rc.ctx.shadowColor = 'rgba(255, 100, 200, 0.8)'

      rc.ctx.fillText('❤️', midX, midY - 25 + bobOffset)

      rc.ctx.shadowBlur = 0
      rc.ctx.restore()
    }
  }

  rc.profiler?.end('render.matingHearts')
}

/**
 * Render stats overlay (FPS, population counts)
 */
export const renderStats = (rc: RenderContext, fps: number): void => {
  rc.profiler?.start('render.stats')
  const counts = countBoidsByRole(rc.allBoids, rc.speciesConfigs)

  const predatorCount = counts.predator
  const preyCount = counts.prey

  const isSmallScreen = rc.width < 600
  const fontSize = isSmallScreen ? 12 : 16
  const lineHeight = isSmallScreen ? 16 : 20
  const startingX = isSmallScreen ? 10 : 25
  const startingY = (() => {
    if (rc.visualSettings.headerCollapsed) {
      return 70
    }
    return isSmallScreen ? 20 : 33
  })()

  rc.ctx.fillStyle = '#00ff88'
  rc.ctx.font = `${fontSize}px monospace`
  rc.ctx.fillText(`FPS: ${Math.round(fps)}`, startingX, startingY)
  rc.ctx.fillText(
    `Total: ${rc.allBoids.length}`,
    startingX,
    startingY + lineHeight
  )
  rc.ctx.fillStyle = '#00ff88'
  rc.ctx.fillText(`Prey: ${preyCount}`, startingX, startingY + lineHeight * 2)
  rc.ctx.fillStyle = '#ff0000'
  rc.ctx.fillText(
    `Predators: ${predatorCount}`,
    startingX,
    startingY + lineHeight * 3
  )
  rc.ctx.fillStyle = '#00ff88'
  rc.ctx.fillText(
    `Obstacles: ${rc.obstacles.length}`,
    startingX,
    startingY + lineHeight * 4
  )

  if (rc.timeState.isPaused) {
    rc.ctx.save()

    rc.ctx.fillStyle = 'rgba(0, 0, 0, 0.3)'
    rc.ctx.fillRect(0, 0, rc.width, rc.height)

    rc.ctx.fillStyle = '#00ff88'
    rc.ctx.font = "bold 64px 'Nunito Sans', sans-serif"
    rc.ctx.textAlign = 'center'
    rc.ctx.textBaseline = 'middle'
    rc.ctx.fillText('⏸️ PAUSED', rc.width / 2, rc.height / 2)

    rc.ctx.fillStyle = '#ffffff'
    rc.ctx.font = "20px 'Nunito Sans', sans-serif"
    rc.ctx.fillText(
      'Press SPACE to resume or → to step forward',
      rc.width / 2,
      rc.height / 2 + 60
    )

    rc.ctx.fillStyle = '#888888'
    rc.ctx.font = "16px 'Nunito Sans', sans-serif"
    rc.ctx.fillText(
      `Frame: ${rc.timeState.simulationFrame}`,
      rc.width / 2,
      rc.height / 2 + 90
    )

    rc.ctx.restore()
  }

  if (rc.timeState.timeScale !== 1.0) {
    rc.ctx.save()
    rc.ctx.fillStyle = '#ffaa00'
    rc.ctx.font = "bold 24px 'Nunito Sans', sans-serif"
    rc.ctx.textAlign = 'right'
    rc.ctx.textBaseline = 'top'
    rc.ctx.fillText(`⏩ ${rc.timeState.timeScale}x`, rc.width - 20, 20)
    rc.ctx.restore()
  }

  rc.profiler?.end('render.stats')
}

/**
 * Render picker mode circle and target highlight
 */
export const renderPickerMode = (rc: RenderContext): void => {
  if (rc.camera.mode.type !== 'picker') return

  const { mouseWorldPos, targetBoidId, mouseInCanvas } = rc.camera.mode

  if (!mouseInCanvas) return

  const ctx = rc.ctx

  const screenPos = rc.camera.worldToScreen(mouseWorldPos.x, mouseWorldPos.y)

  const pickerRadius = 80 // pixels
  ctx.save()
  ctx.strokeStyle = 'rgba(100, 200, 255, 0.6)'
  ctx.lineWidth = 2
  ctx.setLineDash([5, 5])
  ctx.beginPath()
  ctx.arc(screenPos.x, screenPos.y, pickerRadius, 0, Math.PI * 2)
  ctx.stroke()
  ctx.setLineDash([])
  ctx.restore()

  if (targetBoidId) {
    const targetBoid = rc.allBoids[targetBoidId]
    if (targetBoid) {
      const boidScreenPos = rc.camera.worldToScreen(
        targetBoid.position.x,
        targetBoid.position.y
      )

      ctx.save()
      ctx.strokeStyle = 'rgba(100, 200, 255, 0.8)'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.arc(boidScreenPos.x, boidScreenPos.y, 15, 0, Math.PI * 2)
      ctx.stroke()
      ctx.restore()
    }
  }
}

/**
 * Render pulsing ring around followed boid
 *
 */
export const renderFollowedBoid = (rc: RenderContext): void => {
  if (rc.camera.mode.type !== cameraKeywords.mode.following) {
    return
  }

  const followedBoidId = (
    rc.camera.mode as Extract<CameraMode, { type: 'following' }>
  ).boidId

  const followedBoid = rc.allBoids[followedBoidId]
  if (!followedBoid) {
    return
  }

  const ctx = rc.ctx
  const screenPos = rc.camera.worldToScreen(
    followedBoid.position.x,
    followedBoid.position.y
  )

  const pulseSpeed = 0.5 // Hz
  const time = rc.timeState.simulationElapsedMs / 1000
  const pulsePhase = time * pulseSpeed * Math.PI * 2
  const pulseScale = 0.8 + Math.sin(pulsePhase) * 0.2 // 0.6 to 1.0
  const radius = 20 * pulseScale
  const alpha = 0.5 + Math.sin(pulsePhase) * 0.3 // 0.2 to 0.8

  ctx.save()
  ctx.strokeStyle = `rgba(255, 200, 100, ${alpha})`
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.arc(screenPos.x, screenPos.y, radius, 0, Math.PI * 2)
  ctx.stroke()
  ctx.restore()
}

/**
 * Complete rendering pipeline - orchestrates all render passes
 */
export const renderFrame = (rc: RenderContext, fps: number): void => {
  renderBackground(rc)

  rc.ctx.save()
  rc.ctx.translate(rc.width / 2, rc.height / 2)
  rc.ctx.scale(rc.camera.zoom, rc.camera.zoom)
  rc.ctx.translate(-rc.camera.x, -rc.camera.y)

  renderObstacles(rc)
  renderDeathMarkers(rc)
  renderFoodSources(rc)

  renderTrails(rc)

  renderBoidBodies(rc)

  renderStanceSymbols(rc)
  renderEnergyBars(rc)
  renderHealthBars(rc) // NEW: Health bars
  renderMatingHearts(rc)

  rc.ctx.restore()

  renderPickerMode(rc)
  renderFollowedBoid(rc)

  renderStats(rc, fps)
}
