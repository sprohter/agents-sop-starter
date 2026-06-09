# Runtime Boundary

> 本目录只说明运行态边界。public starter 不保存真实运行态文件。

## 运行态包括什么

- 日志、缓存、状态文件。
- 浏览器 storage、会话、cookie。
- 临时导出、截图、报告、Excel、JSON。
- 本机私有配置、凭证相邻配置。
- 自动化上次运行状态。

## 默认规则

- public starter 不提交真实运行态。
- private backup 也不保存凭证密钥和运行态噪音。
- 需要示例时，只放 `.example`、占位符或 README 说明。
- 自动化任务应有固定 state 和 logs，但真实文件留在本机。

## 推荐目录口径

```text
runtime/
├── README.md              ← 本文件，只说明边界
├── local-secrets/         ← 本机私有配置，真实文件不入库
├── state/                 ← 状态、缓存、日志，真实文件不入库
└── templates/             ← 可公开的配置模板或示例
```

public starter 可以保留上述口径，但不要创建真实 secret、state 或 cache。

