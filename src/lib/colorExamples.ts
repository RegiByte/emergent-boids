/**
 * Color Utilities Examples
 *
 * Demonstrates the capabilities of the color library.
 * Run this file to see examples of all color transformations.
 */

import {
  adjustColorBrightness,
  hexToRgba,
  toRgb,
  toHex,
  mixColors,
  getContrastColor,
  createColorScale,
  generateUITheme,
  lighten,
  darken,
  saturate,
  desaturate,
} from './colors'

console.log('🎨 Color Utilities Examples\n')

console.log('1️⃣  Energy-Based Brightness:')
const baseColor = '#4a9eff'
console.log(`   Base: ${baseColor}`)
console.log(`   0% energy:   ${adjustColorBrightness(baseColor, 0.0)}`)
console.log(`   50% energy:  ${adjustColorBrightness(baseColor, 0.5)}`)
console.log(`   100% energy: ${adjustColorBrightness(baseColor, 1.0)}`)
console.log('')

console.log('2️⃣  RGBA Conversion (Motion Blur):')
console.log(`   Solid:       ${hexToRgba('#0a0a0f', 1.0)}`)
console.log(`   Semi-trans:  ${hexToRgba('#0a0a0f', 0.5)}`)
console.log(`   Trail:       ${hexToRgba('#0a0a0f', 0.1)}`)
console.log('')

console.log('3️⃣  Color Mixing (Parent → Offspring):')
const parent1 = '#ff0000' // Red
const parent2 = '#0000ff' // Blue
console.log(`   Parent 1:    ${parent1} (red)`)
console.log(`   Parent 2:    ${parent2} (blue)`)
console.log(`   Child (50%): ${mixColors(parent1, parent2, 0.5)}`)
console.log(`   Child (25%): ${mixColors(parent1, parent2, 0.25)} (more red)`)
console.log(`   Child (75%): ${mixColors(parent1, parent2, 0.75)} (more blue)`)
console.log('')

console.log('4️⃣  Color Scale (Energy Gradient):')
const energyScale = createColorScale('#440000', '#ff0000', 5)
console.log(`   Steps: ${energyScale.join(' → ')}`)
console.log('')

console.log('5️⃣  Automatic Contrast Colors:')
console.log(`   Dark BG (#000000) → Text: ${getContrastColor('#000000')}`)
console.log(`   Light BG (#ffffff) → Text: ${getContrastColor('#ffffff')}`)
console.log(`   Blue BG (#4a9eff) → Text: ${getContrastColor('#4a9eff')}`)
console.log('')

console.log('6️⃣  Auto-Generated UI Theme:')
const theme = generateUITheme('#0a0a0f')
console.log(`   Background:  ${theme.background}`)
console.log(`   Text:        ${theme.text}`)
console.log(`   Text Muted:  ${theme.textMuted}`)
console.log(`   Accent:      ${theme.accent}`)
console.log(`   Hover:       ${theme.hover}`)
console.log(`   Border:      ${theme.border}`)
console.log('')

console.log('7️⃣  Color Manipulation:')
const testColor = '#4a9eff'
console.log(`   Original:    ${testColor}`)
console.log(`   Lighter:     ${lighten(testColor, 1)}`)
console.log(`   Darker:      ${darken(testColor, 1)}`)
console.log(`   Saturated:   ${saturate(testColor, 2)}`)
console.log(`   Desaturated: ${desaturate(testColor, 2)}`)
console.log('')

console.log('8️⃣  RGB Components (for Batching):')
const trailColor = '#ff4a4a'
const [r, g, b] = toRgb(trailColor)
console.log(`   Color: ${trailColor}`)
console.log(`   RGB: [${r}, ${g}, ${b}]`)
console.log(`   Batch Key: "${r},${g},${b}|0.5|2"`)
console.log('')

console.log('9️⃣  Format Conversion:')
console.log(`   rgb(255,0,0) → ${toHex('rgb(255, 0, 0)')}`)
console.log(`   hsl(0,100%,50%) → ${toHex('hsl(0, 100%, 50%)')}`)
console.log(`   red → ${toHex('red')}`)
console.log('')

console.log('🧬 Genetics Simulation (3 Generations):')
const gen1_parent1 = '#ff0000'
const gen1_parent2 = '#00ff00'
console.log(`   Gen 1 Parents: ${gen1_parent1}, ${gen1_parent2}`)

const gen2_child = mixColors(gen1_parent1, gen1_parent2, 0.5)
console.log(`   Gen 2 Child:   ${gen2_child}`)

const gen2_mate = '#0000ff'
const gen3_child = mixColors(gen2_child, gen2_mate, 0.5)
console.log(`   Gen 2 Mates:   ${gen2_child}, ${gen2_mate}`)
console.log(`   Gen 3 Child:   ${gen3_child}`)
console.log('')

console.log('🌌 Atmospheric Effects:')
const atmosphere = '#0a0a0f'
console.log(`   Base:        ${atmosphere}`)
console.log(
  `   Danger:      ${saturate(lighten(atmosphere, 2), 3)} (shift to red)`
)
console.log(`   Calm:        ${desaturate(atmosphere, 1)}`)
console.log(`   Alert:       ${lighten(saturate(atmosphere, 2), 1)}`)
console.log('')

console.log('✅ All examples complete!')
console.log('📝 See src/lib/COLORS.md for full documentation')
