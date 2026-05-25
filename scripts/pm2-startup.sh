#!/bin/bash
# PM2 开机自启动配置脚本
# 用途：配置 PM2 在服务器重启后自动启动应用

set -e

echo "=========================================="
echo "  PM2 开机自启动配置脚本"
echo "=========================================="
echo ""

# 检查是否以 root 权限运行
if [ "$EUID" -ne 0 ]; then 
  echo "❌ 错误：此脚本需要 root 权限运行"
  echo "请使用: sudo bash pm2-startup.sh"
  exit 1
fi

# 检查 PM2 是否已安装
if ! command -v pm2 &> /dev/null; then
    echo "❌ 错误：PM2 未安装"
    echo "请先安装 PM2: npm install -g pm2"
    exit 1
fi

echo "✓ PM2 已安装"
echo ""

# 获取当前用户（非 root）
ACTUAL_USER="${SUDO_USER:-$USER}"
echo "当前用户: $ACTUAL_USER"
echo ""

# 配置 PM2 开机自启
echo "正在配置 PM2 开机自启动..."
su - $ACTUAL_USER -c "pm2 startup" | grep -E "sudo|systemctl" | bash

echo ""
echo "✓ PM2 开机自启动已配置"
echo ""

# 保存当前 PM2 进程列表
echo "正在保存 PM2 进程列表..."
su - $ACTUAL_USER -c "pm2 save"

echo ""
echo "=========================================="
echo "  配置完成！"
echo "=========================================="
echo ""
echo "下次服务器重启时，PM2 将自动启动所有已保存的进程"
echo ""
echo "常用命令："
echo "  pm2 list          - 查看进程列表"
echo "  pm2 save          - 保存当前进程列表"
echo "  pm2 resurrect     - 恢复已保存的进程"
echo "  pm2 unstartup     - 取消开机自启"
echo ""
