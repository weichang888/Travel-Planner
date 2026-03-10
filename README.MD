# Travel Planner & Journal

一個以 React + Tailwind CSS 製作的 Notion 風格旅遊規劃應用。  
支援多旅程管理、行程拖曳排序、旅遊心得編輯、購物清單統計，以及本機資料持久化。

## 功能特色

- 多旅程管理
  - 新增/刪除多個旅程
  - 每個旅程可設定封面圖片
- 旅遊規劃（Itinerary）
  - 依天數管理行程（可新增天數）
  - 活動卡片可拖曳到任意位置調整順序
  - 活動可附圖片
- 旅遊心得（Journal）
  - 心得列表頁與編輯頁分離
  - 已發表心得可再次編輯
  - 支援多段落、段落顏色、複數圖片
- 購物清單（Shopping）
  - 清單列表頁與編輯頁分離
  - 可自訂類別（新增、重新命名、刪除）
  - 商品可附圖片（網址/上傳/拖曳）
  - 列表卡片圖片固定顯示於右側
  - 內建圓餅圖/環形圖/長條圖統計
- 待辦清單（To-do）
  - 可新增、勾選、刪除待辦事項
- 本機記憶（localStorage）
  - 會記住使用者名稱與所有旅程資料

## 技術棧

- React 19
- TypeScript
- Tailwind CSS
- Vite

## 快速開始

## 1. 安裝依賴

```bash
npm install
```

## 2. 啟動開發環境

```bash
npm run dev
```

預設開啟後可在瀏覽器查看本機網址（通常為 `http://localhost:5173`）。

## 3. 建置正式版本

```bash
npm run build
```

## 4. 本機預覽正式版

```bash
npm run preview
```

## Node.js 版本建議

目前 Vite 版本建議使用：

- Node.js `20.19+` 或
- Node.js `22.12+`

## 專案結構（重點）

```text
travel_page/
├─ src/
│  ├─ App.tsx        # 主要介面與功能邏輯
│  ├─ main.tsx       # 入口檔
│  └─ index.css      # 全域樣式（含字體與 Notion 色系）
├─ public/
├─ package.json
└─ tailwind.config.js
```

## 資料儲存說明

- 本專案目前使用瀏覽器 `localStorage` 儲存資料。
- 清除瀏覽器快取或更換瀏覽器環境時，資料可能會消失。

## 上傳到 GitHub（範例）

```bash
git init
git add .
git commit -m "feat: travel planner and journal app"
git branch -M main
git remote add origin <你的-repo-url>
git push -u origin main
```

---
