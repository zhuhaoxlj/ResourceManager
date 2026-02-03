from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import Optional, List
from app.models.database import get_db
from app.models.resource import Resource, Version
from app.schemas.resource import (
    ResourceCreate,
    ResourceUpdate,
    ResourceResponse,
    ResourceListResponse,
    VersionResponse,
)

router = APIRouter(prefix="/resources", tags=["resources"])


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
        query = query.filter(Resource.name.contains(search))

    # 总数
    total = query.count()

    # 分页
    resources = query.order_by(Resource.updated_at.desc()).offset(skip).limit(limit).all()

    return ResourceListResponse(total=total, items=resources)


@router.post("/", response_model=ResourceResponse)
def create_resource(resource: ResourceCreate, db: Session = Depends(get_db)):
    """创建资源"""
    db_resource = Resource(**resource.model_dump())
    db.add(db_resource)
    db.commit()
    db.refresh(db_resource)
    return db_resource


@router.get("/{resource_id}", response_model=ResourceResponse)
def get_resource(resource_id: int, db: Session = Depends(get_db)):
    """获取资源详情"""
    resource = db.query(Resource).filter(Resource.id == resource_id).first()
    if not resource:
        raise HTTPException(status_code=404, detail="资源不存在")
    return resource


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
    return resource


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

    return (
        db.query(Version)
        .filter(Version.resource_id == resource_id)
        .order_by(Version.upload_date.desc())
        .all()
    )
