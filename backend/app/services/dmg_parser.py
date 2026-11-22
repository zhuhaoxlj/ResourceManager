"""DMG（macOS 磁盘映像）解析：应用名、Bundle ID、版本、系统要求、架构、图标。

容器里没有 hdiutil，改用 7-Zip 读取 DMG（UDIF + HFS/APFS）：
只按需解出 .app 的 Info.plist、.icns 和可执行文件头，避免整盘解压。
"""

from __future__ import annotations

import io
import plistlib
import re
import shutil
import struct
import subprocess
import tempfile
from dataclasses import dataclass, field
from pathlib import Path
from typing import List, Optional, Tuple

from PIL import Image

SEVEN_ZIP = shutil.which("7z") or "7z"
TIMEOUT = 120
ICON_MAX = 512

# 7z -ba 输出：日期 时间 属性 大小 压缩后大小 路径
_ENTRY_RE = re.compile(r"^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} (\S+) +(\d*) +(\d*) +(.*)$")

# 辅助程序的 .app 不算主应用
_HELPER_DIRS = re.compile(
    r"/Contents/(Frameworks|Library|PlugIns|XPCServices|Helpers|Resources)/"
)

_CATEGORY_MAP = {
    "developer-tools": "开发工具",
    "graphics-design": "图形设计",
    "productivity": "效率",
    "utilities": "工具",
    "video": "影音",
    "music": "音乐",
    "photography": "摄影",
    "social-networking": "社交",
    "finance": "财务",
    "games": "游戏",
    "education": "教育",
    "business": "商务",
    "reference": "参考",
    "news": "新闻",
    "medical": "医疗",
    "lifestyle": "生活",
    "entertainment": "娱乐",
    "books": "图书",
    "weather": "天气",
    "travel": "旅行",
    "sports": "体育",
    "food-and-drink": "美食",
    "shopping": "购物",
    "navigation": "导航",
    "healthcare-fitness": "健康健美",
    "magazines-newspapers": "报刊",
}

_CPU_NAMES = {
    0x01000007: "x86_64",
    0x0100000C: "arm64",
    0x00000007: "i386",
    0x0000000C: "arm",
    0x00000012: "ppc",
    0x01000012: "ppc64",
}


@dataclass
class DmgInfo:
    """从 DMG 里解析出来的展示信息"""

    label: Optional[str] = None
    bundle_id: Optional[str] = None
    version: Optional[str] = None
    build: Optional[str] = None
    min_os: Optional[str] = None
    category: Optional[str] = None
    architectures: List[str] = field(default_factory=list)
    icon_png: Optional[bytes] = None

    def to_dict(self) -> dict:
        """转成和 APK 元信息一致的结构，方便扫描器统一写库"""
        return {
            "label": self.label,
            "package": self.bundle_id,
            "version_name": self.version,
            "version_code": self.build,
            "min_sdk": self.min_os,
            "target_sdk": None,
            "architectures": ",".join(self.architectures),
            "permissions": None,
            "category": self.category,
        }


def _run(args: List[str], timeout: int = TIMEOUT) -> subprocess.CompletedProcess:
    return subprocess.run(
        args,
        stdout=subprocess.PIPE,
        stderr=subprocess.DEVNULL,
        timeout=timeout,
        check=False,
    )


def list_entries(dmg_path: Path) -> List[Tuple[str, int]]:
    """列出 DMG 内所有条目（路径 + 大小）。

    注意：7-Zip 对某些镜像会返回码 2（有警告）但列表仍然可用，所以不看返回码。
    """
    try:
        result = _run([SEVEN_ZIP, "l", "-ba", str(dmg_path)])
    except (subprocess.TimeoutExpired, OSError):
        return []

    entries: List[Tuple[str, int]] = []
    for raw_line in result.stdout.decode("utf-8", "replace").splitlines():
        match = _ENTRY_RE.match(raw_line)
        if not match:
            continue
        attr, size, _packed, name = match.groups()
        if "D" in attr:  # 目录
            continue
        try:
            entry_size = int(size) if size else 0
        except ValueError:
            entry_size = 0
        entries.append((name, entry_size))
    return entries


def _extract(dmg_path: Path, internal_path: str, workdir: Path) -> Optional[bytes]:
    """把 DMG 里的单个文件解到临时目录再读出来。"""
    try:
        _run([SEVEN_ZIP, "x", "-y", f"-o{workdir}", str(dmg_path), internal_path])
    except (subprocess.TimeoutExpired, OSError):
        return None

    target = workdir / internal_path
    if not target.is_file():
        # 某些版本会把路径分隔符改写，兜底按文件名找
        candidates = list(workdir.rglob(Path(internal_path).name))
        if not candidates:
            return None
        target = max(candidates, key=lambda item: item.stat().st_size)
    try:
        return target.read_bytes()
    except OSError:
        return None


def _parse_plist(raw: bytes) -> Optional[dict]:
    """解析 plist；兼容缺少 <?xml 声明、只有 DOCTYPE 的 XML plist。"""
    try:
        return plistlib.loads(raw)
    except Exception:
        pass

    head = raw.lstrip()
    if not (head.startswith(b"<!DOCTYPE plist") or head.startswith(b"<plist")):
        return None

    declaration = b'<?xml version="1.0" encoding="UTF-8"?>\n'
    for candidate in (declaration + head, None):
        if candidate is None:
            end = head.find(b"</plist>")
            if end < 0:
                return None
            candidate = declaration + head[: end + len(b"</plist>")]
        try:
            return plistlib.loads(candidate)
        except Exception:
            continue
    return None


def _pick_main_plist(entries: List[Tuple[str, int]]) -> Optional[str]:
    candidates = [
        path
        for path, _size in entries
        if path.endswith("/Contents/Info.plist") and not _HELPER_DIRS.search(path)
    ]
    if not candidates:
        return None

    # 层级最少的就是主 .app；同层级里排除 Install/Uninstall 这类辅助程序
    best_depth = min(path.count("/") for path in candidates)
    top = sorted(path for path in candidates if path.count("/") == best_depth)
    preferred = [
        path
        for path in top
        if not re.search(r"/(install|uninstall|setup|updater|upgrade)[^/]*\.app/", path, re.IGNORECASE)
    ]
    return (preferred or top)[0]


def _icon_candidates(
    entries: List[Tuple[str, int]], app_dir: str, plist: dict
) -> List[str]:
    resources = f"{app_dir}/Contents/Resources/"
    candidates: List[str] = []

    icon_file = plist.get("CFBundleIconFile") or plist.get("CFBundleIconName")
    if isinstance(icon_file, str) and icon_file:
        name = icon_file if icon_file.lower().endswith(".icns") else f"{icon_file}.icns"
        preferred = f"{resources}{name}"
        if any(path == preferred for path, _ in entries):
            candidates.append(preferred)

    icns = [
        (path, size)
        for path, size in entries
        if path.startswith(resources) and path.lower().endswith(".icns") and size > 0
    ]
    if not icns:
        # 退一步：整个 app 里任意 icns
        icns = [
            (path, size)
            for path, size in entries
            if path.startswith(app_dir + "/") and path.lower().endswith(".icns") and size > 0
        ]

    def score(item: Tuple[str, int]) -> Tuple[int, int, int]:
        path, size = item
        lower = path.lower()
        hint = 2 if "appicon" in lower else (1 if "icon" in lower else 0)
        return (hint, size, -path.count("/"))

    for path, _size in sorted(icns, key=score, reverse=True):
        if path not in candidates:
            candidates.append(path)
    return candidates


def _icns_to_png(data: bytes) -> Optional[bytes]:
    try:
        with Image.open(io.BytesIO(data)) as image:
            image = image.convert("RGBA")
            if max(image.size) > ICON_MAX:
                image.thumbnail((ICON_MAX, ICON_MAX), Image.LANCZOS)
            buffer = io.BytesIO()
            image.save(buffer, format="PNG", optimize=True)
            return buffer.getvalue()
    except Exception:
        return None


def _mach_o_archs(dmg_path: Path, exec_path: str) -> List[str]:
    """读取可执行文件的 Mach-O 头（只读前几 KB）判断架构。"""
    try:
        process = subprocess.Popen(
            [SEVEN_ZIP, "e", "-so", str(dmg_path), exec_path],
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
        )
    except OSError:
        return []

    try:
        head = process.stdout.read(4096) if process.stdout else b""
    finally:
        process.kill()
        try:
            process.communicate(timeout=5)
        except Exception:
            pass

    if len(head) < 8:
        return []

    archs: List[str] = []
    magic_be = struct.unpack(">I", head[:4])[0]
    magic_le = struct.unpack("<I", head[:4])[0]

    def add(cpu: int) -> None:
        name = _CPU_NAMES.get(cpu & 0xFFFFFFFF)
        if name and name not in archs:
            archs.append(name)

    if magic_be in (0xCAFEBABE, 0xCAFEBABF):  # fat (big endian)
        count = struct.unpack(">I", head[4:8])[0]
        for i in range(min(count, 8)):
            offset = 8 + i * 20
            if offset + 4 > len(head):
                break
            add(struct.unpack(">I", head[offset : offset + 4])[0])
    elif magic_le in (0xCAFEBABE, 0xCAFEBABF):  # fat (little endian)
        count = struct.unpack("<I", head[4:8])[0]
        for i in range(min(count, 8)):
            offset = 8 + i * 20
            if offset + 4 > len(head):
                break
            add(struct.unpack("<I", head[offset : offset + 4])[0])
    elif magic_le in (0xFEEDFACF, 0xFEEDFACE, 0xFEEDFACD):
        add(struct.unpack("<I", head[4:8])[0])
    elif magic_be in (0xFEEDFACF, 0xFEEDFACE):
        add(struct.unpack(">I", head[4:8])[0])
    return archs


def _category(value: Optional[str]) -> Optional[str]:
    if not value:
        return None
    key = value.split(".")[-1]
    return _CATEGORY_MAP.get(key, key.replace("-", " ") or None)


def parse_dmg(path: Path) -> Optional[DmgInfo]:
    """解析 DMG，失败返回 None（驱动包、损坏文件等）。"""
    try:
        entries = list_entries(path)
    except (subprocess.TimeoutExpired, OSError):
        return None
    if not entries:
        return None

    plist_path = _pick_main_plist(entries)
    if not plist_path:
        return None

    app_dir = plist_path[: -len("/Contents/Info.plist")]
    info = DmgInfo()

    workdir = Path(tempfile.mkdtemp(prefix="dmg-"))
    try:
        raw_plist = _extract(path, plist_path, workdir)
        if not raw_plist:
            return None
        plist = _parse_plist(raw_plist)
        if not plist:
            return None

        display = plist.get("CFBundleDisplayName") or plist.get("CFBundleName")
        if isinstance(display, str) and display.strip():
            info.label = display.strip()
        elif Path(app_dir).name.endswith(".app"):
            info.label = Path(app_dir).name[: -len(".app")]

        bundle_id = plist.get("CFBundleIdentifier")
        if isinstance(bundle_id, str):
            info.bundle_id = bundle_id

        version = plist.get("CFBundleShortVersionString")
        if isinstance(version, str):
            info.version = version
        build = plist.get("CFBundleVersion")
        if isinstance(build, str):
            info.build = build

        min_os = plist.get("LSMinimumSystemVersion")
        if isinstance(min_os, str):
            info.min_os = min_os

        info.category = _category(plist.get("LSApplicationCategoryType"))

        for icon_path in _icon_candidates(entries, app_dir, plist):
            raw_icon = _extract(path, icon_path, workdir)
            if not raw_icon:
                continue
            png = _icns_to_png(raw_icon)
            if png:
                info.icon_png = png
                break

        executable = plist.get("CFBundleExecutable")
        if isinstance(executable, str) and executable:
            exec_path = f"{app_dir}/Contents/MacOS/{executable}"
            if any(entry == exec_path for entry, _ in entries):
                info.architectures = _mach_o_archs(path, exec_path)
    finally:
        shutil.rmtree(workdir, ignore_errors=True)

    return info
