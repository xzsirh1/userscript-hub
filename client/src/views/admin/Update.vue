<template>
  <div class="update-page">
    <div class="page-header">
      <h2>系统更新</h2>
      <p class="desc">上传更新包进行系统升级</p>
    </div>

    <!-- 当前版本信息 -->
    <el-card class="version-card">
      <template #header>
        <div class="card-header">
          <span>版本信息</span>
          <el-button size="small" @click="loadVersion" :loading="loadingVersion">刷新</el-button>
        </div>
      </template>
      <el-descriptions :column="2" border>
        <el-descriptions-item label="当前版本">{{ versionInfo.version || '未知' }}</el-descriptions-item>
        <el-descriptions-item label="构建时间">{{ versionInfo.buildTime || '未知' }}</el-descriptions-item>
        <el-descriptions-item label="PM2 进程名">
          <el-input v-model="pm2ProcessName" size="small" style="width: 200px" placeholder="userscript-hub">
            <template #append>
              <el-button @click="savePm2Config" :loading="savingPm2">保存</el-button>
            </template>
          </el-input>
        </el-descriptions-item>
      </el-descriptions>
    </el-card>

    <!-- 上传更新包 -->
    <el-card class="upload-card">
      <template #header>
        <div class="card-header">
          <span>上传更新包</span>
        </div>
      </template>
      <div class="upload-area">
        <el-upload
          ref="uploadRef"
          drag
          :auto-upload="false"
          :limit="1"
          accept=".zip"
          :on-change="handleFileChange"
          :on-exceed="handleExceed"
        >
          <el-icon class="el-icon--upload"><UploadFilled /></el-icon>
          <div class="el-upload__text">拖拽 ZIP 文件到此处，或 <em>点击选择</em></div>
          <template #tip>
            <div class="el-upload__tip">
              只支持 ZIP 格式，最大 100MB。更新包应包含 server/src 和 client/src 目录。
            </div>
          </template>
        </el-upload>

        <div class="upload-actions" v-if="selectedFile">
          <el-button type="primary" @click="executeUpdate" :loading="updating" :disabled="!selectedFile">
            <el-icon><Upload /></el-icon>
            一键更新
          </el-button>
          <el-button @click="uploadOnly" :loading="uploading" :disabled="!selectedFile">
            仅上传解压
          </el-button>
          <el-button @click="clearFile">清除</el-button>
        </div>
      </div>

      <!-- 更新进度 -->
      <div class="update-progress" v-if="updateStatus">
        <el-alert :type="updateStatus.type" :title="updateStatus.title" :description="updateStatus.desc" show-icon :closable="false" />
      </div>
    </el-card>

    <!-- 手动操作 -->
    <el-card class="manual-card">
      <template #header>
        <div class="card-header">
          <span>手动操作</span>
        </div>
      </template>
      <el-space>
        <el-button @click="buildFrontend" :loading="building">
          <el-icon><SetUp /></el-icon>
          构建前端
        </el-button>
        <el-popconfirm title="确定要重启服务吗？" @confirm="restartService">
          <template #reference>
            <el-button type="warning" :loading="restarting">
              <el-icon><RefreshRight /></el-icon>
              重启服务
            </el-button>
          </template>
        </el-popconfirm>
      </el-space>
    </el-card>

    <!-- 备份管理 -->
    <el-card class="backup-card">
      <template #header>
        <div class="card-header">
          <span>代码备份</span>
          <el-button size="small" @click="loadBackups" :loading="loadingBackups">刷新</el-button>
        </div>
      </template>
      <el-table :data="backups" v-loading="loadingBackups" empty-text="暂无备份">
        <el-table-column prop="name" label="备份名称" />
        <el-table-column prop="createdAt" label="创建时间">
          <template #default="{ row }">{{ formatTime(row.createdAt) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="180">
          <template #default="{ row }">
            <el-popconfirm title="确定要回滚到此备份吗？" @confirm="rollback(row.name)">
              <template #reference>
                <el-button type="warning" size="small" :loading="row._rolling">回滚</el-button>
              </template>
            </el-popconfirm>
            <el-popconfirm title="确定要删除此备份吗？此操作不可恢复！" @confirm="deleteBackup(row.name)">
              <template #reference>
                <el-button type="danger" size="small" :loading="row._deleting" style="margin-left: 10px">删除</el-button>
              </template>
            </el-popconfirm>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <!-- 更新日志 -->
    <el-card class="logs-card">
      <template #header>
        <div class="card-header">
          <span>更新日志</span>
          <el-button size="small" @click="loadLogs" :loading="loadingLogs">刷新</el-button>
        </div>
      </template>
      <el-table :data="logs" v-loading="loadingLogs" empty-text="暂无日志">
        <el-table-column prop="status" label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="getStatusType(row.status)" size="small">{{ getStatusText(row.status) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="details" label="详情" show-overflow-tooltip />
        <el-table-column prop="files_updated" label="文件数" width="80" />
        <el-table-column prop="duration" label="耗时" width="100">
          <template #default="{ row }">{{ row.duration ? Math.round(row.duration / 1000) + 's' : '-' }}</template>
        </el-table-column>
        <el-table-column prop="created_at" label="时间" width="180">
          <template #default="{ row }">{{ formatTime(row.created_at) }}</template>
        </el-table-column>
      </el-table>
      <div class="pagination" v-if="logsTotal > 10">
        <el-pagination
          v-model:current-page="logsPage"
          :page-size="10"
          :total="logsTotal"
          layout="prev, pager, next"
          @current-change="loadLogs"
        />
      </div>
    </el-card>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { UploadFilled, Upload, SetUp, RefreshRight } from '@element-plus/icons-vue'
import request from '@/api/request'

const uploadRef = ref(null)
const selectedFile = ref(null)

// 版本信息
const versionInfo = ref({})
const loadingVersion = ref(false)
const pm2ProcessName = ref('userscript-hub')
const savingPm2 = ref(false)

// 更新状态
const updating = ref(false)
const uploading = ref(false)
const building = ref(false)
const restarting = ref(false)
const updateStatus = ref(null)

// 备份
const backups = ref([])
const loadingBackups = ref(false)

// 日志
const logs = ref([])
const logsTotal = ref(0)
const logsPage = ref(1)
const loadingLogs = ref(false)

onMounted(() => {
  loadVersion()
  loadBackups()
  loadLogs()
})

const loadVersion = async () => {
  loadingVersion.value = true
  try {
    const res = await request.get('/update/version')
    if (res.code === 200) {
      versionInfo.value = res.data
      pm2ProcessName.value = res.data.pm2ProcessName || 'userscript-hub'
    }
  } catch (e) {
    console.error(e)
  } finally {
    loadingVersion.value = false
  }
}

const savePm2Config = async () => {
  savingPm2.value = true
  try {
    const res = await request.put('/update/pm2-config', { processName: pm2ProcessName.value })
    if (res.code === 200) {
      ElMessage.success('保存成功')
    }
  } catch (e) {
    ElMessage.error('保存失败')
  } finally {
    savingPm2.value = false
  }
}

const handleFileChange = (file) => {
  selectedFile.value = file.raw
}

const handleExceed = () => {
  ElMessage.warning('只能选择一个文件')
}

const clearFile = () => {
  selectedFile.value = null
  uploadRef.value?.clearFiles()
  updateStatus.value = null
}

// 一键更新
const executeUpdate = async () => {
  if (!selectedFile.value) return

  updating.value = true
  updateStatus.value = { type: 'info', title: '正在更新...', desc: '上传并解压更新包，构建前端，重启服务' }

  try {
    const formData = new FormData()
    formData.append('file', selectedFile.value)

    const res = await request.post('/update/execute', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 600000
    })

    if (res.code === 200) {
      updateStatus.value = { type: 'success', title: '更新成功', desc: res.message + '，页面将在 5 秒后刷新' }
      clearFile()
      setTimeout(() => location.reload(), 5000)
    } else {
      updateStatus.value = { type: 'error', title: '更新失败', desc: res.message }
    }
  } catch (e) {
    updateStatus.value = { type: 'error', title: '更新失败', desc: e.message }
  } finally {
    updating.value = false
    loadLogs()
  }
}

// 仅上传解压
const uploadOnly = async () => {
  if (!selectedFile.value) return

  uploading.value = true
  updateStatus.value = { type: 'info', title: '正在上传...', desc: '上传并解压更新包' }

  try {
    const formData = new FormData()
    formData.append('file', selectedFile.value)

    const res = await request.post('/update/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 300000
    })

    if (res.code === 200) {
      updateStatus.value = { type: 'success', title: '上传成功', desc: res.message }
      clearFile()
    } else {
      updateStatus.value = { type: 'error', title: '上传失败', desc: res.message }
    }
  } catch (e) {
    updateStatus.value = { type: 'error', title: '上传失败', desc: e.message }
  } finally {
    uploading.value = false
    loadLogs()
    loadBackups()
  }
}

// 构建前端
const buildFrontend = async () => {
  building.value = true
  updateStatus.value = { type: 'info', title: '正在构建...', desc: '安装依赖并构建前端，可能需要几分钟' }

  try {
    const res = await request.post('/update/build', {}, { timeout: 600000 })
    if (res.code === 200) {
      updateStatus.value = { type: 'success', title: '构建成功', desc: res.message }
    } else {
      updateStatus.value = { type: 'error', title: '构建失败', desc: res.message }
    }
  } catch (e) {
    updateStatus.value = { type: 'error', title: '构建失败', desc: e.message }
  } finally {
    building.value = false
    loadLogs()
  }
}

// 重启服务
const restartService = async () => {
  restarting.value = true
  updateStatus.value = { type: 'info', title: '正在重启...', desc: '服务重启中，页面将在 5 秒后刷新' }

  try {
    await request.post('/update/restart')
    setTimeout(() => location.reload(), 5000)
  } catch (e) {
    updateStatus.value = { type: 'error', title: '重启失败', desc: e.message }
  } finally {
    restarting.value = false
  }
}

// 加载备份列表
const loadBackups = async () => {
  loadingBackups.value = true
  try {
    const res = await request.get('/update/backups')
    if (res.code === 200) {
      backups.value = res.data.map(b => ({
        ...b,
        createdAt: normalizeBackupTime(b.createdAt, b.name),
        _rolling: false,
        _deleting: false
      }))
    }
  } catch (e) {
    console.error(e)
  } finally {
    loadingBackups.value = false
  }
}

// 回滚
const rollback = async (backupName) => {
  const backup = backups.value.find(b => b.name === backupName)
  if (backup) backup._rolling = true

  try {
    const res = await request.post('/update/rollback', { backupName })
    if (res.code === 200) {
      ElMessage.success(res.message)
      loadLogs()
    } else {
      ElMessage.error(res.message)
    }
  } catch (e) {
    ElMessage.error('回滚失败: ' + e.message)
  } finally {
    if (backup) backup._rolling = false
  }
}

// 删除备份
const deleteBackup = async (backupName) => {
  const backup = backups.value.find(b => b.name === backupName)
  if (backup) backup._deleting = true

  try {
    const res = await request.delete(`/update/backups/${backupName}`)
    if (res.code === 200) {
      ElMessage.success('备份已删除')
      loadBackups() // 刷新列表
    } else {
      ElMessage.error(res.message)
    }
  } catch (e) {
    ElMessage.error('删除失败: ' + e.message)
  } finally {
    if (backup) backup._deleting = false
  }
}

// 加载日志
const loadLogs = async () => {
  loadingLogs.value = true
  try {
    const res = await request.get('/update/logs', { params: { page: logsPage.value, limit: 10 } })
    if (res.code === 200) {
      logs.value = res.data.list
      logsTotal.value = res.data.total
    }
  } catch (e) {
    console.error(e)
  } finally {
    loadingLogs.value = false
  }
}

const formatTime = (time) => {
  if (!time) return '-'

  const normalizedTime = normalizeTimeValue(time)
  if (!normalizedTime) return '-'

  const date = new Date(normalizedTime)
  if (Number.isNaN(date.getTime())) return '-'

  return date.toLocaleString('zh-CN')
}

const normalizeTimeValue = (time) => {
  if (time instanceof Date) {
    return Number.isNaN(time.getTime()) ? null : time.getTime()
  }

  if (typeof time === 'number') {
    return Number.isFinite(time) ? time : null
  }

  if (typeof time === 'string') {
    const trimmed = time.trim()
    if (!trimmed) return null

    if (/^\d+$/.test(trimmed)) {
      const numeric = Number(trimmed)
      return Number.isFinite(numeric) ? numeric : null
    }

    const parsed = Date.parse(trimmed)
    return Number.isNaN(parsed) ? null : parsed
  }

  return null
}

const normalizeBackupTime = (createdAt, backupName) => {
  const normalized = normalizeTimeValue(createdAt)
  if (normalized) {
    return normalized
  }

  const match = String(backupName || '').match(/^backup_(\d{10,})$/)
  if (!match) {
    return null
  }

  const numeric = Number(match[1])
  if (!Number.isFinite(numeric)) {
    return null
  }

  return match[1].length === 10 ? numeric * 1000 : numeric
}

const getStatusType = (status) => {
  const map = { success: 'success', failed: 'danger', processing: 'info', building: 'warning', uploaded: 'info', built: 'success', restarting: 'warning', rollback: 'warning' }
  return map[status] || 'info'
}

const getStatusText = (status) => {
  const map = { success: '成功', failed: '失败', processing: '处理中', building: '构建中', uploaded: '已上传', built: '已构建', restarting: '重启中', rollback: '已回滚' }
  return map[status] || status
}
</script>

<style lang="scss" scoped>
.update-page {
  .page-header {
    margin-bottom: 20px;
    h2 { margin: 0 0 5px 0; }
    .desc { color: #909399; font-size: 14px; margin: 0; }
  }

  .el-card {
    margin-bottom: 20px;
  }

  .card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .upload-area {
    text-align: center;

    .upload-actions {
      margin-top: 20px;
    }
  }

  .update-progress {
    margin-top: 20px;
  }

  .pagination {
    margin-top: 15px;
    display: flex;
    justify-content: center;
  }
}
</style>
