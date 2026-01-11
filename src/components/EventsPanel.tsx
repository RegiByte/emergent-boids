import { useResource } from '../systems/standard.ts'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { Badge } from './ui/badge'
import { Button } from './ui/button'
import { ScrollArea } from './ui/scroll-area'
import { Slider } from './ui/slider'
import { Label } from './ui/label'
import { motion, AnimatePresence } from 'motion/react'
import { toast } from 'sonner'
import {
  IconActivity,
  IconClock,
  IconCopy,
  IconDna,
  IconHeart,
  IconSkull,
  IconTarget,
  IconSettings,
  IconPlus,
  IconMinus,
  IconFilter,
  IconFilterOff,
  IconAdjustments,
} from '@tabler/icons-react'
import type { AllEvents } from '@/boids/vocabulary/schemas/events'
import type { SpeciesRecord } from '@/boids/vocabulary/schemas/species'
import { eventKeywords } from '@/boids/vocabulary/keywords'
import { useMemo } from 'react'
import { getTickWindowKey, getCurrentTickWindow } from '@/lib/tickWindowing'
import { createWeightedComparator } from '@/lib/weightedMath'

const getEventIcon = (eventType: string) => {
  if (eventType.includes('reproduced')) return IconHeart
  if (eventType.includes('died')) return IconSkull
  if (eventType.includes('caught')) return IconTarget
  if (eventType.includes('typeConfigChanged')) return IconDna
  if (eventType.includes('added')) return IconPlus
  if (eventType.includes('removed') || eventType.includes('cleared'))
    return IconMinus
  if (eventType.includes('passed')) return IconClock
  if (eventType.includes('Changed')) return IconSettings
  return IconActivity
}

const getEventColor = (eventType: string) => {
  if (eventType.includes('reproduced')) return 'text-pink-500'
  if (eventType.includes('died')) return 'text-red-500'
  if (eventType.includes('caught')) return 'text-orange-500'
  if (eventType.includes('typeConfigChanged')) return 'text-blue-500'
  if (eventType.includes('added')) return 'text-green-500'
  if (eventType.includes('removed') || eventType.includes('cleared'))
    return 'text-yellow-500'
  if (eventType.includes('passed')) return 'text-gray-500'
  return 'text-primary'
}

const getEventBgColor = (eventType: string) => {
  if (eventType.includes('reproduced')) return 'bg-pink-500/10'
  if (eventType.includes('died')) return 'bg-red-500/10'
  if (eventType.includes('caught')) return 'bg-orange-500/10'
  if (eventType.includes('typeConfigChanged')) return 'bg-blue-500/10'
  if (eventType.includes('added')) return 'bg-green-500/10'
  if (eventType.includes('removed') || eventType.includes('cleared'))
    return 'bg-yellow-500/10'
  if (eventType.includes('passed')) return 'bg-gray-500/10'
  return 'bg-primary/10'
}

const formatEventType = (eventType: string) => {
  const withoutNamespace = eventType.split('/').pop() || eventType
  return withoutNamespace
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (str) => str.toUpperCase())
    .trim()
}

const getAggregatedSummary = (
  aggregated: AggregatedEvent,
  species: SpeciesRecord
) => {
  const { eventType, count, events } = aggregated

  if (eventType === eventKeywords.boids.reproduced) {
    const speciesCount: Record<string, number> = {}
    let totalOffspring = 0

    events.forEach(({ event }) => {
      if ('typeId' in event && event.typeId) {
        speciesCount[event.typeId] = (speciesCount[event.typeId] || 0) + 1
      }
      if ('offspringCount' in event && event.offspringCount) {
        totalOffspring += event.offspringCount
      }
    })

    const speciesParts = Object.entries(speciesCount).map(([typeId, count]) => {
      const name = species[typeId]?.name || typeId
      return `${name}: ${count}`
    })

    return `${totalOffspring} offspring • ${speciesParts.join(', ')}`
  }

  if (eventType === eventKeywords.boids.caught) {
    const preyCount: Record<string, number> = {}

    events.forEach(({ event }) => {
      if ('preyTypeId' in event && event.preyTypeId) {
        preyCount[event.preyTypeId] = (preyCount[event.preyTypeId] || 0) + 1
      }
    })

    const preyParts = Object.entries(preyCount).map(([typeId, count]) => {
      const name = species[typeId]?.name || typeId
      return `${name}: ${count}`
    })

    return preyParts.join(', ')
  }

  if (eventType === eventKeywords.boids.died) {
    const speciesCount: Record<string, number> = {}
    const causeCount: Record<string, number> = {}

    events.forEach(({ event }) => {
      if ('typeId' in event && event.typeId) {
        speciesCount[event.typeId] = (speciesCount[event.typeId] || 0) + 1
      }
      if ('reason' in event && event.reason) {
        causeCount[event.reason] = (causeCount[event.reason] || 0) + 1
      }
    })

    const speciesParts = Object.entries(speciesCount).map(([typeId, count]) => {
      const name = species[typeId]?.name || typeId
      return `${name}: ${count}`
    })

    const causeParts = Object.entries(causeCount).map(
      ([cause, count]) => `${cause}: ${count}`
    )

    return `${speciesParts.join(', ')} • ${causeParts.join(', ')}`
  }

  return `${count} events`
}

type EventCategory = {
  id: AllEvents['type']
  label: string
  icon: React.ElementType
  color: string
}

const EVENT_CATEGORIES = [
  {
    id: eventKeywords.boids.reproduced,
    label: 'Births',
    icon: IconHeart,
    color: 'pink',
  },
  {
    id: eventKeywords.boids.died,
    label: 'Deaths',
    icon: IconSkull,
    color: 'red',
  },
  {
    id: eventKeywords.boids.caught,
    label: 'Catches',
    icon: IconTarget,
    color: 'orange',
  },
  {
    id: eventKeywords.boids.spawnPredator,
    label: 'Spawns',
    icon: IconPlus,
    color: 'green',
  },
  {
    id: eventKeywords.atmosphere.eventStarted,
    label: 'Atmosphere',
    icon: IconAdjustments,
    color: 'purple',
  },
] as EventCategory[]

const config = {
  maxEventsToShow: 50,
  ignoreEventTypes: [] as AllEvents['type'][],
  aggregationWindowTicks: 10, // 10 ticks (simulation time, not wall-clock)
}

type AggregatedEventItem = {
  id: string
  timestamp: number
  tick: number
  event: AllEvents
}

type AggregatedEvent = {
  id: string
  eventType: string
  count: number
  firstTimestamp: number
  lastTimestamp: number
  firstTick: number
  lastTick: number
  events: Array<AggregatedEventItem>
}

function aggregateEvents(
  events: Array<AggregatedEventItem>,
  windowTicks: number
): AggregatedEvent[] {
  if (events.length === 0) return []

  const windowMap = new Map<string, AggregatedEvent>()

  for (const event of events) {
    const eventType = event.event.type

    const windowKey = `agg-${getTickWindowKey(
      eventType,
      event.tick,
      windowTicks
    )}`

    let window = windowMap.get(windowKey)

    if (!window) {
      const windowStart = Math.floor(event.tick / windowTicks) * windowTicks
      const windowEnd = windowStart + windowTicks

      window = {
        id: windowKey,
        eventType,
        count: 0,
        firstTimestamp: event.timestamp,
        lastTimestamp: event.timestamp,
        firstTick: windowEnd - 1, // Use window end for sorting
        lastTick: windowStart, // Use window start for reference
        events: [],
      }
      windowMap.set(windowKey, window)
    }

    window.events.push(event)
    window.count++

    if (event.timestamp < window.lastTimestamp) {
      window.lastTimestamp = event.timestamp
    }
    if (event.timestamp > window.firstTimestamp) {
      window.firstTimestamp = event.timestamp
    }
  }

  return Array.from(windowMap.values())
}

export function EventsPanel() {
  const { useStore: useRuntimeStore } = useResource('runtimeStore')
  const { useStore: useAnalyticsStore } = useResource('analyticsStore')
  const runtimeController = useResource('runtimeController')
  const recentEvents = useAnalyticsStore((state) => {
    return state.events.data.recentEvents
  })
  const currentTick = useAnalyticsStore((state) => {
    return state.evolution.data.currentSnapshot?.tick
  })

  const currentWindow = useMemo(() => {
    if (!currentTick) return null
    return getCurrentTickWindow(currentTick, config.aggregationWindowTicks)
  }, [currentTick])

  const aggregatedEvents = useMemo(() => {
    const filtered = recentEvents.filter(
      (event) => !config.ignoreEventTypes.includes(event.event.type)
    )
    const aggregated = aggregateEvents(filtered, config.aggregationWindowTicks)

    const comparator = createWeightedComparator<AggregatedEvent>([
      { getValue: (item) => item.firstTick, weight: 1.0, order: 'desc' },
      { getValue: (item) => item.count, weight: 0.01, order: 'desc' },
    ])

    return aggregated.sort(comparator).slice(0, config.maxEventsToShow)
  }, [recentEvents])

  const species = useRuntimeStore((state) => state.config.species)
  const maxEventsCaptured = useAnalyticsStore(
    (state) =>
      state.events.config.customFilter?.maxEvents ??
      state.events.config.defaultFilter.maxEvents
  )
  const allowedEventTypes = useAnalyticsStore(
    (state) =>
      state.events.config.customFilter?.allowedEventTypes ??
      state.events.config.defaultFilter.allowedEventTypes
  )
  const isCustomFilterActive = useAnalyticsStore(
    (state) => state.events.config.customFilter !== null
  )

  const eventCounts = recentEvents.reduce(
    (acc, { event }) => {
      const category = event.type.split('/')[0] || 'other'
      acc[category] = (acc[category] || 0) + 1
      return acc
    },
    {} as Record<string, number>
  )

  const copyEventsToClipboard = () => {
    const eventsText = recentEvents
      .map(({ timestamp, event }) => {
        const time = new Date(timestamp).toLocaleTimeString()
        const eventData = JSON.stringify(event, null, 2)
        return `[${time}] ${event.type}\n${eventData}`
      })
      .join('\n---\n\n')

    navigator.clipboard
      .writeText(eventsText)
      .then(() => {
        toast.success(`Copied ${recentEvents.length} events to clipboard!`)
      })
      .catch((err) => {
        console.error('Failed to copy events:', err)
        toast.error('Failed to copy events')
      })
  }

  const handleMaxEventsChange = (value: number | readonly number[]) => {
    const maxEvents = Array.isArray(value) ? value[0] : value
    runtimeController.dispatch({
      type: eventKeywords.analytics.filterChanged,
      maxEvents,
      allowedEventTypes: allowedEventTypes ?? undefined,
    })
  }

  const toggleEventCategory = (categoryId: string) => {
    const currentTypes = allowedEventTypes || []
    const isEnabled = currentTypes.includes(categoryId)

    let newTypes: string[] | null
    if (isEnabled) {
      newTypes = currentTypes.filter((t) => t !== categoryId)
      if (newTypes.length === 0) {
        newTypes = null
      }
    } else {
      newTypes = [...currentTypes, categoryId]
    }

    runtimeController.dispatch({
      type: eventKeywords.analytics.filterChanged,
      maxEvents: maxEventsCaptured,
      allowedEventTypes: newTypes ?? undefined,
    })
  }

  const clearCustomFilter = () => {
    runtimeController.dispatch({
      type: eventKeywords.analytics.filterCleared,
    })
    toast.info('Filter reset to default')
  }

  const enableAllCategories = () => {
    runtimeController.dispatch({
      type: eventKeywords.analytics.filterChanged,
      maxEvents: maxEventsCaptured,
      allowedEventTypes: EVENT_CATEGORIES.map((c) => c.id),
    })
    toast.success('All categories enabled')
  }

  return (
    <div className="p-1 space-y-4">
      {/* Filter Controls Card */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm flex items-center gap-2">
              <IconFilter className="size-4" />
              Event Filter
              {isCustomFilterActive && (
                <Badge variant="default" className="ml-1">
                  Custom
                </Badge>
              )}
            </CardTitle>
            <Button
              variant="ghost"
              size="sm"
              onClick={clearCustomFilter}
              disabled={!isCustomFilterActive}
            >
              <IconFilterOff className="size-4 mr-1" />
              Reset
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Max Events Slider */}
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <Label className="text-xs">Max Events</Label>
              <span className="text-xs font-mono text-primary">
                {maxEventsCaptured}
              </span>
            </div>
            <Slider
              value={[maxEventsCaptured]}
              onValueChange={handleMaxEventsChange}
              min={10}
              max={500}
              step={10}
            />
          </div>

          {/* Event Category Toggles */}
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <Label className="text-xs">Event Categories</Label>
              <Button
                variant="ghost"
                size="sm"
                onClick={enableAllCategories}
                className="h-6 text-xs"
              >
                Enable All
              </Button>
            </div>
            <div className="flex flex-wrap gap-2">
              {EVENT_CATEGORIES.map((category) => {
                const Icon = category.icon
                const isEnabled =
                  !allowedEventTypes || allowedEventTypes.includes(category.id)
                return (
                  <Button
                    key={category.id}
                    variant={isEnabled ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => toggleEventCategory(category.id)}
                    className="gap-1"
                  >
                    <Icon className="size-3" />
                    {category.label}
                  </Button>
                )
              })}
            </div>
            {allowedEventTypes === null && (
              <p className="text-xs text-muted-foreground">
                No events are being tracked. Enable at least one category.
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Events List */}
      <Card>
        <CardHeader className="pb-1">
          <CardTitle className="text-sm text-muted-foreground flex items-center justify-between">
            <div className="flex flex-col">
              <span>Recent Events</span>
              <span className="text-xs text-muted-foreground/70 -mt-1">
                Sampling last {recentEvents.length}
              </span>
            </div>
            {currentWindow && (
              <Badge variant="outline" className="font-mono text-xs">
                T{currentWindow.start}-{currentWindow.end}
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <ScrollArea className="h-[400px]">
            <div className="p-1 space-y-2">
              <AnimatePresence initial={false}>
                {aggregatedEvents.map((aggregated) => {
                  const Icon = getEventIcon(aggregated.eventType)
                  const colorClass = getEventColor(aggregated.eventType)
                  const bgClass = getEventBgColor(aggregated.eventType)
                  const summary = getAggregatedSummary(aggregated, species)

                  const timeStart = new Date(
                    aggregated.firstTimestamp
                  ).toLocaleTimeString()
                  const timeEnd = new Date(
                    aggregated.lastTimestamp
                  ).toLocaleTimeString()
                  const timeDisplay =
                    aggregated.count === 1
                      ? timeStart
                      : `${timeEnd} - ${timeStart}`

                  return (
                    <motion.div
                      key={aggregated.id}
                      initial={{
                        opacity: 0,
                        y: -20,
                        scale: 0.98,
                      }}
                      animate={{
                        opacity: 1,
                        y: 0,
                        scale: 1,
                      }}
                      exit={{
                        opacity: 0,
                        y: 20,
                        scale: 0.95,
                      }}
                      transition={{
                        type: 'spring',
                        stiffness: 500,
                        damping: 30,
                        mass: 0.2,
                      }}
                      layout
                    >
                      <Card className={`${bgClass} border-l-4 mr-2.5`}>
                        <CardContent className="px-1">
                          <div className="flex items-start gap-1">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between gap-1 mb-1">
                                <div className="font-medium text-xs flex items-center gap-1">
                                  <span className="whitespace-nowrap">
                                    {formatEventType(aggregated.eventType)}
                                  </span>
                                  {aggregated.count > 1 && (
                                    <Badge
                                      variant="secondary"
                                      className="text-[10px] px-1 py-0 h-4"
                                    >
                                      ×{aggregated.count}
                                    </Badge>
                                  )}
                                  <div className={`mt-0.5 ${colorClass}`}>
                                    <Icon className="size-4" />
                                  </div>
                                </div>
                                <span className="text-xs text-muted-foreground whitespace-nowrap">
                                  {timeDisplay}
                                </span>
                              </div>
                              {summary && (
                                <p className="text-xs text-muted-foreground">
                                  {summary}
                                </p>
                              )}
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    </motion.div>
                  )
                })}
              </AnimatePresence>

              {aggregatedEvents.length === 0 && (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <IconActivity className="size-12 text-muted-foreground/50 mb-4" />
                  <p className="text-sm text-muted-foreground">No events yet</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Events will appear here as they occur
                  </p>
                </div>
              )}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Analytics Card */}
      <Card>
        <CardHeader className="pb-1">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg flex items-center gap-2">
              <IconActivity className="size-5 text-primary" />
              Analytics
            </CardTitle>
            <Button
              variant="outline"
              size="sm"
              onClick={copyEventsToClipboard}
              disabled={recentEvents.length === 0}
            >
              <IconCopy className="size-4 mr-2" />
              Copy ({recentEvents.length})
            </Button>
          </div>
        </CardHeader>
        <CardContent className="pb-1">
          <div className="flex flex-wrap gap-2">
            {Object.entries(eventCounts).map(([category, count]) => (
              <Badge key={category} variant="secondary">
                {category}: {count}
              </Badge>
            ))}
            {Object.keys(eventCounts).length === 0 && (
              <span className="text-sm text-muted-foreground">
                No events yet...
              </span>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
