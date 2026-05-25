<template>
  <div class="admin-layout">
    <button
      v-if="isMobile && mobileSidebarOpen"
      class="sidebar-backdrop"
      type="button"
      aria-label="关闭侧边栏"
      @click="closeMobileSidebar"
    />

    <aside
      class="sidebar"
      :class="{
        collapsed: !isMobile && desktopSidebarCollapsed,
        'mobile-open': isMobile && mobileSidebarOpen
      }"
    >
      <div class="sidebar-header">
        <div class="brand">
          <img :src="faviconUrl" alt="Logo" class="logo" />
          <span v-if="!isMobile && !desktopSidebarCollapsed" class="title">{{ siteStore.title }}</span>
          <span v-else-if="isMobile" class="title">{{ siteStore.title }}</span>
        </div>
        <el-button
          v-if="isMobile"
          text
          circle
          class="sidebar-close"
          :icon="'Close'"
          @click="closeMobileSidebar"
        />
      </div>

      <el-menu
        :default-active="activeMenu"
        :collapse="!isMobile && desktopSidebarCollapsed"
        router
        class="sidebar-menu"
        @select="handleMenuSelect"
      >
        <el-menu-item index="/admin/dashboard">
          <el-icon><DataAnalysis /></el-icon>
          <span>控制台</span>
        </el-menu-item>
        <el-menu-item index="/admin/scripts">
          <el-icon><Document /></el-icon>
          <span>脚本管理</span>
        </el-menu-item>
        <el-menu-item index="/admin/categories">
          <el-icon><Folder /></el-icon>
          <span>分类管理</span>
        </el-menu-item>
        <el-menu-item index="/admin/plugins">
          <el-icon><Box /></el-icon>
          <span>插件管理</span>
        </el-menu-item>
        <el-menu-item index="/admin/programs">
          <el-icon><Files /></el-icon>
          <span>程序管理</span>
        </el-menu-item>
        <el-menu-item index="/admin/settings">
          <el-icon><Setting /></el-icon>
          <span>网站设置</span>
        </el-menu-item>
        <el-menu-item index="/admin/sync">
          <el-icon><Refresh /></el-icon>
          <span>数据同步</span>
        </el-menu-item>
        <el-menu-item index="/admin/update">
          <el-icon><Upload /></el-icon>
          <span>系统更新</span>
        </el-menu-item>
        <el-menu-item index="/admin/runtime">
          <el-icon><Key /></el-icon>
          <span>授权与运行时</span>
        </el-menu-item>
        <el-menu-item index="/admin/help">
          <el-icon><QuestionFilled /></el-icon>
          <span>帮助中心</span>
        </el-menu-item>
      </el-menu>
    </aside>

    <div class="main-wrapper">
      <header class="header">
        <div class="header-left">
          <el-button :icon="sidebarToggleIcon" @click="toggleSidebar" />
          <div class="header-title-group">
            <el-breadcrumb v-if="!isMobile" separator="/">
              <el-breadcrumb-item :to="{ path: '/admin' }">后台</el-breadcrumb-item>
              <el-breadcrumb-item>{{ currentTitle }}</el-breadcrumb-item>
            </el-breadcrumb>
            <div v-else class="mobile-page-title">{{ currentTitle }}</div>
          </div>
        </div>

        <div class="header-right">
          <el-button
            :icon="isDark ? 'Sunny' : 'Moon'"
            circle
            @click="themeStore.toggleTheme()"
          />
          <el-dropdown @command="handleCommand">
            <span class="user-info">
              <el-avatar :size="32" :icon="UserFilled" />
              <span v-if="!isMobile" class="username">{{ userStore.userInfo?.username || 'Admin' }}</span>
            </span>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="home">
                  <el-icon><HomeFilled /></el-icon>
                  前台首页
                </el-dropdown-item>
                <el-dropdown-item command="password">
                  <el-icon><Key /></el-icon>
                  修改密码
                </el-dropdown-item>
                <el-dropdown-item divided command="logout">
                  <el-icon><SwitchButton /></el-icon>
                  退出登录
                </el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
      </header>

      <main class="main-content">
        <router-view />
      </main>
    </div>

    <el-dialog
      v-model="passwordDialogVisible"
      title="修改密码"
      :width="isMobile ? '92%' : '400px'"
    >
      <el-form ref="passwordFormRef" :model="passwordForm" :rules="passwordRules" :label-position="isMobile ? 'top' : 'right'">
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
        <el-button @click="passwordDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="handleChangePassword">确认</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed, reactive, onBeforeUnmount, onMounted, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { UserFilled } from '@element-plus/icons-vue'
import { useThemeStore } from '@/store/theme'
import { useUserStore } from '@/store/user'
import { useSiteStore } from '@/store/site'
import { changePassword } from '@/api/auth'

const MOBILE_BREAKPOINT = 768

const router = useRouter()
const route = useRoute()
const themeStore = useThemeStore()
const userStore = useUserStore()
const siteStore = useSiteStore()

const isDark = computed(() => themeStore.isDark)
const isMobile = ref(false)
const desktopSidebarCollapsed = ref(false)
const mobileSidebarOpen = ref(false)
const faviconUrl = '/api/config/favicon'

const activeMenu = computed(() => route.path)
const currentTitle = computed(() => route.meta.title || '控制台')
const sidebarToggleIcon = computed(() => {
  if (isMobile.value) {
    return mobileSidebarOpen.value ? 'Close' : 'Expand'
  }
  return desktopSidebarCollapsed.value ? 'Expand' : 'Fold'
})

const updateTitle = () => {
  const pageTitle = route.meta.title
  document.title = pageTitle ? `${pageTitle} - ${siteStore.title}` : siteStore.title
}

const syncViewport = () => {
  isMobile.value = window.innerWidth <= MOBILE_BREAKPOINT
  if (!isMobile.value) {
    mobileSidebarOpen.value = false
  }
}

const toggleSidebar = () => {
  if (isMobile.value) {
    mobileSidebarOpen.value = !mobileSidebarOpen.value
    return
  }
  desktopSidebarCollapsed.value = !desktopSidebarCollapsed.value
}

const closeMobileSidebar = () => {
  mobileSidebarOpen.value = false
}

const handleMenuSelect = () => {
  if (isMobile.value) {
    closeMobileSidebar()
  }
}

watch(() => route.path, () => {
  updateTitle()
  if (isMobile.value) {
    closeMobileSidebar()
  }
})

const passwordDialogVisible = ref(false)
const passwordFormRef = ref(null)
const passwordForm = reactive({
  oldPassword: '',
  newPassword: '',
  confirmPassword: ''
})

const passwordRules = {
  oldPassword: [{ required: true, message: '请输入旧密码', trigger: 'blur' }],
  newPassword: [
    { required: true, message: '请输入新密码', trigger: 'blur' },
    { min: 6, message: '密码长度不能少于 6 位', trigger: 'blur' }
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

const handleCommand = (command) => {
  switch (command) {
    case 'home':
      router.push('/')
      break
    case 'password':
      passwordDialogVisible.value = true
      break
    case 'logout':
      ElMessageBox.confirm('确定要退出登录吗？', '提示', {
        type: 'warning'
      }).then(() => {
        userStore.logout()
        router.push('/admin/login')
      }).catch(() => {})
      break
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
        passwordDialogVisible.value = false
        userStore.logout()
        router.push('/admin/login')
      }
    } catch (error) {
      console.error('修改密码失败', error)
    }
  })
}

onMounted(async () => {
  syncViewport()
  window.addEventListener('resize', syncViewport)
  userStore.fetchProfile()
  await siteStore.loadConfig()
  updateTitle()
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', syncViewport)
})
</script>

<style lang="scss" scoped>
.admin-layout {
  display: flex;
  min-height: 100vh;
}

.sidebar-backdrop {
  position: fixed;
  inset: 0;
  z-index: 998;
  border: 0;
  background: rgba(15, 23, 42, 0.42);
}

.sidebar {
  width: 220px;
  background: var(--card-bg);
  border-right: 1px solid var(--border-color-light);
  display: flex;
  flex-direction: column;
  transition: width 0.24s ease, transform 0.24s ease;
  z-index: 999;

  &.collapsed {
    width: 64px;

    .sidebar-header .title {
      display: none;
    }
  }
}

.sidebar-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 18px 20px;
  border-bottom: 1px solid var(--border-color-light);

  .brand {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
  }

  .logo {
    width: 32px;
    height: 32px;
    flex: 0 0 auto;
  }

  .title {
    font-size: 16px;
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
}

.sidebar-menu {
  flex: 1;
  border-right: none;

  &:not(.el-menu--collapse) {
    width: 100%;
  }
}

.main-wrapper {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.header {
  height: 60px;
  background: var(--card-bg);
  border-bottom: 1px solid var(--border-color-light);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 0 20px;
}

.header-left,
.header-right {
  display: flex;
  align-items: center;
  gap: 14px;
  min-width: 0;
}

.header-title-group {
  min-width: 0;
}

.mobile-page-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-color);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.user-info {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
}

.username {
  font-size: 14px;
}

.main-content {
  flex: 1;
  padding: 20px;
  background: var(--bg-color);
  overflow-y: auto;
}

@media (max-width: 768px) {
  .sidebar {
    position: fixed;
    top: 0;
    left: 0;
    bottom: 0;
    width: min(82vw, 300px);
    transform: translateX(-100%);
    box-shadow: 0 18px 48px rgba(15, 23, 42, 0.2);

    &.mobile-open {
      transform: translateX(0);
    }
  }

  .header {
    padding: 0 12px;
  }

  .header-left,
  .header-right {
    gap: 10px;
  }

  .main-content {
    padding: 14px;
  }
}
</style>
