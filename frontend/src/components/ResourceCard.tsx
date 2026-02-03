import { Resource } from "@/services/api"
import { Card, CardContent, CardFooter } from "./ui/card"
import { Button } from "./ui/button"
import { formatFileSize } from "@/lib/utils"
import { Download, FileText } from "lucide-react"

interface ResourceCardProps {
  resource: Resource
  onClick: () => void
  onDownload?: () => void
}

export function ResourceCard({ resource, onClick, onDownload }: ResourceCardProps) {
  const latestVersion = resource.versions[0]
  const coverImage = resource.cover_image || "/placeholder.png"

  return (
    <Card className="group overflow-hidden transition-all hover:shadow-lg cursor-pointer">
      <div
        className="aspect-square w-full overflow-hidden bg-muted relative"
        onClick={onClick}
      >
        {resource.cover_image ? (
          <img
            src={coverImage}
            alt={resource.name}
            className="h-full w-full object-cover transition-transform group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full items-center justify-center">
            <FileText className="h-16 w-16 text-muted-foreground/50" />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>
      <CardContent className="p-4" onClick={onClick}>
        <h3 className="font-semibold text-lg truncate">{resource.name}</h3>
        <p className="text-sm text-muted-foreground mt-1">
          {resource.category || "未分类"}
        </p>
        {latestVersion && (
          <p className="text-xs text-muted-foreground mt-2">
            v{latestVersion.version}
            {latestVersion.file_size && ` · ${formatFileSize(latestVersion.file_size)}`}
          </p>
        )}
      </CardContent>
      <CardFooter className="p-4 pt-0">
        <Button
          variant="outline"
          size="sm"
          className="w-full"
          onClick={(e) => {
            e.stopPropagation()
            if (onDownload) onDownload()
          }}
        >
          <Download className="h-4 w-4 mr-2" />
          下载
        </Button>
      </CardFooter>
    </Card>
  )
}
