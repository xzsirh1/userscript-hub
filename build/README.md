# Build 目录

此目录包含项目构建和打包相关的脚本和文件。

## 目录结构

```
build/
├── archives/               # 标准更新包归档目录
└── temp/
    └── update-staging/     # 更新包打包临时目录和手工整理临时文件
```

## 使用说明

### 生成更新包

在项目根目录执行：

```bash
node scripts/create-update.js
```

生成的更新包会保存在 `build/archives/`，文件名格式为 `update_YYYYMMDD_HHMMSS.zip`。

### 临时目录规则

- 所有更新包打包中间产物统一放在 `build/temp/update-staging/`
- 根目录不再新增 `temp_update_*` 目录
- 手工排查更新问题时，如果要保留临时整理内容，也统一放到 `build/temp/update-staging/`

### 归档说明

`archives/` 目录用于存放历史更新包，这些文件不会被提交到 Git 仓库（已在 `.gitignore` 中配置）。

## 当前有效脚本

- 唯一标准脚本：`scripts/create-update.js`
- 后续所有打包规则、目录规则、构建逻辑都只允许维护这一份
- 不再保留 bat / sh / ps1 多入口包装脚本，避免 AI 或人工误用旧入口

## 注意事项

- 更新包生成前会自动构建前端项目
- 更新包包含：server/src、client/src、client/dist、scripts、docs 等目录
- 生成的更新包可直接通过后台管理界面上传部署
- 涉及 Docker 下载回源能力时，源站与拉取站需要升级到同一版本
