import { RouterProvider, createRouter } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import "./index.css";
import { routeTree } from "./routeTree.gen";

// Store root reference globally to prevent HMR from creating multiple roots
declare global {
  interface Window {
    __APP_ROOT__?: Root;
  }
}

const rootElement = document.getElementById("root")!

// Create a new router instance
const router = createRouter({ routeTree });

// Register the router instance for type safety
declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

if (!window.__APP_ROOT__) {
  window.__APP_ROOT__ = createRoot(rootElement);
}

window.__APP_ROOT__.render(
  <StrictMode>
    <RouterProvider router={router} basepath="/emergent-boids" />
  </StrictMode>
);
