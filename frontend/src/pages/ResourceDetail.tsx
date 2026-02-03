import { useEffect } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { useResourceStore } from "@/store/resourceStore"
import { VersionList } from "@/components/VersionList"
import { Button } from "@/components/ui/button"
import { ArrowLeft, Loader2, FileText } from "lucide-react"

export function ResourceDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { currentResource, loading, fetchResource, clearCurrentResource } = useResourceStore()

  useEffect(() => {
    if (id) {
      fetchResource(parseInt(id))
    }
    return () => {
      clearCurrentResource()
    }
  }, [id, fetchResource, clearCurrentResource])

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
            <div className="aspect-square rounded-lg overflow-hidden bg-muted">
              {currentResource.cover_image ? (
                <img
                  src={currentResource.cover_image}
                  alt={currentResource.name}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full items-center justify-center">
                  <FileText className="h-32 w-32 text-muted-foreground/50" />
                </div>
              )}
            </div>
          </div>

          <div className="lg:col-span-2 space-y-6">
            <div>
              <h1 className="text-3xl font-bold mb-2">{currentResource.name}</h1>
              <p className="text-muted-foreground">
                {currentResource.category || "未分类"} · {currentResource.platform}
              </p>
            </div>

            {currentResource.description && (
              <div>
                <h2 className="text-lg font-semibold mb-2">简介</h2>
                <p className="text-muted-foreground">{currentResource.description}</p>
              </div>
            )}

            <div>
              <h2 className="text-lg font-semibold mb-4">版本历史</h2>
              <VersionList
                versions={currentResource.versions}
                resourceName={currentResource.name}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
