<template>
  <div class="home-page">
    <div class="container">
      <!-- 公告区域 -->
      <div v-if="siteConfig.announcement" class="announcement">
        <el-alert
          :title="siteConfig.announcement"
          type="info"
          show-icon
          :closable="false"
        />
      </div>

      <!-- 油猴插件安装区 -->
      <section class="plugin-section card">
        <h2 class="section-title">
          <el-icon><Download /></el-icon>
          安装油猴插件
        </h2>
        <p class="section-desc">使用脚本前，请先安装 Tampermonkey 浏览器扩展</p>

        <div class="plugin-list">
          <div
            v-for="plugin in plugins"
            :key="plugin.id"
            class="plugin-card"
            :class="{ recommended: plugin.is_recommended }"
          >
            <div class="plugin-info">
              <h3>{{ plugin.name }}</h3>
              <p>{{ plugin.description || '油猴脚本管理器' }}</p>
              <span class="plugin-version">v{{ plugin.version }}</span>
              <span v-if="plugin.is_recommended" class="recommend-badge">推荐</span>
            </div>
            <el-button type="primary" @click="downloadPlugin(plugin)">
              <el-icon><Download /></el-icon>
              下载安装
            </el-button>
          </div>

          <div v-if="plugins.length === 0" class="empty-tip">
            暂无可用插件，请联系管理员上传
          </div>
        </div>

        <div class="guide-link">
          <router-link to="/guide">
            不会安装？查看详细教程 <el-icon><ArrowRight /></el-icon>
          </router-link>
        </div>
      </section>

      <!-- 脚本分类 -->
      <section class="category-section">
        <h2 class="section-title">
          <el-icon><Grid /></el-icon>
          脚本分类
        </h2>

        <div class="category-grid">
          <div
            v-for="category in categories"
            :key="category.id"
            class="category-card card"
            @click="goToCategory(category.id)"
          >
            <div class="category-icon">
              <el-icon><Folder /></el-icon>
            </div>
            <div class="category-info">
              <h3>{{ category.name }}</h3>
              <p>{{ category.script_count || 0 }} 个脚本</p>
            </div>
            <el-icon class="arrow-icon"><ArrowRight /></el-icon>
          </div>
        </div>
      </section>

      <!-- 最新脚本 -->
      <section class="scripts-section">
        <div class="section-header">
          <h2 class="section-title">
            <el-icon><Document /></el-icon>
            最新脚本
          </h2>
          <router-link to="/scripts" class="view-all">
            查看全部 <el-icon><ArrowRight /></el-icon>
          </router-link>
        </div>

        <div class="script-grid">
          <div
            v-for="script in latestScripts"
            :key="script.id"
            class="script-card card"
            @click="goToScript(script.id)"
          >
            <div class="script-header">
              <h3>{{ script.name }}</h3>
              <span class="script-version">v{{ script.current_version || script.latest_version || '1.0.0' }}</span>
            </div>
            <div v-if="script.auth_mode && script.auth_mode !== 'none'" class="script-notice">
              需先提交授权申请，审批通过后按授权码激活使用
            </div>
            <p class="script-desc">{{ script.description || '暂无描述' }}</p>
            <div class="script-footer">
              <span class="script-category">{{ script.category_name || '未分类' }}</span>
              <span class="script-downloads">
                <el-icon><Download /></el-icon>
                {{ script.download_count || 0 }}
              </span>
            </div>
          </div>
        </div>

        <div v-if="latestScripts.length === 0" class="empty-state">
          <el-empty description="暂无脚本" />
        </div>
      </section>

      <!-- 小程序区域 -->
      <section class="programs-section" v-if="programs.length > 0">
        <div class="section-header">
          <h2 class="section-title">
            <el-icon><Files /></el-icon>
            小程序下载
          </h2>
          <router-link to="/programs" class="view-all">
            查看全部 <el-icon><ArrowRight /></el-icon>
          </router-link>
        </div>

        <div class="program-grid">
          <div
            v-for="program in programs"
            :key="program.id"
            class="program-card card"
          >
            <div class="program-header">
              <h3>{{ program.name }}</h3>
              <span class="program-version">v{{ program.version || '1.0.0' }}</span>
            </div>
            <p class="program-desc">{{ program.description || '暂无描述' }}</p>
            <div class="program-footer">
              <span class="program-downloads">
                <el-icon><Download /></el-icon>
                {{ program.download_count || 0 }}
              </span>
              <el-button type="primary" size="small" @click="downloadProgram(program)">
                下载
              </el-button>
            </div>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { getScripts } from '@/api/scripts'
import { getCategories } from '@/api/categories'
import { getPlugins } from '@/api/plugins'
import { getPrograms } from '@/api/programs'
import { getConfig } from '@/api/config'

const router = useRouter()

const siteConfig = ref({})
const plugins = ref([])
const categories = ref([])
const latestScripts = ref([])
const programs = ref([])

const loadData = async () => {
  try {
    const [configRes, pluginsRes, categoriesRes, scriptsRes, programsRes] = await Promise.all([
      getConfig(),
      getPlugins(),
      getCategories(),
      getScripts({ limit: 6 }),
      getPrograms()
    ])

    if (configRes.code === 200) siteConfig.value = configRes.data
    if (pluginsRes.code === 200) plugins.value = pluginsRes.data
    if (categoriesRes.code === 200) categories.value = categoriesRes.data
    if (scriptsRes.code === 200) latestScripts.value = scriptsRes.data.list
    if (programsRes.code === 200) programs.value = programsRes.data.slice(0, 6)
  } catch (e) {
    console.error('加载数据失败', e)
  }
}

const downloadPlugin = (plugin) => {
  window.open(`/api/download/plugin/${plugin.id}`, '_blank')
}

const goToCategory = (categoryId) => {
  router.push({ path: '/scripts', query: { category: categoryId } })
}

const goToScript = (scriptId) => {
  router.push(`/script/${scriptId}`)
}

const downloadProgram = (program) => {
  window.open(`/api/download/program/${program.id}`, '_blank')
}

onMounted(loadData)
</script>

<style lang="scss" scoped>
.home-page {
  .announcement {
    margin-bottom: 30px;
  }

  .section-title {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 20px;
    font-weight: 600;
    color: var(--text-color);
    margin-bottom: 20px;

    .el-icon {
      color: var(--primary-color);
    }
  }

  .section-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 20px;

    .section-title {
      margin-bottom: 0;
    }

    .view-all {
      display: flex;
      align-items: center;
      gap: 4px;
      color: var(--primary-color);
      font-size: 14px;
    }
  }
}

// 插件区域
.plugin-section {
  margin-bottom: 40px;

  .section-desc {
    color: var(--text-color-secondary);
    margin-bottom: 20px;
  }
}

.plugin-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 20px;
  margin-bottom: 20px;
}

.plugin-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px;
  background: var(--bg-color);
  border-radius: 8px;
  border: 1px solid var(--border-color-light);
  transition: all 0.3s;

  &:hover {
    border-color: var(--primary-color);
  }

  &.recommended {
    border-color: var(--success-color);
    background: rgba(103, 194, 58, 0.05);
  }

  .plugin-info {
    h3 {
      font-size: 16px;
      margin-bottom: 5px;
    }

    p {
      color: var(--text-color-secondary);
      font-size: 13px;
      margin-bottom: 8px;
    }

    .plugin-version {
      font-size: 12px;
      color: var(--text-color-muted);
      background: var(--bg-color-secondary);
      padding: 2px 8px;
      border-radius: 4px;
    }

    .recommend-badge {
      margin-left: 8px;
      font-size: 12px;
      color: var(--success-color);
      background: rgba(103, 194, 58, 0.1);
      padding: 2px 8px;
      border-radius: 4px;
    }
  }
}

.guide-link {
  text-align: center;

  a {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    color: var(--primary-color);
  }
}

.empty-tip {
  text-align: center;
  color: var(--text-color-muted);
  padding: 40px;
}

// 分类区域
.category-section {
  margin-bottom: 40px;
}

.category-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
  gap: 15px;
}

.category-card {
  display: flex;
  align-items: center;
  gap: 15px;
  padding: 20px;
  cursor: pointer;
  transition: all 0.3s;

  &:hover {
    transform: translateY(-2px);

    .arrow-icon {
      transform: translateX(5px);
    }
  }

  .category-icon {
    width: 50px;
    height: 50px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: linear-gradient(135deg, var(--primary-color), #67C23A);
    border-radius: 12px;
    color: #fff;
    font-size: 24px;
  }

  .category-info {
    flex: 1;

    h3 {
      font-size: 16px;
      margin-bottom: 4px;
    }

    p {
      color: var(--text-color-muted);
      font-size: 13px;
    }
  }

  .arrow-icon {
    color: var(--text-color-muted);
    transition: transform 0.3s;
  }
}

// 脚本区域
.scripts-section {
  margin-bottom: 40px;
}

.script-notice {
  margin-bottom: 10px;
  font-size: 12px;
  color: #b26a00;
  background: rgba(230, 162, 60, 0.12);
  border-radius: 6px;
  padding: 6px 10px;
}

.script-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 20px;
}

.script-card {
  cursor: pointer;
  transition: all 0.3s;

  &:hover {
    transform: translateY(-3px);
  }

  .script-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 10px;

    h3 {
      font-size: 16px;
      font-weight: 600;
    }

    .script-version {
      font-size: 12px;
      color: var(--primary-color);
      background: rgba(64, 158, 255, 0.1);
      padding: 2px 8px;
      border-radius: 4px;
    }
  }

  .script-desc {
    color: var(--text-color-secondary);
    font-size: 14px;
    line-height: 1.6;
    margin-bottom: 15px;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .script-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 13px;
    color: var(--text-color-muted);

    .script-category {
      padding: 2px 8px;
      background: var(--bg-color-secondary);
      border-radius: 4px;
    }

    .script-downloads {
      display: flex;
      align-items: center;
      gap: 4px;
    }
  }
}

// 小程序区域
.programs-section {
  margin-bottom: 40px;
}

.program-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 20px;
}

.program-card {
  transition: all 0.3s;

  &:hover {
    transform: translateY(-3px);
  }

  .program-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 10px;

    h3 {
      font-size: 16px;
      font-weight: 600;
    }

    .program-version {
      font-size: 12px;
      color: #67C23A;
      background: rgba(103, 194, 58, 0.1);
      padding: 2px 8px;
      border-radius: 4px;
    }
  }

  .program-desc {
    color: var(--text-color-secondary);
    font-size: 14px;
    line-height: 1.6;
    margin-bottom: 15px;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .program-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 13px;

    .program-downloads {
      display: flex;
      align-items: center;
      gap: 4px;
      color: var(--text-color-muted);
    }
  }
}

.empty-state {
  padding: 40px 0;
}

// 响应式
@media (max-width: 768px) {
  .plugin-list {
    grid-template-columns: 1fr;
  }

  .plugin-card {
    flex-direction: column;
    text-align: center;
    gap: 15px;
  }

  .category-grid {
    grid-template-columns: 1fr;
  }

  .script-grid {
    grid-template-columns: 1fr;
  }
}
</style>
