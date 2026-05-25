import request from './request'

// 获取统计概览
export const getOverview = () => {
  return request.get('/stats/overview')
}

// 获取下载趋势
export const getTrend = (days = 30) => {
  return request.get('/stats/trend', { params: { days } })
}

// 获取浏览器分布
export const getBrowserStats = () => {
  return request.get('/stats/browser')
}

// 获取操作系统分布
export const getOsStats = () => {
  return request.get('/stats/os')
}

// 获取地区分布
export const getRegionStats = () => {
  return request.get('/stats/region')
}

// 获取热门脚本
export const getHotScripts = (limit = 10) => {
  return request.get('/stats/hot-scripts', { params: { limit } })
}

// 获取下载列表
export const getDownloadList = (params) => {
  return request.get('/stats/downloads', { params })
}
