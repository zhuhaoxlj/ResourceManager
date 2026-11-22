import hashlib
import json
import os
import re
from pathlib import Path
from typing import Dict, Optional, Set

from sqlalchemy import and_, or_
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models.resource import Resource, Version
from app.schemas.resource import ScanResult
from app.services.apk_parser import ApkInfo, parse_apk

settings = get_settings()

APK_ICON_DIR = "apk"
APK_CACHE_FILE = "apk_meta.json"


class DirectoryScanner:
    """目录扫描器"""

    # 版本号匹配模式
    VERSION_PATTERNS = [
        r"_v?(\d+\.\d+\.\d+)",  # v1.0.0, 1.0.0
        r"_v?(\d+\.\d+)",  # v1.0, 1.0
        r"\[v?(\d+\.\d+\.\d+)\]",  # [v1.0.0]
        r"\[v?(\d+\.\d+)\]",  # [v1.0]
        r"-(\d+\.\d+\.\d+)",  # -1.0.0
        r"-(\d+\.\d+)",  # -1.0
    ]

    # 应该跳过的目录
    SKIP_DIRS = {
        "node_modules", ".git", ".vscode", "dist", "build",
        "target", "venv", ".venv", "__pycache__", ".pytest_cache",
        "coverage", ".next", ".nuxt", "vendor", "bower_components",
        "frontend", "backend", ".zcf", "data",
    }

    def __init__(self, base_path: Path):
        self.base_path = base_path
        self._cache: Optional[Dict[str, dict]] = None

    # ------------------------------------------------------------ 基础工具

    def detect_platform(self, filename: str) -> Optional[str]:
        """检测文件所属平台"""
        ext = Path(filename).suffix.lower()
        for platform, extensions in settings.platform_extensions.items():
            if ext in extensions:
                return platform
        return None

    def extract_version(self, filename: str) -> str:
        """从文件名提取版本号"""
        for pattern in self.VERSION_PATTERNS:
            match = re.search(pattern, filename, re.IGNORECASE)
            if match:
                return match.group(1)
        return "1.0.0"  # 默认版本

    def extract_resource_name(self, filename: str, platform: str) -> str:
        """从文件名提取资源名称"""
        # 移除版本号和扩展名
        name = Path(filename).stem

        # 移除版本号模式
        for pattern in self.VERSION_PATTERNS:
            name = re.sub(pattern, "", name, flags=re.IGNORECASE)

        # 清理名称
        name = name.strip(" -_[]")
        return name

    # ------------------------------------------------------------ APK 缓存

    @property
    def cache_path(self) -> Path:
        return settings.upload_dir / "cache" / APK_CACHE_FILE

    def _load_cache(self) -> Dict[str, dict]:
        if self._cache is not None:
            return self._cache
        try:
            self._cache = json.loads(self.cache_path.read_text("utf-8"))
        except Exception:
            self._cache = {}
        return self._cache

    def _save_cache(self) -> None:
        try:
            self.cache_path.parent.mkdir(parents=True, exist_ok=True)
            self.cache_path.write_text(
                json.dumps(self._cache or {}, ensure_ascii=False, indent=2),
                encoding="utf-8",
            )
        except Exception:
            pass

    # ------------------------------------------------------------ APK 解析

    def _save_icon(self, relative_path: str, info: ApkInfo) -> Optional[str]:
        if not info.icon_png:
            return None

        digest = hashlib.sha1((info.package or relative_path).encode("utf-8")).hexdigest()[:16]
        filename = f"{digest}.png"
        icon_dir = settings.upload_dir / "covers" / APK_ICON_DIR
        icon_dir.mkdir(parents=True, exist_ok=True)
        icon_file = icon_dir / filename
        if not icon_file.exists():
            icon_file.write_bytes(info.icon_png)
        return f"/api/v1/static/covers/{APK_ICON_DIR}/{filename}"

    def apk_meta(self, file_path: Path, relative_path: str) -> Optional[dict]:
        """解析（并缓存）APK 元信息，返回可直接写库的字典。"""
        cache = self._load_cache()
        try:
            stat = file_path.stat()
            mtime, size = stat.st_mtime, stat.st_size
        except OSError:
            return None

        cached = cache.get(relative_path)
        if cached and cached.get("mtime") == mtime and cached.get("size") == size:
            return None if cached.get("failed") else cached

        info = parse_apk(file_path)
        if not info:
            # 解析失败也缓存，避免每次扫描都重试
            cache[relative_path] = {"mtime": mtime, "size": size, "failed": True}
            return None

        data = {"mtime": mtime, "size": size, **info.to_dict()}
        data["icon"] = self._save_icon(relative_path, info)
        cache[relative_path] = data
        return data

    # ------------------------------------------------------------ 写库

    def _apply_apk_meta(self, resource: Resource, meta: dict, filename: str, platform: str) -> None:
        """把 APK 元信息写到资源上（用户手动改过的名字不覆盖）。"""
        legacy_name = self.extract_resource_name(filename, platform)
        label = (meta.get("label") or "").strip()
        if label and resource.name in (legacy_name, Path(filename).stem, ""):
            resource.name = label

        if meta.get("package"):
            resource.package_name = meta["package"]
        if meta.get("version_name"):
            resource.app_version = meta["version_name"]
        if meta.get("version_code"):
            resource.version_code = str(meta["version_code"])
        if meta.get("min_sdk"):
            resource.min_sdk = str(meta["min_sdk"])
        if meta.get("target_sdk"):
            resource.target_sdk = str(meta["target_sdk"])
        if meta.get("architectures"):
            resource.architectures = meta["architectures"]
        if meta.get("permissions") is not None:
            resource.permissions_count = int(meta["permissions"])
        icon = meta.get("icon")
        if icon:
            resource.cover_image = icon
        elif resource.cover_image and "/covers/apk/" in resource.cover_image:
            # 之前解析出的图标已失效（例如纯空白图），清掉让前端用首字母占位
            resource.cover_image = None

    def _find_resource(
        self,
        db: Session,
        platform: str,
        name: str,
        meta: Optional[dict],
        existing_version: Optional[Version],
    ) -> Optional[Resource]:
        if existing_version is not None:
            return existing_version.resource

        package = (meta or {}).get("package")
        if package:
            resource = (
                db.query(Resource)
                .filter(Resource.platform == platform, Resource.package_name == package)
                .first()
            )
            if resource:
                return resource

        return (
            db.query(Resource)
            .filter(Resource.platform == platform, Resource.name == name)
            .first()
        )

    def _merge_duplicates(self, db: Session, resource: Resource, package: str) -> None:
        """同一个包名只保留一个资源，把历史重复项合并进来。"""
        db.flush()
        candidates = (
            db.query(Resource)
            .filter(
                Resource.platform == resource.platform,
                Resource.id != resource.id,
                or_(
                    Resource.package_name == package,
                    and_(Resource.package_name.is_(None), Resource.name == resource.name),
                ),
            )
            .all()
        )
        merged = False
        for duplicate in candidates:
            if duplicate.package_name not in (None, package):
                continue
            # 用 Core 语句搬移版本，避免 ORM 级联把搬走的版本删掉
            db.query(Version).filter(Version.resource_id == duplicate.id).update(
                {Version.resource_id: resource.id}, synchronize_session=False
            )
            db.query(Resource).filter(Resource.id == duplicate.id).delete(
                synchronize_session=False
            )
            merged = True
        if merged:
            db.expire_all()

    def _drop_if_empty(self, db: Session, resource_id: int) -> None:
        count = db.query(Version).filter(Version.resource_id == resource_id).count()
        if count == 0:
            db.query(Resource).filter(Resource.id == resource_id).delete(
                synchronize_session=False
            )

    def index_file(self, db: Session, file_path: Path, relative_path: str) -> str:
        """把一个文件登记到数据库，返回 created / updated。"""
        filename = file_path.name
        platform = self.detect_platform(filename)
        if not platform:
            return "skipped"

        # Session 关闭了 autoflush，先落盘上一轮的元数据，保证按包名查找/合并能查到
        db.flush()
        file_size = file_path.stat().st_size
        ext = file_path.suffix.lower()

        meta: Optional[dict] = None
        if ext == ".apk":
            meta = self.apk_meta(file_path, relative_path)

        # 提取信息（APK 优先用清单里的应用名/版本）
        version = self.extract_version(filename)
        resource_name = self.extract_resource_name(filename, platform)
        if meta:
            version = (meta.get("version_name") or version).strip() or version
            resource_name = (meta.get("label") or resource_name).strip() or resource_name

        existing_version = (
            db.query(Version).filter(Version.file_path == relative_path).first()
        )
        resource = self._find_resource(db, platform, resource_name, meta, existing_version)

        status = "updated"
        if not resource:
            resource = Resource(name=resource_name, platform=platform)
            db.add(resource)
            db.flush()
            status = "created"

        if meta:
            self._apply_apk_meta(resource, meta, filename, platform)
            if meta.get("package"):
                self._merge_duplicates(db, resource, meta["package"])

        if existing_version is not None:
            # 文件已入库：同步版本号/大小，必要时迁移到合并后的资源
            old_resource_id = existing_version.resource_id
            existing_version.version = version
            existing_version.file_size = file_size
            if old_resource_id != resource.id:
                db.query(Version).filter(Version.id == existing_version.id).update(
                    {Version.resource_id: resource.id}, synchronize_session=False
                )
                db.flush()
                self._drop_if_empty(db, old_resource_id)
        else:
            db.add(
                Version(
                    resource_id=resource.id,
                    version=version,
                    file_path=relative_path,
                    file_size=file_size,
                )
            )

        return status

    def scan_directory(self, db: Session) -> ScanResult:
        """扫描目录并更新数据库"""
        result = ScanResult(scanned=0, created=0, updated=0, errors=[])

        if not self.base_path.exists():
            result.errors.append(f"目录不存在: {self.base_path}")
            return result

        # 收集所有支持的扩展名
        all_extensions: Set[str] = set()
        for extensions in settings.platform_extensions.values():
            all_extensions.update(extensions)

        # 使用 os.walk 进行更高效的遍历
        for root, dirs, files in os.walk(self.base_path):
            # 过滤掉不需要扫描的目录（修改 dirs 会影响后续遍历）
            dirs[:] = [d for d in dirs if d not in self.SKIP_DIRS]

            for filename in files:
                ext = Path(filename).suffix.lower()
                if ext not in all_extensions:
                    continue

                file_path = Path(root) / filename
                result.scanned += 1

                try:
                    relative_path = str(file_path.relative_to(self.base_path))
                    status = self.index_file(db, file_path, relative_path)
                    if status == "created":
                        result.created += 1
                    elif status == "updated":
                        result.updated += 1
                except Exception as e:
                    result.errors.append(f"处理文件 {file_path} 时出错: {str(e)}")

        try:
            db.commit()
        except Exception as e:
            db.rollback()
            result.errors.append(f"数据库提交失败: {str(e)}")

        self._save_cache()
        return result

    def get_platform_stats(self, db: Session) -> dict[str, int]:
        """获取各平台资源统计"""
        stats = {}
        for platform in settings.platforms:
            count = (
                db.query(Resource)
                .filter(Resource.platform == platform)
                .count()
            )
            stats[platform] = count
        return stats
