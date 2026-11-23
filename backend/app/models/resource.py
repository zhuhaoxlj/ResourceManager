from sqlalchemy import Column, Integer, String, DateTime, Text, ForeignKey, BigInteger
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.models.database import Base


class Resource(Base):
    """资源模型"""

    __tablename__ = "resources"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False, index=True)
    platform = Column(String(50), nullable=False, index=True)
    category = Column(String(100), nullable=True)
    description = Column(Text, nullable=True)
    cover_image = Column(String(500), nullable=True)
    # 名称来源：auto=解析/文件名自动生成，manual=用户手动改过
    name_source = Column(String(20), nullable=True, default="auto")
    # APK 解析出来的应用信息
    package_name = Column(String(255), nullable=True, index=True)
    app_version = Column(String(50), nullable=True)
    version_code = Column(String(50), nullable=True)
    min_sdk = Column(String(20), nullable=True)
    target_sdk = Column(String(20), nullable=True)
    architectures = Column(String(100), nullable=True)
    permissions_count = Column(Integer, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # 关联版本
    versions = relationship("Version", back_populates="resource", cascade="all, delete-orphan")


class Version(Base):
    """版本模型"""

    __tablename__ = "versions"

    id = Column(Integer, primary_key=True, index=True)
    resource_id = Column(Integer, ForeignKey("resources.id"), nullable=False)
    version = Column(String(100), nullable=False)
    file_path = Column(String(500), nullable=False)
    # 文件所在的资源根目录（容器内路径），换资源目录后旧版本仍能定位
    root_path = Column(String(500), nullable=True)
    file_size = Column(BigInteger, nullable=True)
    upload_date = Column(DateTime(timezone=True), server_default=func.now())

    # 关联资源
    resource = relationship("Resource", back_populates="versions")


class AppConfig(Base):
    """运行时可改的配置（资源目录等）"""

    __tablename__ = "app_config"

    key = Column(String(64), primary_key=True)
    value = Column(Text, nullable=True)
