import request from './request'

// 获取插件列表
export const getPlugins = () => {
  return request.get('/plugins')
}

// 获取推荐插件
export const getRecommendedPlugins = () => {
  return request.get('/plugins/recommended')
}

// 获取插件详情
export const getPlugin = (id) => {
  return request.get(`/plugins/${id}`)
}

// 上传插件
export const uploadPlugin = (formData) => {
  return request.post('/plugins', formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  })
}

// 更新插件
export const updatePlugin = (id, data) => {
  return request.put(`/plugins/${id}`, data)
}

// 删除插件
export const deletePlugin = (id) => {
  return request.delete(`/plugins/${id}`)
}

// 设置推荐
export const setRecommended = (id) => {
  return request.post(`/plugins/${id}/recommend`)
}
