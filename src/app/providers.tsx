"use client"

import * as React from "react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"

/**
 * Client-side providers for the whole app.
 *
 * Devtools are deliberately not mounted — this ships to phones in a bar.
 */

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // The game state is shared and changes under us constantly, so nothing
        // is ever worth treating as fresh.
        staleTime: 0,
        gcTime: 5 * 60_000,
        retry: 1,
        refetchOnWindowFocus: true,
        refetchOnReconnect: true,
      },
      mutations: {
        // Writes are not idempotent from the user's point of view; a retry
        // would re-apply a tap the user has since taken back.
        retry: 0,
      },
    },
  })
}

let browserClient: QueryClient | undefined

function getQueryClient(): QueryClient {
  // On the server every request gets its own client, or two visitors would
  // share one cache. In the browser there is exactly one, kept across renders
  // (and across Fast Refresh) so the cache survives.
  if (typeof window === "undefined") return makeQueryClient()
  browserClient ??= makeQueryClient()
  return browserClient
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = React.useState(getQueryClient)

  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
}
