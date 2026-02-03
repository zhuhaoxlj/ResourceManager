import { Version } from "@/services/api"
import { Button } from "./ui/button"
import { Download } from "lucide-react"
import { formatFileSize, formatDate } from "@/lib/utils"
import { api } from "@/services/api"

interface VersionListProps {
  versions: Version[]
  resourceName: string
}

export function VersionList({ versions, resourceName }: VersionListProps) {
  const handleDownload = (version: Version) => {
    const url = api.downloadFile(version.id)
    const link = document.createElement("a")
    link.href = url
    link.download = `${resourceName}_v${version.version}`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  if (versions.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        暂无版本记录
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {versions.map((version) => (
        <div
          key={version.id}
          className="flex items-center justify-between p-4 rounded-lg border bg-card"
        >
          <div className="flex-1">
            <div className="font-medium">v{version.version}</div>
            <div className="text-sm text-muted-foreground mt-1">
              {formatDate(version.upload_date)}
              {version.file_size && ` · ${formatFileSize(version.file_size)}`}
            </div>
          </div>
          <Button
            size="sm"
            onClick={() => handleDownload(version)}
          >
            <Download className="h-4 w-4 mr-2" />
            下载
          </Button>
        </div>
      ))}
    </div>
  )
}
