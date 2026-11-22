#!/bin/bash

echo "=== 设置网络 (macvlan) ==="
sudo ip link add macvlan-shim link enp1s0 type macvlan mode bridge 2>/dev/null || echo "macvlan-shim already exists"
sudo ip addr add 192.168.0.250/24 dev macvlan-shim 2>/dev/null || echo "IP already assigned"
sudo ip link set macvlan-shim up
# 删除可能的错误路由，确保使用macvlan-shim
sudo ip route del 192.168.0.100 dev macvlan0 2>/dev/null
sudo ip route del 192.168.0.100 dev macvlan-shim 2>/dev/null
sudo ip route add 192.168.0.100 dev macvlan-shim

echo "=== 测试代理连接 ==="
curl -x http://192.168.0.100:7890 -I https://www.google.com 2>&1 | head -3

echo ""
echo "=== 配置 Docker buildkit 代理 ==="
sudo mkdir -p /etc/systemd/system/docker.service.d
sudo tee /etc/systemd/system/docker.service.d/http-proxy.conf > /dev/null << 'EOF'
[Service]
Environment="HTTP_PROXY=http://192.168.0.100:7890"
Environment="HTTPS_PROXY=http://192.168.0.100:7890"
Environment="NO_PROXY=localhost,127.0.0.1"
EOF

sudo tee /etc/docker/daemon.json > /dev/null << 'EOF'
{
    "data-root": "/vol1/docker",
    "insecure-registries": ["127.0.0.1:19827"],
    "live-restore": true,
    "features": {
        "buildkit": true
    }
}
EOF

sudo systemctl daemon-reload
sudo systemctl restart docker

echo "=== 验证配置 ==="
systemctl show --property=Environment docker

echo ""
echo "=== 启动代理容器 (openwrt) ==="
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
echo "=== 开始构建部署 ==="
sudo docker compose up -d --build
