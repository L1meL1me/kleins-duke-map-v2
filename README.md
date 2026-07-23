# Klein's Duke Map V3

Duke 与 Research Triangle 的个人生活地图，包含 65 个固定地点：

- West / East Campus 宿舍、课程、图书馆与餐饮
- C1、CSF、Swift Shuttle 站点与 TransLoc 实时入口
- Ninth Street 餐厅与咖啡
- 超市、亚洲食品店、日用品商店与 Duke Credit Union
- RDU 机场 Terminal 1 / 2
- Durham、Chapel Hill、Raleigh 与 Cary 的游览地点
- 步行、骑行、驾车和 Duke Shuttle 路线模式

## 独立网站

网站通过 GitHub Pages 自动发布，不依赖 ChatGPT 或 `chatgpt.site`。每次修改
`main` 分支后，GitHub Actions 会自动重新构建并上线。

## 最常编辑的文件

- `app/data.ts`：地点、坐标、课程、说明与官方来源
- `app/DukeMapClient.tsx`：页面交互与地图界面
- `app/globals.css`：颜色、排版、桌面与手机版式
- `app/route-client.ts`：步行、骑行和驾车路线请求
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
