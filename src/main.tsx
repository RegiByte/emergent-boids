import { StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { ThemeProvider } from "next-themes";
import "./index.css";
import App from "./App.tsx";
import { Spinner } from "./components/ui/spinner.tsx";

const Loading = (
  <div className="flex items-center justify-center h-screen gap-3">
    <Spinner className="w-10 h-10" />
    <p className="text-sm text-muted-foreground">Simulation Loading...</p>
  </div>
);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
      <Suspense fallback={Loading}>
        <App />
      </Suspense>
    </ThemeProvider>
  </StrictMode>
);
