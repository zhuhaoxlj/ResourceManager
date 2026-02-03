from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.models.database import get_db
from app.services.scanner import DirectoryScanner
from app.core.config import get_settings

router = APIRouter(prefix="/scan", tags=["scan"])
settings = get_settings()


@router.post("/")
async def scan_directory(db: Session = Depends(get_db)):
    """扫描目录并返回结果"""
    scanner = DirectoryScanner(settings.resource_dir)
    result = scanner.scan_directory(db)

    return {
        "message": "扫描完成",
        "scanned": result.scanned,
        "created": result.created,
        "updated": result.updated,
        "errors": result.errors[:10],  # 只返回前10个错误
    }


@router.get("/stats")
def get_scan_stats(db: Session = Depends(get_db)):
    """获取扫描统计信息"""
    scanner = DirectoryScanner(settings.resource_dir)
    stats = scanner.get_platform_stats(db)
    return stats
