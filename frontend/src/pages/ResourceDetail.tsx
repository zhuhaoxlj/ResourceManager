import { useEffect, useRef, useState } from "react"
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
  const [nameDraft, setNameDraft] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [editError, setEditError] = useState("")
  const coverInput = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (id) {
      fetchResource(parseInt(id))
    }
    return () => {
      clearCurrentResource()
    }
  }, [id, fetchResource, clearCurrentResource])

  const saveName = async () => {
    if (!currentResource || nameDraft === null) return
    const name = nameDraft.trim()
    if (!name) {
      setEditError("名称不能为空")
      return
    }
    setSaving(true)
    setEditError("")
    try {
      await api.updateResource(currentResource.id, { name })
      setNameDraft(null)
      await fetchResource(currentResource.id)
    } catch (error) {
      setEditError(error instanceof Error ? error.message : "保存失败")
    } finally {
      setSaving(false)
    }
  }

  const uploadCover = async (file: File | undefined) => {
    if (!currentResource || !file) return
    setSaving(true)
    setEditError("")
    try {
      await api.uploadCover(file, currentResource.id)
      await fetchResource(currentResource.id)
    } catch (error) {
      setEditError(error instanceof Error ? error.message : "上传封面失败")
    } finally {
      setSaving(false)
      if (coverInput.current) coverInput.current.value = ""
    }
  }

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
  const game = resource.switch_details

  const details = [
    { label: "平台", value: PLATFORM_LABELS[resource.platform] || resource.platform },
    { label: "分类", value: resource.category || (game?.genres.join("、") || "未分类") },
    game && { label: "文件格式", value: game.format },
    game?.title_id && { label: "Title ID", value: game.title_id, mono: true },
    game?.kind && { label: "内容类型", value: { base: "本体", update: "更新补丁", DLC: "DLC" }[game.kind] },
    game?.content_version != null && { label: "内容版本号", value: String(game.content_version) },
    game?.publisher && { label: "发行商", value: game.publisher },
    game?.developer && { label: "开发商", value: game.developer },
    game?.release_date && { label: "发行日期", value: game.release_date },
    game?.players && { label: "支持人数", value: `${game.players} 人` },
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
            <div className={`${game ? "aspect-video" : "aspect-square"} rounded-2xl overflow-hidden ${icon && (isAndroid || isMac) ? "bg-white" : "bg-muted"}`}>
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
              {nameDraft === null ? (
                <h1 className="text-3xl font-bold mb-2">{resource.name}</h1>
              ) : (
                <form
                  className="mb-2 flex flex-wrap items-center gap-2"
                  onSubmit={(event) => {
                    event.preventDefault()
                    void saveName()
                  }}
                >
                  <label className="sr-only" htmlFor="resource-name">资源名称</label>
                  <input
                    id="resource-name"
                    className="min-w-0 flex-1 rounded-md border bg-background px-3 py-2 text-xl font-semibold"
                    value={nameDraft}
                    onChange={(event) => setNameDraft(event.target.value)}
                    disabled={saving}
                    autoFocus
                  />
                  <Button type="submit" size="sm" disabled={saving || !nameDraft.trim()}>保存</Button>
                  <Button type="button" size="sm" variant="ghost" disabled={saving} onClick={() => { setNameDraft(null); setEditError("") }}>取消</Button>
                </form>
              )}
              <p className="text-muted-foreground">
                {PLATFORM_LABELS[resource.platform] || resource.platform}
                {resource.package_name ? ` · ${resource.package_name}` : ""}
                {resource.architectures ? ` · ${resource.architectures.split(",").join("/")}` : ""}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Button variant="ghost" size="sm" disabled={saving} onClick={() => setNameDraft(resource.name)}>
                  重命名
                </Button>
                <Button variant="ghost" size="sm" disabled={saving} onClick={() => coverInput.current?.click()}>
                  上传封面
                </Button>
                <input
                  ref={coverInput}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  className="hidden"
                  onChange={(event) => void uploadCover(event.target.files?.[0])}
                />
              </div>
              {game && !game.title_id && (
                <p className="mt-2 text-xs text-muted-foreground">
                  未从文件或文件名识别到 Title ID，无法匹配商店资料。可以把文件名改成 <code>游戏名 [0100XXXXXXXXXXXX].xci</code>，或手动上传封面、重命名。
                </p>
              )}
              {game?.title_id && !icon && (
                <p className="mt-2 text-xs text-muted-foreground">
                  商店目录里没有这个 Title ID 的封面，可以手动上传一张。
                </p>
              )}
              {editError && <p role="alert" className="mt-2 text-sm text-destructive">{editError}</p>}
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
