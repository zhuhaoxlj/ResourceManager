# 接收代理参数
ARG HTTP_PROXY
ARG HTTPS_PROXY
ARG NO_PROXY
# 接收 pip/uv 镜像源，默认官方源
ARG PIP_INDEX_URL=https://pypi.org/simple

# 使用官方 Python 镜像作为基础镜像
FROM python:3.11-slim

# 重新声明 ARG（FROM 之后需要重新声明才能使用）
ARG PIP_INDEX_URL=https://pypi.org/simple

# 设置代理
ENV HTTP_PROXY=${HTTP_PROXY}
ENV HTTPS_PROXY=${HTTPS_PROXY}
ENV NO_PROXY=${NO_PROXY}

# 设置工作目录
WORKDIR /app

# 安装 uv（国内网络可通过 --build-arg PIP_INDEX_URL 指定镜像源）
RUN pip install --no-cache-dir --index-url "${PIP_INDEX_URL}" uv

# 复制项目文件
COPY pyproject.toml ./

# 安装依赖
RUN uv pip install --system --index-url "${PIP_INDEX_URL}" -e .

# 复制应用代码
COPY app/ ./app/

# 创建必要的目录
RUN mkdir -p /app/data /app/uploads /app/resources

# 暴露端口
EXPOSE 8787

# 启动应用（使用环境变量配置端口，默认 8787）
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${API_PORT:-8787}"]
