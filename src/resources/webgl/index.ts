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

// ============================================
// TYPES
// ============================================
export type {
  AtlasData,
  ShapeAtlasData,
  BodyPartsAtlasData,
  EmojiAtlasData,
  FontAtlasData,
  InstanceData,
  StanceSymbol,
  StanceSymbols,
} from "./types";

// ============================================
// ATLASES
// ============================================
export {
  createEmojiAtlas,
  createEmojiTexture,
  stanceSymbols,
  type EmojiAtlasResult,
} from "./atlases/emojiAtlas";

export {
  createFontAtlas,
  createFontTexture,
  DEFAULT_FONT_CHARS,
  type FontAtlasResult,
} from "./atlases/fontAtlas";

export {
  createShapeAtlas,
  createShapeTexture,
  logShapeAtlasDebugInfo,
  type ShapeAtlasResult,
} from "./atlases/shapeAtlas";

export {
  createBodyPartsAtlas,
  createBodyPartsTexture,
  logBodyPartsAtlasDebugInfo,
  type BodyPartsAtlasResult,
} from "./atlases/bodyPartsAtlas";

// ============================================
// DATA PREPARATION
// ============================================
export {
  colorToRgb,
  calculateBoidRotation,
  calculateBoidScale,
} from "./dataPreparation/utils";

export {
  prepareShapeBoidData,
  type ShapeBoidInstanceData,
} from "./dataPreparation/shapeBoids";

export {
  prepareBodyPartsData,
  type BodyPartsInstanceData,
} from "./dataPreparation/bodyParts";

export {
  prepareTriangleBoidData,
  type TriangleBoidInstanceData,
} from "./dataPreparation/triangleBoids";

export {
  prepareFoodData,
  type FoodInstanceData,
} from "./dataPreparation/food";

export {
  prepareTrailData,
  collectTrailBatches,
  type TrailBatch,
  type TrailSegment,
  type TrailInstanceData,
} from "./dataPreparation/trails";

export {
  prepareEnergyBarData,
  type EnergyBarInstanceData,
} from "./dataPreparation/energyBars";

export {
  prepareHealthBarData,
  type HealthBarInstanceData,
} from "./dataPreparation/healthBars";

export {
  prepareSelectionData,
  type SelectionInstanceData,
} from "./dataPreparation/selection";

export {
  prepareStanceSymbolData,
  type StanceSymbolInstanceData,
} from "./dataPreparation/stanceSymbols";

export {
  layoutText,
  type TextInstanceData,
} from "./dataPreparation/text";

// ============================================
// DRAW COMMANDS
// ============================================
export { createShapeBoidsDrawCommand } from "./drawCommands/shapeBoids";
export { createBodyPartsDrawCommand } from "./drawCommands/bodyParts";
export { createTriangleBoidsDrawCommand } from "./drawCommands/triangleBoids";
export { createFoodDrawCommand } from "./drawCommands/food";
export { createTrailsDrawCommand } from "./drawCommands/trails";
export {
  createEnergyBarsDrawCommand,
  ENERGY_BAR_CONFIG,
} from "./drawCommands/energyBars";
export {
  createHealthBarsDrawCommand,
  HEALTH_BAR_CONFIG,
} from "./drawCommands/healthBars";
export { createSelectionCirclesDrawCommand } from "./drawCommands/selection";
export {
  createStanceSymbolsDrawCommand,
  STANCE_SYMBOL_CONFIG,
} from "./drawCommands/stanceSymbols";
export { createTextDrawCommand } from "./drawCommands/text";

// ============================================
// UTILITIES
// ============================================
export {
  createProjectionMatrix,
  createViewMatrix,
  getResolution,
} from "./utils/transforms";

export {
  createWheelHandler,
  findClosestBoidToScreen,
  createMouseMoveHandler,
  createMouseEnterHandler,
  createMouseLeaveHandler,
  createClickHandler,
  attachEventHandlers,
} from "./utils/eventHandlers";

