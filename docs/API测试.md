# API 测试脚本

## 测试程序相关接口

### 1. 获取程序列表（公开接口）
```bash
curl http://localhost:3000/api/programs
```

### 2. 获取推荐程序（公开接口）
```bash
curl http://localhost:3000/api/programs/recommended
```

### 3. 获取程序详情（公开接口）
```bash
curl http://localhost:3000/api/programs/1
```

### 4. 下载程序（公开接口）
```bash
curl -O http://localhost:3000/api/download/program/1
```

### 5. 上传程序（需要登录）
```bash
# 先登录获取 token
TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin"}' \
  | jq -r '.data.token')

# 上传程序
curl -X POST http://localhost:3000/api/programs \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@test.exe" \
  -F "name=测试程序" \
  -F "description=这是一个测试程序" \
  -F "version=1.0.0" \
  -F "is_recommended=1"
```

### 6. 更新程序信息（需要登录）
```bash
curl -X PUT http://localhost:3000/api/programs/1 \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "更新后的程序名",
    "description": "更新后的描述",
    "version": "1.0.1",
    "is_recommended": true
  }'
```

### 7. 删除程序（需要登录）
```bash
curl -X DELETE http://localhost:3000/api/programs/1 \
  -H "Authorization: Bearer $TOKEN"
```

### 8. 设置推荐（需要登录）
```bash
curl -X POST http://localhost:3000/api/programs/1/recommend \
  -H "Authorization: Bearer $TOKEN"
```

### 9. 查看统计（需要登录）
```bash
curl http://localhost:3000/api/stats/overview \
  -H "Authorization: Bearer $TOKEN"
```

## Windows PowerShell 测试

### 获取程序列表
```powershell
Invoke-RestMethod -Uri "http://localhost:3000/api/programs" -Method Get
```

### 登录并上传程序
```powershell
# 登录
$loginResponse = Invoke-RestMethod -Uri "http://localhost:3000/api/auth/login" `
  -Method Post `
  -ContentType "application/json" `
  -Body '{"username":"admin","password":"admin"}'

$token = $loginResponse.data.token

# 上传程序
$headers = @{
  "Authorization" = "Bearer $token"
}

$form = @{
  file = Get-Item -Path "test.exe"
  name = "测试程序"
  description = "这是一个测试程序"
  version = "1.0.0"
  is_recommended = "1"
}

Invoke-RestMethod -Uri "http://localhost:3000/api/programs" `
  -Method Post `
  -Headers $headers `
  -Form $form
```

## 前端路由测试

访问以下 URL 测试前端页面：

- 前台程序列表：http://localhost:5173/programs
- 后台程序管理：http://localhost:5173/admin/programs
- 首页（查看程序展示）：http://localhost:5173/

## 数据库验证

```sql
-- 查看 programs 表结构
PRAGMA table_info(programs);

-- 查看程序列表
SELECT * FROM programs;

-- 查看程序下载统计
SELECT * FROM download_stats WHERE target_type = 'program';
```
