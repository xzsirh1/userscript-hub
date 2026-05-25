<template>
  <div class="sync-page">
    <el-alert
      type="info"
      :closable="false"
      show-icon
      title="同步范围说明"
      description="现在的同步不只会拉分类、脚本、版本、插件和程序，也会同步脚本的安装方式、授权开关、运行设置，以及远程模块的版本信息。授权申请、设备在线和运行记录仍保留在本机，不跟其他节点互相覆盖。"
      class="sync-scope-alert"
    />

    <!-- 本机 API 密钥 -->
    <div class="card">
      <h3>本机同步密钥</h3>
      <p class="tip">其他节点连接本机时需要填写此密钥</p>
      <div class="api-key-row">
        <el-input v-model="apiKey" readonly style="max-width: 500px">
          <template #append>
            <el-button @click="copyApiKey">复制</el-button>
          </template>
        </el-input>
        <el-button type="warning" @click="regenerateKey" :loading="regenerating">重新生成</el-button>
      </div>
    </div>

    <!-- 同步节点管理 -->
    <div class="card">
      <div class="card-header">
        <h3>同步节点</h3>
        <el-button type="primary" @click="showAddDialog">添加节点</el-button>
      </div>

      <el-table :data="nodes" v-loading="loading" empty-text="暂无同步节点">
        <el-table-column prop="name" label="名称" width="120" />
        <el-table-column prop="url" label="地址" min-width="200" show-overflow-tooltip />
        <el-table-column prop="direction" label="方向" width="100">
          <template #default="{ row }">
            <el-tag :type="row.direction === 'pull' ? 'primary' : row.direction === 'push' ? 'success' : 'warning'" size="small">
              {{ { pull: '拉取', push: '推送', both: '双向' }[row.direction] || row.direction }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="sync_interval" label="间隔" width="90">
          <template #default="{ row }">
            {{ row.sync_interval >= 1440 ? (row.sync_interval / 1440) + '天' : row.sync_interval >= 60 ? (row.sync_interval / 60) + '小时' : row.sync_interval + '分钟' }}
          </template>
        </el-table-column>
        <el-table-column prop="last_sync_at" label="上次同步" width="170">
          <template #default="{ row }">
            {{ row.last_sync_at || '从未同步' }}
          </template>
        </el-table-column>
        <el-table-column prop="enabled" label="状态" width="80">
          <template #default="{ row }">
            <el-switch v-model="row.enabled" :active-value="1" :inactive-value="0" @change="toggleNode(row)" />
          </template>
        </el-table-column>
        <el-table-column label="操作" width="340" fixed="right">
          <template #default="{ row }">
            <el-button size="small" @click="testNode(row)" :loading="row._testing">测试</el-button>
            <el-button size="small" type="success" @click="syncNode(row)" :loading="row._syncing">同步</el-button>
            <el-button size="small" type="warning" @click="fullSyncNode(row)" :loading="row._syncing">全量</el-button>
            <el-button size="small" @click="editNode(row)">编辑</el-button>
            <el-button size="small" type="danger" @click="deleteNode(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <!-- 同步日志 -->
    <div class="card">
      <h3>同步日志</h3>
      <el-table :data="logs" v-loading="logsLoading" empty-text="暂无同步记录">
        <el-table-column prop="node_name" label="节点" width="120" />
        <el-table-column prop="direction" label="方向" width="80">
          <template #default="{ row }">
            {{ { pull: '拉取', push: '推送', both: '双向' }[row.direction] || '-' }}
          </template>
        </el-table-column>
        <el-table-column prop="status" label="状态" width="80">
          <template #default="{ row }">
            <el-tag :type="row.status === 'success' ? 'success' : 'danger'" size="small">
              {{ row.status === 'success' ? '成功' : '失败' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="同步数据" min-width="240">
          <template #default="{ row }">
            <span v-if="row.status === 'success'">
              {{ formatSyncSummary(row) }}
            </span>
            <span v-else class="error-text">{{ row.details }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="duration" label="耗时" width="90">
          <template #default="{ row }">
            {{ row.duration > 1000 ? (row.duration / 1000).toFixed(1) + 's' : row.duration + 'ms' }}
          </template>
        </el-table-column>
        <el-table-column prop="created_at" label="时间" width="170" />
      </el-table>
      <div class="pagination" v-if="logTotal > 20">
        <el-pagination
          v-model:current-page="logPage"
          :page-size="20"
          :total="logTotal"
          layout="prev, pager, next"
          @current-change="loadLogs"
        />
      </div>
    </div>

    <!-- 添加/编辑节点弹窗 -->
    <el-dialog v-model="dialogVisible" :title="editingNode ? '编辑节点' : '添加同步节点'" width="500px">
      <el-form :model="nodeForm" label-width="90px" ref="nodeFormRef" :rules="nodeRules">
        <el-form-item label="节点名称" prop="name">
          <el-input v-model="nodeForm.name" placeholder="如：群晖、备用服务器" />
        </el-form-item>
        <el-form-item label="节点地址" prop="url">
          <el-input v-model="nodeForm.url" placeholder="如：https://example.com" />
        </el-form-item>
        <el-form-item label="API 密钥" prop="api_key">
          <el-input v-model="nodeForm.api_key" placeholder="对方节点的同步密钥" show-password />
        </el-form-item>
        <el-form-item label="同步方向" prop="direction">
          <el-radio-group v-model="nodeForm.direction">
            <el-radio value="pull">拉取（从对方同步到本机）</el-radio>
            <el-radio value="push">推送（从本机同步到对方）</el-radio>
            <el-radio value="both">双向同步</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="同步间隔">
          <el-select v-model="nodeForm.sync_interval" style="width: 200px">
            <el-option label="每5分钟" :value="5" />
            <el-option label="每10分钟" :value="10" />
            <el-option label="每15分钟" :value="15" />
            <el-option label="每30分钟" :value="30" />
            <el-option label="每1小时" :value="60" />
            <el-option label="每6小时" :value="360" />
            <el-option label="每12小时" :value="720" />
            <el-option label="每天" :value="1440" />
          </el-select>
        </el-form-item>
        <el-form-item label="启用">
          <el-switch v-model="nodeForm.enabled" :active-value="1" :inactive-value="0" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="saveNode" :loading="saving">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import request from '@/api/request'

// 本机 API 密钥
const apiKey = ref('')
const regenerating = ref(false)

const loadApiKey = async () => {
  try {
    const res = await request.get('/sync/api-key')
    if (res.code === 200) apiKey.value = res.data.apiKey
  } catch (e) { console.error(e) }
}

const formatSyncSummary = (row) => {
  if (row.details) {
    return row.details
  }

  const parts = [
    `分类 ${row.categories_synced || 0}`,
    `脚本 ${row.scripts_synced || 0}`,
    `版本 ${row.versions_synced || 0}`,
    `插件 ${row.plugins_synced || 0}`,
    `小程序 ${row.programs_synced || 0}`,
    `文件 ${row.files_synced || 0}`
  ]

  if (row.runtime_settings_synced) {
    parts.push(`运行设置 ${row.runtime_settings_synced}`)
  }
  if (row.remote_manifests_synced) {
    parts.push(`远程版本 ${row.remote_manifests_synced}`)
  }
  if (row.remote_modules_synced) {
    parts.push(`远程模块 ${row.remote_modules_synced}`)
  }

  return parts.join(' / ')
}

const copyApiKey = () => {
  navigator.clipboard.writeText(apiKey.value)
  ElMessage.success('已复制到剪贴板')
}

const regenerateKey = async () => {
  try {
    await ElMessageBox.confirm('重新生成后，所有已连接的节点需要更新密钥，确定？', '警告', { type: 'warning' })
    regenerating.value = true
    const res = await request.post('/sync/api-key/regenerate')
    if (res.code === 200) {
      apiKey.value = res.data.apiKey
      ElMessage.success('已重新生成')
    }
  } catch (e) { if (e !== 'cancel') console.error(e) }
  finally { regenerating.value = false }
}

// 节点管理
const nodes = ref([])
const loading = ref(false)
const dialogVisible = ref(false)
const editingNode = ref(null)
const saving = ref(false)
const nodeFormRef = ref(null)

const nodeForm = reactive({
  name: '',
  url: '',
  api_key: '',
  direction: 'pull',
  sync_interval: 1440,
  enabled: 1
})

const nodeRules = {
  name: [{ required: true, message: '请输入节点名称', trigger: 'blur' }],
  url: [{ required: true, message: '请输入节点地址', trigger: 'blur' }],
  api_key: [{ required: true, message: '请输入API密钥', trigger: 'blur' }]
}

const loadNodes = async () => {
  loading.value = true
  try {
    const res = await request.get('/sync/nodes')
    if (res.code === 200) nodes.value = res.data.map(n => ({ ...n, _testing: false, _syncing: false }))
  } catch (e) { console.error(e) }
  finally { loading.value = false }
}

const showAddDialog = () => {
  editingNode.value = null
  Object.assign(nodeForm, { name: '', url: '', api_key: '', direction: 'pull', sync_interval: 30, enabled: 1 })
  dialogVisible.value = true
}

const editNode = (row) => {
  editingNode.value = row
  Object.assign(nodeForm, { name: row.name, url: row.url, api_key: row.api_key, direction: row.direction, sync_interval: row.sync_interval, enabled: row.enabled })
  dialogVisible.value = true
}

const saveNode = async () => {
  if (!nodeFormRef.value) return
  await nodeFormRef.value.validate(async (valid) => {
    if (!valid) return
    saving.value = true
    try {
      if (editingNode.value) {
        const res = await request.put(`/sync/nodes/${editingNode.value.id}`, nodeForm)
        if (res.code === 200) ElMessage.success('更新成功')
      } else {
        const res = await request.post('/sync/nodes', nodeForm)
        if (res.code === 200) ElMessage.success('添加成功')
      }
      dialogVisible.value = false
      loadNodes()
    } catch (e) { console.error(e) }
    finally { saving.value = false }
  })
}

const deleteNode = async (row) => {
  try {
    await ElMessageBox.confirm(`确定删除节点「${row.name}」？`, '提示', { type: 'warning' })
    const res = await request.delete(`/sync/nodes/${row.id}`)
    if (res.code === 200) {
      ElMessage.success('删除成功')
      loadNodes()
    }
  } catch (e) { if (e !== 'cancel') console.error(e) }
}

const toggleNode = async (row) => {
  try {
    await request.put(`/sync/nodes/${row.id}`, row)
  } catch (e) { console.error(e) }
}

const testNode = async (row) => {
  row._testing = true
  try {
    const res = await request.post(`/sync/nodes/${row.id}/test`)
      if (res.code === 200) {
        ElMessage.success(`连接成功！对方有 ${res.data.scripts} 个脚本、${res.data.plugins} 个插件、${res.data.programs || 0} 个小程序、${res.data.remoteCoreScripts || 0} 个远程模块脚本`)
      } else {
        ElMessage.error(res.message || '连接失败')
      }
  } catch (e) { ElMessage.error('连接失败') }
  finally { row._testing = false }
}

const syncNode = async (row) => {
  row._syncing = true
  try {
    const res = await request.post(`/sync/nodes/${row.id}/sync`)
    if (res.code === 200) {
      const d = res.data
      ElMessage.success(`同步完成：${formatSyncSummary(d)}`)
      loadNodes()
      loadLogs()
    }
  } catch (e) { ElMessage.error('同步失败: ' + (e.message || '未知错误')) }
  finally { row._syncing = false }
}

const fullSyncNode = async (row) => {
  row._syncing = true
  try {
    await ElMessageBox.confirm('全量同步会重新检查该节点的全部分类、脚本、插件和小程序，首次补拉历史数据时建议执行一次。确定继续吗？', '提示', { type: 'warning' })
    const res = await request.post(`/sync/nodes/${row.id}/sync`, { forceFull: true })
    if (res.code === 200) {
      const d = res.data
      ElMessage.success(`全量同步完成：${formatSyncSummary(d)}`)
      loadNodes()
      loadLogs()
    }
  } catch (e) {
    if (e !== 'cancel') {
      ElMessage.error('全量同步失败: ' + (e.message || '未知错误'))
    }
  } finally {
    row._syncing = false
  }
}

// 同步日志
const logs = ref([])
const logsLoading = ref(false)
const logPage = ref(1)
const logTotal = ref(0)

const loadLogs = async () => {
  logsLoading.value = true
  try {
    const res = await request.get('/sync/logs', { params: { page: logPage.value, limit: 20 } })
    if (res.code === 200) {
      logs.value = res.data.list
      logTotal.value = res.data.total
    }
  } catch (e) { console.error(e) }
  finally { logsLoading.value = false }
}

onMounted(() => {
  loadApiKey()
  loadNodes()
  loadLogs()
})
</script>

<style lang="scss" scoped>
.sync-page {
  .sync-scope-alert {
    margin-bottom: 20px;
  }

  .card {
    background: var(--card-bg);
    border-radius: 8px;
    padding: 20px;
    margin-bottom: 20px;

    h3 {
      font-size: 16px;
      font-weight: 600;
      margin-bottom: 10px;
    }

    .tip {
      font-size: 13px;
      color: #909399;
      margin-bottom: 15px;
    }
  }

  .card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 15px;

    h3 { margin-bottom: 0; }
  }

  .api-key-row {
    display: flex;
    gap: 10px;
    align-items: center;
  }

  .error-text {
    color: #f56c6c;
    font-size: 13px;
  }

  .pagination {
    margin-top: 15px;
    display: flex;
    justify-content: center;
  }
}
</style>
