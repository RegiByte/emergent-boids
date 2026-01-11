import { createFileRoute } from '@tanstack/react-router'
import {
  IconBrandGithub,
  IconDna,
  IconFish,
  IconBrain,
} from '@tabler/icons-react'

export const Route = createFileRoute('/about')({
  component: About,
})

function About() {
  return (
    <div className="min-h-screen bg-background p-8">
      <div className="mx-auto max-w-4xl space-y-12">
        {/* Header */}
        <header className="space-y-4 text-center">
          <h1 className="text-4xl font-bold tracking-tight">Emergent Boids</h1>
          <p className="text-xl text-muted-foreground">
            An Ecosystem Simulation Demonstrating Emergent Behavior
          </p>
        </header>

        {/* Overview */}
        <section className="space-y-4">
          <h2 className="text-2xl font-semibold">Overview</h2>
          <div className="space-y-3 text-muted-foreground">
            <p>
              Emergent Boids is a real-time ecosystem simulation that
              demonstrates how complex behaviors emerge from simple rules. Watch
              as populations of predators and prey evolve through genetic
              inheritance, navigate their world using flocking algorithms, and
              adapt their behavior based on survival pressures.
            </p>
            <p>
              Built with modern web technologies (React, TypeScript, WebGL), the
              simulation showcases the power of emergent systems - no central
              intelligence directs the ecosystem, yet coherent patterns arise
              naturally from individual interactions.
            </p>
          </div>
        </section>

        {/* Core Concepts */}
        <section className="space-y-4">
          <h2 className="text-2xl font-semibold">Core Concepts</h2>
          <div className="grid gap-6 md:grid-cols-3">
            <ConceptCard
              icon={<IconFish className="h-8 w-8" />}
              title="Flocking Algorithms"
              description="Boids navigate using separation, alignment, and cohesion - creating emergent swarm behavior without centralized control."
            />
            <ConceptCard
              icon={<IconDna className="h-8 w-8" />}
              title="Genetic Evolution"
              description="Each boid carries a genome that determines traits like speed, size, and energy efficiency. Successful traits spread through reproduction."
            />
            <ConceptCard
              icon={<IconBrain className="h-8 w-8" />}
              title="Emergent Behavior"
              description="Complex ecosystem dynamics arise from simple local rules - predator-prey cycles, territorial behavior, and resource competition."
            />
          </div>
        </section>

        {/* Architecture */}
        <section className="space-y-4">
          <h2 className="text-2xl font-semibold">Architecture Highlights</h2>
          <div className="space-y-3 text-muted-foreground">
            <ArchitectureItem
              title="Braided Resource System"
              description="Modular dependency management where resources declare explicit dependencies and compose automatically. Each route can use a minimal system configuration."
            />
            <ArchitectureItem
              title="Emergent Event System"
              description="Event-driven architecture where past-tense events (reproduced, consumed, died) flow through pure handlers. No central state manager needed."
            />
            <ArchitectureItem
              title="Modular WebGL Rendering"
              description="High-performance rendering pipeline split into 31 modular files - atlases, data preparation, draw commands. Average file size: 98 lines."
            />
          </div>
        </section>

        {/* Philosophy */}
        <section className="space-y-4">
          <h2 className="text-2xl font-semibold">Philosophy</h2>
          <blockquote className="border-l-4 border-primary pl-4 italic text-muted-foreground">
            "Everything is information processing. Simple rules compose.
            Emergence is reliable. No central governor needed."
          </blockquote>
          <p className="text-sm text-muted-foreground">
            This project embodies a philosophy of compositional systems - where
            complexity emerges from the interaction of simple, well-defined
            components rather than monolithic architectures.
          </p>
        </section>

        {/* Resources */}
        <section className="space-y-4">
          <h2 className="text-2xl font-semibold">Resources</h2>
          <div className="flex flex-wrap gap-4">
            <ResourceLink
              href="https://github.com/regibyte/emergent-boids"
              icon={<IconBrandGithub className="h-5 w-5" />}
              label="View on GitHub"
            />
          </div>
        </section>

        {/* Credits */}
        <section className="space-y-4">
          <h2 className="text-2xl font-semibold">Credits</h2>
          <div className="space-y-2 text-sm text-muted-foreground">
            <p>
              <strong>Created by:</strong> RegiByte
            </p>
            <p>
              <strong>AI Assistant:</strong> Claude (Anthropic)
            </p>
            <p>
              <strong>Key Libraries:</strong> React, TypeScript, Vite, TanStack
              Router, Braided, Emergent, REGL (WebGL), Zod, Zustand
            </p>
          </div>
        </section>

        {/* Footer */}
        <footer className="border-t pt-8 text-center text-sm text-muted-foreground">
          <p>Session History & Technical Documentation: .regibyte/ folder</p>
          <p className="mt-2">Built with ❤️ through emergent collaboration</p>
        </footer>
      </div>
    </div>
  )
}

function ConceptCard({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode
  title: string
  description: string
}) {
  return (
    <div className="space-y-2 rounded-lg border bg-card p-4 text-card-foreground">
      <div className="text-primary">{icon}</div>
      <h3 className="font-semibold">{title}</h3>
      <p className="text-sm text-muted-foreground">{description}</p>
    </div>
  )
}

function ArchitectureItem({
  title,
  description,
}: {
  title: string
  description: string
}) {
  return (
    <div>
      <h3 className="font-semibold text-foreground">{title}</h3>
      <p className="text-sm">{description}</p>
    </div>
  )
}

function ResourceLink({
  href,
  icon,
  label,
}: {
  href: string
  icon: React.ReactNode
  label: string
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-2 rounded-lg border bg-card px-4 py-2 text-sm font-medium text-card-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
    >
      {icon}
      {label}
    </a>
  )
}
