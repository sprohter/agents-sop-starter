# 框架结构说明

> 本文件说明 agents-sop-starter 的分层结构、依赖方向和公开分享边界。

## 1. 分层总览

| 层 | 目录 / 文件 | 职责 |
|----|-------------|------|
| 入口层 | `README.md`、`contract.md`、`routing.md` | 导航、行为边界、任务入口 |
| 执行层 | `roles/`、`sops/` | 岗位接管和标准流程执行 |
| 知识层 | `knowledge/` | 稳定事实、术语、口径和经验卡 |
| 治理层 | `governance/` | 维护、沉淀、纠偏、隐私、导出、变更、自动化 |
| 模板层 | `templates/` | 创建岗位卡、SOP、知识卡、路由项和决策记录 |
| 接入层 | `config-templates/`、`adapters/` | 本地 agent、IDE、CLI 如何接入底座 |
| 工具层 | `tools/` | 可复用工具的索引和使用边界 |
| 运行态边界 | `runtime/` | 说明缓存、日志、状态、本机配置不进入分享仓 |
| 协作层 | `collab/` | 多 agent 或多人协作的交接和复核口径 |
| 案例层 | `case-studies/` | 脱敏案例摘要、复盘模板和训练样例 |
| 归档层 | `archive/` | 退役内容、历史方案和替代入口说明 |

## 2. 依赖方向

默认依赖方向：

```text
用户请求
  -> routing.md
  -> roles/ 或 sops/
  -> knowledge/、templates/、tools/
  -> 输出结论
  -> governance/ 处理缺口、纠偏和维护
```

不要让低层内容反向定义上层规则：

- SOP 可以引用 knowledge，但不要在 knowledge 中隐藏流程入口。
- skill / tools 可以支撑 SOP，但不要绕过 `contract.md` 的安全边界。
- runtime 只说明边界，不保存真实运行态。
- archive 只保留历史，不作为默认入口。

## 3. 最小可用与完整底座

最小可用底座：

- `README.md`
- `contract.md`
- `routing.md`
- `roles/`
- `sops/`
- `knowledge/`
- `governance/`
- `templates/`
- `config-templates/`

更完整的可维护底座建议再包含：

- `adapters/`
- `tools/`
- `runtime/`
- `collab/`
- `case-studies/`
- `archive/`

这些扩展目录在 public starter 中默认只放 README、模板或抽象规则，不放真实实现、凭证、日志或业务证据。

## 4. public 分享边界

public starter 只表达结构和通用方法：

- 可以写目录职责、流程骨架、模板、治理规则。
- 可以写脱敏测试 SOP、问题反馈分析 SOP、公开安全工具说明。
- 不写真实系统、真实账号、真实链接、业务数据、运行态缓存或内部事故证据。

如果一个内容既有复用价值又含敏感细节，先抽象成通用规则，再决定是否进入 public starter。

