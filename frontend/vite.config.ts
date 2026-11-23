import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import path from "path"

// 反代目标：容器内默认走 compose 服务名，本地开发可用环境变量覆盖
const backendTarget = process.env.VITE_PROXY_TARGET || "http://backend:8787"

const proxy = {
  "/api": {
    target: backendTarget,
    changeOrigin: true,
  },
  "/static": {
    target: backendTarget,
    changeOrigin: true,
  },
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 5173,
    proxy,
  },
  // vite preview 也走同样的反代，生产容器里前端和 API 同源
  preview: {
    host: "0.0.0.0",
    port: 5173,
    proxy,
  },
})
