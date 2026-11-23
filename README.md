# 资源管理系统

> 项目主页：<https://zhuhaoxlj.github.io/ResourceManager/>

一个现代化的多平台资源管理系统，用于统一管理 NAS 上的 Mac、Windows、Android、Switch 软件资源。

## 特性

- 🎯 **多平台支持** - Mac、Windows、Android、Switch 四大平台
- 📁 **目录扫描** - 自动扫描指定目录，智能识别平台和版本
- 🎨 **简约设计** - 高端整洁的 UI 界面，基于 shadcn/ui 设计系统
- 📦 **版本管理** - 自动追踪软件版本历史
- 🚀 **一键部署** - Docker Compose 快速部署
- 📤 **拖拽上传** - 支持拖拽文件上传到对应平台分类
- 🖼️ **预览图** - 支持手动上传资源预览图
- ⬇️ **便捷下载** - 一键下载任意版本

## 技术栈

### 前端
- React 18 + TypeScript
- Vite + Bun（构建工具）
- shadcn/ui + Tailwind CSS（UI 组件库）
- Zustand（状态管理）
- React Router（路由）
- Axios（HTTP 客户端）

### 后端
- Python 3.11+
- FastAPI（Web 框架）
- SQLAlchemy（ORM）
- SQLite（数据库）
- uv（包管理器）

### 部署
- Docker + Docker Compose

## 快速开始

### 前置要求

- Docker
- Docker Compose
- NAS 资源目录（存放软件文件的目录）

### 1. 克隆项目

```bash
git clone <repository-url>
cd ResourceManager
```

### 2. 配置资源目录

编辑 `docker-compose.yml`，修改资源目录路径：

```yaml
volumes:
  # 将此处路径修改为您的 NAS 资源目录
  - /your/actual/nas/path:/app/resources
```

### 3. 构建并启动

```bash
chmod +x build.sh
./build.sh
```

或手动执行：

```bash
# 创建数据目录
mkdir -p data/db data/uploads

# 构建镜像
docker-compose build

# 启动服务
docker-compose up -d
```

### 4. 访问应用

- **前端界面**: http://localhost:5173
- **API 文档**: http://localhost:8000/api/docs
- **健康检查**: http://localhost:8000/health

## 使用指南

### 目录结构规范

系统会自动识别以下目录结构：

```
/NAS/Resources/
├── Mac/          # Mac 软件 (.dmg, .pkg)
├── Windows/      # Windows 软件 (.exe, .msi)
├── Android/      # Android 应用 (.apk)
└── Switch/       # Switch 游戏 (.nsp, .xci)
```

### 文件命名规范

建议使用包含版本号的文件名，系统会自动识别：

```
Chrome_v119.0.dmg      # 识别为 Chrome v119.0
VSCode-1.85.0.exe      # 识别为 VSCode v1.85.0
App_v2.0.0.apk         # 识别为 App v2.0.0
```

### 功能说明

#### 1. 聚合页
首页展示四个平台卡片，点击进入对应平台分类页。

#### 2. 平台分类页
显示该平台下所有资源，支持搜索过滤。

#### 3. 资源详情页
- 查看资源信息和预览图
- 浏览所有版本历史
- 一键下载任意版本

#### 4. 管理页面
- **拖拽上传**：选择平台后，拖拽文件到上传区域
- **目录扫描**：点击扫描按钮，自动识别新文件
- **资源管理**：查看、编辑、删除资源

## API 接口

### 资源管理

```
GET    /api/v1/resources/        # 获取资源列表
POST   /api/v1/resources/        # 创建资源
GET    /api/v1/resources/{id}    # 获取资源详情
PUT    /api/v1/resources/{id}    # 更新资源
DELETE /api/v1/resources/{id}    # 删除资源
```

### 文件上传

```
POST /api/v1/upload/file         # 上传资源文件
POST /api/v1/upload/cover/{id}   # 上传预览图
```

### 目录扫描

```
POST /api/v1/scan/               # 触发目录扫描
GET  /api/v1/scan/stats          # 获取统计信息
```

### 下载

```
GET /api/v1/download/{version_id}  # 下载指定版本
```

详细 API 文档请访问：http://localhost:8000/api/docs

## 常用命令

```bash
# 查看日志
docker-compose logs -f

# 查看后端日志
docker-compose logs -f backend

# 查看前端日志
docker-compose logs -f frontend

# 停止服务
docker-compose down

# 重启服务
docker-compose restart

# 进入后端容器
docker-compose exec backend bash

# 进入前端容器
docker-compose exec frontend sh
```

## 配置说明

### 后端配置 (.env)

```bash
RESOURCE_DIR=/app/resources      # 资源目录
UPLOAD_DIR=/app/uploads          # 上传目录
DATABASE_URL=sqlite:///./data/resources.db  # 数据库路径
API_HOST=0.0.0.0                 # API 监听地址
API_PORT=8000                    # API 端口
MAX_UPLOAD_SIZE=500              # 最大上传大小（MB）
```

### 前端配置

前端通过 Vite 代理与后端通信，默认配置在 `vite.config.ts` 中。

## 开发指南

详见 [DEVELOPMENT.md](./DEVELOPMENT.md)

## 故障排除

### 问题 1：无法访问资源目录

检查 `docker-compose.yml` 中的卷映射是否正确。

### 问题 2：上传失败

检查文件大小是否超过限制（默认 500MB）。

### 问题 3：扫描后没有识别文件

确保文件扩展名符合平台要求：
- Mac: .dmg, .pkg, .app
- Windows: .exe, .msi, .zip
- Android: .apk, .xapk
- Switch: .nsp, .nsz, .xci

## 许可证

MIT License

## 贡献

欢迎提交 Issue 和 Pull Request！
