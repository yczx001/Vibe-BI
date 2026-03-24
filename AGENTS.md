# Repository Guidelines

## Project Structure & Module Organization
`packages/` 是前端工作区：`core` 存放共享类型，`renderer` 负责报表渲染，`editor` 提供编辑器 UI，`desktop` 是 Electron 客户端，`web-viewer` 是浏览器查看端。`server/src/` 是 .NET 10 后端：`VibeBi.Api` 提供 HTTP 接口，`VibeBi.AI` 负责 AI 编排与 Provider，`VibeBi.Core` 负责 SSAS/ADOMD 服务与模型。`dist/`、`dist-electron/`、`bin/`、`obj/`、`node_modules/` 都是生成物，不要手工修改。

## Build, Test, and Development Commands
工作区脚本定义在根目录 `package.json`。下面示例使用 `npm`；如果使用 `pnpm`，请不要在同一个 PR 里混入不同锁文件的变更。

- `npm run dev`：运行所有工作区的 `dev` 脚本。
- `npm run build`：构建全部前端包。
- `npm run lint`：对各包执行 ESLint。
- `cd packages/web-viewer && npm run dev`：本地启动 Web 查看端。
- `cd packages/desktop && npm run dev`：启动 Electron 桌面端。
- `cd server/src && dotnet build VibeBi.slnx`：构建后端解决方案。
- `cd server/src && dotnet run --project VibeBi.Api`：以开发模式运行 API 和 Swagger。

## Coding Style & Naming Conventions
TypeScript 使用 ES modules、2 空格缩进、分号和单引号。React 组件文件使用 PascalCase，例如 `KpiCard.tsx`；hooks 和工具函数使用 camelCase，例如 `useQueryData.ts`；共享契约统一放在 `packages/core/src/types`。C# 使用 file-scoped namespace、4 空格缩进、PascalCase 的公开类型和成员，以及 `IModelMetadataService` 这类 `I` 前缀接口名。提交前至少执行一次 lint，必要时使用 Prettier 格式化。

## Testing Guidelines
当前仓库还没有配置正式的自动化测试套件或覆盖率门禁。`npm run test` 目前只是工作区占位脚本，因此改动至少要通过 `npm run build`、`npm run lint`，并在受影响的应用或 API 中做一次手工冒烟验证。后续新增测试时，前端测试建议与源码同目录放置并命名为 `*.test.ts` 或 `*.test.tsx`；后端测试建议放到独立 .NET 测试项目中，文件名使用 `*Tests.cs`。

## Commit & Pull Request Guidelines
当前目录不包含可用的 Git 历史信息，因此无法从提交记录归纳出既有规范。建议使用简短的祈使句提交标题，并优先采用 `feat:`、`fix:`、`docs:`、`refactor:` 这类 Conventional Commit 前缀。PR 应保持聚焦，明确说明影响的包或项目、列出验证步骤、关联对应问题；如果改动涉及界面或接口行为变化，附上截图或示例请求/响应。

## Security & Configuration Tips
不要提交真实的连接字符串、SSAS 地址或 AI Provider 密钥。敏感信息应保存在环境专用配置中；共享日志、截图或示例报表文件前，先清理其中的账号、地址和业务数据。
