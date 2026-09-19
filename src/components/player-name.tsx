"use client"

import * as React from "react"
import { UserIcon } from "lucide-react"

import { Input } from "@/components/ui/input"

const STORAGE_KEY = "kylling:navn"

const listeners = new Set<() => void>()

function subscribe(listener: () => void) {
  listeners.add(listener)
  window.addEventListener("storage", listener)
  return () => {
    listeners.delete(listener)
    window.removeEventListener("storage", listener)
  }
}

function getSnapshot(): string {
  try {
    return window.localStorage.getItem(STORAGE_KEY) ?? ""
  } catch {
    // private mode / storage disabled — just stay anonymous
    return ""
  }
}

/**
 * The player's name, remembered on this phone (and shared between tabs).
 * Read through useSyncExternalStore so SSR hydrates with "" and never mismatches.
 */
export function usePlayerName() {
  const name = React.useSyncExternalStore(subscribe, getSnapshot, () => "")

  const update = React.useCallback((value: string) => {
    try {
      window.localStorage.setItem(STORAGE_KEY, value)
    } catch {
      // ignore
    }
    for (const listener of listeners) listener()
  }, [])

  return [name, update] as const
}

export function PlayerNameField({
  name,
  onNameChange,
}: {
  name: string
  onNameChange: (value: string) => void
}) {
  return (
    <label className="flex items-center gap-2 rounded-xl bg-card px-3 py-2 ring-1 ring-foreground/10">
      <UserIcon className="size-4 shrink-0 text-muted-foreground" />
      <span className="shrink-0 text-sm text-muted-foreground">Du er</span>
      <Input
        value={name}
        onChange={(e) => onNameChange(e.target.value)}
        placeholder="skriv dit navn"
        autoComplete="given-name"
        maxLength={24}
        className="h-9 border-0 bg-transparent px-1 text-base font-medium shadow-none focus-visible:ring-0 dark:bg-transparent"
      />
    </label>
  )
}
