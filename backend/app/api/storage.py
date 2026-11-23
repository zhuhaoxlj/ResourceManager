"""资源路径管理：目录浏览、修改资源目录、把 NAS 上的文件导入（移动）到资源库。"""

import os
import shutil
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models.database import get_db
from app.services.runtime_config import (
    get_library_root,
    get_scan_roots,
    host_path,
    set_library_root,
    set_scan_roots,
)
from app.services.scanner import DirectoryScanner

router = APIRouter(prefix="/storage", tags=["storage"])
settings = get_settings()

# 允许浏览的 NAS 卷根目录（compose 里按同路径挂载进容器）
# 本地开发可用 STORAGE_VOLUMES=/tmp:/data 覆盖
VOLUME_ROOTS = [
    Path(item)
    for item in os.environ.get("STORAGE_VOLUMES", "/vol1:/vol2:/vol3").split(":")
    if item
]


class PathPayload(BaseModel):
    path: str


def _is_within(child: Path, parent: Path) -> bool:
    try:
        child.relative_to(parent)
        return True
    except ValueError:
        return False


def _allowed_bases(db: Session) -> list[Path]:
    bases = [root for root in VOLUME_ROOTS if root.exists()]
    bases.append(get_library_root(db))
    bases.append(Path(settings.resource_dir))
    resolved = []
    for base in bases:
        try:
            resolved.append(base.resolve())
        except OSError:
            continue
    return resolved


def _check_path(db: Session, raw: str) -> Path:
    try:
        path = Path(raw).resolve()
    except OSError:
        raise HTTPException(status_code=400, detail="路径无效")
    if not any(_is_within(path, base) for base in _allowed_bases(db)):
        raise HTTPException(status_code=400, detail="只允许访问已挂载的 NAS 目录（/vol1、/vol2、/vol3）")
    return path


def _supported_extensions() -> set[str]:
    extensions: set[str] = set()
    for values in settings.platform_extensions.values():
        extensions.update(values)
    return extensions


def _detect_platform(filename: str) -> Optional[str]:
    suffix = Path(filename).suffix.lower()
    for platform, extensions in settings.platform_extensions.items():
        if suffix in extensions:
            return platform
    return None


def _storage_payload(db: Session) -> dict:
    root = get_library_root(db)
    return {
        "library_root": str(root),
        "library_root_host": str(host_path(root)),
        "upload_template": f"{host_path(root)}/<平台>/",
        "volumes": [str(item) for item in VOLUME_ROOTS if item.exists()],
        "scan_roots": [
            {"path": str(item), "host_path": str(host_path(item))}
            for item in get_scan_roots(db)
        ],
    }


@router.get("/")
def storage_info(db: Session = Depends(get_db)):
    """当前资源目录、额外扫描目录与可浏览的卷。"""
    return _storage_payload(db)


@router.post("/scan-roots")
def add_scan_root(payload: PathPayload, db: Session = Depends(get_db)):
    """把一个 NAS 目录加进扫描列表（原地登记，不移动文件）。"""
    target = _check_path(db, payload.path)
    if not target.exists() or not target.is_dir():
        raise HTTPException(status_code=400, detail="目录不存在")

    # 资源库同时以容器路径和 NAS 路径挂载，两种写法都要识别
    library_roots = {get_library_root(db)}
    try:
        library_roots.add(host_path(get_library_root(db)))
    except Exception:
        pass
    try:
        if any(target == item.resolve() or item.resolve() in target.parents for item in library_roots):
            raise HTTPException(status_code=400, detail="该目录已在资源库内，无需重复添加")
    except OSError:
        raise HTTPException(status_code=400, detail="路径无效")

    roots = [item.resolve() for item in get_scan_roots(db)]
    if target in roots:
        raise HTTPException(status_code=400, detail="该目录已在扫描列表中")
    if any(target in root.parents for root in roots):
        raise HTTPException(status_code=400, detail="该目录已包含在现有的扫描目录中")

    roots = [item for item in roots if item not in target.parents]
    roots.append(target)
    set_scan_roots(db, roots)
    return _storage_payload(db)


@router.delete("/scan-roots")
def remove_scan_root(path: str = Query(..., description="要移除的扫描目录"), db: Session = Depends(get_db)):
    """从扫描列表里移除一个目录（不影响已经入库的资源）。"""
    try:
        target = Path(path).resolve()
    except OSError:
        raise HTTPException(status_code=400, detail="路径无效")

    roots = [item.resolve() for item in get_scan_roots(db)]
    if target not in roots:
        raise HTTPException(status_code=404, detail="该目录不在扫描列表中")

    set_scan_roots(db, [item for item in roots if item != target])
    return _storage_payload(db)


@router.get("/browse")
def browse(path: str = Query(..., description="要浏览的目录"), db: Session = Depends(get_db)):
    """列出目录下的子目录（只列目录，不列文件）。"""
    target = _check_path(db, path)
    if not target.exists():
        raise HTTPException(status_code=404, detail="目录不存在")
    if not target.is_dir():
        raise HTTPException(status_code=400, detail="不是目录")

    entries = []
    try:
        children = sorted(target.iterdir(), key=lambda item: item.name.lower())
    except OSError as exc:
        raise HTTPException(status_code=403, detail=f"无法读取目录：{exc}")

    for child in children:
        if child.name.startswith("."):
            continue
        try:
            if not child.is_dir() or child.is_symlink():
                continue
        except OSError:
            continue
        entries.append({"name": child.name, "path": str(child)})

    parent = None
    if target.parent != target and any(_is_within(target.parent, base) for base in _allowed_bases(db)):
        parent = str(target.parent)

    return {
        "path": str(target),
        "host_path": str(host_path(target)),
        "parent": parent,
        "entries": entries,
    }


@router.put("/library-root")
def update_library_root(payload: PathPayload, db: Session = Depends(get_db)):
    """修改资源目录（扫描 + 上传 + 导入落点）。"""
    target = _check_path(db, payload.path)
    if not target.exists() or not target.is_dir():
        raise HTTPException(status_code=400, detail="目录不存在")
    if not _writable(target):
        raise HTTPException(status_code=400, detail="目录不可写")

    set_library_root(db, target)
    return {
        "library_root": str(target),
        "library_root_host": str(host_path(target)),
        "upload_template": f"{host_path(target)}/<平台>/",
    }


def _writable(path: Path) -> bool:
    return os.access(path, os.W_OK)


@router.post("/import")
def import_from_path(payload: PathPayload, db: Session = Depends(get_db)):
    """把 NAS 某个目录里的安装包移动到资源库对应平台目录，然后重新扫描。"""
    source = _check_path(db, payload.path)
    if not source.exists() or not source.is_dir():
        raise HTTPException(status_code=400, detail="目录不存在")

    root = get_library_root(db).resolve()
    if source == root or _is_within(source, root):
        raise HTTPException(status_code=400, detail="该目录已在资源库内，直接扫描即可")

    supported = _supported_extensions()
    moved = 0
    skipped = 0
    errors: list[str] = []

    for item in sorted(source.rglob("*")):
        try:
            if not item.is_file() or item.is_symlink():
                continue
            if item.suffix.lower() not in supported:
                skipped += 1
                continue
            platform = _detect_platform(item.name)
            if not platform:
                skipped += 1
                continue

            target_dir = root / platform.capitalize()
            target_dir.mkdir(parents=True, exist_ok=True)
            target = target_dir / item.name
            if target.exists():
                target = target_dir / f"{item.stem}_{int(item.stat().st_mtime)}{item.suffix}"

            shutil.move(str(item), str(target))
            moved += 1
        except Exception as exc:  # noqa: BLE001 - 单个文件失败不影响其它文件
            errors.append(f"{item.name}: {exc}")

    scan_result = None
    if moved:
        scan_result = DirectoryScanner(root).scan_directory(db)

    return {
        "source": str(source),
        "library_root": str(root),
        "moved": moved,
        "skipped": skipped,
        "errors": errors[:10],
        "scanned": scan_result.scanned if scan_result else 0,
        "created": scan_result.created if scan_result else 0,
        "updated": scan_result.updated if scan_result else 0,
    }
