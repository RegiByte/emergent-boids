import { AspectRatio } from '@/components/ui/aspect-ratio'
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from '@/components/ui/carousel'
import AutoScroll from 'embla-carousel-auto-scroll'
import { EnergyGraph } from './EnergyGraph'
import { BirthRatesGraph } from './BirthRatesGraph'
import { DeathRatesGraph } from './DeathRatesGraph'
import { PopulationGraph } from './PopulationGraph'
import { Toggle } from './ui/toggle'
import { useState } from 'react'
import { ToggleGroup } from './ui/toggle-group'
import { cn } from '@/lib/utils'

export function GraphBar() {
  const [expanded, setExpanded] = useState(true)
  const [autoScroll, setAutoScroll] = useState(true)
  const isCompactMode = !expanded
  return (
    <div className="border-b border-border rounded-md bg-background px-2 py-2 max-h-48">
      <Carousel
        opts={{
          align: 'start',
          loop: true,
        }}
        plugins={[
          AutoScroll({
            active: autoScroll,
            startDelay: 5000,
            stopOnMouseEnter: true,
            stopOnFocusIn: true,
            stopOnInteraction: false,
            speed: 0.2,
          }),
        ]}
        className="w-full"
      >
        <CarouselContent className="-ml-2">
          <CarouselItem className="basis-[50%] pl-2">
            <AspectRatio ratio={16 / 9} className="w-full">
              <PopulationGraph compact={isCompactMode} />
            </AspectRatio>
          </CarouselItem>
          <CarouselItem className="basis-[50%] pl-2">
            <AspectRatio ratio={16 / 9} className="w-full">
              <EnergyGraph compact={isCompactMode} />
            </AspectRatio>
          </CarouselItem>
          <CarouselItem className="basis-[50%] pl-2">
            <AspectRatio ratio={16 / 9} className="w-full">
              <BirthRatesGraph compact={isCompactMode} />
            </AspectRatio>
          </CarouselItem>
          <CarouselItem className="basis-[50%] pl-2">
            <AspectRatio ratio={16 / 9} className="w-full">
              <DeathRatesGraph compact={isCompactMode} />
            </AspectRatio>
          </CarouselItem>
        </CarouselContent>
        <CarouselPrevious
          className={cn(
            '-left-8 cursor-pointer',
            autoScroll ? 'dark:bg-background' : 'dark:bg-background/30'
          )}
        />
        <CarouselNext
          className={cn(
            '-right-8 cursor-pointer',
            autoScroll ? 'dark:bg-background/30' : 'dark:bg-background'
          )}
        />

        <div className="absolute -top-5 -left-2">
          <ToggleGroup className={cn('bg-background')}>
            <Toggle
              className={cn('')}
              variant="outline"
              size="sm"
              onPressedChange={() => setExpanded((current) => !current)}
              pressed={!expanded}
            >
              {isCompactMode ? 'Compact' : 'Expanded'} view
            </Toggle>
            <Toggle
              variant="outline"
              size="sm"
              onPressedChange={() => setAutoScroll((current) => !current)}
              pressed={!autoScroll}
            >
              Auto Scroll {autoScroll ? 'On' : 'Off'}
            </Toggle>
          </ToggleGroup>
        </div>
      </Carousel>
    </div>
  )
}
