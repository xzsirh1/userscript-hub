<template>
  <div class="plugins-manage-page">
    <div class="action-bar card">
      <el-upload
        ref="uploadRef"
        action="/api/plugins"
        :headers="uploadHeaders"
        :data="uploadForm"
        :before-upload="beforeUpload"
        :on-success="onUploadSuccess"
        :on-error="onUploadError"
        :on-progress="onUploadProgress"
        :show-file-list="false"
        :disabled="uploading"
        accept=".crx,.xpi,.zip"
      >
        <el-button type="primary" :loading="uploading" :disabled="uploading">
          <el-icon v-if="!uploading"><Upload /></el-icon>
          {{ uploading ? '上传中...' : '上传插件' }}
        </el-button>
      </el-upload>
      <div class="upload-form">
        <el-input v-model="uploadForm.name" placeholder="插件名称" style="width: 150px" :disabled="uploading" />
        <el-input v-model="uploadForm.version" placeholder="版本号" style="width: 100px" :disabled="uploading" />
        <el-select v-model="uploadForm.browser_type" placeholder="浏览器" style="width: 120px" :disabled="uploading">
          <el-option label="Chrome" value="chrome" />
          <el-option label="Firefox" value="firefox" />
          <el-option label="Edge" value="edge" />
        </el-select>
      </div>
    </div>

    <!-- 上传进度条 -->
    <div v-if="uploading" class="upload-progress card">
      <el-progress :percentage="uploadProgress" :status="uploadProgress === 100 ? 'success' : ''" :stroke-width="10" />
      <span class="progress-text">{{ uploadProgressText }}</span>
    </div>

    <div class="table-card card">
      <el-table :data="plugins" v-loading="loading" stripe>
        <el-table-column prop="name" label="插件名称" min-width="150" />
        <el-table-column prop="version" label="版本" width="100">
          <template #default="{ row }">v{{ row.version }}</template>
        </el-table-column>
        <el-table-column prop="browser_type" label="浏览器" width="100">
          <template #default="{ row }">{{ browserMap[row.browser_type] || row.browser_type }}</template>
        </el-table-column>
        <el-table-column prop="is_recommended" label="推荐" width="80">
          <template #default="{ row }">
            <el-tag v-if="row.is_recommended" type="success" size="small">推荐</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="download_count" label="下载" width="80" />
        <el-table-column prop="file_size" label="大小" width="100">
          <template #default="{ row }">{{ formatSize(row.file_size) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="220">
          <template #default="{ row }">
            <el-button size="small" @click="handleSetRecommend(row)" :disabled="row.is_recommended">设为推荐</el-button>
            <el-button size="small" @click="openEditDialog(row)">编辑</el-button>
            <el-button size="small" type="danger" @click="handleDelete(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <el-dialog v-model="dialogVisible" title="编辑插件" width="450px">
      <el-form ref="formRef" :model="form" :rules="rules" label-width="80px">
        <el-form-item label="名称" prop="name">
          <el-input v-model="form.name" />
        </el-form-item>
        <el-form-item label="描述">
          <el-input v-model="form.description" type="textarea" :rows="2" />
        </el-form-item>
        <el-form-item label="版本">
          <el-input v-model="form.version" />
        </el-form-item>
        <el-form-item label="浏览器">
          <el-select v-model="form.browser_type" style="width: 100%">
            <el-option label="Chrome" value="chrome" />
            <el-option label="Firefox" value="firefox" />
            <el-option label="Edge" value="edge" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="handleSubmit">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { getPlugins, updatePlugin, deletePlugin, setRecommended } from '@/api/plugins'

const browserMap = { chrome: 'Chrome', firefox: 'Firefox', edge: 'Edge' }

const loading = ref(false)
const plugins = ref([])

const uploadForm = reactive({ name: '', version: '', browser_type: 'chrome' })
const uploadHeaders = computed(() => ({
  Authorization: `Bearer ${localStorage.getItem('token')}`
}))
const uploading = ref(false)
const uploadProgress = ref(0)
const uploadProgressText = ref('')

const dialogVisible = ref(false)
const formRef = ref(null)
const form = reactive({ id: null, name: '', description: '', version: '', browser_type: 'chrome' })
const rules = { name: [{ required: true, message: '请输入插件名称', trigger: 'blur' }] }

const loadPlugins = async () => {
  loading.value = true
  try {
    const res = await getPlugins()
    if (res.code === 200) plugins.value = res.data
  } catch (e) { console.error(e) }
  finally { loading.value = false }
}

const beforeUpload = (file) => {
  if (!uploadForm.name) {
    ElMessage.warning('请先填写插件名称')
    return false
  }
  const ext = file.name.split('.').pop().toLowerCase()
  if (!['crx', 'xpi', 'zip'].includes(ext)) {
    ElMessage.error('只能上传 .crx, .xpi, .zip 文件')
    return false
  }
  uploading.value = true
  uploadProgress.value = 0
  uploadProgressText.value = '准备上传...'
  return true
}

const onUploadProgress = (event) => {
  if (event.percent) {
    uploadProgress.value = Math.round(event.percent)
    if (event.percent < 100) {
      uploadProgressText.value = `上传中 ${Math.round(event.percent)}%`
    } else {
      uploadProgressText.value = '处理中，请稍候...'
    }
  }
}

const onUploadSuccess = (res) => {
  uploading.value = false
  uploadProgress.value = 0
  if (res.code === 200) {
    ElMessage.success('上传成功')
    uploadForm.name = ''
    uploadForm.version = ''
    loadPlugins()
  } else {
    ElMessage.error(res.message || '上传失败')
  }
}

const onUploadError = () => {
  uploading.value = false
  uploadProgress.value = 0
  ElMessage.error('上传失败，请检查网络后重试')
}

const openEditDialog = (row) => {
  Object.assign(form, row)
  dialogVisible.value = true
}

const handleSubmit = async () => {
  if (!formRef.value) return
  await formRef.value.validate(async (valid) => {
    if (!valid) return
    try {
      const res = await updatePlugin(form.id, form)
      if (res.code === 200) {
        ElMessage.success('更新成功')
        dialogVisible.value = false
        loadPlugins()
      }
    } catch (e) { console.error(e) }
  })
}

const handleSetRecommend = async (row) => {
  try {
    const res = await setRecommended(row.id)
    if (res.code === 200) {
      ElMessage.success('设置成功')
      loadPlugins()
    }
  } catch (e) { console.error(e) }
}

const handleDelete = (row) => {
  ElMessageBox.confirm(`确定要删除插件「${row.name}」吗？`, '提示', { type: 'warning' })
    .then(async () => {
      try {
        const res = await deletePlugin(row.id)
        if (res.code === 200) {
          ElMessage.success('删除成功')
          loadPlugins()
        }
      } catch (e) { console.error(e) }
    }).catch(() => {})
}

const formatSize = (bytes) => {
  if (!bytes) return '-'
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / 1024 / 1024).toFixed(1) + ' MB'
}

onMounted(loadPlugins)
</script>

<style lang="scss" scoped>
.plugins-manage-page {
  .action-bar {
    display: flex;
    align-items: center;
    gap: 15px;
    flex-wrap: wrap;
    margin-bottom: 20px;

    .upload-form {
      display: flex;
      gap: 10px;
    }
  }

  .upload-progress {
    margin-bottom: 20px;
    padding: 15px;

    .progress-text {
      display: block;
      margin-top: 8px;
      font-size: 12px;
      color: #606266;
      text-align: center;
    }
  }
}
</style>
