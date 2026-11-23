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
import { ArrowLeft, RefreshCw, Loader2, HardDrive, FolderInput, FolderPlus, X } from "lucide-react"
import { api, type ImportJob, type ImportMode, type ImportResult, type StorageInfo } from "@/services/api"
import { PathPicker } from "@/components/PathPicker"
import { formatFileSize } from "@/lib/utils"
import { platformConfig } from "@/lib/theme"

interface ScanResult {
  message: string
  scanned: number
  created: number
  updated: number
  errors: string[]
}

const importPhaseLabel: Record<ImportJob["phase"], string> = {
  queued: "等待当前磁盘任务完成",
  preparing: "统计源目录文件",
  copying: "跨卷复制文件",
  indexing: "登记资源",
  cleanup: "清理源卷暂存目录",
  rollback: "恢复源目录",
  complete: "导入完成",
  failed: "导入失败",
}

export function Admin() {
  const navigate = useNavigate()
  const { resources, loading, fetchResources } = useResourceStore()
  const [selectedPlatform, setSelectedPlatform] = useState<string>("mac")
  const [isScanning, setIsScanning] = useState(false)
  const [scanResult, setScanResult] = useState<ScanResult | null>(null)

  // 资源路径设置
  const [storage, setStorage] = useState<StorageInfo | null>(null)
  const [picker, setPicker] = useState<null | "library" | "import" | "scan">(null)
  const [pathBusy, setPathBusy] = useState(false)
  const [pathError, setPathError] = useState("")
  const [importPlatform, setImportPlatform] = useState("")
  const [importMode, setImportMode] = useState<ImportMode>("files")
  const [importJob, setImportJob] = useState<ImportJob | null>(null)
  const [importStatusError, setImportStatusError] = useState(false)
  const activeImportId = importJob && !["complete", "failed"].includes(importJob.phase) ? importJob.id : null
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

  useEffect(() => {
    let disposed = false
    let timer: ReturnType<typeof setTimeout>
    const readJob = async () => {
      try {
        const job = await api.getCurrentImport()
        if (disposed) return
        setImportStatusError(false)
        if (!activeImportId) {
          if (job && !["complete", "failed"].includes(job.phase)) {
            setImportJob(job)
            setPicker("import")
          }
          return
        }
        if (!job || job.id !== activeImportId) {
          setImportJob(null)
          setPathError("暂时找不到这笔任务，请检查源目录和目标目录后再试")
          return
        }
        setImportJob(job)
        if (job.phase === "complete") {
          setImportResult(job.result ?? null)
          setPicker(null)
          void loadStorage()
          void fetchResources()
          return
        }
        if (job.phase === "failed") {
          setPathError(job.error ?? "导入失败")
          return
        }
      } catch {
        if (disposed) return
        if (!activeImportId) return
        setImportStatusError(true)
      }
      timer = setTimeout(readJob, 1000)
    }
    void readJob()
    return () => {
      disposed = true
      clearTimeout(timer)
    }
  }, [activeImportId, fetchResources])

  const handleRemoveScanRoot = async (path: string) => {
    setPathBusy(true)
    setPathError("")
    try {
      setStorage(await api.removeScanRoot(path))
    } catch (error) {
      setPathError(error instanceof Error ? error.message : "移除失败")
    } finally {
      setPathBusy(false)
    }
  }

  const openImportPicker = () => {
    setImportPlatform("")
    setImportMode("files")
    setPathError("")
    setImportResult(null)
    setImportJob(null)
    setPicker("import")
  }

  const handlePickPath = async (path: string) => {
    setPathBusy(true)
    setPathError("")
    try {
      if (picker === "library") {
        const info = await api.setLibraryRoot(path)
        setStorage(info)
        await fetchResources()
      } else if (picker === "scan") {
        setStorage(await api.addScanRoot(path))
      } else {
        setImportJob(await api.startImport(path, importPlatform, importMode))
        return
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
            </div>
          </div>

          {pathError && <p className="mt-3 text-sm text-destructive">{pathError}</p>}

          {importResult && (
            <div className="mt-3 rounded-md border bg-muted/40 p-3 text-sm">
              <p className="font-medium">导入完成</p>
              <p className="mt-1 text-muted-foreground">
                已导入 {importResult.moved} 个文件，入库新增{" "}
                {importResult.created}、更新 {importResult.updated}。
              </p>
              <p className="mt-1 break-all font-mono text-xs">{importResult.destination}</p>
              {importResult.errors.length > 0 && (
                <p className="mt-1 text-destructive">{importResult.errors[0]}</p>
              )}
            </div>
          )}
        </div>

        <PathPicker
          open={picker !== null}
          title={
            picker === "library" ? "更改资源目录" : picker === "scan" ? "添加扫描目录" : "从 NAS 导入"
          }
          confirmLabel={
            picker === "library" ? "使用此目录" : picker === "scan" ? "添加为扫描目录" : "移动并导入"
          }
          initialPath={
            picker === "library" ? storage?.library_root : storage?.volumes[0] || "/vol2"
          }
          hint={
            picker === "library"
              ? "扫描、上传、导入都会使用这个目录"
              : picker === "scan"
                ? "文件留在原处，只登记到资源库"
                : "选择源目录和目标平台。移动完成后，原目录会被移除。"
          }
          busy={pathBusy || !!activeImportId}
          confirmDisabled={picker === "import" && !importPlatform}
          volumes={storage?.volumes}
          onClose={() => setPicker(null)}
          onConfirm={handlePickPath}
        >
          {picker === "import" && (
            <div className="space-y-3 border-t px-5 py-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="import-platform">目标平台</Label>
                  <Select value={importPlatform} onValueChange={setImportPlatform} disabled={pathBusy || !!activeImportId}>
                    <SelectTrigger id="import-platform"><SelectValue placeholder="选择平台" /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(platformConfig).map(([key, config]) => (
                        <SelectItem key={key} value={key}>{config.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="import-mode">登记方式</Label>
                  <Select value={importMode} onValueChange={(value: ImportMode) => setImportMode(value)} disabled={pathBusy || !!activeImportId}>
                    <SelectTrigger id="import-mode"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="files">逐文件登记</SelectItem>
                      <SelectItem value="folder">整目录作为一条资源</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <p className="text-xs text-muted-foreground break-all">
                {importPlatform && `${storage?.library_root_host ?? ""}/${importPlatform[0].toUpperCase()}${importPlatform.slice(1)}/ · `}
                {importMode === "folder" ? "保留目录结构，适用于便携应用。下载时打包为 ZIP。" : "保留目录结构，所有文件都归入所选平台。"}
              </p>
              {activeImportId && importJob && (
                <div className="space-y-2 rounded-md bg-muted p-3 text-sm">
                  <div role="status" className="flex flex-wrap justify-between gap-1">
                    <span className="font-medium">{importPhaseLabel[importJob.phase]}</span>
                    {importJob.phase === "copying" && (
                      <span className="tabular-nums">
                        {formatFileSize(importJob.bytes_done)} / {formatFileSize(importJob.bytes_total)}
                        {importJob.bytes_total > 0 && ` · ${Math.min(100, importJob.bytes_done / importJob.bytes_total * 100).toFixed(1)}%`}
                      </span>
                    )}
                  </div>
                  <progress
                    aria-label={importPhaseLabel[importJob.phase]}
                    className="block h-2 w-full accent-primary"
                    max={importJob.phase === "indexing" ? importJob.registration_total || 1 : importJob.bytes_total || 1}
                    value={importJob.phase === "indexing" ? importJob.registered ?? 0 :
                      importJob.phase === "copying" && importJob.bytes_total ? importJob.bytes_done : undefined}
                  />
                  {importJob.phase === "copying" && (
                    <p className="text-xs text-muted-foreground">已复制 {importJob.files_done} / {importJob.files_total} 个文件</p>
                  )}
                  {importJob.phase === "indexing" && (
                    <p className="text-xs text-muted-foreground">已登记 {importJob.registered} / {importJob.registration_total} 项</p>
                  )}
                  <p className="break-all text-xs text-muted-foreground">源目录 {importJob.source}</p>
                  {importJob.current_file && <p className="break-all text-xs text-muted-foreground">{importJob.current_file}</p>}
                  {importStatusError && <p className="text-xs text-muted-foreground">进度连接暂时中断，正在重新连接。</p>}
                </div>
              )}
              {pathError && <p role="alert" className="text-sm text-destructive">{pathError}</p>}
            </div>
          )}
        </PathPicker>

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
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-xl font-semibold">目录扫描</h2>
              <Button size="sm" onClick={openImportPicker} disabled={!storage || pathBusy || !!activeImportId || isScanning}>
                <FolderInput className="mr-2 h-4 w-4" />
                从 NAS 移动导入
              </Button>
            </div>
            <p className="text-sm text-muted-foreground">开始扫描会更新下列目录的资源记录。移动导入会将所选文件夹迁入资源目录。</p>

            <div className="rounded-lg border bg-card p-3 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">扫描目录</span>
                <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setPicker("scan")}>
                  <FolderPlus className="mr-1.5 h-3.5 w-3.5" />
                  添加目录
                </Button>
              </div>
              <ul className="mt-2 space-y-1">
                <li className="flex items-center gap-2 text-muted-foreground">
                  <span className="truncate font-mono text-xs">{storage?.library_root_host || "…"}</span>
                  <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[11px]">资源目录</span>
                </li>
                {storage?.scan_roots.map((root) => (
                  <li key={root.path} className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate font-mono text-xs" title={root.host_path}>
                      {root.host_path}
                    </span>
                    <button
                      type="button"
                      className="shrink-0 rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                      onClick={() => handleRemoveScanRoot(root.path)}
                      aria-label="移除该扫描目录"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            </div>

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
