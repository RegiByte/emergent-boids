/* eslint-disable no-unused-vars */
import { RouterProvider, createRouter } from '@tanstack/react-router'
import { StrictMode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import './index.css'
import { routeTree } from './routeTree.gen'

declare global {
  interface Window {
    __APP_ROOT__?: Root
  }
}

const rootElement = document.getElementById('root')!

const router = createRouter({ routeTree })

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

if (!window.__APP_ROOT__) {
  window.__APP_ROOT__ = createRoot(rootElement)
}

window.__APP_ROOT__.render(
  <StrictMode>
    <RouterProvider router={router} basepath="/emergent-boids" />
  </StrictMode>
)
