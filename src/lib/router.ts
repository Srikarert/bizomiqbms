import { useEffect, useState } from "react"

// Minimal hash router: #/leads, #/clients, ... No router library needed.
export const ROUTES = ["dashboard", "leads", "clients", "projects", "tasks", "follow-ups", "settings"] as const
export type Route = (typeof ROUTES)[number]

function parseHash(): Route {
  const path = window.location.hash.replace(/^#\/?/, "").split(/[/?]/)[0]
  return (ROUTES as readonly string[]).includes(path) ? (path as Route) : "dashboard"
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(parseHash)
  useEffect(() => {
    const onChange = () => setRoute(parseHash())
    window.addEventListener("hashchange", onChange)
    return () => window.removeEventListener("hashchange", onChange)
  }, [])
  return route
}

export const href = (route: Route) => `#/${route}`
