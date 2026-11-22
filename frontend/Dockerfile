# 接收代理参数
ARG HTTP_PROXY
ARG HTTPS_PROXY
ARG NO_PROXY
# 接收API地址参数
ARG VITE_API_URL=http://localhost:8787/api/v1

# 使用官方 Node.js 镜像
FROM node:20-alpine

# 重新声明ARG（FROM之后需要重新声明）
ARG HTTP_PROXY
ARG HTTPS_PROXY
ARG NO_PROXY
ARG VITE_API_URL=http://localhost:8787/api/v1

# 设置环境变量
ENV HTTP_PROXY=${HTTP_PROXY}
ENV HTTPS_PROXY=${HTTPS_PROXY}
ENV NO_PROXY=${NO_PROXY}
ENV VITE_API_URL=${VITE_API_URL}

WORKDIR /app

# 安装 Bun
RUN npm install -g bun

# 复制依赖文件
COPY package.json bun.lock* ./

# 安装所有依赖（包括 devDependencies，因为需要 vite）
RUN bun install --frozen-lockfile

# 复制源代码
COPY . .

# 构建应用
RUN bun run build

# 暴露端口
EXPOSE 5173

# 使用 bun x 运行 vite preview
CMD ["bun", "x", "vite", "preview", "--host", "0.0.0.0", "--port", "5173"]
