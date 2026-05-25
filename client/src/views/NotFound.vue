<template>
  <div class="not-found-page">
    <div class="content">
      <h1>404</h1>
      <p>页面不存在</p>
      <el-button type="primary" @click="router.push('/')">返回首页</el-button>
    </div>
  </div>
</template>

<script setup>
import { useRouter } from 'vue-router'
const router = useRouter()
</script>

<style lang="scss" scoped>
.not-found-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-color);

  .content {
    text-align: center;

    h1 {
      font-size: 120px;
      font-weight: 700;
      color: var(--primary-color);
      margin-bottom: 10px;
      line-height: 1;
    }

    p {
      font-size: 20px;
      color: var(--text-color-muted);
      margin-bottom: 30px;
    }
  }
}
</style>
