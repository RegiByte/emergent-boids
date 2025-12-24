import { StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { ThemeProvider } from "next-themes";
import "./index.css";
import App from "./App.tsx";
import { Spinner } from "./components/ui/spinner.tsx";
import { ErrorBoundary } from "react-error-boundary";
import { IconAlertCircle } from "@tabler/icons-react";

const Loading = (
  <div className="flex items-center justify-center h-screen gap-3">
    <Spinner className="w-10 h-10" />
    <p className="text-sm text-muted-foreground">Simulation Loading...</p>
  </div>
);

function ErrorFallback({ error }: { error: Error }) {
  return (
    <div className="flex flex-col items-center justify-center h-screen gap-3">
      <IconAlertCircle className="w-10 h-10" />
      <p className="text-sm text-destructive">System Startup Failed</p>
      <p className="text-sm text-destructive">{error.message}</p>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
      <ErrorBoundary FallbackComponent={ErrorFallback}>
        <Suspense fallback={Loading}>
          <App />
        </Suspense>
      </ErrorBoundary>
    </ThemeProvider>
  </StrictMode>
);
