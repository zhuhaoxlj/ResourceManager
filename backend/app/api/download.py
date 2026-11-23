import shutil
from tempfile import TemporaryDirectory

from starlette.background import BackgroundTask
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from pathlib import Path
from app.models.database import get_db
from app.models.resource import Version
from app.services.file_manager import file_manager
from app.core.config import settings

router = APIRouter(prefix="/download", tags=["download"])


@router.get("/{version_id}")
def download_file(version_id: int, db: Session = Depends(get_db)):
    """下载指定版本的文件"""
    # 查找版本
    version = db.query(Version).filter(Version.id == version_id).first()
    if not version:
        raise HTTPException(status_code=404, detail="版本不存在")

    # 获取文件路径（优先用版本记录的根目录，兼容老数据）
    root = Path(version.root_path) if version.root_path else settings.resource_dir
    try:
        file_path = file_manager.get_file_path(version.file_path, root)
    except HTTPException:
        raise HTTPException(status_code=404, detail="文件不存在")

    if file_path.is_dir():
        if any(item.is_symlink() or not (item.is_file() or item.is_dir()) for item in file_path.rglob("*")):
            raise HTTPException(status_code=400, detail="目录内含链接或特殊文件，无法打包")
        temp = TemporaryDirectory(prefix="resource-download-")
        try:
            archive = shutil.make_archive(str(Path(temp.name) / "download"), "zip", file_path.parent, file_path.name)
        except Exception:
            temp.cleanup()
            raise
        return FileResponse(
            archive, filename=f"{file_path.name}.zip", media_type="application/zip",
            background=BackgroundTask(temp.cleanup),
        )

    filename = Path(file_path).name
    return FileResponse(
        path=str(file_path),
        filename=filename,
        media_type="application/octet-stream",
    )
