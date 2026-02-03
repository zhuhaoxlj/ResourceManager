import os
import re
from pathlib import Path
from typing import List, Optional, Set
from sqlalchemy.orm import Session
from app.core.config import get_settings
from app.models.resource import Resource, Version
from app.schemas.resource import ScanResult

settings = get_settings()


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

            # 只处理支持的文件扩展名
            for filename in files:
                ext = Path(filename).suffix.lower()
                if ext not in all_extensions:
                    continue

                file_path = Path(root) / filename
                result.scanned += 1

                try:
                    # 检测平台
                    platform = self.detect_platform(filename)
                    if not platform:
                        continue

                    # 提取信息
                    version = self.extract_version(filename)
                    resource_name = self.extract_resource_name(filename, platform)
                    file_size = file_path.stat().st_size
                    relative_path = str(file_path.relative_to(self.base_path))

                    # 查找或创建资源
                    resource = (
                        db.query(Resource)
                        .filter(
                            Resource.name == resource_name,
                            Resource.platform == platform,
                        )
                        .first()
                    )

                    if not resource:
                        # 创建新资源
                        resource = Resource(
                            name=resource_name,
                            platform=platform,
                        )
                        db.add(resource)
                        db.flush()
                        result.created += 1
                    else:
                        result.updated += 1

                    # 检查版本是否已存在
                    existing_version = (
                        db.query(Version)
                        .filter(
                            Version.resource_id == resource.id,
                            Version.version == version,
                        )
                        .first()
                    )

                    if not existing_version:
                        # 创建新版本
                        version_record = Version(
                            resource_id=resource.id,
                            version=version,
                            file_path=relative_path,
                            file_size=file_size,
                        )
                        db.add(version_record)

                except Exception as e:
                    result.errors.append(f"处理文件 {file_path} 时出错: {str(e)}")

        try:
            db.commit()
        except Exception as e:
            db.rollback()
            result.errors.append(f"数据库提交失败: {str(e)}")

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
