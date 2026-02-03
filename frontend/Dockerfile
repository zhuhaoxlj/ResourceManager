# 使用官方 Bun 镜像
FROM oven/bun:1

WORKDIR /app

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
