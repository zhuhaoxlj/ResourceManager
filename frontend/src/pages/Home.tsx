import { useNavigate } from "react-router-dom"
import { Card, CardContent } from "@/components/ui/card"
import { platformConfig } from "@/lib/theme"
import {
  Laptop,
  Monitor,
  Smartphone,
  Gamepad2,
  ArrowRight,
} from "lucide-react"

const iconMap = {
  Laptop,
  Monitor,
  Smartphone,
  Gamepad2,
}

export function Home() {
  const navigate = useNavigate()

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-muted/20">
      <div className="container mx-auto px-4 py-16">
        <div className="text-center mb-16">
          <h1 className="text-4xl font-bold mb-4">资源管理系统</h1>
          <p className="text-muted-foreground text-lg">
            统一管理您的多平台软件资源
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-6xl mx-auto">
          {Object.entries(platformConfig).map(([key, config]) => {
            const Icon = iconMap[config.icon as keyof typeof iconMap]
            return (
              <Card
                key={key}
                className="group overflow-hidden cursor-pointer transition-all hover:scale-105 hover:shadow-xl"
                onClick={() => navigate(`/platform/${key}`)}
              >
                <div
                  className={`bg-gradient-to-br ${config.color} p-8 text-white`}
                >
                  <Icon className="h-16 w-16 mb-4" />
                  <h2 className="text-2xl font-bold">{config.name}</h2>
                </div>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between text-muted-foreground group-hover:text-foreground transition-colors">
                    <span>查看资源</span>
                    <ArrowRight className="h-4 w-4" />
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>

        <div className="mt-16 text-center">
          <button
            onClick={() => navigate("/admin")}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            进入管理页面 →
          </button>
        </div>
      </div>
    </div>
  )
}
