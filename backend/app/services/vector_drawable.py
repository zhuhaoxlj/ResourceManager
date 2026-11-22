"""Android VectorDrawable 极简光栅化器（纯 Pillow 实现）。

APK 里的自适应图标（adaptive-icon）通常只有矢量前景 + 纯色背景，
不能直接当图片用。这里把 VectorDrawable 的 pathData 解析成多边形，
再用 Pillow 画出来，足够用于列表页/详情页展示。

支持：M/L/H/V/C/S/Q/T/A/Z 指令、group 变换、填充/描边、纯色与渐变近似。
不支持：clip-path、复杂渐变、动画。
"""

from __future__ import annotations

import math
import re
import xml.etree.ElementTree as ET
from typing import Callable, List, Optional, Tuple

from PIL import Image, ImageChops, ImageDraw

ANDROID_NS = "{http://schemas.android.com/apk/res/android}"
AAPT_NS = "{http://schemas.android.com/aapt}"

Point = Tuple[float, float]
Matrix = Tuple[float, float, float, float, float, float]  # a,b,c,d,e,f

_TOKEN_RE = re.compile(r"[MmLlHhVvCcSsQqTtAaZz]|[-+]?(?:\d+\.\d*|\.\d+|\d+)(?:[eE][-+]?\d+)?")


def _attr(element: ET.Element, name: str) -> Optional[str]:
    return element.get(ANDROID_NS + name)


def _float_attr(element: ET.Element, name: str, default: float = 0.0) -> float:
    value = _attr(element, name)
    if value is None:
        return default
    match = re.match(r"[-+]?[\d.]+(?:[eE][-+]?\d+)?", value.strip())
    if not match:
        return default
    try:
        return float(match.group(0))
    except ValueError:
        return default


def parse_color(raw: Optional[str]) -> Optional[Tuple[int, int, int, int]]:
    """解析 Android 颜色，支持 #RGB / #ARGB / #RRGGBB / #AARRGGBB。"""
    if not raw:
        return None
    value = raw.strip()
    if not value.startswith("#"):
        return None
    hexpart = value[1:]
    try:
        if len(hexpart) == 3:
            r, g, b = (int(c * 2, 16) for c in hexpart)
            return (r, g, b, 255)
        if len(hexpart) == 4:
            a, r, g, b = (int(c * 2, 16) for c in hexpart)
            return (r, g, b, a)
        if len(hexpart) == 6:
            return (int(hexpart[0:2], 16), int(hexpart[2:4], 16), int(hexpart[4:6], 16), 255)
        if len(hexpart) == 8:
            a = int(hexpart[0:2], 16)
            return (int(hexpart[2:4], 16), int(hexpart[4:6], 16), int(hexpart[6:8], 16), a)
    except ValueError:
        return None
    return None


# ---------------------------------------------------------------- 矩阵变换


def _identity() -> Matrix:
    return (1.0, 0.0, 0.0, 1.0, 0.0, 0.0)


def _multiply(m1: Matrix, m2: Matrix) -> Matrix:
    a1, b1, c1, d1, e1, f1 = m1
    a2, b2, c2, d2, e2, f2 = m2
    return (
        a1 * a2 + c1 * b2,
        b1 * a2 + d1 * b2,
        a1 * c2 + c1 * d2,
        b1 * c2 + d1 * d2,
        a1 * e2 + c1 * f2 + e1,
        b1 * e2 + d1 * f2 + f1,
    )


def _scale_matrix(sx: float, sy: float) -> Matrix:
    return (sx, 0.0, 0.0, sy, 0.0, 0.0)


def _translate_matrix(tx: float, ty: float) -> Matrix:
    return (1.0, 0.0, 0.0, 1.0, tx, ty)


def _rotate_matrix(degrees: float) -> Matrix:
    rad = math.radians(degrees)
    cos = math.cos(rad)
    sin = math.sin(rad)
    return (cos, sin, -sin, cos, 0.0, 0.0)


def _apply(matrix: Matrix, point: Point) -> Point:
    a, b, c, d, e, f = matrix
    x, y = point
    return (a * x + c * y + e, b * x + d * y + f)


# ---------------------------------------------------------------- path 解析


def _tokenize_path(data: str) -> List[str]:
    return _TOKEN_RE.findall(data)


def _cubic_points(p0: Point, p1: Point, p2: Point, p3: Point, steps: int = 14) -> List[Point]:
    points = []
    for i in range(1, steps + 1):
        t = i / steps
        mt = 1 - t
        x = mt**3 * p0[0] + 3 * mt**2 * t * p1[0] + 3 * mt * t**2 * p2[0] + t**3 * p3[0]
        y = mt**3 * p0[1] + 3 * mt**2 * t * p1[1] + 3 * mt * t**2 * p2[1] + t**3 * p3[1]
        points.append((x, y))
    return points


def _quad_points(p0: Point, p1: Point, p2: Point, steps: int = 12) -> List[Point]:
    points = []
    for i in range(1, steps + 1):
        t = i / steps
        mt = 1 - t
        x = mt**2 * p0[0] + 2 * mt * t * p1[0] + t**2 * p2[0]
        y = mt**2 * p0[1] + 2 * mt * t * p1[1] + t**2 * p2[1]
        points.append((x, y))
    return points


def _arc_points(
    p0: Point,
    rx: float,
    ry: float,
    rotation: float,
    large_arc: bool,
    sweep: bool,
    p1: Point,
) -> List[Point]:
    """SVG/VectorDrawable 圆弧转贝塞尔采样点。"""
    if rx == 0 or ry == 0 or p0 == p1:
        return [p1]

    rx, ry = abs(rx), abs(ry)
    phi = math.radians(rotation)
    cos_phi, sin_phi = math.cos(phi), math.sin(phi)

    dx = (p0[0] - p1[0]) / 2
    dy = (p0[1] - p1[1]) / 2
    x1 = cos_phi * dx + sin_phi * dy
    y1 = -sin_phi * dx + cos_phi * dy

    lam = (x1**2) / (rx**2) + (y1**2) / (ry**2)
    if lam > 1:
        scale = math.sqrt(lam)
        rx *= scale
        ry *= scale

    sign = -1 if large_arc == sweep else 1
    numerator = rx**2 * ry**2 - rx**2 * y1**2 - ry**2 * x1**2
    denominator = rx**2 * y1**2 + ry**2 * x1**2
    coef = sign * math.sqrt(max(0.0, numerator / denominator)) if denominator else 0.0
    cx1 = coef * (rx * y1 / ry)
    cy1 = coef * -(ry * x1 / rx)

    cx = cos_phi * cx1 - sin_phi * cy1 + (p0[0] + p1[0]) / 2
    cy = sin_phi * cx1 + cos_phi * cy1 + (p0[1] + p1[1]) / 2

    def angle(ux: float, uy: float, vx: float, vy: float) -> float:
        dot = ux * vx + uy * vy
        norm = math.hypot(ux, uy) * math.hypot(vx, vy)
        if norm == 0:
            return 0.0
        value = max(-1.0, min(1.0, dot / norm))
        sign2 = 1 if (ux * vy - uy * vx) > 0 else -1
        return sign2 * math.acos(value)

    theta1 = angle(1, 0, (x1 - cx1) / rx, (y1 - cy1) / ry)
    delta = angle((x1 - cx1) / rx, (y1 - cy1) / ry, (-x1 - cx1) / rx, (-y1 - cy1) / ry)
    if not sweep and delta > 0:
        delta -= 2 * math.pi
    elif sweep and delta < 0:
        delta += 2 * math.pi

    steps = max(6, int(abs(delta) / (math.pi / 8)))
    points = []
    for i in range(1, steps + 1):
        t = theta1 + delta * i / steps
        x = cx + rx * math.cos(t) * cos_phi - ry * math.sin(t) * sin_phi
        y = cy + rx * math.cos(t) * sin_phi + ry * math.sin(t) * cos_phi
        points.append((x, y))
    return points


class _PathBuilder:
    """把 pathData 变成一组多边形（每个子路径一个点列）。"""

    def __init__(self) -> None:
        self.subpaths: List[List[Point]] = []
        self.current: List[Point] = []
        self.start: Point = (0.0, 0.0)
        self.point: Point = (0.0, 0.0)
        self.previous_curve: Optional[Tuple[Point, Point]] = None
        self.previous_quad: Optional[Point] = None

    def finish(self) -> List[List[Point]]:
        self._close()
        return [p for p in self.subpaths if len(p) >= 3]

    def _close(self) -> None:
        if len(self.current) >= 2:
            self.subpaths.append(self.current)
        self.current = []

    def line_to(self, point: Point) -> None:
        if not self.current:
            self.current = [self.point]
        self.current.append(point)
        self.point = point
        self.previous_curve = None
        self.previous_quad = None

    def cubic_to(self, p1: Point, p2: Point, p3: Point) -> None:
        if not self.current:
            self.current = [self.point]
        self.current.extend(_cubic_points(self.point, p1, p2, p3))
        self.previous_curve = (p2, p3)
        self.previous_quad = None
        self.point = p3

    def quad_to(self, p1: Point, p2: Point) -> None:
        if not self.current:
            self.current = [self.point]
        self.current.extend(_quad_points(self.point, p1, p2))
        self.previous_quad = p1
        self.previous_curve = None
        self.point = p2

    def move_to(self, point: Point) -> None:
        self._close()
        self.start = point
        self.point = point
        self.current = [point]
        self.previous_curve = None
        self.previous_quad = None


def parse_path_data(data: str) -> List[List[Point]]:
    """解析 pathData 为若干子路径的点集（曲线已离散化）。"""
    tokens = _tokenize_path(data)
    if not tokens:
        return []

    builder = _PathBuilder()
    index = 0
    command = "M"

    def number() -> float:
        nonlocal index
        value = float(tokens[index])
        index += 1
        return value

    def has_number() -> bool:
        if index >= len(tokens):
            return False
        return not tokens[index].isalpha()

    while index < len(tokens):
        token = tokens[index]
        if token.isalpha():
            command = token
            index += 1
            if command in "Zz":
                builder.move_to(builder.start)
                continue

        absolute = command.isupper()
        letter = command.upper()

        if letter == "M":
            x, y = number(), number()
            point = (x, y) if absolute else (builder.point[0] + x, builder.point[1] + y)
            builder.move_to(point)
            # 后续隐式坐标按 lineto 处理
            command = "L" if absolute else "l"
        elif letter == "L":
            x, y = number(), number()
            builder.line_to((x, y) if absolute else (builder.point[0] + x, builder.point[1] + y))
        elif letter == "H":
            x = number()
            builder.line_to((x if absolute else builder.point[0] + x, builder.point[1]))
        elif letter == "V":
            y = number()
            builder.line_to((builder.point[0], y if absolute else builder.point[1] + y))
        elif letter == "C":
            x1, y1, x2, y2, x, y = (number() for _ in range(6))
            base = builder.point
            p1 = (x1, y1) if absolute else (base[0] + x1, base[1] + y1)
            p2 = (x2, y2) if absolute else (base[0] + x2, base[1] + y2)
            p3 = (x, y) if absolute else (base[0] + x, base[1] + y)
            builder.cubic_to(p1, p2, p3)
        elif letter == "S":
            x2, y2, x, y = (number() for _ in range(4))
            base = builder.point
            if builder.previous_curve:
                c2, end = builder.previous_curve
                p1 = (2 * base[0] - c2[0], 2 * base[1] - c2[1])
            else:
                p1 = base
            p2 = (x2, y2) if absolute else (base[0] + x2, base[1] + y2)
            p3 = (x, y) if absolute else (base[0] + x, base[1] + y)
            builder.cubic_to(p1, p2, p3)
        elif letter == "Q":
            x1, y1, x, y = (number() for _ in range(4))
            base = builder.point
            p1 = (x1, y1) if absolute else (base[0] + x1, base[1] + y1)
            p2 = (x, y) if absolute else (base[0] + x, base[1] + y)
            builder.quad_to(p1, p2)
        elif letter == "T":
            x, y = number(), number()
            base = builder.point
            if builder.previous_quad:
                p1 = (2 * base[0] - builder.previous_quad[0], 2 * base[1] - builder.previous_quad[1])
            else:
                p1 = base
            p2 = (x, y) if absolute else (base[0] + x, base[1] + y)
            builder.quad_to(p1, p2)
        elif letter == "A":
            rx, ry, rotation, large_arc, sweep, x, y = (number() for _ in range(7))
            target = (x, y) if absolute else (builder.point[0] + x, builder.point[1] + y)
            if not builder.current:
                builder.current = [builder.point]
            builder.current.extend(
                _arc_points(builder.point, rx, ry, rotation, bool(large_arc), bool(sweep), target)
            )
            builder.point = target
            builder.previous_curve = None
            builder.previous_quad = None
        else:
            index += 1

    return builder.finish()


# ---------------------------------------------------------------- 渲染


def _group_matrix(element: ET.Element) -> Matrix:
    matrix = _identity()
    tx = _float_attr(element, "translateX")
    ty = _float_attr(element, "translateY")
    sx = _float_attr(element, "scaleX", 1.0)
    sy = _float_attr(element, "scaleY", 1.0)
    rotation = _float_attr(element, "rotation")
    px = _float_attr(element, "pivotX")
    py = _float_attr(element, "pivotY")

    if tx or ty:
        matrix = _multiply(_translate_matrix(tx, ty), matrix)
    matrix = _multiply(_translate_matrix(px, py), matrix)
    if rotation:
        matrix = _multiply(_rotate_matrix(rotation), matrix)
    if sx != 1.0 or sy != 1.0:
        matrix = _multiply(_scale_matrix(sx, sy), matrix)
    matrix = _multiply(_translate_matrix(-px, -py), matrix)
    return matrix


def _gradient_color(path: ET.Element) -> Optional[str]:
    for child in path:
        if child.tag == AAPT_NS + "attr" and child.get("name") == "android:fillColor":
            for gradient in child:
                if gradient.tag.endswith("gradient") or "gradient" in gradient.tag:
                    return (
                        _attr(gradient, "startColor")
                        or _attr(gradient, "centerColor")
                        or _attr(gradient, "endColor")
                    )
    return None


def _draw_path(
    element: ET.Element,
    matrix: Matrix,
    canvas: Image.Image,
    resolve_color: Optional[Callable[[str], Optional[str]]],
) -> None:
    path_data = _attr(element, "pathData")
    if not path_data:
        return

    subpaths = parse_path_data(path_data)
    if not subpaths:
        return

    fill_raw = _attr(element, "fillColor") or _gradient_color(element)
    stroke_raw = _attr(element, "strokeColor")
    stroke_width = _float_attr(element, "strokeWidth")

    fill_color = parse_color(fill_raw)
    if fill_color is None and fill_raw and fill_raw.startswith("@") and resolve_color:
        fill_color = parse_color(resolve_color(fill_raw))
    stroke_color = parse_color(stroke_raw)
    if stroke_color is None and stroke_raw and stroke_raw.startswith("@") and resolve_color:
        stroke_color = parse_color(resolve_color(stroke_raw))

    if fill_color is None and (stroke_color is None or stroke_width <= 0):
        return

    alpha = _float_attr(element, "fillAlpha", 1.0)
    width, height = canvas.size
    scale = min(width, height) / 100.0

    mask = Image.new("1", (width, height), 0)
    draw = ImageDraw.Draw(mask)
    for subpath in subpaths:
        polygon = [_apply(matrix, point) for point in subpath]
        if len(polygon) < 3:
            continue
        pixel_points = [(int(round(x)), int(round(y))) for x, y in polygon]
        sub_mask = Image.new("1", (width, height), 0)
        ImageDraw.Draw(sub_mask).polygon(pixel_points, fill=1)
        mask = ImageChops.logical_xor(mask, sub_mask)

    if fill_color is not None:
        r, g, b, a = fill_color
        fill_alpha = int(a * alpha)
        if fill_alpha > 0:
            layer = Image.new("RGBA", (width, height), (r, g, b, fill_alpha))
            canvas.paste(layer, (0, 0), mask)

    if stroke_color is not None and stroke_width > 0:
        r, g, b, a = stroke_color
        stroke_alpha = int(a * _float_attr(element, "strokeAlpha", 1.0))
        stroke_pixels = max(1, int(round(stroke_width * scale)))
        stroke_layer = Image.new("RGBA", (width, height), (0, 0, 0, 0))
        stroke_draw = ImageDraw.Draw(stroke_layer)
        for subpath in subpaths:
            points = [
                (int(round(x)), int(round(y)))
                for x, y in (_apply(matrix, point) for point in subpath)
            ]
            if len(points) >= 2:
                stroke_draw.line(points, fill=(r, g, b, stroke_alpha), width=stroke_pixels, joint="curve")
        canvas.paste(stroke_layer, (0, 0), stroke_layer)


def _walk(
    element: ET.Element,
    matrix: Matrix,
    canvas: Image.Image,
    resolve_color: Optional[Callable[[str], Optional[str]]],
) -> None:
    for child in element:
        tag = child.tag.split("}")[-1]
        if tag == "group":
            _walk(child, _multiply(matrix, _group_matrix(child)), canvas, resolve_color)
        elif tag == "path":
            _draw_path(child, matrix, canvas, resolve_color)
        elif tag in ("clip-path",):
            continue
        else:
            _walk(child, matrix, canvas, resolve_color)


def render_vector(
    xml_text: str,
    size: int = 256,
    resolve_color: Optional[Callable[[str], Optional[str]]] = None,
    supersample: int = 2,
) -> Optional[Image.Image]:
    """把 VectorDrawable XML 渲染成 RGBA 图片；失败返回 None。"""
    try:
        root = ET.fromstring(xml_text)
    except ET.ParseError:
        return None

    viewport_width = _float_attr(root, "viewportWidth", size)
    viewport_height = _float_attr(root, "viewportHeight", size)
    if viewport_width <= 0 or viewport_height <= 0:
        return None

    width = size * supersample
    height = size * supersample
    matrix = _scale_matrix(width / viewport_width, height / viewport_height)

    canvas = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    _walk(root, matrix, canvas, resolve_color)

    return canvas.resize((size, size), Image.LANCZOS)
