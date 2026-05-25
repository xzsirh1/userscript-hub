import axios from 'axios'
import { ElMessage } from 'element-plus'

const request = axios.create({
  baseURL: '/api',
  timeout: 30000
})

// 请求拦截器
request.interceptors.request.use(
  config => {
    const token = localStorage.getItem('token')
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  error => {
    return Promise.reject(error)
  }
)

// 响应拦截器
request.interceptors.response.use(
  response => {
    return response.data
  },
  error => {
    const message = error.response?.data?.message || error.message || '请求失败'

    if (error.response?.status === 428 && error.response?.data?.data?.setupRequired) {
      localStorage.removeItem('token')
      if (window.location.pathname !== '/setup') {
        window.location.href = '/setup'
      }
      return Promise.reject(error)
    }

    // 401 未登录或登录过期
    if (error.response?.status === 401) {
      localStorage.removeItem('token')
      // 如果在后台页面，跳转到登录页
      if (window.location.pathname.startsWith('/admin')) {
        window.location.href = '/admin/login'
      }
    }

    ElMessage.error(message)
    return Promise.reject(error)
  }
)

export default request
