<template>
  <div class="programs-manage-page">
    <!-- 操作栏 -->
    <div class="action-bar card">
      <div class="action-left">
        <el-button type="primary" @click="openUploadDialog">
          <el-icon><Plus /></el-icon>
          上传程序
        </el-button>
      </div>
    </div>

    <!-- 程序列表 -->
    <div class="table-card card">
      <el-table :data="programs" v-loading="loading" stripe>
        <el-table-column prop="name" label="程序名称" min-width="150" />
        <el-table-column prop="version" label="版本" width="100">
          <template #default="{ row }">v{{ row.version || '1.0.0' }}</template>
        </el-table-column>
        <el-table-column prop="description" label="描述" min-width="200" show-overflow-tooltip />
        <el-table-column prop="is_recommended" label="推荐" width="80">
          <template #default="{ row }">
            <el-tag v-if="row.is_recommended" type="success" size="small">推荐</el-tag>
            <el-tag v-else type="info" size="small">普通</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="download_count" label="下载" width="80" />
        <el-table-column prop="created_at" label="上传时间" width="170" />
        <el-table-column label="操作" width="280" fixed="right">
          <template #default="{ row }">
            <el-button size="small" @click="downloadProgram(row)">下载</el-button>
            <el-button size="small" @click="openEditDialog(row)">编辑</el-button>
            <el-button size="small" type="warning" @click="handleSetRecommended(row)" v-if="!row.is_recommended">推荐</el-button>
            <el-button size="small" type="danger" @click="handleDelete(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <!-- 上传弹窗 -->
    <el-dialog v-model="uploadDialogVisible" title="上传程序" width="500px">
      <el-form ref="uploadFormRef" :model="uploadForm" :rules="uploadRules" label-width="80px">
        <el-form-item label="程序文件" prop="file">
          <el-upload
            ref="uploadRef"
            :auto-upload="false"
            :limit="1"
            :on-change="handleFileChange"
            :on-remove="handleFileRemove"
            accept=".exe"
          >
            <el-button type="primary">选择文件</el-button>
            <template #tip>
              <div class="el-upload__tip">只支持 .exe 文件，最大 50MB</div>
            </template>
          </el-upload>
        </el-form-item>
        <el-form-item label="名称" prop="name">
          <el-input v-model="uploadForm.name" placeholder="请输入程序名称" />
        </el-form-item>
        <el-form-item label="描述" prop="description">
          <el-input v-model="uploadForm.description" type="textarea" :rows="3" placeholder="请输入程序描述" />
        </el-form-item>
        <el-form-item label="版本" prop="version">
          <el-input v-model="uploadForm.version" placeholder="如 1.0.0" />
        </el-form-item>
        <el-form-item label="推荐">
          <el-switch v-model="uploadForm.is_recommended" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="uploadDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="handleUpload" :loading="uploading">上传</el-button>
      </template>
    </el-dialog>

    <!-- 编辑弹窗 -->
    <el-dialog v-model="editDialogVisible" title="编辑程序" width="500px">
      <el-form ref="editFormRef" :model="editForm" :rules="editRules" label-width="80px">
        <el-form-item label="名称" prop="name">
          <el-input v-model="editForm.name" placeholder="请输入程序名称" />
        </el-form-item>
        <el-form-item label="描述" prop="description">
          <el-input v-model="editForm.description" type="textarea" :rows="3" placeholder="请输入程序描述" />
        </el-form-item>
        <el-form-item label="版本" prop="version">
          <el-input v-model="editForm.version" placeholder="如 1.0.0" />
        </el-form-item>
        <el-form-item label="推荐">
          <el-switch v-model="editForm.is_recommended" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="editDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="handleEdit">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { getPrograms, uploadProgram, updateProgram, deleteProgram, setRecommended } from '@/api/programs'

const loading = ref(false)
const programs = ref([])

const uploadDialogVisible = ref(false)
const uploadFormRef = ref(null)
const uploadRef = ref(null)
const uploadForm = ref({
  file: null,
  name: '',
  description: '',
  version: '1.0.0',
  is_recommended: false
})
const uploadRules = {
  file: [{ required: true, message: '请选择文件', trigger: 'change' }],
  name: [{ required: true, message: '请输入程序名称', trigger: 'blur' }]
}
const uploading = ref(false)

const editDialogVisible = ref(false)
const editFormRef = ref(null)
const editForm = ref({
  id: null,
  name: '',
  description: '',
  version: '',
  is_recommended: false
})
const editRules = {
  name: [{ required: true, message: '请输入程序名称', trigger: 'blur' }]
}

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

const openUploadDialog = () => {
  uploadForm.value = {
    file: null,
    name: '',
    description: '',
    version: '1.0.0',
    is_recommended: false
  }
  uploadDialogVisible.value = true
}

const handleFileChange = (file) => {
  uploadForm.value.file = file.raw
  // 自动填充名称（去掉扩展名）
  if (!uploadForm.value.name) {
    uploadForm.value.name = file.name.replace(/\.[^/.]+$/, '')
  }
}

const handleFileRemove = () => {
  uploadForm.value.file = null
}

const handleUpload = async () => {
  if (!uploadFormRef.value) return
  await uploadFormRef.value.validate(async (valid) => {
    if (!valid) return

    if (!uploadForm.value.file) {
      ElMessage.error('请选择文件')
      return
    }

    uploading.value = true
    try {
      const formData = new FormData()
      formData.append('file', uploadForm.value.file)
      formData.append('name', uploadForm.value.name)
      formData.append('description', uploadForm.value.description)
      formData.append('version', uploadForm.value.version)
      formData.append('is_recommended', uploadForm.value.is_recommended ? '1' : '0')

      const res = await uploadProgram(formData)
      if (res.code === 200) {
        ElMessage.success('上传成功')
        uploadDialogVisible.value = false
        loadPrograms()
      }
    } catch (e) {
      console.error('上传失败', e)
    } finally {
      uploading.value = false
    }
  })
}

const openEditDialog = (row) => {
  editForm.value = {
    id: row.id,
    name: row.name,
    description: row.description || '',
    version: row.version || '1.0.0',
    is_recommended: !!row.is_recommended
  }
  editDialogVisible.value = true
}

const handleEdit = async () => {
  if (!editFormRef.value) return
  await editFormRef.value.validate(async (valid) => {
    if (!valid) return

    try {
      const res = await updateProgram(editForm.value.id, {
        name: editForm.value.name,
        description: editForm.value.description,
        version: editForm.value.version,
        is_recommended: editForm.value.is_recommended
      })
      if (res.code === 200) {
        ElMessage.success('更新成功')
        editDialogVisible.value = false
        loadPrograms()
      }
    } catch (e) {
      console.error('更新失败', e)
    }
  })
}

const handleDelete = async (row) => {
  try {
    await ElMessageBox.confirm(`确定删除程序"${row.name}"吗？`, '提示', {
      type: 'warning'
    })

    const res = await deleteProgram(row.id)
    if (res.code === 200) {
      ElMessage.success('删除成功')
      loadPrograms()
    }
  } catch (e) {
    if (e !== 'cancel') {
      console.error('删除失败', e)
    }
  }
}

const handleSetRecommended = async (row) => {
  try {
    const res = await setRecommended(row.id)
    if (res.code === 200) {
      ElMessage.success('设置成功')
      loadPrograms()
    }
  } catch (e) {
    console.error('设置推荐失败', e)
  }
}

const downloadProgram = (row) => {
  window.open(`/api/download/program/${row.id}`, '_blank')
}

onMounted(() => {
  loadPrograms()
})
</script>

<style scoped lang="scss">
.programs-manage-page {
  .action-bar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 16px;
    margin-bottom: 16px;
  }

  .table-card {
    padding: 16px;
  }
}
</style>
