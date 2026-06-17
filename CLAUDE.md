# CLAUDE.md

這是 Claude Code 的專案說明文件，用於測試 GitHub 上傳功能。
回答時請使用繁體中文

## 專案簡介

**travelplan** 是一個旅遊行程規劃應用程式。

## 技術棧

- **前端框架**：React + TypeScript
- **建置工具**：Vite
- **部署平台**：Cloudflare Workers
- **資料庫**：Cloudflare D1 (SQLite)

## 開發指令

```bash
# 安裝依賴
npm install

# 啟動開發伺服器
npm run dev

# 建置
npm run build
```

## 分支策略

- `main`：主分支，穩定版本
- `claude/*`：Claude Code 開發分支
