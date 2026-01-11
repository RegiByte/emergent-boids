/**
 * Atlases Resource
 *
 * Centralized atlas generation and caching system.
 * Generates all texture atlases once on startup and shares them across the app.
 *
 * Philosophy: "Generate once, share everywhere"
 * - Zero dependencies (pure resource)
 * - Parallel generation (all atlases at once)
 * - Explicit caching (resource lifecycle)
 * - Dependency injection (pass atlases to consumers)
 *
 * Benefits:
 * - No redundant generation (was causing 10s+ page loads)
 * - Clear ownership (resource system manages lifecycle)
 * - Easy testing (mock the resource)
 * - Performance (single generation per app session)
 */

import { defineResource } from 'braided'
import {
  createShapeAtlas,
  type ShapeAtlasResult,
} from '@/resources/browser/webgl/atlases/shapeAtlas.ts'
import {
  createBodyPartsAtlas,
  type BodyPartsAtlasResult,
} from '@/resources/browser/webgl/atlases/bodyPartsAtlas.ts'
import {
  createEmojiAtlas,
  type EmojiAtlasResult,
} from '@/resources/browser/webgl/atlases/emojiAtlas.ts'
import {
  createFontAtlas,
  DEFAULT_FONT_CHARS,
  type FontAtlasResult,
} from '@/resources/browser/webgl/atlases/fontAtlas.ts'
import {
  createObstacleAtlas,
  type AtlasResult as ObstacleAtlasResult,
} from '@/resources/browser/webgl/atlases/obstacleAtlas.ts'

export interface AtlasesResult {
  shapes: ShapeAtlasResult | null
  bodyParts: BodyPartsAtlasResult | null
  emoji: EmojiAtlasResult | null
  font: FontAtlasResult | null
  obstacle: ObstacleAtlasResult | null // Session 130
}

/**
 * Atlases Resource
 *
 * Generates all texture atlases on startup.
 * Zero dependencies - this is a foundational resource.
 */
export const atlases = defineResource({
  dependencies: [],
  start: () => {
    const startTime = performance.now()
    console.log('🎨 [Atlases Resource] Starting atlas generation...')

    const shapes = createShapeAtlas()
    const bodyParts = createBodyPartsAtlas()
    const emoji = createEmojiAtlas()
    const font = createFontAtlas('monospace', 16, DEFAULT_FONT_CHARS)
    const obstacle = createObstacleAtlas() // Session 130

    const endTime = performance.now()
    const duration = (endTime - startTime).toFixed(2)

    console.log(
      `✅ [Atlases Resource] Atlas generation complete in ${duration}ms`
    )
    console.log(`  - Shapes: ${shapes ? '✅' : '❌'}`)
    console.log(`  - Body Parts: ${bodyParts ? '✅' : '❌'}`)
    console.log(`  - Emoji: ${emoji ? '✅' : '❌'}`)
    console.log(`  - Font: ${font ? '✅' : '❌'}`)
    console.log(`  - Obstacle: ${obstacle ? '✅' : '❌'}`)

    return {
      shapes,
      bodyParts,
      emoji,
      font,
      obstacle, // Session 130
    }
  },
  halt: () => {
    console.log('🎨 [Atlases Resource] Shutting down (atlases released)')
  },
})
