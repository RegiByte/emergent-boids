import { StrictMode, Suspense } from "react";
import { createRoot, type Root } from "react-dom/client";
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

// Prevent double-root creation in development (React StrictMode + HMR)
const rootElement = document.getElementById("root")!;

// Store root reference globally to prevent HMR from creating multiple roots
declare global {
  interface Window {
    __APP_ROOT__?: Root;
  }
}

if (!window.__APP_ROOT__) {
  window.__APP_ROOT__ = createRoot(rootElement);
}

window.__APP_ROOT__.render(
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
