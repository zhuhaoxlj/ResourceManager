from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from pathlib import Path
from app.core.config import get_settings

router = APIRouter(prefix="/static", tags=["static"])
settings = get_settings()


@router.get("/covers/{filename:path}")
async def get_cover_image(filename: str):
    """获取预览图"""
    base = (Path(settings.upload_dir) / "covers").resolve()
    file_path = (base / filename).resolve()
    if not str(file_path).startswith(str(base)) or not file_path.is_file():
        # 不存在时返回默认占位图（有的话），否则 404
        placeholder = Path(__file__).parent.parent / "static" / "placeholder.png"
        if placeholder.exists():
            return FileResponse(placeholder)
        raise HTTPException(status_code=404, detail="图片不存在")
    return FileResponse(file_path)
