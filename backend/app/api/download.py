from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from pathlib import Path
from app.models.database import get_db
from app.models.resource import Version
from app.services.file_manager import file_manager

router = APIRouter(prefix="/download", tags=["download"])


@router.get("/{version_id}")
def download_file(version_id: int, db: Session = Depends(get_db)):
    """下载指定版本的文件"""
    # 查找版本
    version = db.query(Version).filter(Version.id == version_id).first()
    if not version:
        raise HTTPException(status_code=404, detail="版本不存在")

    # 获取文件路径
    try:
        file_path = file_manager.get_file_path(version.file_path)
    except HTTPException:
        raise HTTPException(status_code=404, detail="文件不存在")

    # 返回文件
    filename = Path(file_path).name
    return FileResponse(
        path=str(file_path),
        filename=filename,
        media_type="application/octet-stream",
    )
