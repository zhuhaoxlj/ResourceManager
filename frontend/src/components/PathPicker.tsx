import { useEffect, useState, type ReactNode } from "react"
import { ChevronUp, Folder, Loader2, X } from "lucide-react"
import { Button } from "./ui/button"
import { api, type BrowseResult } from "@/services/api"

interface PathPickerProps {
  open: boolean
  title: string
  confirmLabel: string
  initialPath?: string
  hint?: string
  busy?: boolean
  confirmDisabled?: boolean
  volumes?: string[]
  children?: ReactNode
  onClose: () => void
  onConfirm: (path: string) => void
}

export function PathPicker({
  open,
  title,
  confirmLabel,
  initialPath,
  hint,
  busy = false,
  confirmDisabled = false,
  volumes = [],
  children,
  onClose,
  onConfirm,
}: PathPickerProps) {
  const [path, setPath] = useState<string | undefined>(initialPath)
  const [data, setData] = useState<BrowseResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string>("")

  // 打开时从初始目录开始
  useEffect(() => {
    if (open) {
      setData(null)
      setError("")
      setPath(initialPath)
    }
  }, [open, initialPath])

  useEffect(() => {
    if (!open || !path) return
    let cancelled = false
    setLoading(true)
    setError("")
    api
      .browsePath(path)
      .then((result) => {
        if (!cancelled) setData(result)
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "读取目录失败")
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [open, path])

  // Esc 关闭
  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (!busy && event.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, onClose, busy])

  if (!open) return null

  const current = data?.path || path || ""
  const navigateTo = (nextPath: string) => {
    if (nextPath === path) return
    setData(null)
    setPath(nextPath)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (!busy && event.target === event.currentTarget) onClose()
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="max-h-[calc(100dvh-2rem)] w-full max-w-xl overflow-y-auto rounded-2xl border bg-background shadow-2xl"
      >
        <div className="flex items-center justify-between gap-4 border-b px-5 py-4">
          <div>
            <h2 className="text-base font-semibold">{title}</h2>
            {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
            aria-label="关闭"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {volumes.length > 1 && (
          <div className="flex flex-wrap gap-2 border-b px-5 py-2">
            {volumes.map((volume) => (
              <Button key={volume} variant="outline" size="sm" disabled={busy} onClick={() => navigateTo(volume)}>
                {volume}
              </Button>
            ))}
          </div>
        )}
        <div className="flex items-center gap-2 border-b px-5 py-2.5">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2"
            disabled={!data?.parent || loading || busy}
            onClick={() => data?.parent && navigateTo(data.parent)}
          >
            <ChevronUp className="h-4 w-4" />
          </Button>
          <span className="truncate font-mono text-xs text-muted-foreground" title={current}>
            {current}
          </span>
        </div>

        <div className="max-h-80 overflow-y-auto px-2 py-2">
          {loading && (
            <div className="flex items-center justify-center py-10 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          )}

          {!loading && error && (
            <p className="px-3 py-6 text-sm text-destructive">{error}</p>
          )}

          {!loading && !error && data?.entries.length === 0 && (
            <p className="px-3 py-6 text-sm text-muted-foreground">这个目录下没有子目录</p>
          )}

          {!loading &&
            !error &&
            data?.entries.map((entry) => (
              <button
                key={entry.path}
                type="button"
                disabled={busy}
                onClick={() => navigateTo(entry.path)}
                className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm hover:bg-accent"
              >
                <Folder className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="truncate">{entry.name}</span>
              </button>
            ))}
        </div>

        {children}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t px-5 py-4">
          <p className="min-w-0 break-all text-xs text-muted-foreground">
            {data ? `当前目录：${data.host_path}` : ""}
          </p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={busy} onClick={onClose}>
              取消
            </Button>
            <Button
              size="sm"
              disabled={!data || loading || !!error || busy || confirmDisabled}
              onClick={() => onConfirm(current)}
            >
              {busy && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
              {confirmLabel}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
