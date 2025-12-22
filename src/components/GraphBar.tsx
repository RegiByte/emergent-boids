import { AspectRatio } from "@/components/ui/aspect-ratio";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel";
import { PopulationGraph } from "./PopulationGraph";
import { EnergyGraph } from "./EnergyGraph";
import { EventsGraph } from "./EventsGraph";

export function GraphBar() {
  return (
    <div className="border-b border-border bg-background px-4 py-3 max-h-48">
      <Carousel
        opts={{
          align: "start",
          loop: true,
        }}
        className="w-full"
      >
        <CarouselContent>
          <CarouselItem className="basis-1/3">
            <AspectRatio ratio={16 / 9} className="w-full">
              <PopulationGraph compact />
            </AspectRatio>
          </CarouselItem>
          <CarouselItem className="basis-1/3">
            <AspectRatio ratio={16 / 9} className="w-full">
              <EnergyGraph compact />
            </AspectRatio>
          </CarouselItem>
          <CarouselItem className="basis-1/3">
            <AspectRatio ratio={16 / 9} className="w-full">
              <EventsGraph compact />
            </AspectRatio>
          </CarouselItem>
        </CarouselContent>
        <CarouselPrevious />
        <CarouselNext />
      </Carousel>
    </div>
  );
}
