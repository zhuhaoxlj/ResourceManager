import { useEffect, useState } from "react"
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
import { ArrowLeft, RefreshCw, Loader2, CheckCircle2, AlertCircle } from "lucide-react"
import { api } from "@/services/api"
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
  const [uploadStatus, setUploadStatus] = useState<{ message: string; type: "success" | "error" } | null>(null)

  useEffect(() => {
    fetchResources()
  }, [fetchResources])

  const handleFileDrop = async (files: File[]) => {
    if (files.length === 0) return

    try {
      await api.uploadFile(files[0], selectedPlatform)
      setUploadStatus({ message: "上传成功！", type: "success" })
      fetchResources()
      setTimeout(() => setUploadStatus(null), 3000)
    } catch (error) {
      setUploadStatus({ message: error instanceof Error ? error.message : "上传失败", type: "error" })
      setTimeout(() => setUploadStatus(null), 3000)
    }
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
          <div className="space-y-4">
            <h2 className="text-xl font-semibold">上传文件</h2>
            {uploadStatus && (
              <div className={`flex items-center gap-2 p-3 rounded-lg ${
                uploadStatus.type === "success"
                  ? "bg-green-50 text-green-800 dark:bg-green-900/20 dark:text-green-400"
                  : "bg-red-50 text-red-800 dark:bg-red-900/20 dark:text-red-400"
              }`}>
                {uploadStatus.type === "success" ? (
                  <CheckCircle2 className="h-4 w-4" />
                ) : (
                  <AlertCircle className="h-4 w-4" />
                )}
                <span className="text-sm">{uploadStatus.message}</span>
              </div>
            )}
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
            </div>
            <FileDropZone onDrop={handleFileDrop} />
          </div>

          <div className="space-y-4">
            <h2 className="text-xl font-semibold">目录扫描</h2>
            <p className="text-muted-foreground text-sm">
              扫描资源目录（/Users/mark/Downloads），自动识别新文件并更新数据库
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
