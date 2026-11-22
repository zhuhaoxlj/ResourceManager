import { Resource, api } from "@/services/api"
import { Card, CardContent, CardFooter } from "./ui/card"
import { Button } from "./ui/button"
import { formatFileSize } from "@/lib/utils"
import { Download, FileText } from "lucide-react"

interface ResourceCardProps {
  resource: Resource
  onClick: () => void
  onDownload?: () => void
}

const PLACEHOLDER_COLORS = [
  "from-sky-500/20 to-indigo-500/20 text-sky-700 dark:text-sky-300",
  "from-emerald-500/20 to-teal-500/20 text-emerald-700 dark:text-emerald-300",
  "from-amber-500/20 to-orange-500/20 text-amber-700 dark:text-amber-300",
  "from-rose-500/20 to-pink-500/20 text-rose-700 dark:text-rose-300",
  "from-violet-500/20 to-purple-500/20 text-violet-700 dark:text-violet-300",
]

function placeholderColor(name: string): string {
  let hash = 0
  for (let i = 0; i < name.length; i += 1) {
    hash = (hash * 31 + name.charCodeAt(i)) % 997
  }
  return PLACEHOLDER_COLORS[hash % PLACEHOLDER_COLORS.length]
}

export function ResourceCard({ resource, onClick, onDownload }: ResourceCardProps) {
  const latestVersion = resource.versions[0]
  const icon = api.assetUrl(resource.cover_image)
  const isAndroid = resource.platform === "android"
  const isMac = resource.platform === "mac"
  const isAppIcon = !!icon && (isAndroid || isMac)
  const platformLabel =
    { android: "Android", mac: "macOS", windows: "Windows", switch: "Switch" }[resource.platform] ||
    resource.platform
  const versionText = resource.app_version || latestVersion?.version

  return (
    <Card className="group overflow-hidden transition-all hover:shadow-lg cursor-pointer">
      <div
        className={`w-full overflow-hidden relative ${isAppIcon ? "h-40 sm:h-44 bg-white" : "aspect-square bg-muted"}`}
        onClick={onClick}
      >
        {icon ? (
          <img
            src={icon}
            alt={resource.name}
            loading="lazy"
            className={
              isAppIcon
                ? "h-full w-full object-contain transition-transform group-hover:scale-105"
                : "h-full w-full object-cover transition-transform group-hover:scale-105"
            }
          />
        ) : (
          <div className={`flex h-full w-full items-center justify-center bg-gradient-to-br ${placeholderColor(resource.name)}`}>
            {isAndroid ? (
              <span className="text-6xl font-bold tracking-tight">
                {resource.name.trim().slice(0, 1).toUpperCase() || "?"}
              </span>
            ) : (
              <FileText className="h-16 w-16 text-muted-foreground/50" />
            )}
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>
      <CardContent className="p-3" onClick={onClick}>
        <h3 className="font-semibold text-sm truncate" title={resource.name}>
          {resource.name}
        </h3>
        <p className="text-xs text-muted-foreground mt-0.5 truncate">
          {resource.category || (resource.package_name ? `${platformLabel} 应用` : "未分类")}
        </p>
        {latestVersion && (
          <p className="text-[11px] text-muted-foreground mt-1 truncate">
            v{versionText}
            {latestVersion.file_size && ` · ${formatFileSize(latestVersion.file_size)}`}
          </p>
        )}
      </CardContent>
      <CardFooter className="p-3 pt-0">
        <Button
          variant="outline"
          size="sm"
          className="w-full h-8 text-xs"
          onClick={(e) => {
            e.stopPropagation()
            if (onDownload) onDownload()
          }}
        >
          <Download className="h-3.5 w-3.5 mr-1.5" />
          下载
        </Button>
      </CardFooter>
    </Card>
  )
}
