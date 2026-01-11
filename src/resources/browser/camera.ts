import { Atom, AtomState, createAtom, useAtomState } from '@/lib/state.ts'
import { rateLimit } from '@tanstack/pacer'
import { defineResource } from 'braided'
import type { CanvasAPI } from './canvas.ts'
import type { RuntimeStoreResource } from './runtimeStore.ts'

export type CameraMode =
  | { type: 'free' }
  | {
      type: 'picker'
      targetBoidId: string | null
      mouseWorldPos: { x: number; y: number }
      mouseInCanvas: boolean
    }
  | { type: 'following'; boidId: string; lerpFactor: number }

export type CameraAPI = {
  x: number
  y: number
  zoom: number
  viewportWidth: number
  viewportHeight: number
  mode: CameraMode
  isDragging: boolean
  useMode: () => AtomState<Atom<CameraMode>>
  panTo: (x: number, y: number, isManualNavigation?: boolean) => void
  setZoom: (zoom: number) => void
  screenToWorld: (screenX: number, screenY: number) => { x: number; y: number }
  worldToScreen: (worldX: number, worldY: number) => { x: number; y: number }
  isInViewport: (worldX: number, worldY: number, buffer?: number) => boolean
  getViewportBounds: () => {
    left: number
    right: number
    top: number
    bottom: number
  }
  getTransformMatrix: () => number[]
  enterPickerMode: () => void
  updatePickerTarget: (
    boidId: string | null,
    mouseWorldPos: { x: number; y: number }
  ) => void
  setMouseInCanvas: (inCanvas: boolean) => void
  exitPickerMode: () => void
  startFollowing: (boidId: string) => void
  stopFollowing: () => void
  updateFollowPosition: (targetX: number, targetY: number) => void
}

export const camera = defineResource({
  dependencies: ['canvas', 'runtimeStore'],
  start: ({
    canvas,
    runtimeStore,
  }: {
    canvas: CanvasAPI
    runtimeStore: RuntimeStoreResource
  }) => {
    const { config: runtimeConfig } = runtimeStore.store.getState()

    let x = runtimeConfig.world.width / 2
    let y = runtimeConfig.world.height / 2
    let zoom = 1.0 // 1.0 = see full viewport width in world units

    const cameraAtom = createAtom({
      type: 'free',
    } as CameraMode)

    const worldToScreen = (worldX: number, worldY: number) => ({
      x: (worldX - x) * zoom + canvas.width / 2,
      y: (worldY - y) * zoom + canvas.height / 2,
    })

    const screenToWorld = (screenX: number, screenY: number) => ({
      x: (screenX - canvas.width / 2) / zoom + x,
      y: (screenY - canvas.height / 2) / zoom + y,
    })

    const isInViewport = (worldX: number, worldY: number, buffer = 100) => {
      const halfWidth = canvas.width / zoom / 2 + buffer
      const halfHeight = canvas.height / zoom / 2 + buffer

      return (
        worldX >= x - halfWidth &&
        worldX <= x + halfWidth &&
        worldY >= y - halfHeight &&
        worldY <= y + halfHeight
      )
    }

    const getViewportBounds = () => {
      const halfWidth = canvas.width / zoom / 2
      const halfHeight = canvas.height / zoom / 2

      return {
        left: x - halfWidth,
        right: x + halfWidth,
        top: y - halfHeight,
        bottom: y + halfHeight,
      }
    }

    const panTo = (newX: number, newY: number, isManualNavigation = false) => {
      const state = cameraAtom.get()
      if (isManualNavigation && state.type === 'following') {
        cameraAtom.set({ type: 'free' })
      }

      const halfWidth = canvas.width / zoom / 2
      const halfHeight = canvas.height / zoom / 2

      const worldWidth = runtimeConfig.world.width
      const worldHeight = runtimeConfig.world.height

      x = Math.max(halfWidth, Math.min(worldWidth - halfWidth, newX))
      y = Math.max(halfHeight, Math.min(worldHeight - halfHeight, newY))
    }

    const rateLimitedPanTo = rateLimit(
      (newX: number, newY: number, isManualNavigation = false) => {
        panTo(newX, newY, isManualNavigation)
      },
      {
        limit: 4,
        window: 100,
        windowType: 'sliding',
      }
    )

    const setZoom = (newZoom: number) => {
      const worldWidth = runtimeConfig.world.width
      const worldHeight = runtimeConfig.world.height
      const maxZoomForWidth = canvas.width / worldWidth
      const maxZoomForHeight = canvas.height / worldHeight
      const minZoom = Math.max(maxZoomForWidth, maxZoomForHeight) // Stop when either dimension fits

      zoom = Math.max(minZoom, Math.min(2.5, newZoom))
    }

    const handleKeyboard = (e: KeyboardEvent) => {
      const state = cameraAtom.get()
      if (e.key === 'Escape') {
        if (state.type === 'picker' || state.type === 'following') {
          cameraAtom.set({ type: 'free' })
          return
        }
      }

      const panSpeed = 50 / zoom // Faster pan when zoomed out

      switch (e.key.toLowerCase()) {
        case 'w':
          panTo(x, y - panSpeed, true) // Manual navigation
          break
        case 's':
          panTo(x, y + panSpeed, true) // Manual navigation
          break
        case 'a':
          panTo(x - panSpeed, y, true) // Manual navigation
          break
        case 'd':
          panTo(x + panSpeed, y, true) // Manual navigation
          break
      }
    }

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault()

      const rect = canvas.canvas.getBoundingClientRect()
      const mouseScreenX = e.clientX - rect.left
      const mouseScreenY = e.clientY - rect.top

      const worldBeforeZoom = screenToWorld(mouseScreenX, mouseScreenY)

      const zoomFactor = 1.01
      const oldZoom = zoom
      const newZoom = e.deltaY > 0 ? zoom / zoomFactor : zoom * zoomFactor
      setZoom(newZoom)

      if (zoom !== oldZoom) {
        const worldAfterZoom = screenToWorld(mouseScreenX, mouseScreenY)

        const dx = worldBeforeZoom.x - worldAfterZoom.x
        const dy = worldBeforeZoom.y - worldAfterZoom.y

        panTo(x + dx, y + dy)
      }
    }

    let isDragging = false
    let lastMouseX = 0
    let lastMouseY = 0

    const handleMouseDown = (e: MouseEvent) => {
      if (e.button === 1 || (e.button === 0 && e.ctrlKey)) {
        isDragging = true
        lastMouseX = e.clientX
        lastMouseY = e.clientY
        e.preventDefault() // Prevent text selection during drag
        e.stopPropagation() // Stop other click handlers
      }
    }

    const handleMouseMove = (e: MouseEvent) => {
      if (isDragging) {
        const dx = e.clientX - lastMouseX
        const dy = e.clientY - lastMouseY

        panTo(x - dx / zoom, y - dy / zoom, true) // Manual navigation

        lastMouseX = e.clientX
        lastMouseY = e.clientY
        e.preventDefault() // Prevent any default behavior while dragging
      }
    }

    const handleMouseUp = (e: MouseEvent) => {
      if (isDragging) {
        isDragging = false
        e.preventDefault() // Prevent click event after drag
        e.stopPropagation() // Stop click from bubbling to canvas click handler
      }
    }

    const handleContextMenu = (e: MouseEvent) => {
      if (e.ctrlKey) {
        e.preventDefault() // Block "Save image as..." menu
      }
    }

    const enterPickerMode = () => {
      cameraAtom.set({
        type: 'picker',
        targetBoidId: null,
        mouseWorldPos: { x, y },
        mouseInCanvas: false,
      })
    }

    const updatePickerTarget = (
      boidId: string | null,
      mouseWorldPos: { x: number; y: number }
    ) => {
      const state = cameraAtom.get()
      if (state.type === 'picker') {
        cameraAtom.set({
          type: 'picker',
          targetBoidId: boidId,
          mouseWorldPos,
          mouseInCanvas: state.mouseInCanvas,
        })
      }
    }

    const setMouseInCanvas = (inCanvas: boolean) => {
      const state = cameraAtom.get()
      if (state.type === 'picker') {
        cameraAtom.set({
          type: 'picker',
          targetBoidId: state.targetBoidId,
          mouseWorldPos: state.mouseWorldPos,
          mouseInCanvas: inCanvas,
        })
      }
    }

    const exitPickerMode = () => {
      cameraAtom.set({ type: 'free' })
    }

    const startFollowing = (boidId: string) => {
      cameraAtom.set({ type: 'following', boidId, lerpFactor: 0.3 })
    }

    const stopFollowing = () => {
      cameraAtom.set({ type: 'free' })
    }

    const updateFollowPosition = (targetX: number, targetY: number) => {
      const state = cameraAtom.get()
      if (state.type === 'following') {
        const lerpFactor = state.lerpFactor
        const newX = x + (targetX - x) * lerpFactor
        const newY = y + (targetY - y) * lerpFactor
        panTo(newX, newY)
      }
    }

    const getTransformMatrix = (): number[] => {
      const w = canvas.width
      const h = canvas.height

      const scaleX = (2 * zoom) / w
      const scaleY = (-2 * zoom) / h
      const translateX = ((-x * zoom + w / 2) * 2) / w - 1
      const translateY = ((-y * zoom + h / 2) * -2) / h + 1

      return [
        scaleX,
        0,
        0, // Column 0: affects x
        0,
        scaleY,
        0, // Column 1: affects y
        translateX,
        translateY,
        1, // Column 2: translation + homogeneous
      ]
    }

    document.addEventListener('keydown', handleKeyboard)
    canvas.canvas.addEventListener('wheel', handleWheel, { passive: false })
    canvas.canvas.addEventListener('mousedown', handleMouseDown)
    canvas.canvas.addEventListener('contextmenu', handleContextMenu)
    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)

    const cleanup = () => {
      document.removeEventListener('keydown', handleKeyboard)
      canvas.canvas.removeEventListener('wheel', handleWheel)
      canvas.canvas.removeEventListener('mousedown', handleMouseDown)
      canvas.canvas.removeEventListener('contextmenu', handleContextMenu)
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }

    const api = {
      get x() {
        return x
      },
      get y() {
        return y
      },
      get zoom() {
        return zoom
      },
      get mode() {
        return cameraAtom.get()
      },
      get isDragging() {
        return isDragging
      },
      get viewportWidth() {
        return canvas.width // Dynamic - reads current canvas size
      },
      get viewportHeight() {
        return canvas.height // Dynamic - reads current canvas size
      },
      useMode: () => useAtomState(cameraAtom),
      panTo: rateLimitedPanTo,
      setZoom,
      worldToScreen,
      screenToWorld,
      isInViewport,
      getViewportBounds,
      getTransformMatrix,
      enterPickerMode,
      updatePickerTarget,
      setMouseInCanvas,
      exitPickerMode,
      startFollowing,
      stopFollowing,
      updateFollowPosition,
      cleanup,
    } satisfies CameraAPI & { cleanup: () => void }

    return api
  },
  halt: (camera: CameraAPI & { cleanup?: () => void }) => {
    if (camera.cleanup) {
      camera.cleanup()
    }
  },
})
