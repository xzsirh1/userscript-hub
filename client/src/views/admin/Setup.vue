<template>
  <div class="setup-page">
    <section class="setup-hero">
      <div class="hero-kicker">首次部署引导</div>
      <h1>把平台变成你自己的分发中心</h1>
      <p>
        第一次启动时，请先设置平台名称和管理员账号。完成后系统会关闭引导页，
        后续只能通过后台“网站设置”和“修改密码”继续调整。
      </p>
      <div class="hero-preview">
        <span>{{ form.shortName || 'JS' }}</span>
        <div>
          <strong>{{ form.siteTitle || '脚本分发平台' }}</strong>
          <small>{{ form.description || '通用脚本、浏览器插件和程序分发平台' }}</small>
        </div>
      </div>
    </section>

    <section class="setup-card">
      <div class="card-title">
        <h2>部署初始化</h2>
        <p>这些信息会写入本机数据库，不再使用内置个人默认值。</p>
      </div>

      <el-form ref="formRef" :model="form" :rules="rules" label-position="top" @submit.prevent="handleSetup">
        <el-form-item label="平台名称" prop="siteTitle">
          <el-input v-model="form.siteTitle" size="large" placeholder="例如：我的脚本分发平台" maxlength="40" />
        </el-form-item>

        <el-form-item label="平台简称" prop="shortName">
          <el-input v-model="form.shortName" size="large" placeholder="2-4 个字符，用于默认图标" maxlength="4" />
        </el-form-item>

        <el-form-item label="平台描述">
          <el-input
            v-model="form.description"
            type="textarea"
            :rows="2"
            placeholder="一句话说明这个平台提供什么"
            maxlength="120"
            show-word-limit
          />
        </el-form-item>

        <el-form-item label="管理员用户名" prop="username">
          <el-input v-model="form.username" size="large" placeholder="建议使用字母或数字" autocomplete="username" />
        </el-form-item>

        <el-form-item label="管理员密码" prop="password">
          <el-input
            v-model="form.password"
            size="large"
            type="password"
            placeholder="至少 8 位，部署后请妥善保存"
            autocomplete="new-password"
            show-password
          />
        </el-form-item>

        <el-form-item label="确认密码" prop="confirmPassword">
          <el-input
            v-model="form.confirmPassword"
            size="large"
            type="password"
            placeholder="再输入一次管理员密码"
            autocomplete="new-password"
            show-password
            @keyup.enter="handleSetup"
          />
        </el-form-item>

        <el-button type="primary" size="large" class="submit-btn" :loading="loading" @click="handleSetup">
          完成初始化并进入后台
        </el-button>
      </el-form>
    </section>
  </div>
</template>

<script setup>
import { reactive, ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { setupSystem, getSetupStatus } from '@/api/auth'
import { useSiteStore } from '@/store/site'

const router = useRouter()
const siteStore = useSiteStore()
const formRef = ref(null)
const loading = ref(false)

const form = reactive({
  siteTitle: '脚本分发平台',
  shortName: 'JS',
  description: '通用脚本、浏览器插件和程序分发平台',
  footer: '',
  announcement: '',
  username: '',
  password: '',
  confirmPassword: ''
})

const rules = {
  siteTitle: [
    { required: true, message: '请输入平台名称', trigger: 'blur' },
    { min: 2, max: 40, message: '平台名称长度需为 2-40 个字符', trigger: 'blur' }
  ],
  shortName: [
    { max: 4, message: '平台简称最多 4 个字符', trigger: 'blur' }
  ],
  username: [
    { required: true, message: '请输入管理员用户名', trigger: 'blur' },
    { min: 3, max: 32, message: '用户名长度需为 3-32 个字符', trigger: 'blur' },
    {
      pattern: /^[A-Za-z0-9_.-]+$/,
      message: '用户名只能包含字母、数字、下划线、点和短横线',
      trigger: 'blur'
    }
  ],
  password: [
    { required: true, message: '请输入管理员密码', trigger: 'blur' },
    { min: 8, message: '密码长度不能少于 8 位', trigger: 'blur' }
  ],
  confirmPassword: [
    { required: true, message: '请再次输入密码', trigger: 'blur' },
    {
      validator: (rule, value, callback) => {
        if (value !== form.password) {
          callback(new Error('两次输入的密码不一致'))
          return
        }
        callback()
      },
      trigger: 'blur'
    }
  ]
}

onMounted(async () => {
  document.title = '首次部署引导 - 脚本分发平台'
  try {
    const res = await getSetupStatus()
    if (res.code === 200 && !res.data?.setupRequired) {
      router.replace('/admin/login')
    }
  } catch (error) {
    console.error(error)
  }
})

const handleSetup = async () => {
  if (!formRef.value) return
  await formRef.value.validate(async (valid) => {
    if (!valid) return

    loading.value = true
    try {
      const res = await setupSystem({
        siteTitle: form.siteTitle,
        shortName: form.shortName,
        description: form.description,
        footer: form.footer || `${form.siteTitle} - 让安装和分发更简单`,
        announcement: form.announcement,
        username: form.username,
        password: form.password
      })

      if (res.code === 200) {
        localStorage.setItem('token', res.data.token)
        siteStore.updateConfig({
          title: form.siteTitle,
          shortName: form.shortName,
          description: form.description,
          footer: form.footer || `${form.siteTitle} - 让安装和分发更简单`,
          announcement: form.announcement
        })
        ElMessage.success('初始化完成')
        router.replace('/admin/dashboard')
      }
    } finally {
      loading.value = false
    }
  })
}
</script>

<style lang="scss" scoped>
.setup-page {
  min-height: 100vh;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 480px;
  gap: 44px;
  align-items: center;
  padding: 48px clamp(20px, 6vw, 96px);
  background:
    radial-gradient(circle at 12% 18%, rgba(64, 158, 255, 0.2), transparent 28%),
    radial-gradient(circle at 90% 82%, rgba(103, 194, 58, 0.18), transparent 30%),
    linear-gradient(135deg, var(--bg-color), var(--bg-color-secondary));
}

.setup-hero {
  max-width: 680px;

  .hero-kicker {
    display: inline-flex;
    padding: 8px 14px;
    border-radius: 999px;
    background: rgba(64, 158, 255, 0.12);
    color: var(--primary-color);
    font-weight: 700;
    margin-bottom: 18px;
  }

  h1 {
    margin: 0;
    font-size: clamp(38px, 6vw, 72px);
    line-height: 1.02;
    letter-spacing: -0.05em;
    color: var(--text-color);
  }

  p {
    max-width: 560px;
    margin: 22px 0 0;
    color: var(--text-color-secondary);
    font-size: 17px;
    line-height: 1.8;
  }
}

.hero-preview {
  display: inline-flex;
  align-items: center;
  gap: 16px;
  margin-top: 34px;
  padding: 16px 18px;
  border-radius: 22px;
  background: var(--card-bg);
  box-shadow: 0 22px 60px rgba(15, 23, 42, 0.12);

  > span {
    width: 54px;
    height: 54px;
    border-radius: 16px;
    display: grid;
    place-items: center;
    color: #fff;
    font-weight: 900;
    background: linear-gradient(135deg, #409eff, #67c23a);
  }

  div {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  strong {
    color: var(--text-color);
    font-size: 18px;
  }

  small {
    color: var(--text-color-muted);
  }
}

.setup-card {
  padding: 30px;
  border-radius: 28px;
  background: var(--card-bg);
  box-shadow: 0 24px 80px rgba(15, 23, 42, 0.16);
  border: 1px solid var(--border-color-light);
}

.card-title {
  margin-bottom: 22px;

  h2 {
    margin: 0 0 8px;
    color: var(--text-color);
    font-size: 24px;
  }

  p {
    margin: 0;
    color: var(--text-color-muted);
    line-height: 1.6;
  }
}

.submit-btn {
  width: 100%;
  margin-top: 8px;
}

@media (max-width: 900px) {
  .setup-page {
    grid-template-columns: 1fr;
    gap: 28px;
    align-items: start;
    padding: 28px 16px;
  }

  .setup-card {
    padding: 22px;
    border-radius: 22px;
  }
}
</style>
