"""资源路径管理：目录浏览、修改资源目录、把 NAS 上的文件导入（移动）到资源库。"""

import errno
import os
import shutil
from tempfile import mkdtemp
from pathlib import Path
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models.database import get_db
from app.models.resource import Version
from app.services.runtime_config import (
    get_library_root,
    get_scan_roots,
    host_path,
    library_operation_lock,
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


class ImportPayload(PathPayload):
    platform: str
    mode: Literal["files", "folder"]


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
    return _storage_payload(db)


def _writable(path: Path) -> bool:
    return os.access(path, os.W_OK)


@router.post("/import")
def import_from_path(payload: ImportPayload, db: Session = Depends(get_db)):
    """移动整个目录。可逐文件登记，或把目录作为一条资源登记。"""
    with library_operation_lock:
        return _move_into_library(payload, db)


def _move_into_library(payload: ImportPayload, db: Session):
    if payload.platform not in settings.platforms:
        raise HTTPException(status_code=400, detail="请选择有效的导入平台")
    source = _check_path(db, payload.path)
    root = get_library_root(db).resolve()
    source_host = host_path(source).resolve()
    root_host = host_path(root).resolve()
    if not source.is_dir() or source in _allowed_bases(db):
        raise HTTPException(status_code=400, detail="请选择 NAS 卷下的具体文件夹")
    if _is_within(source_host, root_host) or _is_within(root_host, source_host):
        raise HTTPException(status_code=400, detail="源目录和资源目录不能互相包含")

    target_dir = root / payload.platform.capitalize()
    if target_dir.is_symlink():
        raise HTTPException(status_code=400, detail="目标平台目录不能是符号链接")
    try:
        files = []
        for item in source.rglob("*"):
            if item.is_symlink() or not (item.is_file() or item.is_dir()):
                raise HTTPException(status_code=400, detail=f"目录内含链接或特殊文件：{item.relative_to(source)}")
            if item.is_file():
                files.append((item.relative_to(source), item.stat().st_size))
        if not files:
            raise HTTPException(status_code=400, detail="所选目录没有文件")

        target_dir.mkdir(parents=True, exist_ok=True)
        for number in range(10_000):
            target = target_dir / (source.name if number == 0 else f"{source.name} ({number})")
            try:
                target.mkdir()
                break
            except FileExistsError:
                continue
        else:
            raise HTTPException(status_code=409, detail="同名目录过多")
    except OSError as exc:
        raise HTTPException(status_code=400, detail=f"无法读取源目录或创建目标目录：{exc}") from exc

    scanner = DirectoryScanner(root)
    created = updated = 0
    renamed = False
    staging = None
    try:
        try:
            source.rename(target)
            renamed = True
        except OSError as exc:
            if exc.errno != errno.EXDEV:
                raise
            staging = Path(mkdtemp(prefix=".resource-import-", dir=source.parent))
            source.rename(staging / source.name)
            shutil.copytree(staging / source.name, target, dirs_exist_ok=True, symlinks=True)

        # 已经原地登记的版本一并更新到移动后的路径，保留旧下载链接。
        for version in db.query(Version):
            old_root = Path(version.root_path or settings.resource_dir)
            old_path = host_path(old_root / version.file_path)
            if _is_within(old_path, source_host):
                version.root_path = str(root)
                version.file_path = str((target / old_path.relative_to(source_host)).relative_to(root))
        db.flush()
        entries = [(Path(), sum(size for _, size in files))] if payload.mode == "folder" else files
        for relative, size in entries:
            item = target / relative
            status = scanner.index_file(
                db, item, str(item.relative_to(root)), root, platform_override=payload.platform,
                size_override=size, name_override=source.name if payload.mode == "folder" else None,
            )
            created += status == "created"
            updated += status == "updated"
        scan_roots = get_scan_roots(db)
        remaining = [path for path in scan_roots if not _is_within(host_path(path).resolve(), source_host)]
        if remaining != scan_roots:
            set_scan_roots(db, remaining, commit=False)
        db.commit()
    except Exception as exc:
        db.rollback()
        try:
            restore = staging / source.name if staging else None
            if renamed:
                restore = target
            if restore and restore.exists():
                if source.exists() or source.is_symlink():
                    raise OSError(f"源目录已被占用，原文件位于 {host_path(restore)}")
                restore.rename(source)
            if staging:
                staging.rmdir()
            if not renamed:
                shutil.rmtree(target)
        except OSError as rollback_error:
            raise HTTPException(status_code=500, detail=f"导入失败，文件可能仍在 {host_path(target)}：{rollback_error}") from exc
        raise HTTPException(status_code=500, detail=f"导入失败，源文件已保留：{exc}") from exc

    errors = []
    if staging:
        try:
            shutil.rmtree(staging)
        except OSError as exc:
            errors.append(f"目标已入库，源文件暂存目录 {host_path(staging)} 清理未完成：{exc}")
    return {
        "destination": str(host_path(target)), "moved": len(files),
        "created": created, "updated": updated, "errors": errors,
    }
