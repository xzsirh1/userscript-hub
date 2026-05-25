<template>
  <div class="scripts-page">
    <div class="container">
      <!-- 筛选栏 -->
      <div class="filter-bar card">
        <div class="filter-left">
          <el-select
            v-model="filters.category_id"
            placeholder="全部分类"
            clearable
            @change="loadScripts"
          >
            <el-option
              v-for="cat in categories"
              :key="cat.id"
              :label="cat.name"
              :value="cat.id"
            />
          </el-select>

          <el-input
            v-model="filters.keyword"
            placeholder="搜索脚本..."
            clearable
            style="width: 200px"
            @keyup.enter="loadScripts"
          >
            <template #prefix>
              <el-icon><Search /></el-icon>
            </template>
          </el-input>
        </div>

        <div class="filter-right">
          <el-radio-group v-model="sortBy" @change="loadScripts">
            <el-radio-button value="latest">最新</el-radio-button>
            <el-radio-button value="popular">最热</el-radio-button>
          </el-radio-group>
        </div>
      </div>

      <!-- 脚本列表 -->
      <div class="script-list">
        <div
          v-for="script in scripts"
          :key="script.id"
          class="script-item card"
          @click="goToScript(script.id)"
        >
          <div class="script-main">
            <div class="script-header">
              <h3>{{ script.name }}</h3>
              <div class="script-tags">
                <span class="tag version">v{{ script.current_version || script.latest_version || '1.0.0' }}</span>
                <span class="tag category">{{ script.category_name || '未分类' }}</span>
                <span v-if="script.auth_mode && script.auth_mode !== 'none'" class="tag auth">需授权</span>
              </div>
            </div>
            <p class="script-desc">{{ script.description || '暂无描述' }}</p>
            <div class="script-meta">
              <span>
                <el-icon><Download /></el-icon>
                {{ script.download_count || 0 }} 次下载
              </span>
              <span>
                <el-icon><Clock /></el-icon>
                {{ formatDate(script.updated_at) }}
              </span>
            </div>
          </div>
          <div class="script-action">
            <el-button type="primary" @click.stop="installScript(script)">
              一键安装
            </el-button>
          </div>
        </div>

        <el-empty v-if="scripts.length === 0 && !loading" description="暂无脚本" />
      </div>

      <!-- 分页 -->
      <div v-if="total > pageSize" class="pagination">
        <el-pagination
          v-model:current-page="currentPage"
          :page-size="pageSize"
          :total="total"
          layout="prev, pager, next"
          @current-change="loadScripts"
        />
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { ElMessageBox, ElMessage } from 'element-plus'
import { getScripts, verifyPassword } from '@/api/scripts'
import { getCategories } from '@/api/categories'

const router = useRouter()
const route = useRoute()

const loading = ref(false)
const scripts = ref([])
const categories = ref([])
const total = ref(0)
const currentPage = ref(1)
const pageSize = ref(12)
const sortBy = ref('latest')

const filters = reactive({
  category_id: null,
  keyword: ''
})

const loadCategories = async () => {
  try {
    const res = await getCategories()
    if (res.code === 200) {
      categories.value = res.data
    }
  } catch (e) {
    console.error('加载分类失败', e)
  }
}

const loadScripts = async () => {
  loading.value = true
  try {
    const res = await getScripts({
      page: currentPage.value,
      limit: pageSize.value,
      category_id: filters.category_id || undefined,
      keyword: filters.keyword || undefined
    })
    if (res.code === 200) {
      scripts.value = res.data.list
      total.value = res.data.total

      // 根据排序方式排序
      if (sortBy.value === 'popular') {
        scripts.value.sort((a, b) => (b.download_count || 0) - (a.download_count || 0))
      }
    }
  } catch (e) {
    console.error('加载脚本失败', e)
  } finally {
    loading.value = false
  }
}

const goToScript = (id) => {
  router.push(`/script/${id}`)
}

const installScript = async (script) => {
  // 如果是私密脚本
  if (script.is_private) {
    // 非管理员需要输入密码
    try {
      const { value } = await ElMessageBox.prompt('该脚本需要密码访问', '输入密码', {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        inputType: 'password',
        inputPlaceholder: '请输入访问密码'
      })

      // 验证密码
      const res = await verifyPassword(script.id, value)
      if (res.code === 200) {
          window.open(`/api/download/install/${script.id}.user.js`, '_blank')
      } else {
        ElMessage.error(res.message || '密码错误')
      }
    } catch (e) {
      if (e !== 'cancel') {
        ElMessage.error('密码验证失败')
      }
    }
  } else {
    // 公开脚本直接下载
    window.open(`/api/download/install/${script.id}.user.js`, '_blank')
  }
}

const formatDate = (dateStr) => {
  if (!dateStr) return '-'
  return new Date(dateStr).toLocaleDateString('zh-CN')
}

// 监听路由参数
watch(() => route.query.category, (newVal) => {
  if (newVal) {
    filters.category_id = parseInt(newVal)
  }
  loadScripts()
}, { immediate: true })

onMounted(() => {
  loadCategories()
  if (route.query.category) {
    filters.category_id = parseInt(route.query.category)
  }
})
</script>

<style lang="scss" scoped>
.scripts-page {
  .filter-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 15px;
    margin-bottom: 25px;

    .filter-left {
      display: flex;
      gap: 15px;
      flex-wrap: wrap;
    }

    @media (max-width: 768px) {
      flex-direction: column;
      align-items: stretch;

      .filter-left,
      .filter-right {
        width: 100%;
      }

      .el-select,
      .el-input {
        width: 100% !important;
      }
    }
  }
}

.script-list {
  display: flex;
  flex-direction: column;
  gap: 15px;
}

.script-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  cursor: pointer;
  transition: all 0.3s;

  &:hover {
    transform: translateX(5px);
    border-left: 3px solid var(--primary-color);
  }

  .script-main {
    flex: 1;
    min-width: 0;
  }

  .script-header {
    display: flex;
    align-items: center;
    gap: 15px;
    margin-bottom: 10px;
    flex-wrap: wrap;

    h3 {
      font-size: 17px;
      font-weight: 600;
    }

    .script-tags {
      display: flex;
      gap: 8px;

      .tag {
        font-size: 12px;
        padding: 2px 8px;
        border-radius: 4px;

        &.version {
          color: var(--primary-color);
          background: rgba(64, 158, 255, 0.1);
        }

        &.category {
          color: var(--success-color);
          background: rgba(103, 194, 58, 0.1);
        }

        &.auth {
          color: #e67e22;
          background: rgba(230, 126, 34, 0.12);
        }
      }
    }
  }

  .script-desc {
    color: var(--text-color-secondary);
    font-size: 14px;
    line-height: 1.6;
    margin-bottom: 12px;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .script-meta {
    display: flex;
    gap: 20px;
    color: var(--text-color-muted);
    font-size: 13px;

    span {
      display: flex;
      align-items: center;
      gap: 4px;
    }
  }

  .script-action {
    flex-shrink: 0;
  }

  @media (max-width: 768px) {
    flex-direction: column;
    align-items: stretch;

    .script-action {
      margin-top: 15px;

      .el-button {
        width: 100%;
      }
    }
  }
}

.pagination {
  display: flex;
  justify-content: center;
  margin-top: 30px;
}
</style>
