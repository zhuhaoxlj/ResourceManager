from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.models.database import get_db
from app.services.scanner import DirectoryScanner
from app.services.runtime_config import get_library_root, get_scan_roots, library_operation_lock

router = APIRouter(prefix="/scan", tags=["scan"])


@router.post("/")
def scan_directory(db: Session = Depends(get_db)):
    """扫描目录并返回结果"""
    with library_operation_lock:
        library_root = get_library_root(db)
        scanner = DirectoryScanner(library_root)
        result = scanner.scan_directory(db, [library_root, *get_scan_roots(db)])

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
    scanner = DirectoryScanner(get_library_root(db))
    stats = scanner.get_platform_stats(db)
    return stats
