"""Read public Switch package identifiers and match them against a local title catalog."""

import json
import re
import struct
from functools import lru_cache
from pathlib import Path
from urllib.parse import urlsplit

from app.core.config import settings

FORMATS = {".nsp", ".nsz", ".xci"}
TITLE_ID = re.compile(r"(?<![0-9a-f])01[0-9a-f]{14}(?![0-9a-f])", re.IGNORECASE)
TICKET = re.compile(rb"(01[0-9a-f]{14})[0-9a-f]{16}\.tik", re.IGNORECASE)
CONTENT_VERSION = re.compile(r"\[v(\d{1,10})\]", re.IGNORECASE)
CATALOG_FIELDS = (
    "name", "bannerUrl", "iconUrl", "description", "publisher", "developer", "releaseDate",
    "numberOfPlayers", "category",
)


def _ticket_title_id(stream, file_size: int) -> str | None:
    header = stream.read(16)
    if len(header) != 16 or header[:4] != b"PFS0":
        return None
    count, string_size = struct.unpack_from("<II", header, 4)
    if count > 4096 or string_size > 1024 * 1024 or 16 + count * 24 + string_size > file_size:
        return None
    stream.seek(16 + count * 24)
    names = stream.read(string_size)
    ids = {match[1].decode().upper() for name in names.split(b"\0") if (match := TICKET.fullmatch(name))}
    return next(iter(ids)) if len(ids) == 1 else None


@lru_cache(maxsize=2048)
def _read_container(path: Path, size: int, mtime_ns: int) -> tuple[str | None, bool]:
    with path.open("rb") as stream:
        if path.suffix.lower() == ".xci":
            stream.seek(0x100)
            return None, stream.read(4) == b"HEAD"
        valid = stream.read(4) == b"PFS0"
        stream.seek(0)
        return _ticket_title_id(stream, size), valid


@lru_cache(maxsize=1)
def _load_catalog(path: Path, mtime_ns: int) -> dict:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else {}
    except (OSError, ValueError):
        return {}


def _catalog() -> dict:
    path = settings.upload_dir / "switch-catalog.json"
    try:
        return _load_catalog(path, path.stat().st_mtime_ns)
    except OSError:
        return {}


def _cover(entry: dict) -> str | None:
    for key in ("bannerUrl", "iconUrl"):
        value = entry.get(key)
        if isinstance(value, str) and value.startswith("https://"):
            try:
                if urlsplit(value).hostname == "img-eshop.cdn.nintendo.net":
                    return value
            except ValueError:
                continue
    return None


def read_switch_metadata(root: Path, relative_path: str) -> dict | None:
    relative = Path(relative_path)
    if relative.suffix.lower() not in FORMATS:
        return None
    try:
        base = root.resolve()
        path = (base / relative).resolve()
        if not path.is_relative_to(base) or not path.is_file():
            return None
        stat = path.stat()
        internal_id, verified = _read_container(path, stat.st_size, stat.st_mtime_ns)
    except (OSError, RuntimeError, ValueError):
        return None

    filename_id = TITLE_ID.search(relative.name)
    title_id = internal_id or (filename_id[0].upper() if filename_id else None)
    content_version = CONTENT_VERSION.search(relative.name)
    catalog = _catalog()
    entry = {}
    kind = None
    if title_id:
        number = int(title_id, 16)
        suffix = number & 0xFFF
        kind = "DLC" if suffix not in (0, 0x800) else "update" if suffix else "base"
        entry = catalog.get(title_id) or {}
        if not entry and kind != "base":
            base_id = number & ~0xFFF
            if kind == "DLC":
                base_id -= 0x1000
            entry = catalog.get(f"{base_id:016X}") or {}

    release_date = str(entry.get("releaseDate") or "")
    players = entry.get("numberOfPlayers")
    genres = entry.get("category")
    return {
        "title_id": title_id,
        "format": relative.suffix[1:].upper(),
        "kind": kind,
        "content_version": int(content_version[1]) if content_version else None,
        "verified": verified,
        "name": entry.get("name"),
        "cover": _cover(entry),
        "description": entry.get("description"),
        "publisher": entry.get("publisher"),
        "developer": entry.get("developer"),
        "release_date": f"{release_date[:4]}-{release_date[4:6]}-{release_date[6:]}" if re.fullmatch(r"\d{8}", release_date) else None,
        "players": players if isinstance(players, int) and players > 0 else None,
        "genres": [item for item in genres if isinstance(item, str)] if isinstance(genres, list) else [],
    }


def build_catalog(sources: list[Path], target: Path) -> None:
    """Convert eShop region JSON files into a title-ID index. Later regions take precedence."""
    entries = {}
    for source in sources:
        region = {}
        for item in json.loads(source.read_text(encoding="utf-8")).values():
            title_id = str(item.get("id") or "").upper()
            if not TITLE_ID.fullmatch(title_id):
                continue
            values = {key: item[key] for key in CATALOG_FIELDS if item.get(key)}
            if len(values) > len(region.get(title_id, {})):
                region[title_id] = values
        for title_id, values in region.items():
            entries.setdefault(title_id, {}).update(values)
    target.write_text(json.dumps(entries, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description=build_catalog.__doc__)
    parser.add_argument("sources", type=Path, nargs="+")
    parser.add_argument("target", type=Path)
    args = parser.parse_args()
    build_catalog(args.sources, args.target)
