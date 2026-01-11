import { Boid, BoidsById } from './vocabulary/schemas/entities'

export function* iterateBoidsWithIndex(
  boids: BoidsById
): Generator<[Boid, number]> {
  for (const id in boids) {
    const boid = boids[id]
    if (!boid) continue
    yield [boid, boid.index]
  }
}
export function* iterateBoids(boids: BoidsById): Generator<Boid, void, void> {
  for (const id in boids) {
    const boid = boids[id]
    if (!boid) continue
    yield boid
  }
}

export function findBoidWhere(
  boids: BoidsById,
  predicate: (boid: Boid) => boolean
): Boid | undefined {
  for (const boid of iterateBoids(boids)) {
    if (predicate(boid)) {
      return boid
    }
  }
  return undefined
}

export function filterBoidsWhere(
  boids: BoidsById,
  predicate: (boid: Boid) => boolean
) {
  const filtered = []
  for (const boid of iterateBoids(boids)) {
    if (predicate(boid)) {
      filtered.push(boid)
    }
  }
  return filtered
}

export function mapFilteringWhere<TOutput>(
  boids: BoidsById,
  filterPredicate: (boid: Boid) => boolean,
  mapFunction: (boid: Boid) => TOutput
): TOutput[] {
  const result = []

  for (const boid of iterateBoids(boids)) {
    if (filterPredicate(boid)) {
      result.push(mapFunction(boid))
    }
  }

  return result
}
