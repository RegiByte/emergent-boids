export const createPreviewURL = (canvas: HTMLCanvasElement): string => {
  return canvas.toDataURL('image/png')
}
