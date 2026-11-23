"""运行时可变配置：资源目录等，存在 SQLite 里，改完不用重启。"""

import json
from pathlib import Path
from threading import Lock
from typing import List

from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models.resource import AppConfig

settings = get_settings()

LIBRARY_ROOT_KEY = "library_root"
SCAN_ROOTS_KEY = "scan_roots"
library_operation_lock = Lock()


def get_library_root(db: Session) -> Path:
    """当前资源库根目录（容器内路径）。"""
    row = db.query(AppConfig).filter(AppConfig.key == LIBRARY_ROOT_KEY).first()
    if row and row.value:
        return Path(row.value)
    return Path(settings.resource_dir)


def set_library_root(db: Session, path: Path) -> None:
    row = db.query(AppConfig).filter(AppConfig.key == LIBRARY_ROOT_KEY).first()
    if row:
        row.value = str(path)
    else:
        db.add(AppConfig(key=LIBRARY_ROOT_KEY, value=str(path)))
    db.commit()


def get_scan_roots(db: Session) -> List[Path]:
    """额外的扫描目录（原地登记，不移动文件）。"""
    row = db.query(AppConfig).filter(AppConfig.key == SCAN_ROOTS_KEY).first()
    if not row or not row.value:
        return []
    try:
        items = json.loads(row.value)
    except Exception:
        return []
    return [Path(item) for item in items if isinstance(item, str)]


def set_scan_roots(db: Session, roots: List[Path], *, commit: bool = True) -> None:
    value = json.dumps([str(item) for item in roots], ensure_ascii=False)
    row = db.query(AppConfig).filter(AppConfig.key == SCAN_ROOTS_KEY).first()
    if row:
        row.value = value
    else:
        db.add(AppConfig(key=SCAN_ROOTS_KEY, value=value))
    if commit:
        db.commit()


def host_path(root: Path) -> Path:
    """容器内路径 → NAS 真实路径。

    默认挂载 /app/resources 对应 NAS_RESOURCE_PATH；/vol1、/vol2、/vol3 按同路径挂载，
    其余路径原样返回。
    """
    root = Path(root)
    try:
        relative = root.relative_to(settings.resource_dir)
        return Path(settings.nas_resource_path) / relative
    except ValueError:
        return root


def display_path(root: Path, relative_path: str) -> str:
    """给前端展示用的完整 NAS 路径。"""
    return str(host_path(root) / relative_path)
