<template>
  <div class="categories-manage-page">
    <div class="action-bar card">
      <el-button type="primary" @click="openCreateDialog">
        <el-icon><Plus /></el-icon>
        新增分类
      </el-button>
    </div>

    <div class="table-card card">
      <el-table :data="categories" v-loading="loading" stripe>
        <el-table-column prop="name" label="分类名称" min-width="150" />
        <el-table-column prop="description" label="描述" min-width="200">
          <template #default="{ row }">{{ row.description || '-' }}</template>
        </el-table-column>
        <el-table-column prop="script_count" label="脚本数" width="100" />
        <el-table-column prop="sort_order" label="排序" width="80" />
        <el-table-column label="操作" width="150">
          <template #default="{ row }">
            <el-button size="small" @click="openEditDialog(row)">编辑</el-button>
            <el-button size="small" type="danger" @click="handleDelete(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <el-dialog v-model="dialogVisible" :title="isEdit ? '编辑分类' : '新增分类'" width="450px">
      <el-form ref="formRef" :model="form" :rules="rules" label-width="80px">
        <el-form-item label="名称" prop="name">
          <el-input v-model="form.name" placeholder="请输入分类名称" />
        </el-form-item>
        <el-form-item label="描述">
          <el-input v-model="form.description" type="textarea" :rows="2" placeholder="请输入分类描述" />
        </el-form-item>
        <el-form-item label="排序">
          <el-input-number v-model="form.sort_order" :min="0" :max="999" />
          <span style="margin-left: 10px; color: var(--text-color-muted); font-size: 12px">数字越小越靠前</span>
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
import { ref, reactive, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { getCategories, createCategory, updateCategory, deleteCategory } from '@/api/categories'

const loading = ref(false)
const categories = ref([])

const dialogVisible = ref(false)
const isEdit = ref(false)
const formRef = ref(null)
const form = reactive({
  id: null,
  name: '',
  description: '',
  sort_order: 0
})

const rules = {
  name: [{ required: true, message: '请输入分类名称', trigger: 'blur' }]
}

const loadCategories = async () => {
  loading.value = true
  try {
    const res = await getCategories()
    if (res.code === 200) categories.value = res.data
  } catch (e) { console.error(e) }
  finally { loading.value = false }
}

const openCreateDialog = () => {
  isEdit.value = false
  Object.assign(form, { id: null, name: '', description: '', sort_order: 0 })
  dialogVisible.value = true
}

const openEditDialog = (row) => {
  isEdit.value = true
  Object.assign(form, row)
  dialogVisible.value = true
}

const handleSubmit = async () => {
  if (!formRef.value) return
  await formRef.value.validate(async (valid) => {
    if (!valid) return
    try {
      const res = isEdit.value
        ? await updateCategory(form.id, form)
        : await createCategory(form)
      if (res.code === 200) {
        ElMessage.success(isEdit.value ? '更新成功' : '创建成功')
        dialogVisible.value = false
        loadCategories()
      }
    } catch (e) { console.error(e) }
  })
}

const handleDelete = (row) => {
  ElMessageBox.confirm(`确定要删除分类「${row.name}」吗？该分类下的脚本将变为未分类。`, '提示', { type: 'warning' })
    .then(async () => {
      try {
        const res = await deleteCategory(row.id)
        if (res.code === 200) {
          ElMessage.success('删除成功')
          loadCategories()
        }
      } catch (e) { console.error(e) }
    }).catch(() => {})
}

onMounted(loadCategories)
</script>

<style lang="scss" scoped>
.categories-manage-page {
  .action-bar {
    margin-bottom: 20px;
  }
}
</style>
