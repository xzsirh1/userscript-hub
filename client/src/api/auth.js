import request from './request'

// 获取首次部署初始化状态
export const getSetupStatus = () => {
  return request.get('/auth/setup-status')
}

// 首次部署初始化
export const setupSystem = (data) => {
  return request.post('/auth/setup', data)
}

// 登录
export const login = (username, password) => {
  return request.post('/auth/login', { username, password })
}

// 获取用户信息
export const getProfile = () => {
  return request.get('/auth/profile')
}

// 修改密码
export const changePassword = (oldPassword, newPassword) => {
  return request.post('/auth/change-password', { oldPassword, newPassword })
}
