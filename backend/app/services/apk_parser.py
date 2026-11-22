"""APK 元信息解析：应用名、包名、版本、SDK、架构、图标。

依赖 androguard 解析 AndroidManifest / resources.arsc，
图标若是自适应图标（adaptive-icon），会用 Pillow 把矢量前景画出来。
"""

from __future__ import annotations

import io
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import List, Optional

from PIL import Image

# androguard 默认会输出大量 DEBUG 日志，直接关掉
try:  # pragma: no cover - 只做日志降噪
    from loguru import logger as _loguru_logger

    _loguru_logger.remove()
except Exception:  # pragma: no cover
    pass

from androguard.core.apk import APK  # noqa: E402
from androguard.core.axml import AXMLPrinter  # noqa: E402

from app.services.vector_drawable import parse_color, render_vector  # noqa: E402

ADAPTIVE_ICON_MAX = 512
_ARCH_PATTERN = re.compile(r"^lib/([^/]+)/")


@dataclass
class ApkInfo:
    """从 APK 里解析出来的展示信息"""

    package: Optional[str] = None
    label: Optional[str] = None
    version_name: Optional[str] = None
    version_code: Optional[str] = None
    min_sdk: Optional[str] = None
    target_sdk: Optional[str] = None
    architectures: List[str] = field(default_factory=list)
    permissions: int = 0
    icon_png: Optional[bytes] = None

    def to_dict(self) -> dict:
        return {
            "package": self.package,
            "label": self.label,
            "version_name": self.version_name,
            "version_code": self.version_code,
            "min_sdk": self.min_sdk,
            "target_sdk": self.target_sdk,
            "architectures": ",".join(self.architectures),
            "permissions": self.permissions,
        }


def _is_raster(data: bytes) -> bool:
    if not data:
        return False
    if data[:8] == b"\x89PNG\r\n\x1a\n":
        return True
    if data[:2] == b"\xff\xd8":
        return True
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return True
    return False


def _is_binary_xml(data: bytes) -> bool:
    # Android 二进制 XML 的魔数：0x0008 0000 ...
    return len(data) >= 8 and data[:2] == b"\x03\x00" and data[2:4] == b"\x08\x00"


def _xml_text(data: bytes) -> Optional[str]:
    try:
        return AXMLPrinter(data).get_xml().decode("utf-8", "replace")
    except Exception:
        return None


def _looks_blank(image: Optional[Image.Image]) -> bool:
    """图标是否几乎没有内容（全透明白图、纯色块），这类图标不如用占位符。"""
    if image is None:
        return True
    try:
        small = image.convert("RGBA").resize((16, 16))
    except Exception:
        return True
    visible = [pixel for pixel in small.getdata() if pixel[3] > 10]
    if len(visible) < 16:
        return True
    colors = {(r // 24, g // 24, b // 24) for r, g, b, _ in visible}
    brightness = sum(r + g + b for r, g, b, _ in visible) / (len(visible) * 3)
    if len(colors) <= 1 and brightness > 240:
        return True
    return False


def _to_png(data: bytes, max_size: int = ADAPTIVE_ICON_MAX) -> Optional[bytes]:
    """转成 PNG，顺手限制尺寸，避免超大图标。"""
    try:
        with Image.open(io.BytesIO(data)) as image:
            image = image.convert("RGBA")
            if max(image.size) > max_size:
                image.thumbnail((max_size, max_size), Image.LANCZOS)
            buffer = io.BytesIO()
            image.save(buffer, format="PNG", optimize=True)
            return buffer.getvalue()
    except Exception:
        return None


def _resource_value(apk: APK, reference: str) -> Optional[str]:
    """把 @7F05005F 这样的资源引用解析成颜色或文件路径。"""
    if not reference.startswith("@"):
        return reference
    try:
        res_id = int(reference[1:], 16)
    except ValueError:
        return None

    seen = set()
    current = res_id
    while current and current not in seen:
        seen.add(current)
        try:
            configs = apk.get_android_resources().get_resolved_res_configs(current)
        except Exception:
            return None
        if not configs:
            return None
        value = configs[0][1]
        if not isinstance(value, str):
            return None
        if value.startswith("@"):
            try:
                current = int(value[1:], 16)
            except ValueError:
                return None
            continue
        return value
    return None


def _adaptive_reference(apk: APK, reference: str, size: int) -> Optional[Image.Image]:
    """解析自适应图标的一个图层（背景/前景）。"""
    value = _resource_value(apk, reference)
    if not value:
        return None

    color = re.match(r"^#[0-9A-Fa-f]{3,8}$", value)
    if color:
        rgba = parse_color(value)
        if not rgba:
            return None
        return Image.new("RGBA", (size, size), rgba)

    if not value.startswith("res/"):
        return None

    try:
        data = apk.get_file(value)
    except Exception:
        return None
    if not data:
        return None

    if _is_raster(data):
        try:
            with Image.open(io.BytesIO(data)) as image:
                image = image.convert("RGBA")
                return image.resize((size, size), Image.LANCZOS)
        except Exception:
            return None

    if _is_binary_xml(data):
        text = _xml_text(data)
        if not text:
            return None
        if "<vector" in text:
            return render_vector(
                text,
                size=size,
                resolve_color=lambda reference: _resource_value(apk, reference),
            )
    return None


def _extract_icon(apk: APK) -> Optional[bytes]:
    try:
        icon_path = apk.get_app_icon()
    except Exception:
        icon_path = None
    if not icon_path:
        return None

    try:
        data = apk.get_file(icon_path)
    except Exception:
        data = b""
    if not data:
        return None

    if _is_raster(data):
        return _to_png(data)

    if not _is_binary_xml(data):
        return None

    text = _xml_text(data)
    if not text:
        return None

    # layer-list：常见于 Magisk 这类「纯色底 + 前景」的老式图标
    if "<layer-list" in text:
        work_size = 432
        canvas = Image.new("RGBA", (work_size, work_size), (0, 0, 0, 0))
        for item in re.findall(r"<item[^>]*>.*?</item>|<item[^>]*/>", text, re.S):
            drawable_ref = re.search(r'android:drawable="([^"]+)"', item)
            if drawable_ref:
                layer = _adaptive_reference(apk, drawable_ref.group(1), work_size)
                if layer:
                    canvas.alpha_composite(layer)
                continue
            solid = re.search(r'<solid[^>]*android:color="([^"]+)"', item)
            if solid:
                rgba = parse_color(solid.group(1))
                if rgba:
                    canvas.alpha_composite(Image.new("RGBA", (work_size, work_size), rgba))
        canvas = canvas.resize((ADAPTIVE_ICON_MAX, ADAPTIVE_ICON_MAX), Image.LANCZOS)
        return _image_to_png(canvas)

    # 普通矢量图标
    if "<vector" in text:
        image = render_vector(text, size=ADAPTIVE_ICON_MAX)
        return _image_to_png(image)

    # 自适应图标：前景 + 背景合成，按系统规则裁掉四周安全区
    if "<adaptive-icon" in text:
        background_ref = re.search(r'<background[^>]*android:drawable="([^"]+)"', text)
        foreground_ref = re.search(r'<foreground[^>]*android:drawable="([^"]+)"', text)

        work_size = 432  # 108dp * 4
        canvas = Image.new("RGBA", (work_size, work_size), (0, 0, 0, 0))
        if background_ref:
            layer = _adaptive_reference(apk, background_ref.group(1), work_size)
            if layer:
                canvas.alpha_composite(layer)
        if foreground_ref:
            layer = _adaptive_reference(apk, foreground_ref.group(1), work_size)
            if layer:
                canvas.alpha_composite(layer)

        # 自适应图标可视区域是中间 72/108
        margin = int(work_size * (18 / 108))
        canvas = canvas.crop((margin, margin, work_size - margin, work_size - margin))
        canvas = canvas.resize((ADAPTIVE_ICON_MAX, ADAPTIVE_ICON_MAX), Image.LANCZOS)
        return _image_to_png(canvas)

    return None


def _image_to_png(image: Optional[Image.Image]) -> Optional[bytes]:
    if image is None or _looks_blank(image):
        return None
    try:
        buffer = io.BytesIO()
        image.save(buffer, format="PNG", optimize=True)
        return buffer.getvalue()
    except Exception:
        return None


def _architectures(apk: APK) -> List[str]:
    try:
        names = apk.get_files()
    except Exception:
        return []

    archs: List[str] = []
    for name in names:
        match = _ARCH_PATTERN.match(name)
        if not match:
            continue
        arch = match.group(1)
        if arch not in archs:
            archs.append(arch)
    order = ["arm64-v8a", "armeabi-v7a", "armeabi", "x86_64", "x86", "riscv64"]
    archs.sort(key=lambda item: order.index(item) if item in order else len(order))
    return archs[:4]


def parse_apk(path: Path) -> Optional[ApkInfo]:
    """解析 APK，失败返回 None（损坏文件、非 APK 等）。"""
    try:
        apk = APK(str(path))
    except Exception:
        return None

    info = ApkInfo()

    try:
        info.package = apk.get_package()
    except Exception:
        info.package = None

    try:
        label = apk.get_app_name()
        if label and not label.startswith("res/"):
            info.label = label.strip()
    except Exception:
        info.label = None

    try:
        info.version_name = apk.get_androidversion_name()
    except Exception:
        info.version_name = None

    try:
        info.version_code = apk.get_androidversion_code()
    except Exception:
        info.version_code = None

    try:
        info.min_sdk = apk.get_min_sdk_version()
    except Exception:
        info.min_sdk = None

    try:
        info.target_sdk = apk.get_target_sdk_version()
    except Exception:
        info.target_sdk = None

    try:
        info.permissions = len(apk.get_permissions())
    except Exception:
        info.permissions = 0

    info.architectures = _architectures(apk)
    info.icon_png = _extract_icon(apk)
    return info


