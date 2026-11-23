import axios from "axios"

const API_BASE_URL = import.meta.env.VITE_API_URL || "/api/v1"
// 后端根地址（用于拼接静态资源，如 APK 图标）
const API_ORIGIN = API_BASE_URL.replace(/\/api\/v1\/?$/, "")

export interface Resource {
  id: number
  name: string
  platform: string
  category?: string
  description?: string
  cover_image?: string
  // APK 解析信息
  package_name?: string
  app_version?: string
  version_code?: string
  min_sdk?: string
  target_sdk?: string
  architectures?: string
  permissions_count?: number
  created_at: string
  updated_at?: string
  versions: Version[]
}

export interface Version {
  id: number
  version: string
  file_path: string
  file_size?: number
  upload_date: string
  full_path?: string
}

export interface ResourceListResponse {
  total: number
  items: Resource[]
}

export interface ScanRoot {
  path: string
  host_path: string
}

export interface StorageInfo {
  library_root: string
  library_root_host: string
  upload_template: string
  volumes: string[]
  scan_roots: ScanRoot[]
}

export interface BrowseEntry {
  name: string
  path: string
}

export interface BrowseResult {
  path: string
  host_path: string
  parent?: string | null
  entries: BrowseEntry[]
}

export type ImportMode = "files" | "folder"

export interface ImportResult {
  destination: string
  moved: number
  errors: string[]
  created: number
  updated: number
}

export interface ScanStats {
  [platform: string]: number
}

export interface UploadProgress {
  loaded: number
  total: number
  percent: number
}

export interface UploadOptions {
  onProgress?: (progress: UploadProgress) => void
  signal?: AbortSignal
}

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    "Content-Type": "application/json",
  },
})

// 请求拦截器
apiClient.interceptors.request.use(
  (config) => {
    return config
  },
  (error) => {
    return Promise.reject(error)
  }
)

// 静态资源地址（cover_image 可能存相对路径或 /api/v1/... 绝对路径）
export function assetUrl(path?: string): string | undefined {
  if (!path) return undefined
  if (/^https?:\/\//.test(path)) return path
  if (path.startsWith("/api/")) return `${API_ORIGIN}${path}`
  return `${API_ORIGIN}/api/v1/static/covers/${path.replace(/^\/+/, "")}`
}

// 响应拦截器
apiClient.interceptors.response.use(
  (response) => response.data,
  (error) => {
    const message = error.response?.data?.detail || error.message || "请求失败"
    return Promise.reject(new Error(message))
  }
)

export const api = {
  // 资源管理
  getResources: (params?: {
    platform?: string
    category?: string
    search?: string
    skip?: number
    limit?: number
  }): Promise<ResourceListResponse> => {
    return apiClient.get("/resources/", { params })
  },

  getResource: (id: number): Promise<Resource> => {
    return apiClient.get(`/resources/${id}`)
  },

  createResource: (data: Partial<Resource>): Promise<Resource> => {
    return apiClient.post("/resources/", data)
  },

  updateResource: (id: number, data: Partial<Resource>): Promise<Resource> => {
    return apiClient.put(`/resources/${id}`, data)
  },

  deleteResource: (id: number): Promise<void> => {
    return apiClient.delete(`/resources/${id}`)
  },

  getResourceVersions: (id: number): Promise<Version[]> => {
    return apiClient.get(`/resources/${id}/versions`)
  },

  // 上传
  uploadFile: async (
    file: File,
    platform: string,
    options?: UploadOptions
  ): Promise<{ resource_id: number }> => {
    const formData = new FormData()
    formData.append("file", file)
    formData.append("platform", platform)
    // FormData 需要移除默认的 Content-Type，让浏览器自动设置 boundary
    return apiClient.post("/upload/file", formData, {
      headers: { "Content-Type": undefined },
      signal: options?.signal,
      onUploadProgress: (progressEvent) => {
        if (options?.onProgress && progressEvent.total) {
          const percent = Math.round((progressEvent.loaded * 100) / progressEvent.total)
          options.onProgress({
            loaded: progressEvent.loaded,
            total: progressEvent.total,
            percent,
          })
        }
      },
    })
  },

  uploadCover: async (file: File, resourceId: number): Promise<{ cover_url: string }> => {
    const formData = new FormData()
    formData.append("file", file)
    // FormData 需要移除默认的 Content-Type，让浏览器自动设置 boundary
    return apiClient.post(`/upload/cover/${resourceId}`, formData, {
      headers: { "Content-Type": undefined },
    })
  },

  // 检查文件是否已存在
  checkFileExists: async (filename: string, platform: string): Promise<{ exists: boolean; resource?: Resource }> => {
    try {
      const stem = filename.replace(/\.[^/.]+$/, "")
      const keyword = stem.replace(/[-_ ]?v?\d+(?:\.\d+)*$/i, "").trim() || stem
      const result = await apiClient.get("/resources/", {
        params: { platform, search: keyword },
      }) as ResourceListResponse
      const items = result.items
      const lowerStem = stem.toLowerCase()
      const lowerName = filename.toLowerCase()
      const exists = items.some((r: Resource) =>
        r.name.toLowerCase() === lowerStem ||
        r.versions.some((v) => (v.file_path.split("/").pop() || "").toLowerCase() === lowerName)
      )
      return { exists, resource: exists ? items[0] : undefined }
    } catch {
      return { exists: false }
    }
  },

  // 资源路径
  getStorage: (): Promise<StorageInfo> => {
    return apiClient.get("/storage/")
  },

  browsePath: (path: string): Promise<BrowseResult> => {
    return apiClient.get("/storage/browse", { params: { path } })
  },

  setLibraryRoot: (path: string): Promise<StorageInfo> => {
    return apiClient.put("/storage/library-root", { path })
  },

  addScanRoot: (path: string): Promise<StorageInfo> => {
    return apiClient.post("/storage/scan-roots", { path })
  },

  removeScanRoot: (path: string): Promise<StorageInfo> => {
    return apiClient.delete("/storage/scan-roots", { params: { path } })
  },

  importFromPath: (path: string, platform: string, mode: ImportMode): Promise<ImportResult> => {
    return apiClient.post("/storage/import", { path, platform, mode })
  },

  // 扫描
  triggerScan: (): Promise<{ message: string }> => {
    return apiClient.post("/scan/")
  },

  getScanStats: (): Promise<ScanStats> => {
    return apiClient.get("/scan/stats")
  },

  // 静态资源
  assetUrl,

  // 下载
  downloadFile: (versionId: number): string => {
    return `${API_BASE_URL}/download/${versionId}`
  },
}

export default api
