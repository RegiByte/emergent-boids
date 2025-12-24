import { defineResource, StartedResource } from "braided";
import { useStore as useZustandStore } from "zustand";
import type { StoreApi } from "zustand/vanilla";
import { createStore } from "zustand/vanilla";
import { AnalyticsStore } from "@/boids/vocabulary/schemas/state.ts";
import { eventKeywords } from "@/boids/vocabulary/keywords.ts";
import type { AllEvents } from "@/boids/vocabulary/schemas/events.ts";
import type { EvolutionSnapshot } from "@/boids/vocabulary/schemas/evolution.ts";
import { RandomnessResource } from "./randomness";
import type { TimeResource } from "./time";

export type AnalyticsStoreApi = StoreApi<AnalyticsStore>;

/**
 * Analytics Store Resource
 *
 * Separate store for analytics data to prevent race conditions with runtime state.
 * Provides helpers for tracking events and capturing snapshots.
 *
 * Architecture:
 * - Events domain: Recent event tracking with filtering
 * - Evolution domain: Population snapshots over time
 *
 * Helpers:
 * - trackEvent(): Add event to recentEvents (handles filtering and sampling)
 * - captureSnapshot(): Add evolution snapshot to history
 * - updateEventsFilter(): Update event filtering configuration
 * - clearEventsFilter(): Reset to default filter
 */
export const analyticsStore = defineResource({
  dependencies: ["randomness", "time"],
  start: ({
    randomness,
    time,
  }: {
    randomness: RandomnessResource;
    time: TimeResource;
  }) => {
    const rng = randomness.domain("analytics");

    // Create zustand store with initial state
    const store = createStore<AnalyticsStore>()(() => ({
      // Events domain
      events: {
        data: {
          recentEvents: [],
        },
        config: {
          defaultFilter: {
            maxEvents: 100,
            allowedEventTypes: [
              eventKeywords.atmosphere.eventStarted,
              eventKeywords.atmosphere.eventEnded,
              eventKeywords.boids.reproduced,
              eventKeywords.boids.died,
              eventKeywords.boids.caught,
              eventKeywords.boids.foodSourceCreated,
              eventKeywords.boids.spawnPredator,
            ],
          },
          customFilter: null,
        },
      },

      // Evolution domain
      evolution: {
        data: {
          evolutionHistory: [],
          currentSnapshot: null,
        },
        config: {
          snapshotInterval: 3, // Every 3 ticks
          maxSnapshots: 1000, // Keep last 1000 snapshots
        },
      },
    }));

    // React hook for components
    function useStore<T>(selector: (_state: AnalyticsStore) => T): T {
      return useZustandStore(store, selector);
    }

    /**
     * Track an event in the analytics store
     *
     * Handles filtering and sampling based on current configuration.
     * Safe to call from event listeners - no race conditions!
     *
     * @param event - The event to track
     * @param tick - Current simulation tick
     */
    function trackEvent(event: AllEvents, tick: number): void {
      const state = store.getState();
      const { config } = state.events;

      // Get active filter (custom overrides default)
      const maxEvents =
        config.customFilter?.maxEvents ?? config.defaultFilter.maxEvents;
      const allowedEventTypes =
        config.customFilter?.allowedEventTypes ??
        config.defaultFilter.allowedEventTypes;

      // Check if event should be tracked
      const shouldTrack =
        !allowedEventTypes || allowedEventTypes.includes(event.type);

      if (!shouldTrack) return;

      // Create event entry (use simulation time)
      const eventEntry = {
        id: `event-${time.now()}-${rng.next().toString(36).slice(2, 9)}`,
        timestamp: time.now(), // Use simulation time instead of Date.now()
        tick,
        event,
      };

      // Update store (partial update - only events.data)
      store.setState((current) => ({
        ...current,
        events: {
          ...current.events,
          data: {
            recentEvents: [
              eventEntry,
              ...current.events.data.recentEvents,
            ].slice(0, maxEvents),
          },
        },
      }));
    }

    /**
     * Capture an evolution snapshot
     *
     * Adds snapshot to history and updates currentSnapshot.
     * Respects maxSnapshots configuration.
     *
     * @param snapshot - The evolution snapshot to capture
     */
    function captureSnapshot(snapshot: EvolutionSnapshot): void {
      const state = store.getState();
      const { maxSnapshots } = state.evolution.config;

      // Update store (partial update - only evolution.data)
      store.setState((current) => ({
        ...current,
        evolution: {
          ...current.evolution,
          data: {
            evolutionHistory: [
              ...current.evolution.data.evolutionHistory,
              snapshot,
            ].slice(-maxSnapshots),
            currentSnapshot: snapshot,
          },
        },
      }));
    }

    /**
     * Update events filter configuration
     *
     * @param maxEvents - Maximum events to track (optional)
     * @param allowedEventTypes - Event types to track (optional)
     */
    function updateEventsFilter(
      maxEvents?: number,
      allowedEventTypes?: string[] | null
    ): void {
      store.setState((current) => ({
        ...current,
        events: {
          ...current.events,
          config: {
            ...current.events.config,
            customFilter: {
              maxEvents,
              allowedEventTypes,
            },
          },
        },
      }));
    }

    /**
     * Clear custom events filter (revert to default)
     */
    function clearEventsFilter(): void {
      store.setState((current) => ({
        ...current,
        events: {
          ...current.events,
          config: {
            ...current.events.config,
            customFilter: null,
          },
        },
      }));
    }

    /**
     * Update evolution configuration
     *
     * @param snapshotInterval - Ticks between snapshots (optional)
     * @param maxSnapshots - Maximum snapshots to keep (optional)
     */
    function updateEvolutionConfig(
      snapshotInterval?: number,
      maxSnapshots?: number
    ): void {
      store.setState((current) => ({
        ...current,
        evolution: {
          ...current.evolution,
          config: {
            snapshotInterval:
              snapshotInterval ?? current.evolution.config.snapshotInterval,
            maxSnapshots: maxSnapshots ?? current.evolution.config.maxSnapshots,
          },
        },
      }));
    }

    return {
      store,
      useStore,
      trackEvent,
      captureSnapshot,
      updateEventsFilter,
      clearEventsFilter,
      updateEvolutionConfig,
    };
  },
  halt: () => {
    // No cleanup needed for zustand store
  },
});

export type AnalyticsStoreResource = StartedResource<typeof analyticsStore>;
