from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from app.core.config import get_settings
from app.models.database import init_db
from app.api import resources, upload, scan, download, static

settings = get_settings()


def create_app() -> FastAPI:
    """创建 FastAPI 应用"""
    app = FastAPI(
        title="资源管理系统 API",
        description="多平台资源管理系统后端 API",
        version="0.1.0",
        docs_url="/api/docs",
        redoc_url="/api/redoc",
        openapi_url="/api/openapi.json",
    )

    # 配置 CORS
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[settings.frontend_url, "http://localhost:5173"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # 注册路由
    app.include_router(resources.router, prefix="/api/v1")
    app.include_router(upload.router, prefix="/api/v1")
    app.include_router(scan.router, prefix="/api/v1")
    app.include_router(download.router, prefix="/api/v1")
    app.include_router(static.router, prefix="/api/v1")

    # 挂载静态文件目录
    (settings.upload_dir / "covers").mkdir(parents=True, exist_ok=True)
    app.mount("/static/covers", StaticFiles(directory=str(settings.upload_dir / "covers")), name="covers")

    # 启动事件
    @app.on_event("startup")
    async def startup_event():
        """启动时初始化数据库"""
        init_db()

    @app.get("/")
    async def root():
        """根路径"""
        return {"message": "资源管理系统 API", "version": "0.1.0"}

    @app.get("/health")
    async def health():
        """健康检查"""
        return {"status": "healthy"}

    return app


# 创建应用实例
app = create_app()


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "app.main:app",
        host=settings.api_host,
        port=settings.api_port,
        reload=True,
    )
