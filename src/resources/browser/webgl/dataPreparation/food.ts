/**
 * WebGL Data Preparation - Food Sources
 *
 * Prepares instance data for food source rendering.
 *
 */

import type { FoodSource } from '../../../../boids/vocabulary/schemas/entities.ts'
import { toRgb } from '../../../../lib/colors.ts'
import type { AtlasResult } from '../atlases/types.ts'
import { foodEmojis } from '../atlases/emojiAtlas.ts'

/**
 * Instance data for food source rendering
 */
export type FoodInstanceData = {
  positions: Float32Array
  colors: Float32Array
  radii: Float32Array
  alphas: Float32Array
  count: number
}

/**
 * Food source visual configuration
 */
const FOOD_CONFIG = {
  minRadius: 12,
  maxRadius: 28,
  minAlpha: 0.5,
  maxAlpha: 1.0,
  preyColor: '#4CAF50',
  predatorColor: '#F44336',
} as const

/**
 * Prepares food source instance data for GPU rendering
 *
 * @param foodSources - Array of food sources to render
 * @returns Instance data ready for GPU upload
 */
export const prepareFoodData = (
  foodSources: FoodSource[]
): FoodInstanceData => {
  const count = foodSources.length
  const positions = new Float32Array(count * 2)
  const colors = new Float32Array(count * 3)
  const radii = new Float32Array(count)
  const alphas = new Float32Array(count)

  for (let i = 0; i < count; i++) {
    const food = foodSources[i]

    positions[i * 2] = food.position.x
    positions[i * 2 + 1] = food.position.y

    const color =
      food.sourceType === 'prey'
        ? FOOD_CONFIG.preyColor
        : FOOD_CONFIG.predatorColor
    const [r, g, b] = toRgb(color)
    colors[i * 3] = r / 255
    colors[i * 3 + 1] = g / 255
    colors[i * 3 + 2] = b / 255

    const energyRatio = food.energy / food.maxEnergy
    radii[i] =
      FOOD_CONFIG.minRadius +
      energyRatio * (FOOD_CONFIG.maxRadius - FOOD_CONFIG.minRadius)

    alphas[i] = Math.max(FOOD_CONFIG.minAlpha, energyRatio)
  }

  return { positions, colors, radii, alphas, count }
}

/**
 * Instance data for food emoji overlays
 */
export type FoodEmojiInstanceData = {
  foodPositions: Float32Array
  uvOffsets: Float32Array
  alphas: Float32Array
  count: number
}

/**
 * Prepares food emoji instance data for GPU rendering
 * Renders emoji symbols (🌿 for prey, 🥩 for predator) on top of food circles
 *
 * @param foodSources - Array of food sources to render
 * @param emojiAtlas - Emoji atlas containing UV coordinates
 * @returns Instance data ready for GPU upload, or null if no emojis to display
 */
export const prepareFoodEmojiData = (
  foodSources: FoodSource[],
  emojiAtlas: AtlasResult
): FoodEmojiInstanceData | null => {
  if (foodSources.length === 0) {
    return null
  }

  const count = foodSources.length
  const foodPositions = new Float32Array(count * 2)
  const uvOffsets = new Float32Array(count * 2)
  const alphas = new Float32Array(count)

  for (let i = 0; i < count; i++) {
    const food = foodSources[i]

    foodPositions[i * 2] = food.position.x
    foodPositions[i * 2 + 1] = food.position.y

    const emoji =
      food.sourceType === 'prey' ? foodEmojis.prey : foodEmojis.predator
    const uvCoords = emojiAtlas.uvMap.get(emoji)

    if (uvCoords) {
      uvOffsets[i * 2] = uvCoords.u
      uvOffsets[i * 2 + 1] = uvCoords.v
    } else {
      uvOffsets[i * 2] = 0
      uvOffsets[i * 2 + 1] = 0
    }

    const energyRatio = food.energy / food.maxEnergy
    alphas[i] = Math.max(FOOD_CONFIG.minAlpha, energyRatio)
  }

  return { foodPositions, uvOffsets, alphas, count }
}
