# 贡献指南

感谢你考虑为本项目做出贡献！本文档提供了参与项目开发的指南和规范。

---

## 目录

- [行为准则](#行为准则)
- [如何贡献](#如何贡献)
- [开发流程](#开发流程)
- [代码规范](#代码规范)
- [提交规范](#提交规范)
- [测试要求](#测试要求)
- [文档更新](#文档更新)

---

## 行为准则

参与本项目的所有贡献者应：

- 尊重他人，保持友善和专业
- 接受建设性的批评
- 关注对社区最有利的事情
- 对其他社区成员表现出同理心

---

## 如何贡献

### 报告 Bug

如果你发现了 Bug，请：

1. 检查 [Issues](../../issues) 确认问题是否已被报告
2. 如果没有，创建新 Issue，包含：
   - 清晰的标题和描述
   - 复现步骤
   - 预期行为和实际行为
   - 环境信息（操作系统、Node.js 版本等）
   - 相关截图或日志

### 提出新功能

1. 先在 [Issues](../../issues) 中讨论你的想法
2. 说明功能的用途和价值
3. 等待维护者反馈后再开始开发

### 提交代码

1. Fork 本仓库
2. 创建功能分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 创建 Pull Request

---

## 开发流程

### 1. 环境准备

```bash
# 克隆你 fork 的仓库
git clone https://github.com/YOUR_USERNAME/油猴.git
cd 油猴

# 添加上游仓库
git remote add upstream https://github.com/ORIGINAL_OWNER/油猴.git

# 安装依赖
cd server && npm install
cd ../client && npm install
```

### 2. 创建功能分支

```bash
# 从 main 分支创建新分支
git checkout main
git pull upstream main
git checkout -b feature/your-feature-name
```

### 3. 开发和测试

```bash
# 启动开发服务器
cd server && npm run dev    # 后端
cd client && npm run dev    # 前端

# 运行测试（如果有）
npm test
```

### 4. 提交更改

```bash
# 添加更改
git add .

# 提交（遵循提交规范）
git commit -m "feat: add new feature"

# 推送到你的仓库
git push origin feature/your-feature-name
```

### 5. 创建 Pull Request

1. 访问你的 GitHub 仓库
2. 点击 "New Pull Request"
3. 填写 PR 描述，说明：
   - 更改的内容
   - 解决的问题
   - 测试情况
   - 相关 Issue 编号

---

## 代码规范

### JavaScript/Vue 规范

- 使用 ES6+ 语法
- 使用 2 空格缩进
- 使用单引号
- 语句末尾不加分号
- 遵循 ESLint 配置

**示例：**

```javascript
// ✅ 好的写法
const getUserData = async (userId) => {
  try {
    const response = await api.getUser(userId)
    return response.data
  } catch (error) {
    console.error('获取用户数据失败:', error)
    throw error
  }
}

// ❌ 不好的写法
function getUserData(userId){
    return api.getUser(userId).then(function(response){
        return response.data;
    }).catch(function(error){
        console.log(error);
    });
}
```

### Vue 组件规范

- 组件名使用 PascalCase
- Props 使用 camelCase
- 事件名使用 kebab-case
- 组件文件名使用 PascalCase

**示例：**

```vue
<template>
  <div class="user-card">
    <h3>{{ userName }}</h3>
    <button @click="handleClick">点击</button>
  </div>
</template>

<script setup>
import { ref } from 'vue'

const props = defineProps({
  userName: {
    type: String,
    required: true
  }
})

const emit = defineEmits(['user-selected'])

const handleClick = () => {
  emit('user-selected', props.userName)
}
</script>
```

### 后端 API 规范

- 使用 RESTful 风格
- 统一的响应格式
- 适当的 HTTP 状态码
- 错误处理和日志记录

**响应格式：**

```javascript
// 成功响应
{
  "success": true,
  "data": { ... },
  "message": "操作成功"
}

// 错误响应
{
  "success": false,
  "error": "错误信息",
  "code": "ERROR_CODE"
}
```

---

## 提交规范

使用语义化的 commit message，格式：

```
<type>(<scope>): <subject>

<body>

<footer>
```

### Type 类型

- `feat`: 新功能
- `fix`: Bug 修复
- `docs`: 文档更新
- `style`: 代码格式（不影响功能）
- `refactor`: 重构（既不是新功能也不是修复）
- `perf`: 性能优化
- `test`: 测试相关
- `chore`: 构建过程或辅助工具的变动

### 示例

```bash
# 新功能
git commit -m "feat(programs): 添加 exe 程序上传功能"

# Bug 修复
git commit -m "fix(auth): 修复登录 token 过期问题"

# 文档更新
git commit -m "docs(readme): 更新部署说明"

# 重构
git commit -m "refactor(api): 优化脚本控制器代码结构"
```

---

## 测试要求

### 提交前检查

- [ ] 代码通过 ESLint 检查
- [ ] 前端构建成功 (`npm run build`)
- [ ] 后端启动正常
- [ ] 新功能已测试
- [ ] 没有破坏现有功能
- [ ] 更新了相关文档

### 测试覆盖

- 核心功能必须有测试
- 新增 API 需要测试
- Bug 修复需要添加回归测试

---

## 文档更新

代码更改时，请同步更新相关文档：

### 需要更新的文档

- **README.md** - 新功能、安装步骤、使用方法
- **CHANGELOG.md** - 版本更新记录
- **API 文档** - 新增或修改的 API
- **配置说明** - 新的环境变量或配置项
- **部署文档** - 部署流程变更

### 文档规范

- 使用清晰的标题和结构
- 提供代码示例
- 包含必要的截图
- 保持简洁明了
- 中英文之间加空格

---

## Pull Request 检查清单

提交 PR 前，请确认：

- [ ] 代码遵循项目规范
- [ ] 提交信息符合规范
- [ ] 已测试所有更改
- [ ] 更新了相关文档
- [ ] 没有合并冲突
- [ ] PR 描述清晰完整
- [ ] 关联了相关 Issue

---

## 代码审查

### 审查标准

- 代码质量和可读性
- 是否遵循项目规范
- 是否有潜在的 Bug
- 性能影响
- 安全性考虑
- 测试覆盖

### 审查流程

1. 维护者会在 1-3 个工作日内审查
2. 可能会要求修改
3. 修改后重新审查
4. 通过后合并到主分支

---

## 版本发布

版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)：

- **主版本号**：不兼容的 API 修改
- **次版本号**：向下兼容的功能性新增
- **修订号**：向下兼容的问题修正

---

## 获取帮助

如有疑问，可以：

- 查看 [文档](docs/)
- 搜索 [Issues](../../issues)
- 创建新 Issue 提问
- 联系维护者

---

## 许可证

贡献的代码将采用与项目相同的 [MIT](LICENSE) 许可证。

---

感谢你的贡献！🎉
