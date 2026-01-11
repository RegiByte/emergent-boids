import { Boid } from './vocabulary/schemas/entities'

export function boidsById(boids: Boid[]): Record<string, Boid> {
  return boids.reduce(
    (acc, boid) => {
      acc[boid.id] = boid
      return acc
    },
    {} as Record<string, Boid>
  )
}

export function lookupBoid(
  boidId: string,
  boidsById: Record<string, Boid>
): Boid | undefined {
  return boidsById[boidId]
}
