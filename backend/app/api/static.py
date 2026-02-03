from fastapi import APIRouter
from fastapi.responses import FileResponse
from pathlib import Path
from app.core.config import get_settings

router = APIRouter(prefix="/static", tags=["static"])
settings = get_settings()


@router.get("/covers/{filename}")
async def get_cover_image(filename: str):
    """获取预览图"""
    file_path = Path(settings.upload_dir) / "covers" / filename
    if not file_path.exists():
        # 返回默认占位图
        return FileResponse(
            Path(__file__).parent.parent / "static" / "placeholder.png"
        )
    return FileResponse(file_path)
