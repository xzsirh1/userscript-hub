#!/bin/bash
# 服务健康检查和自动恢复脚本
# 用途：定期检查服务状态，如果服务异常则自动重启
# 建议添加到 crontab: */5 * * * * /path/to/health-check.sh

set -e

# 配置项
APP_NAME="userscript-hub"
APP_DIR="${APP_DIR:-/opt/userscript-hub/server}"
HEALTH_URL="http://127.0.0.1:3000/api/health"
LOG_FILE="/var/log/userscript-hub-health-check.log"
MAX_RETRIES=3

# 日志函数
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

# 检查 PM2 进程是否运行
check_pm2_process() {
    pm2 describe "$APP_NAME" &> /dev/null
    return $?
}

# 检查 HTTP 健康接口
check_http_health() {
    local response=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 5 --max-time 10 "$HEALTH_URL" 2>/dev/null || echo "000")
    if [ "$response" = "200" ]; then
        return 0
    else
        return 1
    fi
}

# 重启服务
restart_service() {
    log "⚠️  尝试重启服务..."
    
    cd "$APP_DIR"
    
    # 检查是否有 ecosystem.config.js
    if [ -f "ecosystem.config.js" ]; then
        pm2 reload ecosystem.config.js
        log "✓ 使用 ecosystem.config.js 重启服务"
    else
        pm2 restart "$APP_NAME"
        log "✓ 使用进程名重启服务"
    fi
    
    # 等待服务启动
    sleep 5
}

# 启动服务（如果进程不存在）
start_service() {
    log "⚠️  服务未运行，尝试启动..."
    
    cd "$APP_DIR"
    
    if [ -f "ecosystem.config.js" ]; then
        pm2 start ecosystem.config.js
        log "✓ 使用 ecosystem.config.js 启动服务"
    else
        pm2 start src/app.js --name "$APP_NAME"
        log "✓ 使用默认配置启动服务"
    fi
    
    pm2 save
    sleep 5
}

# 主检查逻辑
main() {
    log "开始健康检查..."
    
    # 检查 PM2 进程
    if ! check_pm2_process; then
        log "❌ PM2 进程不存在"
        start_service
        
        # 再次检查
        if check_http_health; then
            log "✓ 服务启动成功"
            return 0
        else
            log "❌ 服务启动失败"
            return 1
        fi
    fi
    
    # 检查 HTTP 健康接口
    local retry=0
    while [ $retry -lt $MAX_RETRIES ]; do
        if check_http_health; then
            log "✓ 服务运行正常"
            return 0
        fi
        
        retry=$((retry + 1))
        log "⚠️  健康检查失败 (尝试 $retry/$MAX_RETRIES)"
        sleep 2
    done
    
    # 多次检查失败，重启服务
    log "❌ 服务健康检查失败，执行重启"
    restart_service
    
    # 重启后再次检查
    sleep 5
    if check_http_health; then
        log "✓ 服务重启成功"
        return 0
    else
        log "❌ 服务重启后仍然异常，请人工检查"
        return 1
    fi
}

# 执行检查
main

log "健康检查完成"
log "----------------------------------------"
