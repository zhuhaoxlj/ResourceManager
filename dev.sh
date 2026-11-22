#!/bin/bash
# 开发环境管理脚本

set -e

COMPOSE_FILE="docker-compose.dev.yml"
PROJECT_NAME="resource-manager-dev"

case "$1" in
  up)
    echo "🚀 启动开发环境（支持热重载）..."
    docker compose -f $COMPOSE_FILE -p $PROJECT_NAME up -d --build
    echo ""
    echo "✅ 开发环境已启动"
    echo "   前端: http://192.168.0.222:5173"
    echo "   后端: http://192.168.0.222:8787"
    echo "   API文档: http://192.168.0.222:8787/api/docs"
    ;;
  down)
    echo "🛑 停止开发环境..."
    docker compose -f $COMPOSE_FILE -p $PROJECT_NAME down
    echo "✅ 已停止"
    ;;
  restart)
    echo "🔄 重启开发环境..."
    docker compose -f $COMPOSE_FILE -p $PROJECT_NAME restart
    echo "✅ 已重启"
    ;;
  logs)
    docker compose -f $COMPOSE_FILE -p $PROJECT_NAME logs -f
    ;;
  backend)
    docker compose -f $COMPOSE_FILE -p $PROJECT_NAME logs -f backend
    ;;
  frontend)
    docker compose -f $COMPOSE_FILE -p $PROJECT_NAME logs -f frontend
    ;;
  shell)
    if [ -z "$2" ]; then
      echo "用法: $0 shell <backend|frontend>"
      exit 1
    fi
    docker compose -f $COMPOSE_FILE -p $PROJECT_NAME exec $2 /bin/sh
    ;;
  clean)
    echo "🧹 清理开发环境..."
    docker compose -f $COMPOSE_FILE -p $PROJECT_NAME down -v
    echo "✅ 已清理"
    ;;
  *)
    echo "开发环境管理脚本"
    echo ""
    echo "用法: $0 <command>"
    echo ""
    echo "命令:"
    echo "  up         启动开发环境（首次运行或依赖变更时使用 --build）"
    echo "  down       停止开发环境"
    echo "  restart    重启服务"
    echo "  logs       查看所有日志"
    echo "  backend    查看后端日志"
    echo "  frontend   查看前端日志"
    echo "  shell      进入容器 shell (需指定服务名: backend 或 frontend)"
    echo "  clean      停止并清理所有数据（包括 volume）"
    echo ""
    echo "示例:"
    echo "  $0 up                    # 启动开发环境"
    echo "  $0 up --build            # 强制重新构建"
    echo "  $0 logs                  # 查看日志"
    echo "  $0 shell backend         # 进入后端容器"
    exit 1
    ;;
esac
