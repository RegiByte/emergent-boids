import { defineResource } from 'braided'

export type CanvasAPI = {
  canvas: HTMLCanvasElement
  ctx: CanvasRenderingContext2D
  width: number
  height: number
  resize: (_newWidth: number, _newHeight: number) => void
}

export const canvas = defineResource({
  dependencies: [],
  start: () => {
    const canvas = document.createElement('canvas')
    canvas.width = 800
    canvas.height = 600
    canvas.classList.add(
      'absolute',
      'top-[50%]',
      'left-[50%]',
      'translate-x-[-50%]',
      'translate-y-[-50%]'
    )

    const ctx = canvas.getContext('2d', {
      willReadFrequently: true,
    })
    if (!ctx) {
      throw new Error('Failed to get 2D context from canvas')
    }

    const resource = {
      canvas,
      ctx,
      width: canvas.width, // Viewport width (800)
      height: canvas.height, // Viewport height (600)
      resize: (newWidth: number, newHeight: number) => {
        canvas.width = newWidth
        canvas.height = newHeight
        resource.width = newWidth
        resource.height = newHeight
      },
    } satisfies CanvasAPI

    return resource
  },
  halt: ({ canvas }: CanvasAPI) => {
    if (canvas.parentNode) {
      canvas.remove()
    }
  },
})
