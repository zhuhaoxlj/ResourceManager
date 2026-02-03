# 开发指南

本文档介绍如何本地开发资源管理系统。

## 环境要求

### 后端
- Python 3.11+
- uv（Python 包管理器）

### 前端
- Node.js 18+
- Bun（可选，用于更快的构建）

## 本地开发

### 后端开发

#### 1. 安装 uv

```bash
curl -LsSf https://astral.sh/uv/install.sh | sh
```

#### 2. 创建虚拟环境并安装依赖

```bash
cd backend
uv venv
source .venv/bin/activate  # Linux/macOS
# .venv\Scripts\activate   # Windows
uv pip install -e .
```

#### 3. 配置环境变量

```bash
cp .env.example .env
# 编辑 .env 文件，修改配置
```

#### 4. 初始化数据库

```bash
python -c "from app.models.database import init_db; init_db()"
```

#### 5. 启动开发服务器

```bash
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

API 文档访问：http://localhost:8000/api/docs

### 前端开发

#### 1. 安装 Bun（可选）

```bash
curl -fsSL https://bun.sh/install | bash
```

#### 2. 安装依赖

使用 Bun：
```bash
cd frontend
bun install
```

使用 npm：
```bash
cd frontend
npm install
```

#### 3. 启动开发服务器

使用 Bun：
```bash
bun run dev
```

使用 npm：
```bash
npm run dev
```

前端访问：http://localhost:5173

## 项目结构

### 后端结构

```
backend/
├── app/
│   ├── api/              # API 路由
│   │   ├── resources.py  # 资源 CRUD
│   │   ├── upload.py     # 文件上传
│   │   ├── scan.py       # 目录扫描
│   │   └── download.py   # 文件下载
│   ├── models/           # 数据库模型
│   │   ├── database.py   # 数据库配置
│   │   └── resource.py   # 资源模型
│   ├── schemas/          # Pydantic Schema
│   │   └── resource.py
│   ├── services/         # 业务逻辑
│   │   ├── scanner.py    # 目录扫描服务
│   │   └── file_manager.py  # 文件管理服务
│   ├── core/             # 核心配置
│   │   └── config.py     # 应用配置
│   └── main.py           # 应用入口
├── pyproject.toml        # 项目配置
└── Dockerfile
```

### 前端结构

```
frontend/
├── src/
│   ├── components/       # 组件
│   │   ├── ui/          # shadcn/ui 组件
│   │   ├── ResourceCard.tsx
│   │   ├── FileDropZone.tsx
│   │   └── VersionList.tsx
│   ├── pages/           # 页面组件
│   │   ├── Home.tsx     # 聚合页
│   │   ├── Platform.tsx # 平台分类页
│   │   ├── ResourceDetail.tsx  # 资源详情页
│   │   └── Admin.tsx    # 管理页
│   ├── services/        # API 服务
│   │   └── api.ts
│   ├── store/           # 状态管理
│   │   └── resourceStore.ts
│   ├── lib/             # 工具函数
│   │   ├── utils.ts
│   │   └── theme.ts
│   ├── main.tsx         # 应用入口
│   └── index.css        # 全局样式
├── package.json
├── vite.config.ts
└── Dockerfile
```

## 添加新平台

### 1. 后端配置

编辑 `backend/app/core/config.py`：

```python
platforms: list[str] = ["mac", "windows", "android", "switch", "new_platform"]

platform_extensions: dict[str, list[str]] = {
    # ...
    "new_platform": [".ext1", ".ext2"],
}
```

### 2. 前端配置

编辑 `frontend/src/lib/theme.ts`：

```typescript
export const platformConfig = {
  // ...
  new_platform: {
    name: "新平台",
    icon: "IconName",
    color: "from-color-600 to-color-800",
    textColor: "text-color-100",
  },
}
```

## 添加新 UI 组件

使用 shadcn/ui CLI：

```bash
cd frontend
bunx shadcn-ui@latest add [component-name]
```

或手动添加到 `frontend/src/components/ui/`。

## 测试

### 后端测试

```bash
cd backend
pytest
```

### 前端测试

```bash
cd frontend
bun run test
```

## 构建生产版本

### 后端

```bash
cd backend
uv pip install --system
```

### 前端

```bash
cd frontend
bun run build
```

## 调试技巧

### 查看后端日志

```bash
docker-compose logs -f backend
```

### 查看前端日志

```bash
docker-compose logs -f frontend
```

### 进入容器调试

```bash
docker-compose exec backend bash
docker-compose exec frontend sh
```

## 常见问题

### Q: 如何修改数据库？

A: 可以使用 SQLite 客户端连接 `data/db/resources.db`，或通过 API 操作。

### Q: 如何添加新的文件类型支持？

A: 修改 `backend/app/core/config.py` 中的 `platform_extensions` 配置。

### Q: 前端如何代理 API 请求？

A: 配置在 `frontend/vite.config.ts` 的 `server.proxy` 中。

## 代码风格

- 后端：遵循 PEP 8
- 前端：使用 ESLint + Prettier
- 提交前请运行格式化工具

## 贡献指南

1. Fork 项目
2. 创建特性分支
3. 提交更改
4. 推送到分支
5. 创建 Pull Request
