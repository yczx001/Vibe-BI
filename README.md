# Vibe BI

AI驱动的BI前端展示系统

## 项目结构

```
vibe-bi/
├── packages/
│   ├── core/           # 共享类型和工具
│   ├── renderer/       # 报表渲染引擎
│   ├── editor/         # 报表编辑器
│   ├── desktop/        # Electron桌面端
│   └── web-viewer/     # Web查看端
├── server/             # .NET后端
└── docs/               # 文档
```

## 快速开始

### 前提条件

- Node.js 18+
- pnpm 8+
- .NET 8 SDK

### 安装依赖

```bash
pnpm install
```

### 开发模式

```bash
# 同时启动所有包
pnpm dev
```

## 技术栈

- **前端**: React 18 + TypeScript + Vite
- **桌面端**: Electron
- **图表**: ECharts
- **状态管理**: Zustand
- **后端**: .NET 8
- **AI**: Claude API / OpenAI API

## License

MIT
