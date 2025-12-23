/**
 * Seeded Random Number Generator (RNG)
 *
 * Provides reproducible randomness using a hierarchical seed system.
 * Think of it like Minecraft's world generation - a single master seed
 * creates deterministic random sequences across different domains.
 *
 * Philosophy: "Everything is information processing"
 * - Master seed → Domain seeds → Random sequences
 * - Each domain has independent RNG stream
 * - Changing one domain doesn't affect others
 *
 * @example
 * const rng = createSeededRNG("RegiByte-2026");
 * const spawning = rng.domain("spawning");
 * const movement = rng.domain("movement");
 *
 * // Same seed always produces same sequence
 * spawning.next(); // Always same value for this seed
 * movement.next(); // Independent from spawning
 */

/**
 * Simple hash function to convert string to number
 * Uses cyrb53 algorithm - fast, good distribution
 */
function hashString(str: string): number {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;

  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }

  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);

  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

/**
 * Mulberry32 PRNG - Fast, high-quality seeded random number generator
 * Returns values in range [0, 1) like Math.random()
 */
function createPRNG(seed: number) {
  let state = seed;

  return function next(): number {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Domain-specific RNG
 * Provides random number generation for a specific domain
 */
export interface DomainRNG {
  /** Get next random number in [0, 1) */
  next(): number;

  /** Get random number in range [min, max) */
  range(min: number, max: number): number;

  /** Get random integer in range [min, max) */
  intRange(min: number, max: number): number;

  /** Pick random element from array */
  pick<T>(array: T[]): T;

  /** Shuffle array in place (Fisher-Yates) */
  shuffle<T>(array: T[]): T[];

  /** Random boolean with given probability (0-1) */
  chance(probability: number): boolean;
}

/**
 * Create a domain-specific RNG from a seed
 */
function createDomainRNG(seed: number): DomainRNG {
  const prng = createPRNG(seed);

  return {
    next: () => prng(),

    range: (min: number, max: number) => {
      return min + prng() * (max - min);
    },

    intRange: (min: number, max: number) => {
      return Math.floor(min + prng() * (max - min));
    },

    pick: <T>(array: T[]): T => {
      return array[Math.floor(prng() * array.length)];
    },

    shuffle: <T>(array: T[]): T[] => {
      // Fisher-Yates shuffle
      for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(prng() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
      }
      return array;
    },

    chance: (probability: number) => {
      return prng() < probability;
    },
  };
}

/**
 * Hierarchical Seeded RNG System
 *
 * Master seed creates domain-specific RNGs.
 * Each domain has independent random sequence.
 */
export interface SeededRNG {
  /** Get the master seed string */
  getMasterSeed(): string;

  /** Get the master seed as number */
  getMasterSeedNumber(): number;

  /** Get or create a domain-specific RNG */
  domain(name: string): DomainRNG;

  /** Get all active domain names */
  getDomains(): string[];
}

/**
 * Create a hierarchical seeded RNG system
 *
 * @param masterSeed - String or number seed (like Minecraft world seeds)
 * @returns Hierarchical RNG with domain separation
 *
 * @example
 * const rng = createSeededRNG("RegiByte-2026");
 * const spawning = rng.domain("spawning");
 * const movement = rng.domain("movement");
 *
 * // Each domain has independent sequence
 * spawning.next(); // 0.123...
 * spawning.next(); // 0.456...
 * movement.next(); // 0.789... (independent!)
 */
export function createSeededRNG(masterSeed: string | number): SeededRNG {
  const masterSeedStr = String(masterSeed);
  const masterSeedNum =
    typeof masterSeed === "number" ? masterSeed : hashString(masterSeedStr);

  const domains = new Map<string, DomainRNG>();

  return {
    getMasterSeed: () => masterSeedStr,
    getMasterSeedNumber: () => masterSeedNum,

    domain: (name: string) => {
      if (!domains.has(name)) {
        // Create domain seed by hashing "masterSeed:domainName"
        const domainSeedStr = `${masterSeedStr}:${name}`;
        const domainSeed = hashString(domainSeedStr);
        domains.set(name, createDomainRNG(domainSeed));
      }
      return domains.get(name)!;
    },

    getDomains: () => Array.from(domains.keys()),
  };
}

/**
 * Convert any value to a valid seed
 * Handles strings, numbers, dates, etc.
 */
export function toSeed(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  if (value instanceof Date) return String(value.getTime());
  return String(value);
}

/**
 * Generate a random seed string (for "random seed" button)
 * Uses current timestamp + random component
 */
export function generateRandomSeed(): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 10);
  return `${timestamp}-${random}`;
}
