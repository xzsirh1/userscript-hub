<template>
  <div class="settings-page">
    <div class="settings-card card">
      <h3>网站基本设置</h3>
      <el-form :model="config" label-width="100px">
        <el-form-item label="网站标题">
          <el-input v-model="config.title" placeholder="请输入网站标题" />
          <span class="form-tip">显示在浏览器标签页和导航栏</span>
        </el-form-item>
        <el-form-item label="网站图标">
          <div class="favicon-upload">
            <div class="favicon-preview">
              <img :src="faviconUrl" alt="favicon" @error="onFaviconError" />
            </div>
            <div class="favicon-actions">
              <el-upload
                ref="faviconUploadRef"
                action="/api/config/favicon"
                :headers="uploadHeaders"
                :show-file-list="false"
                :on-success="onFaviconSuccess"
                :on-error="onFaviconUploadError"
                :before-upload="beforeFaviconUpload"
                accept=".ico,.png,.svg,.jpg,.jpeg,.gif,.webp"
              >
                <el-button size="small" type="primary">上传图标</el-button>
              </el-upload>
              <el-button size="small" @click="resetFavicon" :loading="resettingFavicon">恢复默认</el-button>
            </div>
          </div>
          <span class="form-tip">支持 ico/png/svg/jpg/gif/webp 格式，建议 32x32 或 64x64 像素</span>
        </el-form-item>
        <el-form-item label="网站简称">
          <el-input v-model="config.shortName" placeholder="2-4个字符（如 XZ）" maxlength="4" style="width: 200px" />
          <span class="form-tip">未上传图标时显示在默认图标上</span>
        </el-form-item>
        <el-form-item label="网站描述">
          <el-input v-model="config.description" type="textarea" :rows="2" placeholder="请输入网站描述" />
        </el-form-item>
        <el-form-item label="页脚文字">
          <el-input v-model="config.footer" placeholder="请输入页脚文字" />
        </el-form-item>
        <el-form-item label="公告内容">
          <el-input v-model="config.announcement" type="textarea" :rows="3" placeholder="请输入公告内容（留空则不显示）" />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="handleSave" :loading="saving">保存设置</el-button>
        </el-form-item>
      </el-form>
    </div>

    <div class="settings-card card">
      <h3>账号安全</h3>
      <el-form label-width="100px">
        <el-form-item label="当前账号">
          <span>{{ userStore.userInfo?.username || '-' }}</span>
        </el-form-item>
        <el-form-item>
          <el-button @click="showPasswordDialog = true">修改密码</el-button>
        </el-form-item>
      </el-form>
    </div>

    <div class="settings-card card">
      <h3>数据备份与恢复</h3>
      <div class="backup-info" v-if="backupInfo">
        <div class="info-grid">
          <div class="info-item">
            <span class="label">分类数量</span>
            <span class="value">{{ backupInfo.categories }}</span>
          </div>
          <div class="info-item">
            <span class="label">脚本数量</span>
            <span class="value">{{ backupInfo.scripts }}</span>
          </div>
          <div class="info-item">
            <span class="label">版本数量</span>
            <span class="value">{{ backupInfo.script_versions }}</span>
          </div>
          <div class="info-item">
            <span class="label">插件数量</span>
            <span class="value">{{ backupInfo.plugins }}</span>
          </div>
          <div class="info-item">
            <span class="label">下载记录</span>
            <span class="value">{{ backupInfo.download_stats }}</span>
          </div>
          <div class="info-item">
            <span class="label">文件大小</span>
            <span class="value">{{ backupInfo.uploadSizeFormatted }}</span>
          </div>
        </div>
      </div>
      <el-form label-width="100px">
        <el-form-item label="导出数据">
          <el-button type="primary" @click="handleExport" :loading="exporting">
            <el-icon v-if="!exporting"><Download /></el-icon>
            {{ exporting ? '导出中...' : '一键导出' }}
          </el-button>
          <span class="form-tip">导出所有数据和上传文件为 ZIP 压缩包，生成完成后自动开始下载</span>
        </el-form-item>
        <el-form-item label="导入数据">
          <el-upload
            ref="importUploadRef"
            action="/api/backup/import"
            :headers="uploadHeaders"
            :before-upload="beforeImport"
            :on-success="onImportSuccess"
            :on-error="onImportError"
            :on-progress="onImportProgress"
            :show-file-list="false"
            :disabled="importing"
            accept=".zip"
          >
            <el-button type="warning" :loading="importing" :disabled="importing">
              <el-icon v-if="!importing"><Upload /></el-icon>
              {{ importing ? '导入中...' : '导入备份' }}
            </el-button>
          </el-upload>
          <span class="form-tip">导入会覆盖现有数据，请谨慎操作</span>
        </el-form-item>
      </el-form>
      <!-- 导入进度条 -->
      <div v-if="importing" class="import-progress">
        <el-progress :percentage="importProgress" :status="importProgress === 100 ? 'success' : ''" :stroke-width="10" />
        <span class="progress-text">{{ importProgressText }}</span>
      </div>

      <div v-if="exporting" class="export-progress">
        <el-progress :percentage="exportProgress" :status="exportProgress === 100 ? 'success' : ''" :stroke-width="10" />
        <span class="progress-text">{{ exportProgressText }}</span>
      </div>
    </div>

    <el-dialog v-model="showPasswordDialog" title="修改密码" width="400px">
      <el-form ref="passwordFormRef" :model="passwordForm" :rules="passwordRules" label-width="80px">
        <el-form-item label="旧密码" prop="oldPassword">
          <el-input v-model="passwordForm.oldPassword" type="password" show-password />
        </el-form-item>
        <el-form-item label="新密码" prop="newPassword">
          <el-input v-model="passwordForm.newPassword" type="password" show-password />
        </el-form-item>
        <el-form-item label="确认密码" prop="confirmPassword">
          <el-input v-model="passwordForm.confirmPassword" type="password" show-password />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showPasswordDialog = false">取消</el-button>
        <el-button type="primary" @click="handleChangePassword">确认</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { getConfig, updateConfig } from '@/api/config'
import { changePassword } from '@/api/auth'
import { useUserStore } from '@/store/user'
import request from '@/api/request'

const router = useRouter()
const userStore = useUserStore()

const config = reactive({
  title: '',
  shortName: '',
  description: '',
  footer: '',
  announcement: ''
})
const saving = ref(false)

const showPasswordDialog = ref(false)
const passwordFormRef = ref(null)
const passwordForm = reactive({
  oldPassword: '',
  newPassword: '',
  confirmPassword: ''
})

// favicon 相关
const faviconUrl = ref('/api/config/favicon?t=' + Date.now())
const resettingFavicon = ref(false)

// 备份相关
const backupInfo = ref(null)
const exporting = ref(false)
const exportProgress = ref(0)
const exportProgressText = ref('')
let exportPollTimer = null
const importing = ref(false)
const importProgress = ref(0)
const importProgressText = ref('')
const importUploadRef = ref(null)

const uploadHeaders = computed(() => ({
  Authorization: `Bearer ${localStorage.getItem('token')}`
}))

const passwordRules = {
  oldPassword: [{ required: true, message: '请输入旧密码', trigger: 'blur' }],
  newPassword: [
    { required: true, message: '请输入新密码', trigger: 'blur' },
    { min: 6, message: '密码长度不能少于6位', trigger: 'blur' }
  ],
  confirmPassword: [
    { required: true, message: '请确认新密码', trigger: 'blur' },
    {
      validator: (rule, value, callback) => {
        if (value !== passwordForm.newPassword) {
          callback(new Error('两次输入的密码不一致'))
        } else {
          callback()
        }
      },
      trigger: 'blur'
    }
  ]
}

const loadConfig = async () => {
  try {
    const res = await getConfig()
    if (res.code === 200) {
      Object.assign(config, res.data)
    }
  } catch (e) { console.error(e) }
}

const loadBackupInfo = async () => {
  try {
    const res = await request.get('/backup/info')
    if (res.code === 200) {
      backupInfo.value = res.data
    }
  } catch (e) { console.error(e) }
}

const handleSave = async () => {
  saving.value = true
  try {
    const res = await updateConfig(config)
    if (res.code === 200) {
      ElMessage.success('保存成功')
      document.title = config.title || '脚本库'
      // 刷新 favicon
      refreshFavicon()
    }
  } catch (e) { console.error(e) }
  finally { saving.value = false }
}

// 刷新 favicon
const refreshFavicon = () => {
  const newUrl = '/api/config/favicon?t=' + Date.now()
  faviconUrl.value = newUrl
  // 更新页面 favicon
  let link = document.querySelector("link[rel*='icon']")
  if (link) {
    link.href = newUrl
  }
}

// favicon 上传前检查
const beforeFaviconUpload = (file) => {
  const isLt1M = file.size / 1024 / 1024 < 1
  if (!isLt1M) {
    ElMessage.error('图标文件大小不能超过 1MB')
    return false
  }
  return true
}

// favicon 上传成功
const onFaviconSuccess = (res) => {
  if (res.code === 200) {
    ElMessage.success('图标上传成功')
    refreshFavicon()
  } else {
    ElMessage.error(res.message || '上传失败')
  }
}

// favicon 上传失败
const onFaviconUploadError = () => {
  ElMessage.error('图标上传失败')
}

// favicon 加载失败
const onFaviconError = () => {
  // 使用默认占位
}

// 恢复默认 favicon
const resetFavicon = async () => {
  resettingFavicon.value = true
  try {
    const res = await request.delete('/config/favicon')
    if (res.code === 200) {
      ElMessage.success(res.message)
      refreshFavicon()
    }
  } catch (e) {
    ElMessage.error('操作失败')
  } finally {
    resettingFavicon.value = false
  }
}

const handleChangePassword = async () => {
  if (!passwordFormRef.value) return
  await passwordFormRef.value.validate(async (valid) => {
    if (!valid) return
    try {
      const res = await changePassword(passwordForm.oldPassword, passwordForm.newPassword)
      if (res.code === 200) {
        ElMessage.success('密码修改成功，请重新登录')
        showPasswordDialog.value = false
        userStore.logout()
        router.push('/admin/login')
      }
    } catch (e) { console.error(e) }
  })
}

// 导出数据
const handleExport = async () => {
  exporting.value = true
  exportProgress.value = 0
  exportProgressText.value = '正在创建导出任务...'
  try {
    const createRes = await request.post('/backup/export/jobs')
    if (createRes.code !== 200 || !createRes.data?.jobId) {
      throw new Error(createRes.message || '创建导出任务失败')
    }

    await waitForExportReady(createRes.data.jobId)
    ElMessage.success('导出成功')
  } catch (e) {
    console.error(e)
    ElMessage.error('导出失败: ' + e.message)
  } finally {
    clearExportPollTimer()
    exporting.value = false
  }
}

const waitForExportReady = (jobId) => {
  return new Promise((resolve, reject) => {
    clearExportPollTimer()

    const poll = async () => {
      try {
        const res = await request.get(`/backup/export/jobs/${jobId}`)
        if (res.code !== 200) {
          reject(new Error(res.message || '获取导出进度失败'))
          return
        }

        exportProgress.value = res.data.progress || 0
        exportProgressText.value = res.data.message || '导出处理中...'

        if (res.data.status === 'completed' && res.data.downloadUrl) {
          exportProgress.value = 100
          exportProgressText.value = '导出完成，正在开始下载...'
          await triggerDownload(res.data.downloadUrl)
          resolve()
          return
        }

        if (res.data.status === 'failed') {
          reject(new Error(res.data.message || '导出失败'))
          return
        }

        exportPollTimer = window.setTimeout(poll, 1000)
      } catch (error) {
        reject(error)
      }
    }

    poll()
  })
}

const triggerDownload = async (downloadUrl) => {
  const token = localStorage.getItem('token')
  const a = document.createElement('a')
  const url = new URL(downloadUrl, window.location.origin)
  if (token) {
    url.searchParams.set('token', token)
  }

  a.href = url.toString()
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
}

const clearExportPollTimer = () => {
  if (exportPollTimer) {
    window.clearTimeout(exportPollTimer)
    exportPollTimer = null
  }
}

// 导入数据
const beforeImport = (file) => {
  return new Promise((resolve, reject) => {
    ElMessageBox.confirm(
      '导入备份将会覆盖现有的所有数据（分类、脚本、插件、配置等），此操作不可恢复！\n\n建议先导出当前数据作为备份。\n\n确定要继续吗？',
      '警告',
      {
        confirmButtonText: '确定导入',
        cancelButtonText: '取消',
        type: 'warning'
      }
    ).then(() => {
      if (!file.name.endsWith('.zip')) {
        ElMessage.error('请上传 ZIP 格式的备份文件')
        reject()
        return
      }
      importing.value = true
      importProgress.value = 0
      importProgressText.value = '准备导入...'
      resolve(true)
    }).catch(() => {
      reject()
    })
  })
}

const onImportProgress = (event) => {
  if (event.percent) {
    importProgress.value = Math.round(event.percent)
    if (event.percent < 100) {
      importProgressText.value = `上传中 ${Math.round(event.percent)}%`
    } else {
      importProgressText.value = '正在恢复数据，请稍候...'
    }
  }
}

const onImportSuccess = (res) => {
  importing.value = false
  importProgress.value = 0
  if (res.code === 200) {
    ElMessage.success(`导入成功！已恢复 ${res.data.categories} 个分类、${res.data.scripts} 个脚本、${res.data.plugins} 个插件`)
    loadBackupInfo()
    loadConfig()
  } else {
    ElMessage.error(res.message || '导入失败')
  }
}

const onImportError = () => {
  importing.value = false
  importProgress.value = 0
  ElMessage.error('导入失败，请检查备份文件是否正确')
}

onMounted(() => {
  loadConfig()
  loadBackupInfo()
})
</script>

<style lang="scss" scoped>
.settings-page {
  max-width: 600px;

  .settings-card {
    margin-bottom: 20px;

    h3 {
      font-size: 16px;
      font-weight: 600;
      margin-bottom: 20px;
      padding-bottom: 10px;
      border-bottom: 1px solid var(--border-color-light);
    }
  }

  .favicon-upload {
    display: flex;
    align-items: center;
    gap: 15px;

    .favicon-preview {
      width: 48px;
      height: 48px;
      border: 1px solid var(--border-color);
      border-radius: 6px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--surface-subtle);
      overflow: hidden;

      img {
        max-width: 100%;
        max-height: 100%;
        object-fit: contain;
      }
    }

    .favicon-actions {
      display: flex;
      gap: 10px;
    }
  }

  .backup-info {
    margin-bottom: 20px;
    padding: 15px;
    background: var(--surface-subtle);
    border-radius: 6px;

    .info-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 15px;

      .info-item {
        text-align: center;

        .label {
          display: block;
          font-size: 12px;
          color: var(--text-color-muted);
          margin-bottom: 5px;
        }

        .value {
          display: block;
          font-size: 18px;
          font-weight: 600;
          color: var(--text-color);
        }
      }
    }
  }

  .form-tip {
    margin-left: 10px;
    font-size: 12px;
    color: var(--text-color-muted);
  }

  .import-progress {
    margin-top: 15px;
    padding: 10px 15px;
    background: var(--surface-subtle);
    border-radius: 6px;

    .progress-text {
      display: block;
      margin-top: 8px;
      font-size: 12px;
      color: var(--text-color-secondary);
      text-align: center;
    }
  }

  .export-progress {
    margin-top: 15px;
    padding: 10px 15px;
    background: var(--surface-subtle);
    border-radius: 6px;

    .progress-text {
      display: block;
      margin-top: 8px;
      font-size: 12px;
      color: var(--text-color-secondary);
      text-align: center;
    }
  }
}
</style>
