import { Spinner } from '@/components/ui/spinner'
import { IconAlertCircle } from '@tabler/icons-react'
import { createRootRoute, Outlet } from '@tanstack/react-router'
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools'
import { ThemeProvider } from 'next-themes'
import { Suspense } from 'react'
import { ErrorBoundary } from 'react-error-boundary'

const Loading = (
  <div className="flex items-center justify-center h-screen gap-3">
    <Spinner className="w-10 h-10" />
    <p className="text-sm text-muted-foreground">Simulation Loading...</p>
  </div>
)

function ErrorFallback({ error }: { error: Error }) {
  return (
    <div className="flex flex-col items-center justify-center h-screen gap-3">
      <IconAlertCircle className="w-10 h-10" />
      <p className="text-sm text-destructive">System Startup Failed</p>
      <p className="text-sm text-destructive">{error.message}</p>
    </div>
  )
}

const RootLayout = () => (
  <>
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
      <ErrorBoundary FallbackComponent={ErrorFallback}>
        <Suspense fallback={Loading}>
          <Outlet />
        </Suspense>
      </ErrorBoundary>
    </ThemeProvider>
    <TanStackRouterDevtools />
  </>
)

export const Route = createRootRoute({ component: RootLayout })
