import { useEffect, useState, useRef } from "react"
import { useNavigate } from "react-router-dom"
import { useResourceStore } from "@/store/resourceStore"
import { FileDropZone } from "@/components/FileDropZone"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { ArrowLeft, RefreshCw, Loader2, AlertTriangle } from "lucide-react"
import { api, UploadProgress, Resource } from "@/services/api"
import { platformConfig } from "@/lib/theme"

interface ScanResult {
  message: string
  scanned: number
  created: number
  updated: number
  errors: string[]
}

type UploadStatus = "idle" | "checking" | "confirm-overwrite" | "uploading" | "success" | "error"

export function Admin() {
  const navigate = useNavigate()
  const { resources, loading, fetchResources } = useResourceStore()
  const [selectedPlatform, setSelectedPlatform] = useState<string>("mac")
  const [isScanning, setIsScanning] = useState(false)
  const [scanResult, setScanResult] = useState<ScanResult | null>(null)

  // 上传状态
  const [uploadStatus, setUploadStatus] = useState<UploadStatus>("idle")
  const [uploadProgress, setUploadProgress] = useState<UploadProgress | undefined>()
  const [uploadFileName, setUploadFileName] = useState<string>("")
  const [uploadError, setUploadError] = useState<string>("")
  const [existingResource, setExistingResource] = useState<Resource | null>(null)
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const abortControllerRef = useRef<AbortController | null>(null)

  useEffect(() => {
    fetchResources()
  }, [fetchResources])

  // 重置上传状态
  const resetUploadState = () => {
    setUploadStatus("idle")
    setUploadProgress(undefined)
    setUploadFileName("")
    setUploadError("")
    setExistingResource(null)
    setPendingFile(null)
    abortControllerRef.current?.abort()
    abortControllerRef.current = null
  }

  // 检查文件是否已存在
  const checkFileExists = async (file: File, platform: string) => {
    setUploadStatus("checking")
    setUploadFileName(file.name)

    const { exists, resource } = await api.checkFileExists(file.name, platform)

    if (exists && resource) {
      setExistingResource(resource)
      setPendingFile(file)
      setUploadStatus("confirm-overwrite")
    } else {
      // 文件不存在，直接上传
      startUpload(file, platform)
    }
  }

  // 开始上传
  const startUpload = async (file: File, platform: string) => {
    setUploadStatus("uploading")
    setUploadFileName(file.name)
    setUploadProgress({ loaded: 0, total: file.size, percent: 0 })

    abortControllerRef.current = new AbortController()

    try {
      await api.uploadFile(file, platform, {
        onProgress: (progress) => {
          setUploadProgress(progress)
        },
      })
      setUploadStatus("success")
      fetchResources()

      // 3秒后重置状态
      setTimeout(() => {
        resetUploadState()
      }, 3000)
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "上传失败"
      setUploadError(errorMsg)
      setUploadStatus("error")

      // 5秒后重置状态
      setTimeout(() => {
        resetUploadState()
      }, 5000)
    }
  }

  // 处理文件拖放
  const handleFileDrop = async (files: File[]) => {
    if (files.length === 0) return

    const file = files[0]
    resetUploadState()
    checkFileExists(file, selectedPlatform)
  }

  // 确认覆盖上传
  const handleConfirmOverwrite = () => {
    if (pendingFile) {
      setExistingResource(null)
      startUpload(pendingFile, selectedPlatform)
    }
  }

  // 取消覆盖
  const handleCancelOverwrite = () => {
    resetUploadState()
  }

  // 取消上传
  const handleCancelUpload = () => {
    abortControllerRef.current?.abort()
    resetUploadState()
  }

  const handleScan = async () => {
    setIsScanning(true)
    setScanResult(null)
    try {
      const result = await api.triggerScan() as ScanResult
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

  const isUploading = uploadStatus === "uploading" || uploadStatus === "checking"

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

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-12">
          {/* 上传区域 */}
          <div className="space-y-4">
            <h2 className="text-xl font-semibold">上传文件</h2>

            {/* 覆盖确认对话框 */}
            {uploadStatus === "confirm-overwrite" && existingResource && (
              <div className="flex items-start gap-3 p-4 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
                <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
                <div className="flex-1 space-y-2">
                  <p className="text-sm font-medium text-amber-900 dark:text-amber-100">
                    检测到重复资源
                  </p>
                  <p className="text-xs text-amber-800 dark:text-amber-200">
                    资源 <span className="font-semibold">{existingResource.name}</span> 已存在，
                    当前有 {existingResource.versions.length} 个版本：
                  </p>
                  <ul className="text-xs text-amber-700 dark:text-amber-300 ml-4 space-y-1">
                    {existingResource.versions.map((v) => (
                      <li key={v.id} className="font-mono break-all">
                        • {v.version} → {v.full_path}
                      </li>
                    ))}
                  </ul>
                  <div className="flex gap-2 mt-2">
                    <Button
                      size="sm"
                      onClick={handleConfirmOverwrite}
                      className="bg-amber-600 hover:bg-amber-700"
                    >
                      继续上传（新增版本）
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleCancelOverwrite}
                    >
                      取消
                    </Button>
                  </div>
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label>选择平台</Label>
              <Select
                value={selectedPlatform}
                onValueChange={setSelectedPlatform}
                disabled={isUploading}
              >
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
            </div>

            <FileDropZone
              onDrop={handleFileDrop}
              uploading={isUploading}
              uploadProgress={uploadProgress}
              uploadFileName={uploadFileName}
              uploadStatus={uploadStatus === "checking" || uploadStatus === "confirm-overwrite" ? "idle" : uploadStatus}
              uploadError={uploadError}
              onCancel={uploadStatus === "uploading" ? handleCancelUpload : undefined}
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
