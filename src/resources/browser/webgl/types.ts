/**
 * Shared TypeScript types for WebGL renderer modules
 */

import type REGL from 'regl'

/**
 * Atlas data structure - contains texture and UV mapping
 */
export type AtlasData<TKey extends string = string> = {
  texture: REGL.Texture2D
  uvMap: Map<TKey, { u: number; v: number }>
  canvas?: HTMLCanvasElement // For debugging
  previewURL?: string // Data URL for preview
}

/**
 * Shape atlas specific type
 */
export type ShapeAtlasData = AtlasData<string> & {
  shapeUVMap: Map<string, { u: number; v: number }>
}

/**
 * Body parts atlas specific type
 */
export type BodyPartsAtlasData = AtlasData<string> & {
  partUVMap: Map<string, { u: number; v: number }>
}

/**
 * Emoji atlas specific type
 */
export type EmojiAtlasData = AtlasData<string> & {
  emojiUVMap: Map<string, { u: number; v: number }>
}

/**
 * Font atlas specific type
 */
export type FontAtlasData = AtlasData<string> & {
  charUVMap: Map<
    string,
    { u: number; v: number; width: number; height: number }
  >
  fontSize: number
}

/**
 * Prepared instance data for rendering
 */
export type InstanceData = {
  count: number
  [key: string]: Float32Array | number
}

/**
 * Stance symbol configuration
 */
export type StanceSymbol = {
  emoji: string
  color: string
}

/**
 * Stance symbols registry
 */
export type StanceSymbols = Record<string, StanceSymbol>
