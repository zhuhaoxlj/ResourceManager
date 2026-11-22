import { useDropzone } from "react-dropzone"
import { Upload } from "lucide-react"
import { cn } from "@/lib/utils"

interface FileDropZoneProps {
  onDrop: (files: File[]) => void
  accept?: Record<string, string[]>
  maxFiles?: number
  className?: string
  disabled?: boolean
}

export function FileDropZone({
  onDrop,
  accept,
  maxFiles = 0,
  className,
  disabled = false,
}: FileDropZoneProps) {
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept,
    maxFiles,
    multiple: maxFiles !== 1,
    disabled,
    noClick: disabled,
  })

  return (
    <div
      {...getRootProps()}
      className={cn(
        "border-2 border-dashed rounded-lg p-8 text-center transition-colors relative",
        isDragActive
          ? "border-primary bg-primary/5"
          : "border-muted-foreground/25 hover:border-muted-foreground/50",
        disabled && "pointer-events-none opacity-50",
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
            拖拽一个或多个文件到此处，或点击选择文件
          </p>
          <p className="text-xs text-muted-foreground/50 mt-2">
            支持批量上传 .dmg, .exe, .apk, .nsp 等格式
          </p>
        </div>
      )}
    </div>
  )
}
