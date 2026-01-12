import App from '@/App'
import { systemConfig } from '@/systems/standard'
import { createFileRoute } from '@tanstack/react-router'
import { buildTopology, toDot, topologicalSort } from 'braided'

export const Route = createFileRoute('/')({
  component: Index,
  beforeLoad: async () => {
    const order = topologicalSort(systemConfig as any)
    const topology = buildTopology(systemConfig as any, order)
    console.log(toDot(topology))
    return {
      topology,
    }
  },
})

function Index() {
  return <App />
}
