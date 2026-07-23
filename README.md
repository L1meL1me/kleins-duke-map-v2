# Klein's Duke Map V2

Duke West Campus 的个人地图：固定核验地点、课程动线、地点筛选和校园步行路线。

## 独立网站

网站通过 GitHub Pages 自动发布。每次修改
`main` 分支后，GitHub Actions 会自动重新构建并上线。

## 最常编辑的文件

- `app/data.ts`：地点、坐标、课程、说明与官方来源
- `app/DukeMapClient.tsx`：页面交互与地图界面
- `app/globals.css`：颜色、排版、桌面与手机版式
- `app/route-client.ts`：独立网站的步行路线请求
- `public/og.png`：分享链接时显示的封面图

## 本地运行

需要 Node.js 22 和 pnpm。

```bash
pnpm install
pnpm dev
```

访问 `http://localhost:3000`。

## 构建独立版本

```bash
pnpm build:standalone
```

输出在 `standalone-dist/`。该版本可托管在 GitHub Pages 等任意静态网站服务。

## 数据提醒

课程教室与开放时间仍应以 DukeHub 和 Duke 官方页面为准。步行路线来自
Valhalla/OpenStreetMap，并可能受临时封路影响。
