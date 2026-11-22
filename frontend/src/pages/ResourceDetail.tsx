import { useEffect } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { useResourceStore } from "@/store/resourceStore"
import { VersionList } from "@/components/VersionList"
import { Button } from "@/components/ui/button"
import { ArrowLeft, Loader2, FileText } from "lucide-react"
import { api } from "@/services/api"
import { formatFileSize, formatDate } from "@/lib/utils"

const PLATFORM_LABELS: Record<string, string> = {
  android: "Android",
  windows: "Windows",
  mac: "macOS",
  switch: "Switch",
}

export function ResourceDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { currentResource, loading, fetchResource, clearCurrentResource } = useResourceStore()

  useEffect(() => {
    if (id) {
      fetchResource(parseInt(id))
    }
    return () => {
      clearCurrentResource()
    }
  }, [id, fetchResource, clearCurrentResource])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!currentResource) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-xl font-semibold mb-4">资源不存在</h2>
          <Button onClick={() => navigate(-1)}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            返回
          </Button>
        </div>
      </div>
    )
  }

  const resource = currentResource
  const latestVersion = resource.versions[0]
  const icon = api.assetUrl(resource.cover_image)
  const isAndroid = resource.platform === "android"
  const isMac = resource.platform === "mac"

  const details = [
    { label: "平台", value: PLATFORM_LABELS[resource.platform] || resource.platform },
    { label: "分类", value: resource.category || "未分类" },
    resource.package_name && {
      label: isMac ? "Bundle ID" : "包名",
      value: resource.package_name,
      mono: true,
    },
    (resource.app_version || latestVersion?.version) && {
      label: "版本",
      value: `v${resource.app_version || latestVersion?.version}`,
    },
    resource.version_code && {
      label: isMac ? "构建号" : "versionCode",
      value: resource.version_code,
    },
    resource.min_sdk && {
      label: isMac ? "最低 macOS" : "最低 Android",
      value: isMac
        ? resource.min_sdk
        : `API ${resource.min_sdk}${resource.target_sdk ? ` / 目标 API ${resource.target_sdk}` : ""}`,
    },
    resource.architectures && { label: "CPU 架构", value: resource.architectures.split(",").join("、") },
    !isMac &&
      resource.permissions_count !== null &&
      resource.permissions_count !== undefined && {
        label: "权限数量",
        value: `${resource.permissions_count} 项`,
      },
    latestVersion?.file_size && {
      label: "文件大小",
      value: formatFileSize(latestVersion.file_size),
    },
    latestVersion?.upload_date && {
      label: "最近更新",
      value: formatDate(latestVersion.upload_date),
    },
  ].filter(Boolean) as { label: string; value: string; mono?: boolean }[]

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8">
        <Button
          variant="ghost"
          onClick={() => navigate(-1)}
          className="mb-8"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          返回
        </Button>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-1">
            <div className={`aspect-square rounded-2xl overflow-hidden ${icon && (isAndroid || isMac) ? "bg-white" : "bg-muted"}`}>
              {icon ? (
                <img
                  src={icon}
                  alt={resource.name}
                  className="h-full w-full object-contain"
                />
              ) : (
                <div className="flex h-full items-center justify-center">
                  {isAndroid ? (
                    <span className="text-8xl font-bold text-muted-foreground/60">
                      {resource.name.trim().slice(0, 1).toUpperCase() || "?"}
                    </span>
                  ) : (
                    <FileText className="h-32 w-32 text-muted-foreground/50" />
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="lg:col-span-2 space-y-6">
            <div>
              <h1 className="text-3xl font-bold mb-2">{resource.name}</h1>
              <p className="text-muted-foreground">
                {PLATFORM_LABELS[resource.platform] || resource.platform}
                {resource.package_name ? ` · ${resource.package_name}` : ""}
                {resource.architectures ? ` · ${resource.architectures.split(",").join("/")}` : ""}
              </p>
            </div>

            <div className="rounded-xl border bg-card">
              <dl className="divide-y">
                {details.map((item) => (
                  <div key={item.label} className="grid grid-cols-[6rem_1fr] gap-4 px-4 py-3">
                    <dt className="text-sm text-muted-foreground">{item.label}</dt>
                    <dd className={`text-sm break-all ${item.mono ? "font-mono" : ""}`}>{item.value}</dd>
                  </div>
                ))}
              </dl>
            </div>

            {resource.description && (
              <div>
                <h2 className="text-lg font-semibold mb-2">简介</h2>
                <p className="text-muted-foreground whitespace-pre-wrap">{resource.description}</p>
              </div>
            )}

            <div>
              <h2 className="text-lg font-semibold mb-4">版本历史</h2>
              <VersionList
                versions={resource.versions}
                resourceName={resource.name}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
