import { createRouter, createWebHistory } from 'vue-router'
import { getSetupStatus } from '@/api/auth'

let setupStatusCache = null

const loadSetupStatus = async (force = false) => {
  if (setupStatusCache && !force) return setupStatusCache
  const res = await getSetupStatus()
  setupStatusCache = res.code === 200 ? res.data : { setupRequired: false, completed: true }
  return setupStatusCache
}

const routes = [
  // 前台路由
  {
    path: '/',
    component: () => import('@/views/front/Layout.vue'),
    children: [
      {
        path: '',
        name: 'Home',
        component: () => import('@/views/front/Home.vue'),
        meta: { title: '首页' }
      },
      {
        path: 'scripts',
        name: 'Scripts',
        component: () => import('@/views/front/Scripts.vue'),
        meta: { title: '脚本列表' }
      },
      {
        path: 'script/:id',
        name: 'ScriptDetail',
        component: () => import('@/views/front/ScriptDetail.vue'),
        meta: { title: '脚本详情' }
      },
      {
        path: 'guide',
        name: 'Guide',
        component: () => import('@/views/front/Guide.vue'),
        meta: { title: '安装教程' }
      },
      {
        path: 'programs',
        name: 'Programs',
        component: () => import('@/views/front/Programs.vue'),
        meta: { title: '小程序下载' }
      }
    ]
  },
  // 后台路由
  {
    path: '/setup',
    name: 'Setup',
    component: () => import('@/views/admin/Setup.vue'),
    meta: { title: '首次部署引导', public: true }
  },
  {
    path: '/admin/login',
    name: 'AdminLogin',
    component: () => import('@/views/admin/Login.vue'),
    meta: { title: '管理员登录' }
  },
  {
    path: '/admin',
    component: () => import('@/views/admin/Layout.vue'),
    meta: { requiresAuth: true },
    children: [
      {
        path: '',
        redirect: '/admin/dashboard'
      },
      {
        path: 'dashboard',
        name: 'Dashboard',
        component: () => import('@/views/admin/Dashboard.vue'),
        meta: { title: '控制台' }
      },
      {
        path: 'scripts',
        name: 'AdminScripts',
        component: () => import('@/views/admin/Scripts.vue'),
        meta: { title: '脚本管理' }
      },
      {
        path: 'categories',
        name: 'AdminCategories',
        component: () => import('@/views/admin/Categories.vue'),
        meta: { title: '分类管理' }
      },
      {
        path: 'plugins',
        name: 'AdminPlugins',
        component: () => import('@/views/admin/Plugins.vue'),
        meta: { title: '插件管理' }
      },
      {
        path: 'settings',
        name: 'AdminSettings',
        component: () => import('@/views/admin/Settings.vue'),
        meta: { title: '网站设置' }
      },
      {
        path: 'sync',
        name: 'AdminSync',
        component: () => import('@/views/admin/Sync.vue'),
        meta: { title: '数据同步' }
      },
      {
        path: 'update',
        name: 'AdminUpdate',
        component: () => import('@/views/admin/Update.vue'),
        meta: { title: '系统更新' }
      },
      {
        path: 'runtime',
        name: 'AdminRuntime',
        component: () => import('@/views/admin/Runtime.vue'),
        meta: { title: '授权与运行时' }
      },
      {
        path: 'help',
        name: 'AdminHelp',
        component: () => import('@/views/admin/Help.vue'),
        meta: { title: '帮助中心' }
      },
      {
        path: 'programs',
        name: 'AdminPrograms',
        component: () => import('@/views/admin/Programs.vue'),
        meta: { title: '程序管理' }
      }
    ]
  },
  // 404
  {
    path: '/:pathMatch(.*)*',
    name: 'NotFound',
    component: () => import('@/views/NotFound.vue'),
    meta: { title: '页面不存在' }
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

// 路由守卫 - 标题由各组件自行处理，这里只做初始化和登录检查
router.beforeEach(async (to, from, next) => {
  try {
    const setup = await loadSetupStatus(to.name !== 'Setup' && setupStatusCache?.setupRequired)
    if (setup.setupRequired && to.name !== 'Setup') {
      next({ name: 'Setup' })
      return
    }
    if (!setup.setupRequired && to.name === 'Setup') {
      next({ name: 'AdminLogin' })
      return
    }
  } catch (error) {
    console.error('检查初始化状态失败:', error)
  }

  // 检查是否需要登录
  if (to.matched.some(record => record.meta.requiresAuth)) {
    const token = localStorage.getItem('token')
    if (!token) {
      next({ name: 'AdminLogin', query: { redirect: to.fullPath } })
      return
    }
  }

  next()
})

export default router
