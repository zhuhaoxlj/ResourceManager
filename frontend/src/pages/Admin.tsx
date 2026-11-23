import { useEffect, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import { useResourceStore } from "@/store/resourceStore"
import { FileDropZone } from "@/components/FileDropZone"
import { UploadQueue, type UploadItem } from "@/components/UploadQueue"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { ArrowLeft, RefreshCw, Loader2, HardDrive, FolderInput } from "lucide-react"
import { api, type ImportResult, type StorageInfo } from "@/services/api"
import { PathPicker } from "@/components/PathPicker"
import { platformConfig } from "@/lib/theme"

interface ScanResult {
  message: string
  scanned: number
  created: number
  updated: number
  errors: string[]
}

export function Admin() {
  const navigate = useNavigate()
  const { resources, loading, fetchResources } = useResourceStore()
  const [selectedPlatform, setSelectedPlatform] = useState<string>("mac")
  const [isScanning, setIsScanning] = useState(false)
  const [scanResult, setScanResult] = useState<ScanResult | null>(null)

  // 资源路径设置
  const [storage, setStorage] = useState<StorageInfo | null>(null)
  const [picker, setPicker] = useState<null | "library" | "import">(null)
  const [pathBusy, setPathBusy] = useState(false)
  const [pathError, setPathError] = useState("")
  const [importResult, setImportResult] = useState<ImportResult | null>(null)

  // 上传队列
  const [queue, setQueue] = useState<UploadItem[]>([])
  const queueRef = useRef<UploadItem[]>([])
  const processingRef = useRef(false)
  const abortMapRef = useRef<Record<string, AbortController>>({})
  const percentMapRef = useRef<Record<string, number>>({})

  useEffect(() => {
    fetchResources()
  }, [fetchResources])

  const loadStorage = async () => {
    try {
      setStorage(await api.getStorage())
    } catch (error) {
      setPathError(error instanceof Error ? error.message : "读取路径信息失败")
    }
  }

  useEffect(() => {
    loadStorage()
  }, [])

  const handlePickPath = async (path: string) => {
    setPathBusy(true)
    setPathError("")
    try {
      if (picker === "library") {
        const info = await api.setLibraryRoot(path)
        setStorage(info)
        await fetchResources()
      } else {
        const result = await api.importFromPath(path)
        setImportResult(result)
        await loadStorage()
        await fetchResources()
      }
      setPicker(null)
    } catch (error) {
      setPathError(error instanceof Error ? error.message : "操作失败")
    } finally {
      setPathBusy(false)
    }
  }

  // 队列状态同时保存在 ref 里，异步上传循环里始终能读到最新值
  const setItems = (next: UploadItem[]) => {
    queueRef.current = next
    setQueue(next)
  }

  const updateItem = (id: string, patch: Partial<UploadItem>) => {
    setItems(queueRef.current.map((item) => (item.id === id ? { ...item, ...patch } : item)))
  }

  const getItem = (id: string) => queueRef.current.find((item) => item.id === id)

  // 依次处理队列里所有 pending 的文件
  const processQueue = async () => {
    if (processingRef.current) return
    processingRef.current = true
    try {
      for (;;) {
        const next = queueRef.current.find((item) => item.status === "pending")
        if (!next) break
        await processItem(next.id)
      }
    } finally {
      processingRef.current = false
    }
  }

  const processItem = async (id: string) => {
    const item = getItem(id)
    if (!item) return

    updateItem(id, { status: "checking", error: undefined, note: undefined })

    // 检查同名资源（仅做提示，不阻断上传）
    let note: string | undefined
    try {
      const { exists, resource } = await api.checkFileExists(item.file.name, item.platform)
      if (exists && resource) {
        note = `同名资源「${resource.name}」已存在，本次将新增版本`
      }
    } catch {
      // 检查失败不影响上传
    }

    if (getItem(id)?.status === "cancelled") return

    const controller = new AbortController()
    abortMapRef.current[id] = controller
    percentMapRef.current[id] = 0

    updateItem(id, {
      status: "uploading",
      note,
      progress: { loaded: 0, total: item.file.size, percent: 0 },
    })

    try {
      await api.uploadFile(item.file, item.platform, {
        signal: controller.signal,
        onProgress: (progress) => {
          // 进度事件很密，按百分比变化节流
          if (progress.percent !== percentMapRef.current[id]) {
            percentMapRef.current[id] = progress.percent
            updateItem(id, { progress })
          }
        },
      })
      if (getItem(id)?.status !== "cancelled") {
        updateItem(id, {
          status: "success",
          progress: { loaded: item.file.size, total: item.file.size, percent: 100 },
        })
        fetchResources()
      }
    } catch (error) {
      if (controller.signal.aborted) {
        updateItem(id, { status: "cancelled" })
      } else {
        updateItem(id, {
          status: "error",
          error: error instanceof Error ? error.message : "上传失败",
        })
      }
    } finally {
      delete abortMapRef.current[id]
      delete percentMapRef.current[id]
    }
  }

  // 拖入多个文件：全部入队后逐个上传
  const handleFileDrop = (files: File[]) => {
    if (files.length === 0) return

    const items: UploadItem[] = files.map((file) => ({
      id: `${file.name}-${file.size}-${file.lastModified}-${Math.random().toString(36).slice(2, 8)}`,
      file,
      platform: selectedPlatform,
      status: "pending",
    }))

    setItems([...queueRef.current, ...items])
    void processQueue()
  }

  const handleCancelItem = (id: string) => {
    const item = getItem(id)
    if (!item) return
    if (item.status === "uploading") {
      abortMapRef.current[id]?.abort()
    } else {
      updateItem(id, { status: "cancelled" })
    }
  }

  const handleCancelAll = () => {
    Object.values(abortMapRef.current).forEach((controller) => controller.abort())
    setItems(
      queueRef.current.map((item) =>
        item.status === "pending" || item.status === "checking" || item.status === "uploading"
          ? { ...item, status: "cancelled" }
          : item
      )
    )
  }

  const handleRetry = (id: string) => {
    updateItem(id, { status: "pending", error: undefined })
    void processQueue()
  }

  const handleRemove = (id: string) => {
    setItems(queueRef.current.filter((item) => item.id !== id))
  }

  const handleClearFinished = () => {
    setItems(
      queueRef.current.filter(
        (item) => item.status !== "success" && item.status !== "error" && item.status !== "cancelled"
      )
    )
  }

  const handleScan = async () => {
    setIsScanning(true)
    setScanResult(null)
    try {
      const result = (await api.triggerScan()) as ScanResult
      setScanResult(result)
      fetchResources()
    } catch (error) {
      setScanResult({
        message: "扫描失败",
        scanned: 0,
        created: 0,
        updated: 0,
        errors: [error instanceof Error ? error.message : "未知错误"],
      })
    } finally {
      setIsScanning(false)
    }
  }

  const handleDelete = async (id: number) => {
    if (!confirm("确定要删除此资源吗？")) return

    try {
      await api.deleteResource(id)
      fetchResources()
    } catch (error) {
      console.error("删除失败", error)
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <Button
            variant="ghost"
            onClick={() => navigate("/")}
            className="mb-4"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            返回首页
          </Button>
          <h1 className="text-3xl font-bold">管理页面</h1>
        </div>

        {/* 资源路径 */}
        <div className="mb-8 rounded-lg border bg-card p-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-1">
              <h2 className="flex items-center gap-2 text-base font-semibold">
                <HardDrive className="h-4 w-4 text-muted-foreground" />
                资源路径
              </h2>
              <p className="text-sm text-muted-foreground">
                资源目录：
                <span className="ml-1 font-mono text-foreground">
                  {storage?.library_root_host || "加载中…"}
                </span>
                {storage && (
                  <span className="ml-2 text-xs text-muted-foreground/70">
                    容器内 {storage.library_root}
                  </span>
                )}
              </p>
              <p className="text-sm text-muted-foreground">
                上传与导入保存到：
                <span className="ml-1 font-mono text-foreground">
                  {storage?.upload_template || "…"}
                </span>
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => setPicker("library")}>
                更改资源目录
              </Button>
              <Button size="sm" onClick={() => setPicker("import")}>
                <FolderInput className="mr-2 h-4 w-4" />
                从 NAS 导入…
              </Button>
            </div>
          </div>

          {pathError && <p className="mt-3 text-sm text-destructive">{pathError}</p>}

          {importResult && (
            <div className="mt-3 rounded-md border bg-muted/40 p-3 text-sm">
              <p className="font-medium">导入完成</p>
              <p className="mt-1 text-muted-foreground">
                移动 {importResult.moved} 个文件，跳过 {importResult.skipped} 个；扫描入库 新增{" "}
                {importResult.created}、更新 {importResult.updated}。
              </p>
              {importResult.errors.length > 0 && (
                <p className="mt-1 text-destructive">失败 {importResult.errors.length} 个：{importResult.errors[0]}</p>
              )}
            </div>
          )}
        </div>

        <PathPicker
          open={picker !== null}
          title={picker === "library" ? "更改资源目录" : "从 NAS 导入"}
          confirmLabel={picker === "library" ? "使用此目录" : "导入到此目录"}
          initialPath={
            picker === "library"
              ? storage?.library_root
              : storage?.volumes[0] || "/vol2"
          }
          hint={
            picker === "library"
              ? "扫描、上传、导入都会使用这个目录"
              : "导入会把目录里的安装包移动到资源目录的对应平台子目录，然后重新扫描"
          }
          busy={pathBusy}
          onClose={() => setPicker(null)}
          onConfirm={handlePickPath}
        />

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-12">
          {/* 上传区域 */}
          <div className="space-y-4">
            <h2 className="text-xl font-semibold">上传文件</h2>

            <div className="space-y-2">
              <Label>选择平台</Label>
              <Select value={selectedPlatform} onValueChange={setSelectedPlatform}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(platformConfig).map(([key, config]) => (
                    <SelectItem key={key} value={key}>
                      {config.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                平台在拖入时确定，队列中的文件沿用入队时的平台
              </p>
            </div>

            <FileDropZone onDrop={handleFileDrop} />

            <UploadQueue
              items={queue}
              onCancel={handleCancelItem}
              onRemove={handleRemove}
              onRetry={handleRetry}
              onClearFinished={handleClearFinished}
              onCancelAll={handleCancelAll}
            />
          </div>

          {/* 扫描区域 */}
          <div className="space-y-4">
            <h2 className="text-xl font-semibold">目录扫描</h2>
            <p className="text-muted-foreground text-sm">
              扫描资源目录，自动识别新文件并更新数据库
            </p>
            <Button
              onClick={handleScan}
              disabled={isScanning}
              className="w-full"
            >
              {isScanning ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  扫描中...
                </>
              ) : (
                <>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  开始扫描
                </>
              )}
            </Button>

            {scanResult && (
              <div className="p-4 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
                <h3 className="font-semibold text-blue-900 dark:text-blue-100 mb-2">扫描结果</h3>
                <div className="space-y-1 text-sm text-blue-800 dark:text-blue-200">
                  <p>📁 扫描文件：<span className="font-semibold">{scanResult.scanned}</span> 个</p>
                  <p>✨ 新增资源：<span className="font-semibold">{scanResult.created}</span> 个</p>
                  <p>🔄 更新资源：<span className="font-semibold">{scanResult.updated}</span> 个</p>
                  {scanResult.errors.length > 0 && (
                    <p className="text-red-600 dark:text-red-400">
                      ⚠️ 错误：{scanResult.errors.length} 个
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* 资源列表 */}
        <div>
          <h2 className="text-xl font-semibold mb-4">资源列表 ({resources.length})</h2>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : resources.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground border rounded-lg border-dashed">
              <p>暂无资源</p>
              <p className="text-sm mt-2">上传文件或扫描目录以添加资源</p>
            </div>
          ) : (
            <div className="space-y-2">
              {resources.map((resource) => (
                <div
                  key={resource.id}
                  className="flex items-center justify-between p-4 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
                >
                  <div className="flex-1">
                    <div className="font-medium">{resource.name}</div>
                    <div className="text-sm text-muted-foreground">
                      {resource.platform} · {resource.versions.length} 个版本
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => navigate(`/resource/${resource.id}`)}
                    >
                      查看详情
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => handleDelete(resource.id)}
                    >
                      删除
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
