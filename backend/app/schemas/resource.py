from pydantic import BaseModel, Field
from datetime import datetime
from typing import Optional


class VersionBase(BaseModel):
    """版本基础模型"""

    version: str = Field(..., description="版本号")
    file_path: str = Field(..., description="文件路径")


class VersionCreate(VersionBase):
    """创建版本"""
    file_size: Optional[int] = Field(None, description="文件大小（字节）")


class VersionResponse(VersionBase):
    """版本响应"""

    id: int
    file_size: Optional[int]
    upload_date: datetime

    class Config:
        from_attributes = True


class ResourceBase(BaseModel):
    """资源基础模型"""

    name: str = Field(..., min_length=1, max_length=255, description="资源名称")
    platform: str = Field(..., description="平台（mac/windows/android/switch）")
    category: Optional[str] = Field(None, description="分类")
    description: Optional[str] = Field(None, description="描述")
    cover_image: Optional[str] = Field(None, description="预览图路径")


class ResourceCreate(ResourceBase):
    """创建资源"""

    pass


class ResourceUpdate(BaseModel):
    """更新资源"""

    name: Optional[str] = Field(None, min_length=1, max_length=255)
    category: Optional[str] = None
    description: Optional[str] = None
    cover_image: Optional[str] = None


class ResourceResponse(ResourceBase):
    """资源响应"""

    id: int
    created_at: datetime
    updated_at: Optional[datetime] = None
    versions: list[VersionResponse] = []

    class Config:
        from_attributes = True


class ResourceListResponse(BaseModel):
    """资源列表响应"""

    total: int
    items: list[ResourceResponse]


class ScanResult(BaseModel):
    """扫描结果"""

    scanned: int = Field(..., description="扫描的文件数")
    created: int = Field(..., description="新建资源数")
    updated: int = Field(..., description="更新资源数")
    errors: list[str] = Field(default_factory=list, description="错误信息")
