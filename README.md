# Userscript Hub / 脚本分发平台

> A self-hosted platform for distributing userscripts, browser extensions, and small tools with authorization, version management, remote-core delivery, and update packages.
>
> 一个可以自己部署的脚本分发平台，用来管理油猴脚本、浏览器插件和工具程序，并支持授权审批、版本管理、远程核心下发和在线更新。

## Why This Project Exists / 为什么做这个项目

Many userscript authors can write useful scripts, but they often struggle with distribution, updates, authorization, and protecting their work from casual copying.

很多脚本作者会写脚本，但真正发布给别人使用时，会遇到这些问题：怎么更新、怎么授权、怎么统计使用、怎么保护自己的劳动成果。Userscript Hub 希望把这些复杂流程做成一个更容易使用的平台。

## What You Can Do / 你可以用它做什么

- Upload and manage userscripts, browser extensions, and executable tools.
- Keep multiple script versions and generate install links.
- Protect private scripts with authorization codes, approval flows, and device binding.
- Deliver a lightweight shell script while keeping the core logic on your server through `remote_core`.
- Track downloads, sessions, heartbeat events, and runtime errors.
- Package updates with one standard command and deploy them through the admin panel.

中文总结：

- 上传、管理和分发油猴脚本、浏览器插件、小工具。
- 管理脚本多版本，生成安装链接。
- 用授权码、审批、设备绑定保护私有脚本。
- 使用远程核心模式，让用户安装一个壳，核心逻辑由你的服务器下发。
- 统计下载、运行会话、心跳和错误事件。
- 用标准更新包完成在线升级。

## Who Is It For / 适合谁

- Userscript authors who want a private distribution platform.
- Small teams that need controlled script delivery.
- Developers who want to protect paid or internal automation scripts.
- Beginners who want a web UI instead of editing server files by hand.

适合：油猴脚本作者、小团队、内部工具维护者、想把脚本授权和更新做得更规范的人。

## Highlights / 亮点

- **First-run setup**: new deployments open `/setup` to initialize the platform name and admin account.
- **Remote core**: distribute a shell script and load the real module from your server after authorization.
- **Authorization workflow**: approval requests, authorization codes, device binding, session tracking, and heartbeats.
- **Tampermonkey compatibility**: keeps important UserScript headers and supports sandbox-friendly delivery for stricter CSP websites.
- **Update package workflow**: one command, `node scripts/create-update.js`, creates standard update packages.

## Tech Stack / 技术栈

- Frontend: Vue 3 + Vite + Element Plus + ECharts
- Backend: Node.js + Express + SQLite (`better-sqlite3`)
- Deployment: Docker / PM2 + Nginx

## Quick Start / 快速开始

```bash
git clone https://github.com/xzsirh1/userscript-hub.git
cd userscript-hub

cd server
npm install
npm run dev

cd ../client
npm install
npm run dev
```

Open:

- Frontend: `http://localhost:5173`
- Admin: `http://localhost:5173/admin`
- Setup: `http://localhost:5173/setup`
- API health check: `http://localhost:3000/api/health`

On a fresh database, the platform does not create a default admin account. Visit `/setup` first and create your own platform name, username, and password.

全新数据库不会自动创建默认管理员。第一次部署后请先访问 `/setup`，设置平台名称、管理员用户名和密码。

## Update Package / 更新包

Use the only standard update script:

```bash
node scripts/create-update.js
```

Generated ZIP files are stored in `build/archives/`. Runtime data, uploads, databases, temporary files, and update archives are not committed to the public repository.

## Documentation / 文档

- [Quick Start / 快速开始](docs/快速开始.md)
- [First Deployment Setup / 首次部署引导](docs/首次部署引导.md)
- [User Guide / 使用说明](docs/使用说明.md)
- [Update Package Guide / 更新包说明](docs/更新包说明.md)
- [Deployment Checklist / 部署检查清单](docs/部署检查清单.md)
- [Docs Index / 文档导航](docs/README.md)

## Security Notes / 安全提示

- Set a strong `JWT_SECRET` in production.
- Do not commit `.env`, databases, uploaded files, update ZIP files, real server addresses, or passwords.
- Remote-core delivery can raise the cost of copying and unauthorized use, but no client-side script protection is absolutely unbreakable.

## Roadmap / 后续方向

- Cleaner Docker and PM2 deployment templates.
- More beginner-friendly remote-core publishing flow.
- Better English documentation.
- Screenshots and demo videos.
- Optional Docker image release.

## Contributing / 参与贡献

Issues, suggestions, documentation improvements, and pull requests are welcome.

如果你是中文用户，也可以直接用中文提交 Issue。这个项目还在成长中，任何反馈都很有价值。

## License

MIT
