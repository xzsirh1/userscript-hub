<template>
  <div class="dashboard-page">
    <!-- 统计卡片 -->
    <div class="stat-cards">
      <div class="stat-card">
        <div class="stat-icon" style="background: linear-gradient(135deg, #409EFF, #67C23A)">
          <el-icon><Document /></el-icon>
        </div>
        <div class="stat-info">
          <span class="stat-value">{{ stats.scriptCount }}</span>
          <span class="stat-label">脚本总数</span>
        </div>
      </div>

      <div class="stat-card">
        <div class="stat-icon" style="background: linear-gradient(135deg, #E6A23C, #F56C6C)">
          <el-icon><Box /></el-icon>
        </div>
        <div class="stat-info">
          <span class="stat-value">{{ stats.pluginCount }}</span>
          <span class="stat-label">插件总数</span>
        </div>
      </div>

      <div class="stat-card">
        <div class="stat-icon" style="background: linear-gradient(135deg, #67C23A, #E6A23C)">
          <el-icon><Files /></el-icon>
        </div>
        <div class="stat-info">
          <span class="stat-value">{{ stats.programCount }}</span>
          <span class="stat-label">程序总数</span>
        </div>
      </div>

      <div class="stat-card">
        <div class="stat-icon" style="background: linear-gradient(135deg, #67C23A, #409EFF)">
          <el-icon><Download /></el-icon>
        </div>
        <div class="stat-info">
          <span class="stat-value">{{ stats.totalDownloads }}</span>
          <span class="stat-label">总下载量</span>
        </div>
      </div>

      <div class="stat-card">
        <div class="stat-icon" style="background: linear-gradient(135deg, #909399, #606266)">
          <el-icon><TrendCharts /></el-icon>
        </div>
        <div class="stat-info">
          <span class="stat-value">{{ stats.todayDownloads }}</span>
          <span class="stat-label">今日下载</span>
        </div>
      </div>
    </div>

    <!-- 图表区域 -->
    <div class="chart-section">
      <div class="chart-card card">
        <h3>下载趋势（近30天）</h3>
        <div ref="trendChartRef" class="chart-container"></div>
      </div>

      <div class="chart-row">
        <div class="chart-card card">
          <h3>浏览器分布</h3>
          <div ref="browserChartRef" class="chart-container small"></div>
        </div>

        <div class="chart-card card">
          <h3>操作系统分布</h3>
          <div ref="osChartRef" class="chart-container small"></div>
        </div>
      </div>
    </div>

    <!-- 热门脚本 -->
    <div class="hot-scripts card">
      <h3>热门脚本（近30天）</h3>
      <el-table :data="hotScripts" stripe>
        <el-table-column prop="name" label="脚本名称" />
        <el-table-column prop="category_name" label="分类" width="120">
          <template #default="{ row }">
            {{ row.category_name || '未分类' }}
          </template>
        </el-table-column>
        <el-table-column prop="recent_downloads" label="近期下载" width="100" />
        <el-table-column prop="download_count" label="总下载" width="100" />
      </el-table>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, onUnmounted } from 'vue'
import * as echarts from 'echarts'
import { getOverview, getTrend, getBrowserStats, getOsStats, getHotScripts } from '@/api/stats'

const stats = reactive({
  scriptCount: 0,
  pluginCount: 0,
  programCount: 0,
  totalDownloads: 0,
  todayDownloads: 0
})

const hotScripts = ref([])

const trendChartRef = ref(null)
const browserChartRef = ref(null)
const osChartRef = ref(null)

let trendChart = null
let browserChart = null
let osChart = null

const loadStats = async () => {
  try {
    const res = await getOverview()
    if (res.code === 200) {
      Object.assign(stats, res.data)
    }
  } catch (e) {
    console.error('加载统计失败', e)
  }
}

const loadHotScripts = async () => {
  try {
    const res = await getHotScripts(10)
    if (res.code === 200) {
      hotScripts.value = res.data
    }
  } catch (e) {
    console.error('加载热门脚本失败', e)
  }
}

const initTrendChart = async () => {
  if (!trendChartRef.value) return

  trendChart = echarts.init(trendChartRef.value)

  try {
    const res = await getTrend(30)
    const data = res.code === 200 ? res.data : []

    const option = {
      tooltip: {
        trigger: 'axis'
      },
      grid: {
        left: '3%',
        right: '4%',
        bottom: '3%',
        containLabel: true
      },
      xAxis: {
        type: 'category',
        boundaryGap: false,
        data: data.map(d => d.date)
      },
      yAxis: {
        type: 'value'
      },
      series: [{
        name: '下载量',
        type: 'line',
        smooth: true,
        areaStyle: {
          opacity: 0.3
        },
        data: data.map(d => d.count)
      }]
    }

    trendChart.setOption(option)
  } catch (e) {
    console.error('加载趋势图失败', e)
  }
}

const initBrowserChart = async () => {
  if (!browserChartRef.value) return

  browserChart = echarts.init(browserChartRef.value)

  try {
    const res = await getBrowserStats()
    const data = res.code === 200 ? res.data : []

    const option = {
      tooltip: {
        trigger: 'item'
      },
      series: [{
        type: 'pie',
        radius: ['40%', '70%'],
        avoidLabelOverlap: false,
        itemStyle: {
          borderRadius: 10,
          borderColor: '#fff',
          borderWidth: 2
        },
        label: {
          show: true,
          formatter: '{b}: {c}'
        },
        data: data.map(d => ({ name: d.browser, value: d.count }))
      }]
    }

    browserChart.setOption(option)
  } catch (e) {
    console.error('加载浏览器统计失败', e)
  }
}

const initOsChart = async () => {
  if (!osChartRef.value) return

  osChart = echarts.init(osChartRef.value)

  try {
    const res = await getOsStats()
    const data = res.code === 200 ? res.data : []

    const option = {
      tooltip: {
        trigger: 'item'
      },
      series: [{
        type: 'pie',
        radius: ['40%', '70%'],
        avoidLabelOverlap: false,
        itemStyle: {
          borderRadius: 10,
          borderColor: '#fff',
          borderWidth: 2
        },
        label: {
          show: true,
          formatter: '{b}: {c}'
        },
        data: data.map(d => ({ name: d.os, value: d.count }))
      }]
    }

    osChart.setOption(option)
  } catch (e) {
    console.error('加载系统统计失败', e)
  }
}

const handleResize = () => {
  trendChart?.resize()
  browserChart?.resize()
  osChart?.resize()
}

onMounted(() => {
  loadStats()
  loadHotScripts()
  initTrendChart()
  initBrowserChart()
  initOsChart()
  window.addEventListener('resize', handleResize)
})

onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
  trendChart?.dispose()
  browserChart?.dispose()
  osChart?.dispose()
})
</script>

<style lang="scss" scoped>
.dashboard-page {
  .stat-cards {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 20px;
    margin-bottom: 25px;
  }

  .stat-card {
    background: var(--card-bg);
    border-radius: 12px;
    padding: 20px;
    display: flex;
    align-items: center;
    gap: 15px;
    box-shadow: 0 2px 12px var(--shadow-color);

    .stat-icon {
      width: 56px;
      height: 56px;
      border-radius: 12px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #fff;
      font-size: 24px;
    }

    .stat-info {
      display: flex;
      flex-direction: column;

      .stat-value {
        font-size: 28px;
        font-weight: 600;
        color: var(--text-color);
      }

      .stat-label {
        font-size: 13px;
        color: var(--text-color-muted);
        margin-top: 4px;
      }
    }
  }
}

.chart-section {
  margin-bottom: 25px;

  .chart-row {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
    gap: 20px;
    margin-top: 20px;
  }
}

.chart-card {
  h3 {
    font-size: 16px;
    font-weight: 600;
    margin-bottom: 15px;
    color: var(--text-color);
  }

  .chart-container {
    height: 300px;

    &.small {
      height: 250px;
    }
  }
}

.hot-scripts {
  h3 {
    font-size: 16px;
    font-weight: 600;
    margin-bottom: 15px;
    color: var(--text-color);
  }
}

@media (max-width: 768px) {
  .chart-section .chart-row {
    grid-template-columns: 1fr;
  }
}
</style>
