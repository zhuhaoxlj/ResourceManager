import axios from "axios"

const API_BASE_URL = import.meta.env.VITE_API_URL || "/api/v1"

export interface Resource {
  id: number
  name: string
  platform: string
  category?: string
  description?: string
  cover_image?: string
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
      const result = await apiClient.get("/resources/", {
        params: { platform, search: filename.replace(/\.[^/.]+$/, "") },
      }) as ResourceListResponse
      const items = result.items
      const exists = items.some((r: Resource) => r.name.toLowerCase() === filename.toLowerCase().replace(/\.[^/.]+$/, ""))
      return { exists, resource: exists ? items[0] : undefined }
    } catch {
      return { exists: false }
    }
  },

  // 扫描
  triggerScan: (): Promise<{ message: string }> => {
    return apiClient.post("/scan/")
  },

  getScanStats: (): Promise<ScanStats> => {
    return apiClient.get("/scan/stats")
  },

  // 下载
  downloadFile: (versionId: number): string => {
    return `${API_BASE_URL}/download/${versionId}`
  },
}

export default api
