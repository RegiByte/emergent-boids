/**
 * WebGL Data Preparation - Energy Bars
 *
 * Prepares instance data for energy bar rendering.
 * Energy bars are shown above boids to indicate their current energy level.
 */

import type { Boid } from '../../../../boids/vocabulary/schemas/entities.ts'
import type { SpeciesConfig } from '../../../../boids/vocabulary/schemas/species.ts'

/**
 * Instance data for energy bar rendering
 */
export type EnergyBarInstanceData = {
  boidPositions: Float32Array
  energyPercents: Float32Array
  barColors: Float32Array
  count: number
}

/**
 * Energy bar color configuration
 */
const ENERGY_BAR_COLORS = {
  predator: { r: 1.0, g: 0.0, b: 0.0 }, // Red for predators
  prey: { r: 0.0, g: 1.0, b: 0.53 }, // Green for prey (#00ff88)
} as const

/**
 * Prepares energy bar instance data for GPU rendering
 *
 * @param boids - Array of boids to render energy bars for
 * @param speciesConfigs - Species configuration for role and visibility settings
 * @param energyBarsEnabled - Whether energy bars are enabled for prey (always shown for predators)
 * @returns Instance data ready for GPU upload
 */
export const prepareEnergyBarData = (
  boids: Boid[],
  speciesConfigs: Record<string, SpeciesConfig>,
  energyBarsEnabled: boolean
): EnergyBarInstanceData => {
  const boidsWithBars = boids.filter((boid) => {
    const speciesConfig = speciesConfigs[boid.typeId]
    if (!speciesConfig) return false

    return speciesConfig.role === 'predator' || energyBarsEnabled
  })

  const count = boidsWithBars.length
  const boidPositions = new Float32Array(count * 2)
  const energyPercents = new Float32Array(count)
  const barColors = new Float32Array(count * 3)

  for (let i = 0; i < boidsWithBars.length; i++) {
    const boid = boidsWithBars[i]
    const speciesConfig = speciesConfigs[boid.typeId]
    const energyPercent = boid.energy / boid.phenotype.maxEnergy

    const color =
      speciesConfig.role === 'predator'
        ? ENERGY_BAR_COLORS.predator
        : ENERGY_BAR_COLORS.prey

    boidPositions[i * 2] = boid.position.x
    boidPositions[i * 2 + 1] = boid.position.y
    energyPercents[i] = energyPercent
    barColors[i * 3] = color.r
    barColors[i * 3 + 1] = color.g
    barColors[i * 3 + 2] = color.b
  }

  return { boidPositions, energyPercents, barColors, count }
}
