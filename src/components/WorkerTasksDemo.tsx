/**
 * Worker Tasks Demo Component
 *
 * Demonstrates the worker tasks abstraction with various task types.
 * Now using the `useTaskDispatcher` hook for cleaner state management!
 */

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { createSystemHooks, createSystemManager } from 'braided-react'
import { clientResource } from '@/workers/demoTasks'

const demoSystem = {
  demoTasks: clientResource,
}

const manager = createSystemManager(demoSystem)
const { useResource } = createSystemHooks(manager)

function WorkerTasksDemoInner() {
  const demoTasks = useResource('demoTasks')

  const [squareInput, setSquareInput] = useState('5')
  const [factorialInput, setFactorialInput] = useState('10')
  const [heavyIterations, setHeavyIterations] = useState('10000000')
  const [errorMessage, setErrorMessage] = useState('Test error message')

  const square = demoTasks.useTaskDispatcher('square')
  const factorial = demoTasks.useTaskDispatcher('factorial')
  const heavy = demoTasks.useTaskDispatcher('heavyComputation')
  const throwError = demoTasks.useTaskDispatcher('throwError')

  const handleSquare = () => {
    const n = parseInt(squareInput)
    if (isNaN(n)) return
    square.dispatch(n)
  }

  const handleFactorial = () => {
    const n = parseInt(factorialInput)
    if (isNaN(n)) return
    factorial.dispatch(n)
  }

  const handleHeavyComputation = () => {
    const iterations = parseInt(heavyIterations)
    if (isNaN(iterations)) return
    heavy.dispatch({ iterations })
  }

  const handleThrowError = () => {
    throwError.dispatch({ message: errorMessage })
  }

  return (
    <div className="p-8 space-y-6">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">
          Worker Tasks Abstraction Demo
        </h1>
        <p className="text-muted-foreground">
          Type-safe worker tasks with minimal boilerplate
        </p>
        <div className="mt-2 text-sm">
          <span className="font-mono bg-muted px-2 py-1 rounded">
            Status: {demoTasks.getStatus()}
          </span>
        </div>
      </div>

      {/* Square Task */}
      <Card>
        <CardHeader>
          <CardTitle>Square (Simple Task)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Input
              type="number"
              value={squareInput}
              onChange={(e) => setSquareInput(e.target.value)}
              placeholder="Enter a number"
              className="w-32"
            />
            <Button onClick={handleSquare} disabled={square.isLoading}>
              Calculate Square
            </Button>
          </div>
          {square.output !== null && (
            <div className="text-lg">
              Result:{' '}
              <span className="font-mono font-bold">{square.output}</span>
            </div>
          )}
          {square.error && (
            <div className="text-sm text-destructive">{square.error}</div>
          )}
        </CardContent>
      </Card>

      {/* Factorial Task */}
      <Card>
        <CardHeader>
          <CardTitle>Factorial (Simple Task)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Input
              type="number"
              value={factorialInput}
              onChange={(e) => setFactorialInput(e.target.value)}
              placeholder="Enter a number"
              className="w-32"
            />
            <Button onClick={handleFactorial} disabled={factorial.isLoading}>
              Calculate Factorial
            </Button>
          </div>
          {factorial.output !== null && (
            <div className="text-lg">
              Result:{' '}
              <span className="font-mono font-bold">
                {factorial.output?.toExponential(2)}
              </span>
            </div>
          )}
          {factorial.error && (
            <div className="text-sm text-destructive">{factorial.error}</div>
          )}
        </CardContent>
      </Card>

      {/* Heavy Computation Task */}
      <Card>
        <CardHeader>
          <CardTitle>Heavy Computation (With Progress)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Input
              type="number"
              value={heavyIterations}
              onChange={(e) => setHeavyIterations(e.target.value)}
              placeholder="Iterations"
              className="w-32"
            />
            <Button onClick={handleHeavyComputation} disabled={heavy.isLoading}>
              Start Computation
            </Button>
          </div>
          {heavy.progress && (
            <div className="space-y-2">
              <div className="text-sm text-muted-foreground">
                Progress:{' '}
                {Math.floor(
                  (heavy.progress.current / heavy.progress.total) * 100
                )}
                %
              </div>
              <div className="w-full bg-secondary h-2 rounded-full overflow-hidden">
                <div
                  className="bg-primary h-full transition-all duration-300"
                  style={{
                    width: `${(heavy.progress.current / heavy.progress.total) * 100}%`,
                  }}
                />
              </div>
            </div>
          )}
          {heavy.output && (
            <div className="text-lg space-y-1">
              <div>
                Result:{' '}
                <span className="font-mono font-bold">
                  {heavy.output.result.toFixed(2)}
                </span>
              </div>
              <div className="text-sm text-muted-foreground">
                Duration: {heavy.output.duration.toFixed(2)}ms
              </div>
            </div>
          )}
          {heavy.error && (
            <div className="text-sm text-destructive">{heavy.error}</div>
          )}
        </CardContent>
      </Card>

      {/* Error Task */}
      <Card>
        <CardHeader>
          <CardTitle>Error Handling</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Input
              value={errorMessage}
              onChange={(e) => setErrorMessage(e.target.value)}
              placeholder="Error message"
              className="flex-1"
            />
            <Button
              onClick={handleThrowError}
              variant="destructive"
              disabled={throwError.isLoading}
            >
              Throw Error
            </Button>
          </div>
          {throwError.error && (
            <div className="text-sm text-destructive font-mono bg-destructive/10 p-3 rounded">
              {throwError.error}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

export function WorkerTasksDemo() {
  return <WorkerTasksDemoInner />
}
