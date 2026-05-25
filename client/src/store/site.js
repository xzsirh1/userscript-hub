import { defineStore } from 'pinia'
import { ref } from 'vue'
import { getConfig } from '@/api/config'

export const useSiteStore = defineStore('site', () => {
  const title = ref('脚本分发平台')
  const shortName = ref('')
  const description = ref('')
  const footer = ref('')
  const announcement = ref('')
  const loaded = ref(false)

  const loadConfig = async () => {
    if (loaded.value) return
    try {
      const res = await getConfig()
      if (res.code === 200) {
        title.value = res.data.title || '脚本分发平台'
        shortName.value = res.data.shortName || ''
        description.value = res.data.description || ''
        footer.value = res.data.footer || ''
        announcement.value = res.data.announcement || ''
        loaded.value = true
      }
    } catch (e) {
      console.error('加载网站配置失败:', e)
    }
  }

  const updateConfig = (config) => {
    if (config.title) title.value = config.title
    if (config.shortName !== undefined) shortName.value = config.shortName
    if (config.description !== undefined) description.value = config.description
    if (config.footer !== undefined) footer.value = config.footer
    if (config.announcement !== undefined) announcement.value = config.announcement
  }

  return {
    title,
    shortName,
    description,
    footer,
    announcement,
    loaded,
    loadConfig,
    updateConfig
  }
})
