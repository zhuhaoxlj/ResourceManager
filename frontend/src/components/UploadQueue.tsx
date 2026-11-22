import { Loader2, CheckCircle2, AlertCircle, Clock, Copy, X } from "lucide-react"
import { Button } from "./ui/button"
import { formatFileSize } from "@/lib/utils"
import { type UploadProgress } from "@/services/api"

export type UploadItemStatus =
  | "pending"
  | "checking"
  | "uploading"
  | "success"
  | "error"
  | "cancelled"

export interface UploadItem {
  id: string
  file: File
  platform: string
  status: UploadItemStatus
  progress?: UploadProgress
  error?: string
  note?: string
}

interface UploadQueueProps {
  items: UploadItem[]
  onCancel: (id: string) => void
  onRemove: (id: string) => void
  onRetry: (id: string) => void
  onClearFinished: () => void
  onCancelAll: () => void
}

export function UploadQueue({
  items,
  onCancel,
  onRemove,
  onRetry,
  onClearFinished,
  onCancelAll,
}: UploadQueueProps) {
  if (items.length === 0) return null

  const finished = items.filter(
    (item) => item.status === "success" || item.status === "error" || item.status === "cancelled"
  ).length
  const active = items.filter(
    (item) => item.status === "pending" || item.status === "checking" || item.status === "uploading"
  ).length
  const success = items.filter((item) => item.status === "success").length
  const failed = items.filter((item) => item.status === "error").length

  return (
    <div className="border rounded-lg bg-card">
      <div className="flex items-center justify-between gap-2 px-4 py-3 border-b">
        <div className="text-sm">
          <span className="font-medium">上传队列</span>
          <span className="text-muted-foreground ml-2">
            {items.length} 个{active > 0 && `，进行中 ${active} 个`}
            {success > 0 && `，成功 ${success} 个`}
            {failed > 0 && `，失败 ${failed} 个`}
          </span>
        </div>
        <div className="flex gap-2">
          {finished > 0 && (
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={onClearFinished}>
              清空已完成
            </Button>
          )}
          {active > 0 && (
            <Button variant="ghost" size="sm" className="h-7 text-xs text-destructive" onClick={onCancelAll}>
              全部取消
            </Button>
          )}
        </div>
      </div>

      <ul className="divide-y">
        {items.map((item) => {
          const percent = item.progress?.percent ?? 0
          return (
            <li key={item.id} className="flex items-start gap-3 px-4 py-3">
              <div className="flex-shrink-0 mt-0.5">
                {item.status === "uploading" && <Loader2 className="h-4 w-4 text-primary animate-spin" />}
                {item.status === "checking" && <Loader2 className="h-4 w-4 text-muted-foreground animate-spin" />}
                {item.status === "pending" && <Clock className="h-4 w-4 text-muted-foreground" />}
                {item.status === "success" && <CheckCircle2 className="h-4 w-4 text-green-500" />}
                {item.status === "error" && <AlertCircle className="h-4 w-4 text-destructive" />}
                {item.status === "cancelled" && <X className="h-4 w-4 text-muted-foreground" />}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm truncate" title={item.file.name}>
                    {item.file.name}
                  </p>
                  <span className="text-xs text-muted-foreground flex-shrink-0">
                    {formatFileSize(item.file.size)}
                    {item.status === "uploading" && ` · ${percent}%`}
                  </span>
                </div>

                {item.status === "uploading" && (
                  <div className="mt-1 h-1.5 w-full bg-secondary rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary transition-all duration-200 ease-out"
                      style={{ width: `${percent}%` }}
                    />
                  </div>
                )}

                <div className="mt-0.5 flex items-center gap-2 text-xs">
                  {item.status === "pending" && (
                    <span className="text-muted-foreground">等待上传</span>
                  )}
                  {item.status === "checking" && (
                    <span className="text-muted-foreground">检查是否有同名资源...</span>
                  )}
                  {item.status === "success" && (
                    <span className="text-green-600 dark:text-green-400">上传成功</span>
                  )}
                  {item.status === "error" && (
                    <span className="text-destructive">{item.error || "上传失败"}</span>
                  )}
                  {item.status === "cancelled" && (
                    <span className="text-muted-foreground">已取消</span>
                  )}
                  {item.note && item.status !== "error" && (
                    <span className="text-amber-600 dark:text-amber-400 inline-flex items-center gap-1">
                      <Copy className="h-3 w-3" />
                      {item.note}
                    </span>
                  )}
                </div>
              </div>

              <div className="flex-shrink-0 flex items-center gap-1">
                {item.status === "error" && (
                  <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => onRetry(item.id)}>
                    重试
                  </Button>
                )}
                {(item.status === "uploading" || item.status === "pending" || item.status === "checking") && (
                  <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => onCancel(item.id)}>
                    取消
                  </Button>
                )}
                {(item.status === "success" || item.status === "cancelled") && (
                  <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => onRemove(item.id)}>
                    移除
                  </Button>
                )}
                {item.status === "error" && (
                  <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => onRemove(item.id)}>
                    移除
                  </Button>
                )}
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
