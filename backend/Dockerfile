# 使用官方 Python 镜像作为基础镜像
FROM python:3.11-slim

# 设置工作目录
WORKDIR /app

# 安装 uv
RUN pip install uv

# 复制项目文件
COPY pyproject.toml ./

# 安装依赖
RUN uv pip install --system -e .

# 复制应用代码
COPY app/ ./app/

# 创建必要的目录
RUN mkdir -p /app/data /app/uploads /app/resources

# 暴露端口
EXPOSE 8000

# 启动应用
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
