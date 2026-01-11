/**
 * WebGL Renderer - Modular Architecture
 *
 * This module provides a clean, modular structure for WebGL rendering.
 * Each concern is separated into its own module for easier debugging and maintenance.
 *
 * Architecture:
 * - atlases/: Texture atlas generation (shapes, body parts, emojis, fonts)
 * - drawCommands/: REGL draw commands (one per visual element type)
 * - dataPreparation/: Instance data preparation (typed arrays for GPU)
 * - utils/: Shared utilities (transforms, event handlers)
 */

export type {
  AtlasData,
  ShapeAtlasData,
  BodyPartsAtlasData,
  EmojiAtlasData,
  FontAtlasData,
  InstanceData,
  StanceSymbol,
  StanceSymbols,
} from './types.ts'

export {
  createEmojiAtlas,
  createEmojiTexture,
  stanceSymbols,
  foodEmojis,
  type EmojiAtlasResult,
} from './atlases/emojiAtlas.ts'

export {
  createFontAtlas,
  createFontTexture,
  DEFAULT_FONT_CHARS,
  type FontAtlasResult,
} from './atlases/fontAtlas.ts'

export {
  createObstacleAtlas,
  createObstacleTexture,
  OBSTACLE_CONFIG,
} from './atlases/obstacleAtlas.ts'

export {
  createShapeAtlas,
  createShapeTexture,
  logShapeAtlasDebugInfo,
  type ShapeAtlasResult,
} from './atlases/shapeAtlas.ts'

export {
  createBodyPartsAtlas,
  createBodyPartsTexture,
  logBodyPartsAtlasDebugInfo,
  type BodyPartsAtlasResult,
} from './atlases/bodyPartsAtlas.ts'

export { colorToRgb, calculateBoidRotation } from './dataPreparation/utils.ts'

export {
  prepareShapeBoidData,
  type ShapeBoidInstanceData,
} from './dataPreparation/shapeBoids.ts'

export {
  prepareBodyPartsData,
  type BodyPartsInstanceData,
} from './dataPreparation/bodyParts.ts'

export {
  prepareTriangleBoidData,
  type TriangleBoidInstanceData,
} from './dataPreparation/triangleBoids.ts'

export {
  prepareFoodData,
  prepareFoodEmojiData,
  type FoodInstanceData,
  type FoodEmojiInstanceData,
} from './dataPreparation/food.ts'

export {
  prepareTrailData,
  collectTrailBatches,
  type TrailBatch,
  type TrailSegment,
  type TrailInstanceData,
} from './dataPreparation/trails.ts'

export {
  prepareEnergyBarData,
  type EnergyBarInstanceData,
} from './dataPreparation/energyBars.ts'

export {
  prepareHealthBarData,
  type HealthBarInstanceData,
} from './dataPreparation/healthBars.ts'

export {
  prepareSelectionData,
  type SelectionInstanceData,
} from './dataPreparation/selection.ts'

export {
  prepareStanceSymbolData,
  type StanceSymbolInstanceData,
} from './dataPreparation/stanceSymbols.ts'

export { layoutText, type TextInstanceData } from './dataPreparation/text.ts'

export {
  prepareObstacleData,
  type ObstacleInstanceData,
} from './dataPreparation/obstacles.ts'

export { createShapeBoidsDrawCommand } from './drawCommands/shapeBoids.ts'
export { createBodyPartsDrawCommand } from './drawCommands/bodyParts.ts'
export { createTriangleBoidsDrawCommand } from './drawCommands/triangleBoids.ts'
export { createFoodDrawCommand } from './drawCommands/food.ts'
export { createFoodEmojiDrawCommand } from './drawCommands/foodEmojis.ts'
export { createTrailsDrawCommand } from './drawCommands/trails.ts'
export {
  createEnergyBarsDrawCommand,
  ENERGY_BAR_CONFIG,
} from './drawCommands/energyBars.ts'
export {
  createHealthBarsDrawCommand,
  HEALTH_BAR_CONFIG,
} from './drawCommands/healthBars.ts'
export { createSelectionCirclesDrawCommand } from './drawCommands/selection.ts'
export {
  createStanceSymbolsDrawCommand,
  STANCE_SYMBOL_CONFIG,
} from './drawCommands/stanceSymbols.ts'
export { createTextDrawCommand } from './drawCommands/text.ts'
export {
  createDebugCollisionCirclesDrawCommand,
  prepareDebugCollisionCirclesData,
} from './drawCommands/debugCollisionCircles.ts'
export { createObstacleDrawCommand } from './drawCommands/obstacles.ts'

export {
  createProjectionMatrix,
  createViewMatrix,
  getResolution,
} from './utils/transforms.ts'

export {
  createWheelHandler,
  findClosestBoidToScreen,
  createMouseMoveHandler,
  createMouseEnterHandler,
  createMouseLeaveHandler,
  createClickHandler,
  attachEventHandlers,
} from './utils/eventHandlers.ts'
