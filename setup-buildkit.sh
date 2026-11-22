#!/bin/bash

echo "=== 配置 Buildkit 代理 (正确格式) ==="
sudo mkdir -p /etc/buildkit
sudo tee /etc/buildkit/buildkitd.toml > /dev/null << 'EOF'
[host "https://registry-1.docker.io"]
  http = true
  https = ["http://192.168.0.100:7890"]
EOF

echo "=== 验证配置 ==="
cat /etc/buildkit/buildkitd.toml

echo ""
echo "=== 重启 Docker ==="
sudo systemctl restart docker

echo ""
echo "=== 启动代理容器 ==="
sudo docker start openwrt 2>/dev/null || echo "openwrt already running"

echo "=== 等待代理就绪 ==="
for i in {1..30}; do
    if curl -x http://192.168.0.100:7890 -I https://www.google.com 2>&1 | grep -q "HTTP"; then
        echo "代理已就绪！"
        break
    fi
    echo "等待代理启动... ($i/30)"
    sleep 2
done

echo ""
echo "=== 开始构建部署 (使用 DOCKER_BUILDKIT=1) ==="
sudo DOCKER_BUILDKIT=1 docker compose up -d --build
