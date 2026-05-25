<template>
  <div class="guide-page">
    <div class="container">
      <h1 class="page-title">安装教程</h1>

      <!-- 步骤一：安装油猴插件 -->
      <section class="guide-section card">
        <h2>
          <span class="step-number">1</span>
          安装 Tampermonkey 插件
        </h2>

        <div class="guide-content">
          <p>Tampermonkey（油猴）是一款浏览器扩展，用于管理和运行用户脚本。请根据您的浏览器选择对应的安装方式：</p>

          <div class="browser-tabs">
            <el-tabs v-model="activeBrowser">
              <el-tab-pane label="Chrome / Edge" name="chrome">
                <div class="tab-content">
                  <h4>方式一：从本站下载（推荐）</h4>
                  <ol>
                    <li>在首页下载 Tampermonkey 插件文件（.crx）</li>
                    <li>打开浏览器，地址栏输入 <code>chrome://extensions/</code> 或 <code>edge://extensions/</code></li>
                    <li>开启右上角的「开发者模式」</li>
                    <li>将下载的 .crx 文件拖拽到扩展页面</li>
                    <li>点击「添加扩展程序」完成安装</li>
                  </ol>

                  <h4>方式二：从应用商店安装</h4>
                  <ol>
                    <li>访问 <a href="https://chrome.google.com/webstore/detail/tampermonkey/dhdgffkkebhmkfjojejmpbldmpobfkfo" target="_blank">Chrome 应用商店</a>（需要科学上网）</li>
                    <li>点击「添加至 Chrome」</li>
                  </ol>
                </div>
              </el-tab-pane>

              <el-tab-pane label="Firefox" name="firefox">
                <div class="tab-content">
                  <ol>
                    <li>访问 <a href="https://addons.mozilla.org/firefox/addon/tampermonkey/" target="_blank">Firefox 附加组件商店</a></li>
                    <li>点击「添加到 Firefox」</li>
                    <li>在弹出的对话框中点击「添加」</li>
                  </ol>
                </div>
              </el-tab-pane>

              <el-tab-pane label="Safari" name="safari">
                <div class="tab-content">
                  <ol>
                    <li>访问 <a href="https://apps.apple.com/app/tampermonkey/id1482490089" target="_blank">Mac App Store</a></li>
                    <li>点击「获取」安装 Tampermonkey</li>
                    <li>打开 Safari 偏好设置 - 扩展，启用 Tampermonkey</li>
                  </ol>
                </div>
              </el-tab-pane>
            </el-tabs>
          </div>
        </div>
      </section>

      <!-- 步骤二：安装脚本 -->
      <section class="guide-section card">
        <h2>
          <span class="step-number">2</span>
          安装用户脚本
        </h2>

        <div class="guide-content">
          <p>安装好 Tampermonkey 后，您可以通过以下方式安装脚本：</p>

          <ol>
            <li>在本站浏览脚本列表，找到需要的脚本</li>
            <li>点击「一键安装」按钮</li>
            <li>Tampermonkey 会自动弹出安装确认窗口</li>
            <li>查看脚本信息后，点击「安装」按钮</li>
            <li>安装完成后，刷新目标网页即可生效</li>
          </ol>

          <div class="tip-box">
            <el-icon><InfoFilled /></el-icon>
            <div>
              <strong>提示：</strong>如果点击安装后没有弹出窗口，请检查：
              <ul>
                <li>Tampermonkey 是否已正确安装并启用</li>
                <li>浏览器是否阻止了弹出窗口</li>
                <li>尝试刷新页面后重试</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      <!-- 步骤三：管理脚本 -->
      <section class="guide-section card">
        <h2>
          <span class="step-number">3</span>
          管理已安装的脚本
        </h2>

        <div class="guide-content">
          <p>点击浏览器工具栏中的 Tampermonkey 图标，可以：</p>

          <ul>
            <li><strong>启用/禁用脚本：</strong>点击脚本名称前的开关</li>
            <li><strong>编辑脚本：</strong>点击脚本名称进入编辑器</li>
            <li><strong>删除脚本：</strong>在管理面板中选择删除</li>
            <li><strong>更新脚本：</strong>回到本站重新安装最新版本</li>
          </ul>
        </div>
      </section>

      <!-- 常见问题 -->
      <section class="guide-section card">
        <h2>
          <span class="step-number">?</span>
          常见问题
        </h2>

        <div class="guide-content">
          <el-collapse>
            <el-collapse-item title="脚本安装后不生效怎么办？" name="1">
              <ul>
                <li>确认 Tampermonkey 已启用（图标不是灰色）</li>
                <li>确认脚本已启用（在 Tampermonkey 管理面板查看）</li>
                <li>刷新目标网页（Ctrl+F5 强制刷新）</li>
                <li>检查脚本的匹配规则是否包含当前网站</li>
              </ul>
            </el-collapse-item>

            <el-collapse-item title="如何更新脚本？" name="2">
              <p>回到本站，找到对应脚本，点击「一键安装」即可覆盖安装最新版本。</p>
            </el-collapse-item>

            <el-collapse-item title="脚本会不会有安全风险？" name="3">
              <p>本站所有脚本均经过审核，但建议您：</p>
              <ul>
                <li>安装前查看脚本说明和更新日志</li>
                <li>只安装来源可信的脚本</li>
                <li>定期检查已安装脚本的权限</li>
              </ul>
            </el-collapse-item>

            <el-collapse-item title="Chrome 提示「无法添加来自此网站的应用」？" name="4">
              <p>这是因为 Chrome 限制了非商店来源的扩展安装。请按以下步骤操作：</p>
              <ol>
                <li>打开 <code>chrome://extensions/</code></li>
                <li>开启右上角「开发者模式」</li>
                <li>将 .crx 文件拖拽到页面中</li>
              </ol>
            </el-collapse-item>
          </el-collapse>
        </div>
      </section>

      <div class="back-home">
        <el-button type="primary" @click="router.push('/')">
          <el-icon><Back /></el-icon>
          返回首页
        </el-button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'

const router = useRouter()
const activeBrowser = ref('chrome')
</script>

<style lang="scss" scoped>
.guide-page {
  .page-title {
    font-size: 28px;
    font-weight: 600;
    text-align: center;
    margin-bottom: 40px;
  }
}

.guide-section {
  margin-bottom: 25px;

  h2 {
    display: flex;
    align-items: center;
    gap: 12px;
    font-size: 20px;
    font-weight: 600;
    margin-bottom: 20px;
    padding-bottom: 15px;
    border-bottom: 1px solid var(--border-color-light);

    .step-number {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 32px;
      height: 32px;
      background: var(--primary-color);
      color: #fff;
      border-radius: 50%;
      font-size: 16px;
    }
  }
}

.guide-content {
  color: var(--text-color-secondary);
  line-height: 1.8;

  p {
    margin-bottom: 15px;
  }

  ol, ul {
    padding-left: 20px;
    margin-bottom: 15px;

    li {
      margin-bottom: 8px;
    }
  }

  h4 {
    color: var(--text-color);
    margin: 20px 0 10px;
    font-size: 15px;
  }

  code {
    background: var(--bg-color);
    padding: 2px 8px;
    border-radius: 4px;
    font-family: monospace;
    font-size: 13px;
    color: var(--primary-color);
  }

  a {
    color: var(--primary-color);

    &:hover {
      text-decoration: underline;
    }
  }
}

.browser-tabs {
  margin-top: 20px;

  .tab-content {
    padding: 15px 0;
  }
}

.tip-box {
  display: flex;
  gap: 12px;
  padding: 15px 20px;
  background: rgba(64, 158, 255, 0.05);
  border: 1px solid rgba(64, 158, 255, 0.2);
  border-radius: 8px;
  margin-top: 20px;

  .el-icon {
    color: var(--primary-color);
    font-size: 20px;
    flex-shrink: 0;
    margin-top: 2px;
  }

  ul {
    margin-bottom: 0;
    margin-top: 8px;
  }
}

.back-home {
  text-align: center;
  margin-top: 40px;
}
</style>
