from fastapi import APIRouter, Depends, UploadFile, File, Form, HTTPException
from sqlalchemy.orm import Session
from app.models.database import get_db
from app.models.resource import Resource, Version
from app.services.file_manager import file_manager
from app.services.scanner import DirectoryScanner
from app.services.runtime_config import get_library_root

router = APIRouter(prefix="/upload", tags=["upload"])


@router.post("/file")
async def upload_file(
    file: UploadFile = File(...),
    platform: str = Form(...),
    db: Session = Depends(get_db),
):
    """上传资源文件"""
    # 保存文件到当前资源目录
    library_root = get_library_root(db)
    relative_path, file_size = await file_manager.save_upload_file(file, platform, library_root)

    # 登记资源（APK/DMG 会自动解析应用名、版本、图标等信息）
    scanner = DirectoryScanner(library_root)
    absolute_path = library_root / relative_path
    scanner.index_file(db, absolute_path, relative_path, library_root)

    db.commit()

    version_record = (
        db.query(Version)
        .filter(Version.file_path == relative_path, Version.root_path == str(library_root))
        .first()
    )
    resource_id = version_record.resource_id if version_record else None

    return {"message": "上传成功", "resource_id": resource_id}


@router.post("/cover/{resource_id}")
async def upload_cover(
    resource_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    """上传预览图"""
    # 验证资源存在
    resource = db.query(Resource).filter(Resource.id == resource_id).first()
    if not resource:
        raise HTTPException(status_code=404, detail="资源不存在")

    # 保存预览图
    cover_url = await file_manager.save_cover_image(file, resource_id)

    # 更新资源
    resource.cover_image = cover_url
    db.commit()

    return {"message": "预览图上传成功", "cover_url": cover_url}
