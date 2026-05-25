<template>
  <div class="programs-page">
    <div class="container">
      <div class="filter-bar card">
        <div class="filter-left">
          <div class="filter-summary">
            <span>共 {{ programs.length }} 个小程序</span>
            <span>累计 {{ totalDownloads }} 次下载</span>
          </div>
        </div>
      </div>

      <div v-loading="loading" class="program-list">
        <div
          v-for="program in programs"
          :key="program.id"
          class="program-item card"
        >
          <div class="program-main">
            <div class="program-header">
              <h3>{{ program.name }}</h3>
              <div class="program-tags">
                <span class="tag version">v{{ program.version || '1.0.0' }}</span>
                <span class="tag category">小程序</span>
              </div>
            </div>

            <p class="program-desc">{{ program.description || '暂无描述' }}</p>

            <div class="program-meta">
              <span>
                <el-icon><Download /></el-icon>
                {{ program.download_count || 0 }} 次下载
              </span>
              <span>
                <el-icon><Clock /></el-icon>
                {{ formatDate(program.updated_at || program.created_at) }}
              </span>
            </div>
          </div>

          <div class="program-action">
            <el-button type="primary" @click="downloadProgram(program)">
              立即下载
            </el-button>
          </div>
        </div>

        <el-empty v-if="programs.length === 0 && !loading" description="暂无程序" />
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, onMounted } from 'vue'
import { getPrograms } from '@/api/programs'
import { useSiteStore } from '@/store/site'

const siteStore = useSiteStore()
const loading = ref(true)
const programs = ref([])

const totalDownloads = computed(() => {
  return programs.value.reduce((sum, program) => sum + (Number(program.download_count) || 0), 0)
})

const loadPrograms = async () => {
  loading.value = true
  try {
    const res = await getPrograms()
    if (res.code === 200) {
      programs.value = res.data
    }
  } catch (e) {
    console.error('加载程序列表失败', e)
  } finally {
    loading.value = false
  }
}

const downloadProgram = (program) => {
  window.open(`/api/download/program/${program.id}`, '_blank')
}

const formatDate = (time) => {
  if (!time) return '-'
  const date = new Date(time)
  if (Number.isNaN(date.getTime())) return '-'
  return date.toLocaleDateString('zh-CN')
}

onMounted(async () => {
  await siteStore.loadConfig()
  document.title = `小程序下载 - ${siteStore.title}`
  loadPrograms()
})
</script>

<style scoped lang="scss">
.programs-page {
  .filter-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 15px;
    margin-bottom: 25px;

    .filter-summary {
      display: flex;
      gap: 18px;
      flex-wrap: wrap;
      color: var(--text-color-secondary);
      font-size: 14px;
    }
  }
}

.program-list {
  display: flex;
  flex-direction: column;
  gap: 15px;
}

.program-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  transition: all 0.3s;

  &:hover {
    transform: translateX(5px);
    border-left: 3px solid var(--primary-color);
  }

  .program-main {
    flex: 1;
    min-width: 0;
  }

  .program-header {
    display: flex;
    align-items: center;
    gap: 15px;
    margin-bottom: 10px;
    flex-wrap: wrap;

    h3 {
      font-size: 17px;
      font-weight: 600;
      margin: 0;
    }

    .program-tags {
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
      }
    }
  }

  .program-desc {
    color: var(--text-color-secondary);
    font-size: 14px;
    line-height: 1.6;
    margin-bottom: 12px;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .program-meta {
    display: flex;
    gap: 20px;
    color: var(--text-color-muted);
    font-size: 13px;
    flex-wrap: wrap;

    span {
      display: flex;
      align-items: center;
      gap: 4px;
    }
  }

  .program-action {
    flex-shrink: 0;
  }

  @media (max-width: 768px) {
    flex-direction: column;
    align-items: stretch;

    .program-action {
      margin-top: 15px;

      .el-button {
        width: 100%;
      }
    }
  }
}
</style>
