from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import or_
from sqlalchemy.orm import Session
from typing import Optional, List
from app.models.database import get_db
from app.models.resource import Resource, Version
from app.core.config import settings
from app.schemas.resource import (
    ResourceCreate,
    ResourceUpdate,
    ResourceResponse,
    ResourceListResponse,
    VersionResponse,
)

router = APIRouter(prefix="/resources", tags=["resources"])


def _add_full_paths(versions: List[Version]) -> List[dict]:
    """为版本列表添加完整路径"""
    result = []
    for v in versions:
        v_dict = {
            "id": v.id,
            "version": v.version,
            "file_path": v.file_path,
            "file_size": v.file_size,
            "upload_date": v.upload_date,
            # 使用 NAS 真实路径而非容器内路径
            "full_path": str(settings.nas_resource_path / v.file_path),
        }
        result.append(v_dict)
    return result


def _enrich_resource(resource: Resource) -> dict:
    """为资源添加版本的完整路径"""
    return {
        "id": resource.id,
        "name": resource.name,
        "platform": resource.platform,
        "category": resource.category,
        "description": resource.description,
        "cover_image": resource.cover_image,
        "package_name": resource.package_name,
        "app_version": resource.app_version,
        "version_code": resource.version_code,
        "min_sdk": resource.min_sdk,
        "target_sdk": resource.target_sdk,
        "architectures": resource.architectures,
        "permissions_count": resource.permissions_count,
        "created_at": resource.created_at,
        "updated_at": resource.updated_at,
        "versions": _add_full_paths(resource.versions),
    }


@router.get("/", response_model=ResourceListResponse)
def get_resources(
    platform: Optional[str] = Query(None, description="平台筛选"),
    category: Optional[str] = Query(None, description="分类筛选"),
    search: Optional[str] = Query(None, description="搜索关键词"),
    skip: int = Query(0, ge=0, description="跳过数量"),
    limit: int = Query(50, ge=1, le=100, description="返回数量"),
    db: Session = Depends(get_db),
):
    """获取资源列表"""
    query = db.query(Resource)

    # 筛选条件
    if platform:
        query = query.filter(Resource.platform == platform.lower())
    if category:
        query = query.filter(Resource.category == category)
    if search:
        query = query.filter(
            or_(
                Resource.name.contains(search),
                Resource.package_name.contains(search),
            )
        )

    # 总数
    total = query.count()

    # 分页
    resources = query.order_by(Resource.updated_at.desc()).offset(skip).limit(limit).all()

    items = [_enrich_resource(r) for r in resources]
    return ResourceListResponse(total=total, items=items)


@router.post("/", response_model=ResourceResponse)
def create_resource(resource: ResourceCreate, db: Session = Depends(get_db)):
    """创建资源"""
    db_resource = Resource(**resource.model_dump())
    db.add(db_resource)
    db.commit()
    db.refresh(db_resource)
    return _enrich_resource(db_resource)


@router.get("/{resource_id}", response_model=ResourceResponse)
def get_resource(resource_id: int, db: Session = Depends(get_db)):
    """获取资源详情"""
    resource = db.query(Resource).filter(Resource.id == resource_id).first()
    if not resource:
        raise HTTPException(status_code=404, detail="资源不存在")
    return _enrich_resource(resource)


@router.put("/{resource_id}", response_model=ResourceResponse)
def update_resource(
    resource_id: int,
    resource_update: ResourceUpdate,
    db: Session = Depends(get_db),
):
    """更新资源"""
    resource = db.query(Resource).filter(Resource.id == resource_id).first()
    if not resource:
        raise HTTPException(status_code=404, detail="资源不存在")

    # 更新字段
    update_data = resource_update.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(resource, field, value)

    db.commit()
    db.refresh(resource)
    return _enrich_resource(resource)


@router.delete("/{resource_id}")
def delete_resource(resource_id: int, db: Session = Depends(get_db)):
    """删除资源"""
    resource = db.query(Resource).filter(Resource.id == resource_id).first()
    if not resource:
        raise HTTPException(status_code=404, detail="资源不存在")

    db.delete(resource)
    db.commit()
    return {"message": "删除成功"}


@router.get("/{resource_id}/versions", response_model=List[VersionResponse])
def get_resource_versions(resource_id: int, db: Session = Depends(get_db)):
    """获取资源版本列表"""
    resource = db.query(Resource).filter(Resource.id == resource_id).first()
    if not resource:
        raise HTTPException(status_code=404, detail="资源不存在")

    versions = (
        db.query(Version)
        .filter(Version.resource_id == resource_id)
        .order_by(Version.upload_date.desc())
        .all()
    )
    return _add_full_paths(versions)
