import request from './request'

// 获取网站配置
export const getConfig = () => {
  return request.get('/config')
}

// 更新网站配置
export const updateConfig = (data) => {
  return request.put('/config', data)
}
