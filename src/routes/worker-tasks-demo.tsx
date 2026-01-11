/**
 * Worker Tasks Demo Route
 *
 * Route demonstrating the worker tasks abstraction.
 */

import { createFileRoute } from '@tanstack/react-router'
import { WorkerTasksDemo } from '@/components/WorkerTasksDemo'

export const Route = createFileRoute('/worker-tasks-demo')({
  component: WorkerTasksDemoRoute,
})

function WorkerTasksDemoRoute() {
  return (
    <div className="min-h-screen bg-background">
      <WorkerTasksDemo />
    </div>
  )
}
