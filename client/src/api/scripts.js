import request from './request'

// 获取脚本列表
export const getScripts = (params) => {
  return request.get('/scripts', { params })
}

// 获取脚本详情
export const getScript = (id) => {
  return request.get(`/scripts/${id}`)
}

// 创建脚本
export const createScript = (data) => {
  return request.post('/scripts', data)
}

// 更新脚本
export const updateScript = (id, data) => {
  return request.put(`/scripts/${id}`, data)
}

// 删除脚本
export const deleteScript = (id) => {
  return request.delete(`/scripts/${id}`)
}

// 上传脚本版本
export const uploadVersion = (id, formData) => {
  return request.post(`/scripts/${id}/versions`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  })
}

// 获取版本列表
export const getVersions = (id) => {
  return request.get(`/scripts/${id}/versions`)
}

// 删除版本
export const deleteVersion = (scriptId, versionId) => {
  return request.delete(`/scripts/${scriptId}/versions/${versionId}`)
}

// 验证私密脚本密码
export const verifyPassword = (id, password) => {
  return request.post(`/scripts/${id}/verify-password`, { password })
}
