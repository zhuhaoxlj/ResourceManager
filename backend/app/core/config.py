from pydantic_settings import BaseSettings
from functools import lru_cache
from pathlib import Path


class Settings(BaseSettings):
    """应用配置"""

    # 资源目录
    resource_dir: Path = Path("/app/resources")
    nas_resource_path: Path = Path("/vol2/1000/Software")  # NAS 真实路径
    upload_dir: Path = Path("/app/uploads")

    # 数据库
    database_url: str = "sqlite:///./data/resources.db"

    # API
    api_host: str = "0.0.0.0"
    api_port: int = 8000

    # CORS
    frontend_url: str = "http://localhost:5173"

    # 文件上传限制（MB）
    max_upload_size: int = 500

    # 平台配置
    platforms: list[str] = ["mac", "windows", "android", "switch"]

    # 支持的文件扩展名
    platform_extensions: dict[str, list[str]] = {
        "mac": [".dmg", ".pkg", ".app"],
        "windows": [".exe", ".msi", ".zip"],
        "android": [".apk", ".xapk"],
        "switch": [".nsp", ".nsz", ".xci"],
    }

    class Config:
        env_file = ".env"
        case_sensitive = False


@lru_cache()
def get_settings() -> Settings:
    """获取配置单例"""
    return Settings()


# 创建全局配置实例
settings = get_settings()
