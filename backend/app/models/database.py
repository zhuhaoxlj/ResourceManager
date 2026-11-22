from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from app.core.config import get_settings

settings = get_settings()

# 创建数据库引擎
engine = create_engine(
    settings.database_url,
    connect_args={"check_same_thread": False} if settings.database_url.startswith("sqlite") else {},
)

# 创建会话工厂
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# 创建基类
Base = declarative_base()


def get_db():
    """获取数据库会话"""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    """初始化数据库表"""
    Base.metadata.create_all(bind=engine)
    ensure_schema()


# 旧库升级：SQLite 不支持自动加列，这里按需 ALTER
_EXTRA_COLUMNS = {
    "name_source": "VARCHAR(20)",
    "package_name": "VARCHAR(255)",
    "app_version": "VARCHAR(50)",
    "version_code": "VARCHAR(50)",
    "min_sdk": "VARCHAR(20)",
    "target_sdk": "VARCHAR(20)",
    "architectures": "VARCHAR(100)",
    "permissions_count": "INTEGER",
}


def ensure_schema():
    """补齐新增字段，兼容已存在的 SQLite 数据库。"""
    try:
        with engine.connect() as conn:
            existing = {row[1] for row in conn.exec_driver_sql("PRAGMA table_info(resources)")}
            for column, ddl in _EXTRA_COLUMNS.items():
                if column not in existing:
                    conn.exec_driver_sql(f"ALTER TABLE resources ADD COLUMN {column} {ddl}")
            conn.commit()
    except Exception:
        # 表还未创建（首次启动）时由 create_all 负责
        pass
