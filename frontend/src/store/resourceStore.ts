import { create } from "zustand"
import { api, type Resource } from "@/services/api"

interface ResourceStore {
  resources: Resource[]
  currentResource: Resource | null
  loading: boolean
  error: string | null
  filters: {
    platform?: string
    category?: string
    search?: string
  }

  // Actions
  fetchResources: (filters?: { platform?: string; category?: string; search?: string }) => Promise<void>
  fetchResource: (id: number) => Promise<void>
  createResource: (data: Partial<Resource>) => Promise<void>
  updateResource: (id: number, data: Partial<Resource>) => Promise<void>
  deleteResource: (id: number) => Promise<void>
  setFilters: (filters: { platform?: string; category?: string; search?: string }) => void
  clearCurrentResource: () => void
}

export const useResourceStore = create<ResourceStore>((set, get) => ({
  resources: [],
  currentResource: null,
  loading: false,
  error: null,
  filters: {},

  fetchResources: async (filters) => {
    set({ loading: true, error: null })
    try {
      const response = await api.getResources(filters)
      set({ resources: response.items, filters: filters || {} })
    } catch (error) {
      set({ error: error instanceof Error ? error.message : "获取资源列表失败" })
    } finally {
      set({ loading: false })
    }
  },

  fetchResource: async (id) => {
    set({ loading: true, error: null })
    try {
      const resource = await api.getResource(id)
      set({ currentResource: resource })
    } catch (error) {
      set({ error: error instanceof Error ? error.message : "获取资源详情失败" })
    } finally {
      set({ loading: false })
    }
  },

  createResource: async (data) => {
    set({ loading: true, error: null })
    try {
      await api.createResource(data)
      await get().fetchResources(get().filters)
    } catch (error) {
      set({ error: error instanceof Error ? error.message : "创建资源失败" })
    } finally {
      set({ loading: false })
    }
  },

  updateResource: async (id, data) => {
    set({ loading: true, error: null })
    try {
      await api.updateResource(id, data)
      await get().fetchResources(get().filters)
    } catch (error) {
      set({ error: error instanceof Error ? error.message : "更新资源失败" })
    } finally {
      set({ loading: false })
    }
  },

  deleteResource: async (id) => {
    set({ loading: true, error: null })
    try {
      await api.deleteResource(id)
      await get().fetchResources(get().filters)
    } catch (error) {
      set({ error: error instanceof Error ? error.message : "删除资源失败" })
    } finally {
      set({ loading: false })
    }
  },

  setFilters: (filters) => {
    set({ filters })
  },

  clearCurrentResource: () => {
    set({ currentResource: null })
  },
}))
