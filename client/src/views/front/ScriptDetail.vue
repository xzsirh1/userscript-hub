<template>
  <div class="script-detail-page">
    <div class="container">
      <div v-if="script" class="detail-content">
        <!-- 脚本信息卡片 -->
        <div class="info-card card">
          <div class="info-header">
            <div class="info-main">
              <h1>{{ script.name }}</h1>
              <div class="info-tags">
                <span class="tag version">v{{ script.current_version || '1.0.0' }}</span>
                <span class="tag category">{{ script.category_name || '未分类' }}</span>
                <span v-if="script.is_private" class="tag private">私密</span>
                <span v-if="script.auth_mode && script.auth_mode !== 'none'" class="tag auth">需授权审批</span>
              </div>
            </div>
            <div class="info-action">
              <el-button type="primary" size="large" @click="installScript">
                <el-icon><Download /></el-icon>
                一键安装
              </el-button>
            </div>
          </div>

          <p class="info-desc">{{ script.description || '暂无描述' }}</p>

          <div v-if="script.auth_mode && script.auth_mode !== 'none'" class="auth-notice">
            <el-alert
              type="warning"
              :closable="false"
              show-icon
              title="该脚本启用了授权审批与运行监控"
              description="安装后首次运行需要提交使用申请，管理员审批后输入授权码激活；默认绑定一台设备，后台会记录最近活跃时间和运行会话。"
            />
          </div>

          <div class="info-stats">
            <div class="stat-item">
              <el-icon><Download /></el-icon>
              <span>{{ script.download_count || 0 }} 次下载</span>
            </div>
            <div class="stat-item">
              <el-icon><Clock /></el-icon>
              <span>更新于 {{ formatDate(script.updated_at) }}</span>
            </div>
            <div class="stat-item">
              <el-icon><Calendar /></el-icon>
              <span>创建于 {{ formatDate(script.created_at) }}</span>
            </div>
          </div>
        </div>

        <!-- 版本历史 -->
        <div class="version-card card">
          <h2 class="card-title">
            <el-icon><List /></el-icon>
            版本历史
          </h2>

          <div class="version-list">
            <div
              v-for="(version, index) in script.versions"
              :key="version.id"
              class="version-item"
              :class="{ latest: index === 0 }"
            >
              <div class="version-header">
                <span class="version-number">v{{ version.version }}</span>
                <span v-if="index === 0" class="latest-badge">最新</span>
                <span class="version-date">{{ formatDate(version.created_at) }}</span>
              </div>
              <p v-if="version.changelog" class="version-changelog">{{ version.changelog }}</p>
              <p v-else class="version-changelog empty">暂无更新日志</p>
              <el-button
                size="small"
                @click="installVersion(version.version)"
              >
                安装此版本
              </el-button>
            </div>

            <el-empty v-if="!script.versions?.length" description="暂无版本" />
          </div>
        </div>
      </div>

      <div v-else-if="loading" class="loading-state">
        <el-skeleton :rows="10" animated />
      </div>

      <div v-else class="error-state">
        <el-empty description="脚本不存在或已被删除" />
        <el-button @click="router.push('/scripts')">返回脚本列表</el-button>
      </div>
    </div>

    <!-- 私密脚本密码弹窗 -->
    <el-dialog
      v-model="passwordDialogVisible"
      title="私密脚本验证"
      width="400px"
      :close-on-click-modal="false"
    >
      <el-form @submit.prevent="verifyAndInstall">
        <el-form-item label="访问密码">
          <el-input
            v-model="accessPassword"
            type="password"
            placeholder="请输入访问密码"
            show-password
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="passwordDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="verifyAndInstall">确认</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'
import { getScript, verifyPassword } from '@/api/scripts'
import { useUserStore } from '@/store/user'

const router = useRouter()
const route = useRoute()
const userStore = useUserStore()

const loading = ref(true)
const script = ref(null)
const passwordDialogVisible = ref(false)
const accessPassword = ref('')
const pendingVersion = ref(null)

const loadScript = async () => {
  loading.value = true
  try {
    const res = await getScript(route.params.id)
    if (res.code === 200) {
      script.value = res.data
    }
  } catch (e) {
    if (e.response?.status === 403) {
      ElMessage.warning('该脚本为私密脚本，需要管理员权限')
    }
    console.error('加载脚本失败', e)
  } finally {
    loading.value = false
  }
}

const installScript = () => {
  // 私密脚本需要密码
  if (script.value.is_private) {
    if (script.value.access_password) {
      passwordDialogVisible.value = true
      pendingVersion.value = null
    } else {
      ElMessage.warning('该脚本为私密脚本，需要管理员登录')
    }
    return
  }

  window.open(`/api/download/install/${script.value.id}.user.js`, '_blank')
}

const installVersion = (version) => {
  // 私密脚本需要密码
  if (script.value.is_private) {
    if (script.value.access_password) {
      passwordDialogVisible.value = true
      pendingVersion.value = version
    } else {
      ElMessage.warning('该脚本为私密脚本，需要管理员登录')
    }
    return
  }

  window.open(`/api/download/install/${script.value.id}.user.js?version=${version}`, '_blank')
}

const verifyAndInstall = async () => {
  if (!accessPassword.value) {
    ElMessage.warning('请输入访问密码')
    return
  }

  try {
    const res = await verifyPassword(script.value.id, accessPassword.value)
    if (res.code === 200) {
      passwordDialogVisible.value = false
      const url = pendingVersion.value
        ? `/api/download/install/${script.value.id}.user.js?version=${pendingVersion.value}`
        : `/api/download/install/${script.value.id}.user.js`
      window.open(url, '_blank')
      accessPassword.value = ''
    }
  } catch (e) {
    ElMessage.error('密码错误')
  }
}

const formatDate = (dateStr) => {
  if (!dateStr) return '-'
  return new Date(dateStr).toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  })
}

onMounted(loadScript)
</script>

<style lang="scss" scoped>
.script-detail-page {
  .detail-content {
    display: flex;
    flex-direction: column;
    gap: 25px;
  }
}

.info-card {
  .info-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 20px;
    margin-bottom: 20px;

    @media (max-width: 768px) {
      flex-direction: column;
    }
  }

  .auth-notice {
    margin-bottom: 18px;
  }

  .info-main {
    h1 {
      font-size: 26px;
      font-weight: 600;
      margin-bottom: 12px;
    }

    .info-tags {
      display: flex;
      gap: 10px;
      flex-wrap: wrap;

      .tag {
        font-size: 13px;
        padding: 4px 12px;
        border-radius: 4px;

        &.version {
          color: var(--primary-color);
          background: rgba(64, 158, 255, 0.1);
        }

        &.category {
          color: var(--success-color);
          background: rgba(103, 194, 58, 0.1);
        }

        &.private {
          color: var(--warning-color);
          background: rgba(230, 162, 60, 0.1);
        }

        &.auth {
          color: #8e44ad;
          background: rgba(142, 68, 173, 0.12);
        }
      }
    }
  }

  .info-action {
    flex-shrink: 0;

    @media (max-width: 768px) {
      width: 100%;

      .el-button {
        width: 100%;
      }
    }
  }

  .info-desc {
    color: var(--text-color-secondary);
    font-size: 15px;
    line-height: 1.8;
    margin-bottom: 25px;
    padding-bottom: 25px;
    border-bottom: 1px solid var(--border-color-light);
  }

  .info-stats {
    display: flex;
    gap: 30px;
    flex-wrap: wrap;

    .stat-item {
      display: flex;
      align-items: center;
      gap: 6px;
      color: var(--text-color-muted);
      font-size: 14px;

      .el-icon {
        font-size: 16px;
      }
    }
  }
}

.version-card {
  .card-title {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 18px;
    font-weight: 600;
    margin-bottom: 20px;

    .el-icon {
      color: var(--primary-color);
    }
  }
}

.version-list {
  display: flex;
  flex-direction: column;
  gap: 15px;
}

.version-item {
  padding: 20px;
  background: var(--bg-color);
  border-radius: 8px;
  border-left: 3px solid var(--border-color);
  transition: all 0.3s;

  &.latest {
    border-left-color: var(--primary-color);
    background: rgba(64, 158, 255, 0.03);
  }

  &:hover {
    border-left-color: var(--primary-color);
  }

  .version-header {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 10px;

    .version-number {
      font-size: 16px;
      font-weight: 600;
      color: var(--text-color);
    }

    .latest-badge {
      font-size: 12px;
      color: #fff;
      background: var(--primary-color);
      padding: 2px 8px;
      border-radius: 4px;
    }

    .version-date {
      color: var(--text-color-muted);
      font-size: 13px;
      margin-left: auto;
    }
  }

  .version-changelog {
    color: var(--text-color-secondary);
    font-size: 14px;
    line-height: 1.6;
    margin-bottom: 15px;

    &.empty {
      color: var(--text-color-muted);
      font-style: italic;
    }
  }
}

.loading-state,
.error-state {
  padding: 60px 0;
  text-align: center;
}

.error-state {
  .el-button {
    margin-top: 20px;
  }
}
</style>
