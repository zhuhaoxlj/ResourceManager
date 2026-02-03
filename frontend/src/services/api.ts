import axios from "axios"

const API_BASE_URL = "/api/v1"

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
}

export interface ResourceListResponse {
  total: number
  items: Resource[]
}

export interface ScanStats {
  [platform: string]: number
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
  uploadFile: async (file: File, platform: string): Promise<{ resource_id: number }> => {
    const formData = new FormData()
    formData.append("file", file)
    formData.append("platform", platform)
    return apiClient.post("/upload/file", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    })
  },

  uploadCover: async (file: File, resourceId: number): Promise<{ cover_url: string }> => {
    const formData = new FormData()
    formData.append("file", file)
    return apiClient.post(`/upload/cover/${resourceId}`, formData, {
      headers: { "Content-Type": "multipart/form-data" },
    })
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
