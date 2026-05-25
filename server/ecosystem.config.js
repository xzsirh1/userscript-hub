module.exports = {
  apps: [{
    name: "userscript-hub",
    cwd: __dirname,
    script: "./src/app.js",
    instances: 1,
    exec_mode: "cluster", // 集群模式支持零停机重载
    watch: false,
    max_memory_restart: "500M",
    autorestart: true, // 自动重启
    max_restarts: 10, // 最大重启次数
    min_uptime: "10s", // 最小运行时间，避免频繁重启
    restart_delay: 4000, // 重启延迟（毫秒）
    env: {
      NODE_ENV: "production",
      PORT: 3000
    },
    error_file: "./logs/err.log",
    out_file: "./logs/out.log",
    merge_logs: true,
    log_date_format: "YYYY-MM-DD HH:mm:ss",
    // 进程异常退出时自动重启
    kill_timeout: 5000,
    listen_timeout: 3000,
    exp_backoff_restart_delay: 100
  }]
};
