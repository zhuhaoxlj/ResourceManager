import os
import shutil
from pathlib import Path
from typing import Optional
from fastapi import UploadFile, HTTPException
from app.core.config import get_settings

settings = get_settings()


class FileManager:
    """文件管理器"""

    def __init__(self):
        self.resource_dir = settings.resource_dir
        self.upload_dir = settings.upload_dir
        self._ensure_directories()

    def _ensure_directories(self):
        """确保必要的目录存在"""
        self.upload_dir.mkdir(parents=True, exist_ok=True)
        for platform in settings.platforms:
            (self.resource_dir / platform.capitalize()).mkdir(parents=True, exist_ok=True)

    async def save_upload_file(
        self, upload_file: UploadFile, platform: str, base_dir: Optional[Path] = None
    ) -> tuple[str, int]:
        """保存上传的资源文件（默认落在资源目录，可指定其它根目录）"""
        # 验证平台
        if platform not in settings.platforms:
            raise HTTPException(status_code=400, detail=f"不支持的平台: {platform}")

        base = Path(base_dir) if base_dir else self.resource_dir
        base.mkdir(parents=True, exist_ok=True)

        # 创建平台目录
        platform_dir = base / platform.capitalize()
        platform_dir.mkdir(parents=True, exist_ok=True)

        # 生成文件路径
        file_path = platform_dir / upload_file.filename

        # 如果文件已存在，添加时间戳
        if file_path.exists():
            stem = file_path.stem
            suffix = file_path.suffix
            file_path = platform_dir / f"{stem}_{int(file_path.stat().st_mtime)}{suffix}"

        # 保存文件
        try:
            with file_path.open("wb") as f:
                shutil.copyfileobj(upload_file.file, f)
            file_size = file_path.stat().st_size
            return str(file_path.relative_to(base)), file_size
        finally:
            upload_file.file.close()

    async def save_cover_image(
        self, upload_file: UploadFile, resource_id: int
    ) -> str:
        """保存预览图"""
        # 验证文件类型
        allowed_extensions = {".jpg", ".jpeg", ".png", ".webp", ".gif"}
        file_ext = Path(upload_file.filename).suffix.lower()

        if file_ext not in allowed_extensions:
            raise HTTPException(
                status_code=400, detail=f"不支持的图片格式: {file_ext}"
            )

        # 创建封面目录
        covers_dir = self.upload_dir / "covers"
        covers_dir.mkdir(parents=True, exist_ok=True)

        # 生成文件路径
        filename = f"resource_{resource_id}{file_ext}"
        file_path = covers_dir / filename

        # 保存文件
        try:
            with file_path.open("wb") as f:
                shutil.copyfileobj(upload_file.file, f)
            return f"/api/v1/static/covers/{filename}"
        finally:
            upload_file.file.close()

    def get_file_path(self, relative_path: str, root: Optional[Path] = None) -> Path:
        """获取文件完整路径"""
        file_path = (Path(root) if root else self.resource_dir) / relative_path
        if not file_path.exists():
            raise HTTPException(status_code=404, detail="文件不存在")
        return file_path

    def delete_file(self, relative_path: str, root: Optional[Path] = None) -> bool:
        """删除文件"""
        file_path = (Path(root) if root else self.resource_dir) / relative_path
        if file_path.exists():
            file_path.unlink()
            return True
        return False


# 全局文件管理器实例
file_manager = FileManager()
