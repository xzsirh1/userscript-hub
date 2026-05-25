<template>
  <div class="scripts-manage-page">
    <div class="action-bar card">
      <div class="action-left">
        <el-button type="primary" @click="openCreateDialog">
          <el-icon><Plus /></el-icon>
          新增脚本
        </el-button>
      </div>
      <div class="action-right">
        <el-select v-model="filters.category_id" placeholder="全部分类" clearable @change="loadScripts">
          <el-option v-for="cat in categories" :key="cat.id" :label="cat.name" :value="cat.id" />
        </el-select>
        <el-input
          v-model="filters.keyword"
          placeholder="搜索脚本..."
          clearable
          @keyup.enter="loadScripts"
        >
          <template #prefix><el-icon><Search /></el-icon></template>
        </el-input>
      </div>
    </div>

    <div class="table-card card">
      <el-table :data="scripts" v-loading="loading" stripe>
        <el-table-column prop="name" label="脚本名称" min-width="170" />
        <el-table-column prop="category_name" label="分类" width="110">
          <template #default="{ row }">{{ row.category_name || '未分类' }}</template>
        </el-table-column>
        <el-table-column prop="current_version" label="版本" width="110">
          <template #default="{ row }">v{{ row.current_version || row.latest_version || '-' }}</template>
        </el-table-column>
        <el-table-column prop="is_private" label="可见性" width="90">
          <template #default="{ row }">
            <el-tag v-if="row.is_private" type="warning" size="small">私密</el-tag>
            <el-tag v-else type="success" size="small">公开</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="show_in_list" label="前台展示" width="100">
          <template #default="{ row }">
            <el-tag v-if="row.show_in_list" type="success" size="small">展示</el-tag>
            <el-tag v-else type="info" size="small">隐藏</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="release_mode" label="交付方案" width="130">
          <template #default="{ row }">
            <el-tag size="small" :type="releaseModeType(row.release_mode)">{{ releaseModeText(row.release_mode) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="auth_mode" label="授权" width="110">
          <template #default="{ row }">
            <el-tag size="small" :type="row.auth_mode === 'none' ? 'info' : 'warning'">{{ authModeText(row.auth_mode) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="binding_strategy" label="设备策略" width="120">
          <template #default="{ row }">
            <el-tag size="small" type="info">{{ bindingStrategyText(row.binding_strategy) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="download_count" label="下载" width="80" />
        <el-table-column prop="updated_at" label="更新时间" width="120">
          <template #default="{ row }">{{ formatDate(row.updated_at) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="280" fixed="right">
          <template #default="{ row }">
            <el-button size="small" @click="openVersionDialog(row)">版本管理</el-button>
            <el-button size="small" @click="openEditDialog(row)">编辑</el-button>
            <el-button size="small" type="danger" @click="handleDelete(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>

      <div class="pagination">
        <el-pagination
          v-model:current-page="currentPage"
          :page-size="pageSize"
          :total="total"
          layout="total, prev, pager, next"
          @current-change="loadScripts"
        />
      </div>
    </div>

    <el-dialog v-model="dialogVisible" :title="isEdit ? '编辑脚本' : '新增脚本'" :width="scriptDialogWidth">
      <el-form
        ref="formRef"
        :model="form"
        :rules="rules"
        :label-width="isCompactViewport ? 'auto' : '96px'"
        :label-position="isCompactViewport ? 'top' : 'right'"
      >
        <el-form-item label="名称" prop="name">
          <el-input v-model="form.name" placeholder="请输入脚本名称" />
        </el-form-item>
        <el-form-item label="描述" prop="description">
          <el-input v-model="form.description" type="textarea" :rows="3" placeholder="一句话说明这个脚本是做什么的" />
        </el-form-item>
        <el-form-item label="分类" prop="category_id">
          <el-select v-model="form.category_id" placeholder="请选择分类" clearable style="width: 100%">
            <el-option v-for="cat in categories" :key="cat.id" :label="cat.name" :value="cat.id" />
          </el-select>
        </el-form-item>

        <div class="preset-panel">
          <div class="preset-head">
            <strong>先选一个最接近你的交付方案</strong>
            <p>上面的方案会自动帮你把下面的开关组合到合理状态，先不用纠结每个勾选项。</p>
          </div>
          <div class="preset-grid">
            <button
              v-for="preset in deliveryPresetOptions"
              :key="preset.id"
              type="button"
              class="preset-card"
              :class="{ active: activeDeliveryPreset === preset.id }"
              @click="applyDeliveryPreset(preset.id)"
            >
              <strong>{{ preset.title }}</strong>
              <span>{{ preset.subtitle }}</span>
              <small>{{ preset.description }}</small>
            </button>
          </div>
        </div>

        <el-alert
          type="info"
          :closable="false"
          show-icon
          :title="modeSummary.title"
          :description="modeSummary.description"
          class="mode-alert"
        />

        <div class="checklist-card">
          <div class="checklist-head">保存后会得到</div>
          <ul>
            <li v-for="item in deliveryChecklist" :key="item">{{ item }}</li>
          </ul>
        </div>

        <el-form-item label="私密脚本">
          <el-switch v-model="form.is_private" />
          <span class="form-tip">私密脚本只给知道访问密码的人，或者只给管理员查看。</span>
        </el-form-item>
        <el-form-item v-if="form.is_private" label="前台展示">
          <el-switch v-model="form.show_in_list" />
          <span class="form-tip">关闭后脚本不会出现在前台列表里，只能后台管理和定向分享。</span>
        </el-form-item>
        <el-form-item v-if="form.is_private && form.show_in_list" label="访问密码">
          <el-input v-model="form.access_password" placeholder="前台用户访问或下载时需要输入这个密码" />
        </el-form-item>

        <el-divider>高级开关</el-divider>

        <el-form-item label="交付模式">
          <el-select v-model="form.release_mode" style="width: 100%">
            <el-option label="直接安装（原始代码）" value="direct_raw" />
            <el-option label="直接安装（保护版）" value="direct_obfuscated" />
            <el-option label="先验证再运行" value="verified_loader" />
            <el-option label="远程下发代码" value="remote_core" />
          </el-select>
        </el-form-item>
        <el-form-item label="下载保护">
          <el-switch v-model="form.enable_obfuscation" :disabled="!canToggleObfuscation" />
          <span class="form-tip">“保护版”和“先验证再运行”会自动带上保护壳，避免直接暴露源码。</span>
        </el-form-item>
        <el-form-item label="授权模式">
          <el-select v-model="form.auth_mode" style="width: 100%" :disabled="!canChooseAuthMode">
            <el-option label="任何人都能装" value="none" />
            <el-option label="先申请再使用" value="approval" />
          </el-select>
          <span class="form-tip">只有“先验证再运行”和“远程下发代码”才会真正检查授权。</span>
        </el-form-item>
        <el-form-item label="运行时检查">
          <el-switch v-model="form.runtime_enabled" :disabled="!canToggleRuntime" />
          <span class="form-tip">开启后，脚本启动前会先读取运行时配置、授权和设备状态。</span>
        </el-form-item>
        <el-form-item label="设备绑定">
          <el-switch v-model="form.allow_device_binding" :disabled="!canToggleDeviceBinding" />
          <span class="form-tip">适合付费脚本或审批脚本，用来限制一份授权能绑定多少台设备。</span>
        </el-form-item>
        <el-form-item label="绑定策略">
          <el-select v-model="form.binding_strategy" style="width: 100%" :disabled="!canChooseBindingStrategy">
            <el-option label="按浏览器环境" value="browser" />
            <el-option label="按网站域名" value="host" />
          </el-select>
          <span class="form-tip">全站脚本更推荐“按浏览器环境”，单站高风险脚本再考虑“按网站域名”。</span>
        </el-form-item>
        <el-form-item label="设备数量">
          <el-input-number v-model="form.default_device_limit" :min="1" :max="10" :disabled="!form.allow_device_binding" />
        </el-form-item>
        <el-form-item label="记录使用">
          <el-switch v-model="form.usage_tracking_enabled" :disabled="!canToggleUsageTracking" />
          <span class="form-tip">会记录启动、在线状态、运行时长和异常反馈。</span>
        </el-form-item>

        <el-alert
          v-if="form.release_mode === 'remote_core'"
          type="warning"
          :closable="false"
          show-icon
          title="远程下发模式怎么理解"
          description="浏览器里安装的是入口壳，真正执行逻辑在“授权与运行时”里维护。你可以先上传一个能跑的完整脚本版本，再去那一页一键生成远程模块草稿。"
          class="mode-alert"
        />
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="handleSubmit">确定</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="versionDialogVisible" title="版本管理" :width="versionDialogWidth">
      <div class="version-upload">
        <el-upload
          ref="uploadRef"
          :action="`/api/scripts/${currentScript?.id}/versions`"
          :headers="uploadHeaders"
          :data="uploadData"
          :before-upload="beforeUpload"
          :on-success="onUploadSuccess"
          :on-error="onUploadError"
          :on-progress="onUploadProgress"
          :show-file-list="false"
          :disabled="uploading"
          accept=".js,.user.js"
        >
          <el-button type="primary" :loading="uploading" :disabled="uploading">
            <el-icon v-if="!uploading"><Upload /></el-icon>
            {{ uploading ? '上传中...' : '上传新版本' }}
          </el-button>
        </el-upload>
        <div class="upload-form">
          <el-input v-model="uploadData.version" placeholder="版本号，例如 1.0.0" :disabled="uploading" />
          <el-input v-model="uploadData.changelog" placeholder="更新日志" :disabled="uploading" />
        </div>
      </div>

      <div v-if="uploading" class="upload-progress">
        <el-progress :percentage="uploadProgress" :status="uploadProgress === 100 ? 'success' : ''" :stroke-width="10" />
        <span class="progress-text">{{ uploadProgressText }}</span>
      </div>

      <el-table :data="versions" stripe style="margin-top: 20px">
        <el-table-column prop="version" label="版本号" width="110">
          <template #default="{ row }">v{{ row.version }}</template>
        </el-table-column>
        <el-table-column prop="changelog" label="更新日志" min-width="220">
          <template #default="{ row }">{{ row.changelog || '-' }}</template>
        </el-table-column>
        <el-table-column prop="file_size" label="大小" width="100">
          <template #default="{ row }">{{ formatSize(row.file_size) }}</template>
        </el-table-column>
        <el-table-column prop="created_at" label="上传时间" width="120">
          <template #default="{ row }">{{ formatDate(row.created_at) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="150">
          <template #default="{ row }">
            <el-button size="small" type="primary" @click="handleDownloadVersion(row)">下载</el-button>
            <el-button size="small" type="danger" @click="handleDeleteVersion(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-dialog>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { createScript, deleteScript, deleteVersion, getScripts, getVersions, updateScript } from '@/api/scripts'
import { getCategories } from '@/api/categories'

const loading = ref(false)
const scripts = ref([])
const categories = ref([])
const total = ref(0)
const currentPage = ref(1)
const pageSize = ref(15)
const isCompactViewport = ref(false)

const filters = reactive({ category_id: null, keyword: '' })

const dialogVisible = ref(false)
const isEdit = ref(false)
const formRef = ref(null)
const form = reactive({
  id: null,
  name: '',
  description: '',
  category_id: null,
  is_private: false,
  show_in_list: true,
  access_password: '',
  enable_obfuscation: false,
  release_mode: 'direct_obfuscated',
  auth_mode: 'none',
  runtime_enabled: false,
  allow_device_binding: false,
  binding_strategy: 'browser',
  default_device_limit: 1,
  usage_tracking_enabled: false
})

const rules = {
  name: [{ required: true, message: '请输入脚本名称', trigger: 'blur' }]
}

const versionDialogVisible = ref(false)
const currentScript = ref(null)
const versions = ref([])
const uploadRef = ref(null)
const uploadData = reactive({ version: '', changelog: '' })
const uploading = ref(false)
const uploadProgress = ref(0)
const uploadProgressText = ref('')

const uploadHeaders = computed(() => ({
  Authorization: `Bearer ${localStorage.getItem('token')}`
}))

const scriptDialogWidth = computed(() => (isCompactViewport.value ? '94%' : '760px'))
const versionDialogWidth = computed(() => (isCompactViewport.value ? '96%' : '700px'))

const deliveryPresetOptions = [
  {
    id: 'open_raw',
    title: '公开直装',
    subtitle: '不做保护，任何人都能直接装',
    description: '适合公开脚本、临时工具或你本来就准备开源的内容。'
  },
  {
    id: 'protected_download',
    title: '公开保护版',
    subtitle: '用户仍然可以直接安装，但拿到的是保护版',
    description: '适合只想降低源码直接暴露风险，不做审批和设备限制。'
  },
  {
    id: 'approval_verified',
    title: '审批后运行',
    subtitle: '先审批，再让脚本在用户浏览器本地跑',
    description: '适合大多数付费或内部分发脚本，逻辑仍跟着上传版本走。'
  },
  {
    id: 'remote_live',
    title: '远程热更新',
    subtitle: '审批后安装入口壳，真正逻辑在后台远程下发',
    description: '适合需要灰度发布、快速回滚、远程改逻辑的重点脚本。'
  }
]

const canToggleObfuscation = computed(() => form.release_mode === 'direct_obfuscated')
const shouldForceProtectedDownload = computed(() => form.release_mode === 'direct_obfuscated' || form.release_mode === 'verified_loader')
const canChooseAuthMode = computed(() => form.release_mode === 'verified_loader' || form.release_mode === 'remote_core')
const canToggleRuntime = computed(() => form.release_mode === 'verified_loader' || form.release_mode === 'remote_core')
const canToggleDeviceBinding = computed(() => canToggleRuntime.value && form.auth_mode === 'approval')
const canChooseBindingStrategy = computed(() => canToggleDeviceBinding.value)
const canToggleUsageTracking = computed(() => canToggleRuntime.value)

const activeDeliveryPreset = computed(() => {
  if (form.release_mode === 'direct_raw') return 'open_raw'
  if (form.release_mode === 'direct_obfuscated') return 'protected_download'
  if (form.release_mode === 'verified_loader' && form.auth_mode === 'approval') return 'approval_verified'
  if (form.release_mode === 'remote_core') return 'remote_live'
  return 'custom'
})

const deliveryChecklist = computed(() => {
  const items = []
  if (form.release_mode === 'remote_core') {
    items.push('下发给用户的是远程入口壳脚本')
  } else {
    items.push(form.enable_obfuscation ? '下发给用户的是保护版安装包' : '下发给用户的是原始脚本代码')
  }
  items.push(form.auth_mode === 'approval' ? '用户需要先审批授权才能稳定使用' : '用户无需审批，安装后即可使用')
  items.push(form.release_mode === 'remote_core' ? '真正执行逻辑来自远程模块，可后台切版本' : '真正执行逻辑来自你上传到当前版本管理里的脚本文件')
  items.push(form.allow_device_binding ? `默认限制 ${form.default_device_limit} 台设备绑定` : '默认不限制设备绑定')
  items.push(form.usage_tracking_enabled ? '会记录启动、在线和异常反馈' : '不记录在线与使用情况')
  return items
})

const modeSummary = computed(() => {
  if (form.release_mode === 'direct_raw') {
    return {
      title: '这是最简单的公开直装模式',
      description: '用户安装后拿到的是原始脚本代码，不做授权检查，也不会记录运行状态。'
    }
  }

  if (form.release_mode === 'direct_obfuscated') {
    return {
      title: '这是公开保护版模式',
      description: '用户仍然可以直接安装，但拿到的是处理过的保护版脚本。'
    }
  }

  if (form.release_mode === 'verified_loader') {
    return {
      title: form.auth_mode === 'approval' ? '这是审批后运行模式' : '这是运行时托管模式',
      description: form.auth_mode === 'approval'
        ? '下载时自动套上验证壳，脚本启动前会检查授权、配置和设备状态。'
        : '下载时自动套上验证壳，脚本启动前会先拉取运行时配置，但不会拦截未授权用户。'
    }
  }

  return {
    title: '这是远程热更新模式',
    description: '浏览器安装的是入口壳，真正执行逻辑在后台远程下发，适合重点脚本和快速回滚。'
  }
})

const normalizeFormByMode = () => {
  if (form.release_mode === 'direct_raw') {
    form.enable_obfuscation = false
    form.auth_mode = 'none'
    form.runtime_enabled = false
    form.allow_device_binding = false
    form.default_device_limit = 1
    form.usage_tracking_enabled = false
    return
  }

  if (form.release_mode === 'direct_obfuscated') {
    form.enable_obfuscation = true
    form.auth_mode = 'none'
    form.runtime_enabled = false
    form.allow_device_binding = false
    form.default_device_limit = 1
    form.usage_tracking_enabled = false
    return
  }

  if (form.release_mode === 'verified_loader') {
    form.enable_obfuscation = true
    form.runtime_enabled = true
  }

  if (form.release_mode === 'remote_core') {
    form.enable_obfuscation = false
    form.runtime_enabled = true
    form.auth_mode = 'approval'
    form.usage_tracking_enabled = true
  }

  if (!canChooseAuthMode.value) {
    form.auth_mode = 'none'
  }

  if (!canToggleRuntime.value) {
    form.runtime_enabled = false
  }

  if (!canToggleUsageTracking.value) {
    form.usage_tracking_enabled = false
  }

  if (!canToggleDeviceBinding.value) {
    form.allow_device_binding = false
    form.binding_strategy = 'browser'
    form.default_device_limit = 1
  }

  if (!form.allow_device_binding) {
    form.binding_strategy = 'browser'
  }

  if (!canToggleObfuscation.value) {
    form.enable_obfuscation = shouldForceProtectedDownload.value
  }
}

const syncViewport = () => {
  isCompactViewport.value = window.innerWidth <= 768
}

const applyDeliveryPreset = (presetId) => {
  if (presetId === 'open_raw') {
    form.release_mode = 'direct_raw'
    form.auth_mode = 'none'
    form.runtime_enabled = false
    form.allow_device_binding = false
    form.usage_tracking_enabled = false
  } else if (presetId === 'protected_download') {
    form.release_mode = 'direct_obfuscated'
    form.auth_mode = 'none'
    form.runtime_enabled = false
    form.allow_device_binding = false
    form.usage_tracking_enabled = false
  } else if (presetId === 'approval_verified') {
    form.release_mode = 'verified_loader'
    form.auth_mode = 'approval'
    form.runtime_enabled = true
    form.allow_device_binding = true
    form.usage_tracking_enabled = true
  } else if (presetId === 'remote_live') {
    form.release_mode = 'remote_core'
    form.auth_mode = 'approval'
    form.runtime_enabled = true
    form.allow_device_binding = true
    form.usage_tracking_enabled = true
  }

  normalizeFormByMode()
}

watch(() => [form.release_mode, form.auth_mode], normalizeFormByMode, { immediate: true })

const loadCategories = async () => {
  try {
    const res = await getCategories()
    if (res.code === 200) categories.value = res.data
  } catch (error) {
    console.error(error)
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
    }
  } catch (error) {
    console.error(error)
  } finally {
    loading.value = false
  }
}

const openCreateDialog = () => {
  isEdit.value = false
  Object.assign(form, {
    id: null,
    name: '',
    description: '',
    category_id: null,
    is_private: false,
    show_in_list: true,
    access_password: '',
    enable_obfuscation: false,
    release_mode: 'direct_obfuscated',
    auth_mode: 'none',
    runtime_enabled: false,
    allow_device_binding: false,
    binding_strategy: 'browser',
    default_device_limit: 1,
    usage_tracking_enabled: false
  })
  applyDeliveryPreset('protected_download')
  dialogVisible.value = true
}

const openEditDialog = (row) => {
  isEdit.value = true
  Object.assign(form, {
    ...row,
    is_private: !!row.is_private,
    show_in_list: row.show_in_list !== 0,
    enable_obfuscation: !!row.enable_obfuscation,
    release_mode: row.release_mode || 'direct_obfuscated',
    auth_mode: row.auth_mode || 'none',
    runtime_enabled: !!row.runtime_enabled,
    allow_device_binding: !!row.allow_device_binding,
    binding_strategy: row.binding_strategy || 'browser',
    default_device_limit: row.default_device_limit || 1,
    usage_tracking_enabled: !!row.usage_tracking_enabled
  })
  normalizeFormByMode()
  dialogVisible.value = true
}

const handleSubmit = async () => {
  if (!formRef.value) return
  await formRef.value.validate(async (valid) => {
    if (!valid) return
    try {
      normalizeFormByMode()
      const res = isEdit.value
        ? await updateScript(form.id, form)
        : await createScript(form)
      if (res.code === 200) {
        ElMessage.success(isEdit.value ? '更新成功' : '创建成功')
        dialogVisible.value = false
        loadScripts()
      }
    } catch (error) {
      console.error(error)
    }
  })
}

const handleDelete = (row) => {
  ElMessageBox.confirm(`确定要删除脚本「${row.name}」吗？`, '提示', { type: 'warning' })
    .then(async () => {
      try {
        const res = await deleteScript(row.id)
        if (res.code === 200) {
          ElMessage.success('删除成功')
          loadScripts()
        }
      } catch (error) {
        console.error(error)
      }
    })
}

const openVersionDialog = async (row) => {
  currentScript.value = row
  uploadData.version = ''
  uploadData.changelog = ''
  versionDialogVisible.value = true
  try {
    const res = await getVersions(row.id)
    if (res.code === 200) versions.value = res.data
  } catch (error) {
    console.error(error)
  }
}

const beforeUpload = (file) => {
  const ext = file.name.split('.').pop().toLowerCase()
  if (!['js'].includes(ext) && !file.name.endsWith('.user.js')) {
    ElMessage.error('鍙兘涓婁紶 .js 鎴?.user.js 鏂囦欢')
    return false
  }
  uploading.value = true
  uploadProgress.value = 0
  uploadProgressText.value = '鍑嗗涓婁紶...'
  return true
}

const onUploadProgress = (event) => {
  if (event.percent) {
    uploadProgress.value = Math.round(event.percent)
    if (event.percent < 100) {
      uploadProgressText.value = `上传中... ${Math.round(event.percent)}%`
    } else {
      uploadProgressText.value = '正在处理，请稍候...'
    }
  }
}

const onUploadSuccess = (res) => {
  uploading.value = false
  uploadProgress.value = 0
  if (res.code === 200) {
    ElMessage.success('涓婁紶鎴愬姛')
    uploadData.version = ''
    uploadData.changelog = ''
    openVersionDialog(currentScript.value)
    loadScripts()
  } else {
    ElMessage.error(res.message || '涓婁紶澶辫触')
  }
}

const onUploadError = () => {
  uploading.value = false
  uploadProgress.value = 0
  ElMessage.error('涓婁紶澶辫触锛岃妫€鏌ョ綉缁滃悗閲嶈瘯')
}

const handleDeleteVersion = (row) => {
  ElMessageBox.confirm('确定要删除这个版本吗？', '提示', { type: 'warning' })
    .then(async () => {
      try {
        const res = await deleteVersion(currentScript.value.id, row.id)
        if (res.code === 200) {
          ElMessage.success('删除成功')
          openVersionDialog(currentScript.value)
          loadScripts()
        }
      } catch (error) {
        console.error(error)
      }
    })
    .catch(() => {})
}

const handleDownloadVersion = (row) => {
  const token = localStorage.getItem('token')
  const url = `/api/download/script/${currentScript.value.id}?version=${row.version}&token=${token}`
  window.open(url, '_blank')
}

const formatDate = (dateStr) => {
  if (!dateStr) return '-'
  return new Date(dateStr).toLocaleDateString('zh-CN')
}

const formatSize = (bytes) => {
  if (!bytes) return '-'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

const releaseModeText = (value) => ({
  direct_raw: '公开直装',
  direct_obfuscated: '公开保护版',
  verified_loader: '审批后运行',
  remote_core: '远程热更新'
}[value] || value || '-')

const releaseModeType = (value) => ({
  direct_raw: 'success',
  direct_obfuscated: 'primary',
  verified_loader: 'warning',
  remote_core: 'danger'
}[value] || 'info')

const authModeText = (value) => ({
  none: '无需审批',
  approval: '先申请再用'
}[value] || value || '-')

const bindingStrategyText = (value) => ({
  browser: '按浏览器',
  host: '按网站'
}[value] || '按浏览器')

onMounted(() => {
  syncViewport()
  window.addEventListener('resize', syncViewport)
  loadCategories()
  loadScripts()
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', syncViewport)
})
</script>

<style lang="scss" scoped>
.scripts-manage-page {
  .action-bar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    gap: 15px;
    margin-bottom: 20px;

    .action-right {
      display: flex;
      gap: 10px;
      flex-wrap: wrap;

      :deep(.el-input),
      :deep(.el-select) {
        width: 220px;
      }
    }
  }

  .table-card {
    .pagination {
      margin-top: 20px;
      display: flex;
      justify-content: flex-end;
    }
  }

  .preset-panel {
    margin-bottom: 18px;
    padding: 16px;
    border-radius: 14px;
    background: linear-gradient(135deg, rgba(59, 130, 246, 0.08), rgba(16, 185, 129, 0.06));
    border: 1px solid rgba(59, 130, 246, 0.12);
  }

  .preset-head {
    margin-bottom: 14px;

    strong {
      display: block;
      color: var(--text-color-strong);
      font-size: 15px;
    }

    p {
      margin: 6px 0 0;
      color: var(--text-color-soft);
      line-height: 1.6;
      font-size: 13px;
    }
  }

  .preset-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
  }

  .preset-card {
    border: 1px solid var(--surface-border-strong);
    background: var(--surface-elevated);
    border-radius: 12px;
    padding: 14px;
    text-align: left;
    cursor: pointer;
    transition: border-color 0.2s ease, box-shadow 0.2s ease, transform 0.2s ease;

    strong,
    span,
    small {
      display: block;
    }

    strong {
      color: var(--text-color-heading);
      font-size: 15px;
      margin-bottom: 6px;
    }

    span {
      color: #2563eb;
      font-size: 13px;
      margin-bottom: 8px;
    }

    small {
      color: var(--text-color-soft);
      line-height: 1.6;
    }

    &:hover,
    &.active {
      border-color: #2563eb;
      box-shadow: 0 10px 24px rgba(37, 99, 235, 0.12);
      transform: translateY(-1px);
    }
  }

  .mode-alert {
    margin-bottom: 18px;
  }

  .checklist-card {
    margin-bottom: 18px;
    padding: 14px 16px;
    border-radius: 12px;
    background: var(--surface-muted);
    border: 1px solid var(--surface-border-muted);

    .checklist-head {
      color: var(--text-color-heading);
      font-weight: 600;
      margin-bottom: 8px;
    }

    ul {
      margin: 0;
      padding-left: 18px;
      color: var(--text-color-secondary);
      line-height: 1.7;
    }
  }

  .version-upload {
    display: flex;
    align-items: center;
    gap: 15px;
    flex-wrap: wrap;

    .upload-form {
      display: flex;
      gap: 10px;
      flex: 1;
      flex-wrap: wrap;

      :deep(.el-input) {
        min-width: 180px;
        flex: 1;
      }
    }
  }

  .upload-progress {
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

  .form-tip {
    margin-left: 10px;
    font-size: 12px;
    color: var(--text-color-muted);
    line-height: 1.6;
  }
}

@media (max-width: 768px) {
  .scripts-manage-page {
    .action-bar {
      .action-left,
      .action-right {
        width: 100%;
      }

      .action-right {
        :deep(.el-input),
        :deep(.el-select) {
          width: 100%;
        }
      }
    }

    .preset-grid {
      grid-template-columns: 1fr;
    }

    .table-card {
      overflow-x: auto;
    }

    .pagination {
      justify-content: center !important;
    }

    .form-tip {
      display: block;
      margin: 8px 0 0;
    }
  }
}
</style>
