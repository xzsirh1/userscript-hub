import request from './request'

// 获取分类列表
export const getCategories = () => {
  return request.get('/categories')
}

// 获取分类详情
export const getCategory = (id) => {
  return request.get(`/categories/${id}`)
}

// 创建分类
export const createCategory = (data) => {
  return request.post('/categories', data)
}

// 更新分类
export const updateCategory = (id, data) => {
  return request.put(`/categories/${id}`, data)
}

// 删除分类
export const deleteCategory = (id) => {
  return request.delete(`/categories/${id}`)
}
