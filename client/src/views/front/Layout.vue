<template>
  <div class="front-layout">
    <!-- 顶部导航 -->
    <header class="header">
      <div class="container header-content">
        <div class="logo" @click="router.push('/')">
          <div class="logo-icon">
            <img :src="faviconUrl" alt="logo" />
          </div>
          <span class="logo-text">{{ siteStore.title }}</span>
        </div>

        <nav class="nav-menu" :class="{ 'nav-open': menuOpen }">
          <router-link to="/" class="nav-item" @click="menuOpen = false">首页</router-link>
          <router-link to="/scripts" class="nav-item" @click="menuOpen = false">脚本列表</router-link>
          <router-link to="/programs" class="nav-item" @click="menuOpen = false">小程序</router-link>
          <router-link to="/guide" class="nav-item" @click="menuOpen = false">安装教程</router-link>
        </nav>

        <div class="header-actions">
          <el-button
            :icon="isDark ? 'Sunny' : 'Moon'"
            circle
            @click="themeStore.toggleTheme()"
          />
          <el-button
            v-if="isLoggedIn"
            type="primary"
            @click="router.push('/admin')"
          >
            管理后台
          </el-button>
          <div class="menu-toggle" @click="menuOpen = !menuOpen">
            <el-icon><Menu /></el-icon>
          </div>
        </div>
      </div>
    </header>

    <!-- 主内容区 -->
    <main class="main-content">
      <router-view />
    </main>

    <!-- 页脚 -->
    <footer class="footer">
      <div class="container">
        <p>{{ siteStore.footer || siteStore.title + ' - 让脚本安装更简单' }}</p>
      </div>
    </footer>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useThemeStore } from '@/store/theme'
import { useUserStore } from '@/store/user'
import { useSiteStore } from '@/store/site'

const router = useRouter()
const route = useRoute()
const themeStore = useThemeStore()
const userStore = useUserStore()
const siteStore = useSiteStore()

const isDark = computed(() => themeStore.isDark)
const isLoggedIn = computed(() => userStore.isLoggedIn)

const menuOpen = ref(false)
const faviconUrl = '/api/config/favicon'

// 更新页面标题
const updateTitle = () => {
  const pageTitle = route.meta.title
  document.title = pageTitle ? `${pageTitle} - ${siteStore.title}` : siteStore.title
}

onMounted(async () => {
  await siteStore.loadConfig()
  updateTitle()
})

// 监听路由变化更新标题
router.afterEach(() => {
  updateTitle()
})
</script>

<style lang="scss" scoped>
.front-layout {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

.header {
  background: var(--header-bg);
  color: #fff;
  position: sticky;
  top: 0;
  z-index: 100;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
}

.header-content {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 60px;
}

.logo {
  display: flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
  transition: opacity 0.3s;

  &:hover {
    opacity: 0.9;
  }
}

.logo-icon {
  width: 36px;
  height: 36px;

  :deep(svg) {
    width: 100%;
    height: 100%;
  }
}

.logo-text {
  font-size: 20px;
  font-weight: 600;
  letter-spacing: 1px;
}

.nav-menu {
  display: flex;
  gap: 30px;

  @media (max-width: 768px) {
    position: fixed;
    top: 60px;
    left: 0;
    right: 0;
    background: var(--header-bg);
    flex-direction: column;
    padding: 20px;
    gap: 15px;
    transform: translateY(-100%);
    opacity: 0;
    transition: all 0.3s;
    pointer-events: none;

    &.nav-open {
      transform: translateY(0);
      opacity: 1;
      pointer-events: auto;
    }
  }
}

.nav-item {
  color: rgba(255, 255, 255, 0.9);
  font-size: 15px;
  transition: color 0.3s;
  text-decoration: none;

  &:hover,
  &.router-link-active {
    color: #fff;
  }

  &.router-link-active {
    font-weight: 600;
  }
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 10px;

  .el-button {
    --el-button-bg-color: rgba(255, 255, 255, 0.2);
    --el-button-border-color: transparent;
    --el-button-hover-bg-color: rgba(255, 255, 255, 0.3);
    --el-button-text-color: #fff;
  }
}

.menu-toggle {
  display: none;
  cursor: pointer;
  font-size: 24px;

  @media (max-width: 768px) {
    display: block;
  }
}

.main-content {
  flex: 1;
  padding: 30px 0;

  @media (max-width: 768px) {
    padding: 20px 0;
  }
}

.footer {
  background: var(--bg-color-secondary);
  border-top: 1px solid var(--border-color-light);
  padding: 20px 0;
  text-align: center;
  color: var(--text-color-muted);
  font-size: 13px;
}
</style>
