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

import { defineResource } from "braided";
import {
  createShapeAtlas,
  type ShapeAtlasResult,
} from "./webgl/atlases/shapeAtlas";
import {
  createBodyPartsAtlas,
  type BodyPartsAtlasResult,
} from "./webgl/atlases/bodyPartsAtlas";
import {
  createEmojiAtlas,
  type EmojiAtlasResult,
} from "./webgl/atlases/emojiAtlas";
import {
  createFontAtlas,
  DEFAULT_FONT_CHARS,
  type FontAtlasResult,
} from "./webgl/atlases/fontAtlas";

export interface AtlasesResult {
  shapes: ShapeAtlasResult | null;
  bodyParts: BodyPartsAtlasResult | null;
  emoji: EmojiAtlasResult | null;
  font: FontAtlasResult | null;
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
    const startTime = performance.now();
    console.log("🎨 [Atlases Resource] Starting atlas generation...");

    // Generate all atlases (these are synchronous, but independent)
    // Note: We could use Promise.all() if these become async in the future
    const shapes = createShapeAtlas();
    const bodyParts = createBodyPartsAtlas();
    const emoji = createEmojiAtlas();
    const font = createFontAtlas("monospace", 16, DEFAULT_FONT_CHARS);

    const endTime = performance.now();
    const duration = (endTime - startTime).toFixed(2);

    // Log results
    console.log(
      `✅ [Atlases Resource] Atlas generation complete in ${duration}ms`,
    );
    console.log(`  - Shapes: ${shapes ? "✅" : "❌"}`);
    console.log(`  - Body Parts: ${bodyParts ? "✅" : "❌"}`);
    console.log(`  - Emoji: ${emoji ? "✅" : "❌"}`);
    console.log(`  - Font: ${font ? "✅" : "❌"}`);

    // Return the atlases for consumers to use
    return {
      shapes,
      bodyParts,
      emoji,
      font,
    };
  },
  halt: () => {
    // Atlases are canvas-based and will be garbage collected
    // No explicit cleanup needed
    console.log("🎨 [Atlases Resource] Shutting down (atlases released)");
  },
});

