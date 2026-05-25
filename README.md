# 脚本分发平台

一个通用的脚本、浏览器扩展和程序分发管理平台，支持版本管理、下载统计、授权审批、设备绑定、远程核心下发和在线更新。

## 功能概览

- 脚本管理：上传、解析 UserScript 头部、版本管理、混淆下载。
- 授权运行时：支持授权申请、后台审批、授权码、设备绑定、会话和心跳。
- 远程核心：下载壳脚本，授权后从服务端拉取 Manifest 与远程模块。
- 资源分发：支持脚本、浏览器插件和可执行程序上传与下载统计。
- 后台管理：分类、站点配置、主题、更新包、备份和同步。
- 首次部署引导：新环境启动后通过 `/setup` 设置平台名称和管理员账号，不依赖硬编码默认账号。

## 技术栈

- 前端：Vue 3 + Vite + Element Plus + ECharts
- 后端：Node.js + Express + SQLite (`better-sqlite3`)
- 部署：Docker / PM2 + Nginx

## 本地开发

```bash
git clone <repository-url>
cd userscript-hub

cd server
npm install
npm run dev

cd ../client
npm install
npm run dev
```

默认地址：

- 前台：`http://localhost:5173`
- 后台：`http://localhost:5173/admin`
- 首次部署引导：`http://localhost:5173/setup`
- 后端健康检查：`http://localhost:3000/api/health`

## 首次部署

全新数据库启动后不会自动创建默认管理员。请先访问 `/setup`，按页面引导填写：

- 平台名称
- 管理员用户名
- 管理员密码

已有旧数据库如果已经存在管理员账号，会继续保持兼容，不会强制进入初始化流程。

## 更新包

项目统一使用唯一标准脚本生成更新包：

```bash
node scripts/create-update.js
```

正式更新包会输出到 `build/archives/`。公开仓库不会提交更新包 ZIP、临时构建目录、数据库、上传文件或真实部署数据。

## 目录结构

```text
client/                  前端源码
server/                  后端源码
docs/                    通用文档
scripts/                 工具脚本
build/README.md          构建与更新包目录说明
CHANGELOG.md             变更记录
CONTRIBUTING.md          贡献说明
LICENSE                  开源协议
```

## 文档

- [快速开始](docs/快速开始.md)
- [首次部署引导](docs/首次部署引导.md)
- [使用说明](docs/使用说明.md)
- [更新包说明](docs/更新包说明.md)
- [部署检查清单](docs/部署检查清单.md)
- [文档导航](docs/README.md)

## 安全提示

- 生产环境务必设置强 `JWT_SECRET`。
- 不要提交 `.env`、数据库、上传文件、更新包、真实服务器地址或账号密码。
- 远程核心用于提高脚本分发和授权管理门槛，不等同于绝对防破解。

## License

MIT
