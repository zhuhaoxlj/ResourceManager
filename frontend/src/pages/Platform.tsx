import { useEffect } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { useResourceStore } from "@/store/resourceStore"
import { ResourceCard } from "@/components/ResourceCard"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Search, ArrowLeft, Loader2 } from "lucide-react"
import { platformConfig } from "@/lib/theme"
import { api } from "@/services/api"

export function Platform() {
  const { platform } = useParams<{ platform: string }>()
  const navigate = useNavigate()
  const { resources, loading, fetchResources, setFilters } = useResourceStore()

  useEffect(() => {
    if (platform) {
      fetchResources({ platform })
    }
  }, [platform, fetchResources])

  const handleSearch = (query: string) => {
    setFilters({ platform, search: query })
    fetchResources({ platform, search: query })
  }

  const handleDownload = (resourceId: number) => {
    const resource = resources.find((r) => r.id === resourceId)
    if (resource && resource.versions.length > 0) {
      const url = api.downloadFile(resource.versions[0].id)
      window.open(url, "_blank")
    }
  }

  const config = platform ? platformConfig[platform as keyof typeof platformConfig] : null

  if (!config) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-xl font-semibold mb-4">平台不存在</h2>
          <Button onClick={() => navigate("/")}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            返回首页
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8">
        <div className="mb-6">
          <Button
            variant="ghost"
            onClick={() => navigate("/")}
            className="mb-3"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            返回首页
          </Button>
          <h1 className="text-2xl font-bold">{config.name} 资源</h1>
        </div>

        <div className="mb-6">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="搜索资源..."
              className="pl-10"
              onChange={(e) => handleSearch(e.target.value)}
            />
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : resources.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <p>暂无资源</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7 gap-3 sm:gap-4">
            {resources.map((resource) => (
              <ResourceCard
                key={resource.id}
                resource={resource}
                onClick={() => navigate(`/resource/${resource.id}`)}
                onDownload={() => handleDownload(resource.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
