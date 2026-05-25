import request from './request'

// 获取程序列表
export const getPrograms = () => {
  return request.get('/programs')
}

// 获取推荐程序
export const getRecommendedPrograms = () => {
  return request.get('/programs/recommended')
}

// 获取程序详情
export const getProgram = (id) => {
  return request.get(`/programs/${id}`)
}

// 上传程序
export const uploadProgram = (formData) => {
  return request.post('/programs', formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  })
}

// 更新程序
export const updateProgram = (id, data) => {
  return request.put(`/programs/${id}`, data)
}

// 删除程序
export const deleteProgram = (id) => {
  return request.delete(`/programs/${id}`)
}

// 设置推荐
export const setRecommended = (id) => {
  return request.post(`/programs/${id}/recommend`)
}
