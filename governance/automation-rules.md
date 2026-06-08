# 自动化规则

> 创建或修改定时同步、提醒、监控、watchdog、后台任务前先读本规则。

## 1. 默认姿态

自动化应当安静、可续接、可停止。

- 默认不要自动新建会话或独立任务窗口。
- 优先使用稳定的 automation ID 和固定状态文件。
- 如果平台支持，绑定当前线程或指定线程。
- owner、target、state、logs、stop method 不清楚前，不启用 schedule。

## 2. 必填信息

| 字段 | 要求 |
|------|------|
| owner | 谁发起或负责这个自动化 |
| target | 会触碰的仓库、目录、系统、线程或任务 |
| schedule | 人类可读时间；必要时补 cron / rrule |
| state | 可回读、可续跑的状态文件或状态记录 |
| logs | stdout、stderr、失败原因写到哪里 |
| stop | 如何暂停、禁用或删除 |
| permissions | 允许读写什么，明确禁止什么 |

## 3. 默认不新开会话

周期性 agent 任务优先续接已有线程。

默认允许：

- follow-up / heartbeat 形态的自动化。
- 配置 `target_thread_id` 或等价指针。
- 状态文件记录上次处理的 commit、export 或 checkpoint。

需要用户明确要求：

- 每次运行都新建线程。
- 启动独立常驻 worker。
- 向群、工单、文档系统或其他外部服务发消息。

## 4. Windows 后台规则

后台任务不得闪现命令窗口或打断桌面。

- 优先使用隐藏包装、服务模式或无窗口 launcher。
- stdout / stderr 写日志。
- 不用前台 `cmd.exe`、`powershell.exe`、`node.exe`、`python.exe` 作为计划任务入口。
- 失败应能通过日志或状态文件追踪，而不是弹窗。

## 5. 同步自动化门禁

仓库同步类自动化至少满足：

1. 先 dry-run。
2. public 和 private export profile 分开。
3. 不默认推送到 deprecated / legacy 目标。
4. 不 force push；如必须修复历史，必须知道精确旧 commit 并使用 lease。
5. push 后回读远端分支和最新提交元数据。

