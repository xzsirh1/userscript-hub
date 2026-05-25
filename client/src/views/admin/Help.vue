<template>
  <div class="help-page">
    <el-card class="hero-card">
      <div class="hero-content">
        <span class="hero-kicker">后台帮助中心</span>
        <h2>远程核心到底怎么用？</h2>
        <p>把它理解成“脚本保护壳”：用户浏览器里安装入口壳，你真正想保护的核心代码放在服务器。新手先用傻瓜保护壳，跑通后再考虑高级远程模块。</p>
      </div>
    </el-card>

    <div class="help-grid">
      <el-card class="help-card strong-card">
        <template #header>
          <strong>推荐给小白：傻瓜保护壳</strong>
        </template>
        <ol class="step-list">
          <li>在“脚本管理”创建脚本，交付模式选“远程下发代码”。</li>
          <li>上传一个原本就能正常运行的完整油猴脚本。</li>
          <li>进入“授权与运行时”，选择这个脚本。</li>
          <li>选择“傻瓜保护壳”，点击“一键保护并发布”。</li>
          <li>发给用户安装。用户拿到的是入口壳，核心逻辑由后台远程下发。</li>
        </ol>
      </el-card>

      <el-card class="help-card">
        <template #header>
          <strong>给懂代码的人：高级远程模块</strong>
        </template>
        <p>高级模式允许你把脚本拆成远程模块、运行参数、站点规则。它适合后续频繁热更新，但第一次接入不建议直接大拆。</p>
        <ul class="plain-list">
          <li>模块代码：真正执行的脚本逻辑。</li>
          <li>发布版本号：用户线上会拿到哪一版。</li>
          <li>使用代码版：这个发布版本指向哪一份模块代码。</li>
          <li>高级设置：选择器、文案、节奏参数等可变内容。</li>
        </ul>
      </el-card>

      <el-card class="help-card">
        <template #header>
          <strong>为什么不能承诺 100% 兼容？</strong>
        </template>
        <p>系统会尽量自动保留 <code>@match</code>、<code>@grant</code>、<code>@require</code>、<code>@connect</code> 等头部能力，也会把完整主体包进远程代码版。但有些脚本写法天生风险高，需要真实页面测试。</p>
        <ul class="plain-list">
          <li>用了 <code>unsafeWindow</code>、<code>eval</code>、<code>new Function</code> 的脚本要重点测试。</li>
          <li>强依赖页面加载时机、iframe、跨域资源的脚本要重点测试。</li>
          <li>AI 生成的脚本建议先用傻瓜模式跑通，再逐步整理参数。</li>
        </ul>
      </el-card>

      <el-card class="help-card">
        <template #header>
          <strong>上线前检查清单</strong>
        </template>
        <ul class="check-list">
          <li>运行时地址使用 HTTPS，正式站不要用本地 IP。</li>
          <li>安装脚本后能正常提交授权申请。</li>
          <li>后台批准后，脚本能激活并继续运行。</li>
          <li>能看到设备绑定、在线会话和最近记录。</li>
          <li>真实业务页面至少跑一遍核心流程。</li>
        </ul>
      </el-card>
    </div>
  </div>
</template>

<style scoped lang="scss">
.help-page {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.hero-card {
  border: none;
  background:
    radial-gradient(circle at top left, rgba(37, 99, 235, 0.16), transparent 34%),
    linear-gradient(135deg, rgba(16, 185, 129, 0.12), rgba(59, 130, 246, 0.08));
  box-shadow: 0 12px 30px rgba(15, 23, 42, 0.08);
}

.hero-content {
  max-width: 860px;

  h2 {
    margin: 8px 0 10px;
    font-size: 30px;
    color: var(--text-color-strong);
  }

  p {
    margin: 0;
    color: var(--text-color-secondary);
    line-height: 1.8;
  }
}

.hero-kicker {
  color: #2563eb;
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.08em;
}

.help-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 20px;
}

.help-card {
  border: 1px solid var(--surface-border-soft);

  p {
    margin: 0 0 12px;
    color: var(--text-color-secondary);
    line-height: 1.8;
  }

  code {
    color: #2563eb;
    background: rgba(37, 99, 235, 0.08);
    padding: 1px 5px;
    border-radius: 5px;
  }
}

.strong-card {
  border-color: rgba(37, 99, 235, 0.22);
}

.step-list,
.plain-list,
.check-list {
  margin: 0;
  padding-left: 20px;
  color: var(--text-color-secondary);
  line-height: 1.8;
}

.step-list li,
.plain-list li,
.check-list li {
  margin-bottom: 6px;
}

@media (max-width: 900px) {
  .help-grid {
    grid-template-columns: 1fr;
  }

  .hero-content h2 {
    font-size: 24px;
  }
}
</style>
