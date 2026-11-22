import { useDropzone } from "react-dropzone"
import { Upload, Loader2, CheckCircle2, AlertCircle } from "lucide-react"
import { cn } from "@/lib/utils"
import { type UploadProgress } from "@/services/api"

interface FileDropZoneProps {
  onDrop: (files: File[]) => void
  accept?: Record<string, string[]>
  maxFiles?: number
  className?: string
  // 上传状态
  uploading?: boolean
  uploadProgress?: UploadProgress
  uploadFileName?: string
  uploadStatus?: "idle" | "uploading" | "success" | "error"
  uploadError?: string
  // 取消上传
  onCancel?: () => void
}

export function FileDropZone({
  onDrop,
  accept,
  maxFiles = 1,
  className,
  uploading = false,
  uploadProgress,
  uploadFileName,
  uploadStatus = "idle",
  uploadError,
  onCancel,
}: FileDropZoneProps) {
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept,
    maxFiles,
    disabled: uploading,
    noClick: uploading,
  })

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return "0 B"
    const k = 1024
    const sizes = ["B", "KB", "MB", "GB"]
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i]
  }

  return (
    <div className="space-y-3">
      <div
        {...getRootProps()}
        className={cn(
          "border-2 border-dashed rounded-lg p-8 text-center transition-colors relative",
          isDragActive
            ? "border-primary bg-primary/5"
            : "border-muted-foreground/25 hover:border-muted-foreground/50",
          uploading && "pointer-events-none opacity-50",
          className
        )}
      >
        <input {...getInputProps()} />
        <Upload className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
        {isDragActive ? (
          <p className="text-muted-foreground">释放以上传文件...</p>
        ) : (
          <div>
            <p className="text-muted-foreground">
              拖拽文件到此处，或点击选择文件
            </p>
            <p className="text-xs text-muted-foreground/50 mt-2">
              支持 .dmg, .exe, .apk, .nsp 等格式
            </p>
          </div>
        )}
      </div>

      {/* 上传状态卡片 */}
      {(uploadStatus === "uploading" || uploadStatus === "success" || uploadStatus === "error") && (
        <div className="border rounded-lg p-4 bg-card">
          <div className="flex items-center gap-3">
            {/* 图标 */}
            <div className="flex-shrink-0">
              {uploadStatus === "uploading" && (
                <Loader2 className="h-5 w-5 text-primary animate-spin" />
              )}
              {uploadStatus === "success" && (
                <CheckCircle2 className="h-5 w-5 text-green-500" />
              )}
              {uploadStatus === "error" && (
                <AlertCircle className="h-5 w-5 text-destructive" />
              )}
            </div>

            {/* 文件信息和进度 */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2 mb-1">
                <p className="text-sm font-medium truncate">
                  {uploadFileName || "未知文件"}
                </p>
                {uploadStatus === "uploading" && uploadProgress && (
                  <span className="text-xs text-muted-foreground flex-shrink-0">
                    {uploadProgress.percent}%
                  </span>
                )}
              </div>

              {/* 进度条 */}
              {uploadStatus === "uploading" && (
                <div className="space-y-1">
                  <div className="h-2 w-full bg-secondary rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary transition-all duration-300 ease-out"
                      style={{ width: `${uploadProgress?.percent || 0}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>
                      {uploadProgress
                        ? `${formatBytes(uploadProgress.loaded)} / ${formatBytes(uploadProgress.total)}`
                        : "准备中..."}
                    </span>
                    {onCancel && (
                      <button
                        onClick={onCancel}
                        className="text-destructive hover:underline"
                      >
                        取消
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* 成功/错误消息 */}
              {uploadStatus === "success" && (
                <p className="text-xs text-green-600 dark:text-green-400">
                  上传成功！
                </p>
              )}
              {uploadStatus === "error" && (
                <p className="text-xs text-destructive">
                  {uploadError || "上传失败，请重试"}
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
