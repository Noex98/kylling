"use client"

import * as React from "react"
import { cn } from "cn"
import { PlusIcon } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { buildOpeningHours, WEEKDAY_ORDER, WEEKDAY_SHORT } from "@/lib/hours"
import type { AddBarRequest, Weekday } from "@/lib/types"

type AddBarDialogProps = {
  now: Date
  onAdd: (bar: AddBarRequest) => Promise<boolean>
}

export function AddBarDialog({ now, onAdd }: AddBarDialogProps) {
  const today = now.getDay() as Weekday

  const [open, setOpen] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  const [name, setName] = React.useState("")
  const [address, setAddress] = React.useState("")
  const [note, setNote] = React.useState("")
  const [days, setDays] = React.useState<Weekday[]>([today])
  const [opens, setOpens] = React.useState("16:00")
  const [closes, setCloses] = React.useState("02:00")

  function reset() {
    setName("")
    setAddress("")
    setNote("")
    setDays([today])
    setOpens("16:00")
    setCloses("02:00")
  }

  function toggleDay(day: Weekday) {
    setDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    )
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    const trimmed = name.trim()
    if (!trimmed || saving) return

    setSaving(true)
    const ok = await onAdd({
      name: trimmed,
      address: address.trim() || undefined,
      note: note.trim() || undefined,
      hours: buildOpeningHours(days, opens, closes),
    })
    setSaving(false)

    if (ok) {
      toast.success(`${trimmed} er tilføjet 🐔`)
      reset()
      setOpen(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="lg"
          className="h-12 w-full border-dashed text-base"
        >
          <PlusIcon /> Tilføj bar
        </Button>
      </DialogTrigger>

      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Tilføj bar</DialogTitle>
          <DialogDescription>
            Kun navnet er påkrævet — resten kan du fylde ud senere.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="grid gap-4">
          <Field label="Navn">
            <Input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Fx Kupé"
              className="h-11 text-base"
              required
            />
          </Field>

          <Field label="Adresse">
            <Input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Fx Jægergårdsgade 45"
              className="h-11 text-base"
            />
          </Field>

          <Field label="Note">
            <Input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Fx billig fadøl i kælderen"
              className="h-11 text-base"
            />
          </Field>

          <div className="grid gap-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Åbningstider</span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() =>
                  setDays(days.length === 7 ? [today] : [...WEEKDAY_ORDER])
                }
              >
                {days.length === 7 ? "Kun i dag" : "Alle dage"}
              </Button>
            </div>

            <div className="grid grid-cols-7 gap-1">
              {WEEKDAY_ORDER.map((day) => {
                const active = days.includes(day)
                return (
                  <button
                    key={day}
                    type="button"
                    onClick={() => toggleDay(day)}
                    aria-pressed={active}
                    className={cn(
                      "h-10 rounded-lg border text-sm font-medium capitalize transition-colors",
                      active
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-muted/40 text-muted-foreground"
                    )}
                  >
                    {WEEKDAY_SHORT[day]}
                  </button>
                )
              })}
            </div>

            <div className="grid grid-cols-2 gap-2">
              <Field label="Åbner">
                <Input
                  type="time"
                  value={opens}
                  onChange={(e) => setOpens(e.target.value)}
                  className="h-11 text-base"
                />
              </Field>
              <Field label="Lukker">
                <Input
                  type="time"
                  value={closes}
                  onChange={(e) => setCloses(e.target.value)}
                  className="h-11 text-base"
                />
              </Field>
            </div>
            <p className="text-xs text-muted-foreground">
              Lukketid før åbningstid betyder efter midnat.
            </p>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              className="h-11"
              onClick={() => setOpen(false)}
            >
              Annullér
            </Button>
            <Button type="submit" className="h-11" disabled={!name.trim() || saving}>
              {saving ? "Gemmer…" : "Tilføj bar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function Field({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <label className="grid gap-1.5">
      <span className="text-sm font-medium">{label}</span>
      {children}
    </label>
  )
}
