ip link add macvlan-shim link enp1s0 type macvlan mode bridge
ip addr add 192.168.0.250/24 dev macvlan-shim
ip link set macvlan-shim up
ip route add 192.168.0.100 dev macvlan-shim
