import { useEffect, useRef, useState } from 'react'
import { useResource } from '../systems/standard.ts'
import type { Boid } from '../boids/vocabulary/schemas/entities'
import { iterateBoids } from '@/boids/iterators.ts'

export function Minimap({ backgroundColor }: { backgroundColor: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const camera = useResource('camera')
  const runtimeStore = useResource('runtimeStore')
  const { store: boidStore } = useResource('localBoidStore')

  const worldWidth = runtimeStore.useStore((state) => state.config.world.width)
  const worldHeight = runtimeStore.useStore(
    (state) => state.config.world.height
  )
  const speciesConfigs = runtimeStore.useStore((state) => state.config.species)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const MINIMAP_SIZE = 200
    const scaleX = MINIMAP_SIZE / worldWidth
    const scaleY = MINIMAP_SIZE / worldHeight

    let animationId: number

    const render = () => {
      ctx.fillStyle = backgroundColor
      ctx.fillRect(0, 0, MINIMAP_SIZE, MINIMAP_SIZE)

      ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)'
      ctx.lineWidth = 1
      const gridSize = 1000 // 1K grid
      for (let i = 0; i <= worldWidth; i += gridSize) {
        const x = i * scaleX
        ctx.beginPath()
        ctx.moveTo(x, 0)
        ctx.lineTo(x, MINIMAP_SIZE)
        ctx.stroke()
      }
      for (let i = 0; i <= worldHeight; i += gridSize) {
        const y = i * scaleY
        ctx.beginPath()
        ctx.moveTo(0, y)
        ctx.lineTo(MINIMAP_SIZE, y)
        ctx.stroke()
      }

      const boidsBySpecies = new Map<string, Boid[]>()
      for (const boid of iterateBoids(boidStore.boids)) {
        const existing = boidsBySpecies.get(boid.typeId)
        if (existing) {
          existing.push(boid)
        } else {
          boidsBySpecies.set(boid.typeId, [boid])
        }
      }

      for (const [typeId, boids] of boidsBySpecies) {
        const speciesConfig = speciesConfigs[typeId]
        if (!speciesConfig) continue

        ctx.fillStyle = speciesConfig.baseGenome.visual.color

        for (const boid of boids) {
          const x = boid.position.x * scaleX
          const y = boid.position.y * scaleY

          const size = speciesConfig.role === 'predator' ? 2.5 : 1.5

          ctx.beginPath()
          ctx.arc(x, y, size, 0, Math.PI * 2)
          ctx.fill()
        }
      }

      const viewportBounds = camera.getViewportBounds()
      const viewportX = viewportBounds.left * scaleX
      const viewportY = viewportBounds.top * scaleY
      const viewportWidth =
        (viewportBounds.right - viewportBounds.left) * scaleX
      const viewportHeight =
        (viewportBounds.bottom - viewportBounds.top) * scaleY

      ctx.strokeStyle = '#00ff88'
      ctx.lineWidth = 2
      ctx.strokeRect(viewportX, viewportY, viewportWidth, viewportHeight)

      const cameraCenterX = camera.x * scaleX
      const cameraCenterY = camera.y * scaleY
      ctx.strokeStyle = '#00ff88'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(cameraCenterX - 4, cameraCenterY)
      ctx.lineTo(cameraCenterX + 4, cameraCenterY)
      ctx.moveTo(cameraCenterX, cameraCenterY - 4)
      ctx.lineTo(cameraCenterX, cameraCenterY + 4)
      ctx.stroke()

      ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)'
      ctx.lineWidth = 2
      ctx.strokeRect(0, 0, MINIMAP_SIZE, MINIMAP_SIZE)

      animationId = requestAnimationFrame(render)
    }

    render()

    return () => {
      cancelAnimationFrame(animationId)
    }
  }, [
    boidStore,
    camera,
    worldWidth,
    worldHeight,
    speciesConfigs,
    backgroundColor,
  ])

  const [isDragging, setIsDragging] = useState(false)

  const minimapToWorld = (
    minimapX: number,
    minimapY: number
  ): { x: number; y: number } => {
    const MINIMAP_SIZE = 200
    const scaleX = MINIMAP_SIZE / worldWidth
    const scaleY = MINIMAP_SIZE / worldHeight

    return {
      x: minimapX / scaleX,
      y: minimapY / scaleY,
    }
  }

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    setIsDragging(true)

    const canvas = canvasRef.current
    if (!canvas) return

    const rect = canvas.getBoundingClientRect()
    const clickX = e.clientX - rect.left
    const clickY = e.clientY - rect.top

    const worldPos = minimapToWorld(clickX, clickY)
    camera.panTo(worldPos.x, worldPos.y, true) // Manual navigation
  }

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDragging) return

    const canvas = canvasRef.current
    if (!canvas) return

    const rect = canvas.getBoundingClientRect()
    const mouseX = e.clientX - rect.left
    const mouseY = e.clientY - rect.top

    const worldPos = minimapToWorld(mouseX, mouseY)
    camera.panTo(worldPos.x, worldPos.y, true) // Manual navigation
  }

  const handleMouseUp = () => {
    setIsDragging(false)
  }

  const handleMouseLeave = () => {
    setIsDragging(false)
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 hidden md:block">
      <div className="bg-black/1 backdrop-blur-xs border border-primary/30 rounded-lg p-2 shadow-2xl">
        <div className="text-xs text-primary/70 mb-1 font-mono text-center">
          MINIMAP
        </div>
        <canvas
          ref={canvasRef}
          width={200}
          height={200}
          className={
            isDragging ? 'cursor-grabbing rounded' : 'cursor-grab rounded'
          }
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseLeave}
          title="Click and drag to navigate"
        />
        <div className="text-xs text-primary/50 mt-1 font-mono text-center">
          {worldWidth}x{worldHeight}
        </div>
      </div>
    </div>
  )
}
