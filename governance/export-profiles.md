# 导出 Profile 规则

> public 分享、private 备份、内部包必须分 profile 管理，不要用一个仓库承接所有内容。

## 1. Profile 定义

| Profile | 可见性 | 用途 | 默认规则 |
|---------|--------|------|----------|
| `public-starter` | 公开或部门全员可见 | 骨架级 SOP 框架、通用流程、公开安全 skill | 严格 allowlist，只放通用内容 |
| `private-backup` | 个人私有仓 | 在其他机器恢复本地 agent 框架 | 内容可更全，但不保存凭证和运行态噪音 |
| `internal-package` | 受控团队内部包 | 在可信团队内分享可复用 SOP | 允许脱敏后的团队流程，必须带说明策略 |
| `legacy-share` | 历史旧分享目标 | 兼容历史用途 | 默认停用，优先迁到 `public-starter` |

不要把 public 仓同时当作 starter 和 private backup。

## 2. 内容分级

| 级别 | 示例 | Public Starter | Private Backup |
|------|------|----------------|----------------|
| C0 凭证密钥 | 密码、token、cookie、私钥、连接串 | 禁止 | 禁止 |
| C1 运行态噪音 | 日志、缓存、会话、临时导出、生成报告 | 禁止 | 禁止 |
| C2 敏感上下文 | 客户、内部链接、私有主机名、原始事故证据 | 禁止 | 强脱敏后谨慎，默认避免 |
| C3 工作流程 | SOP、写作规范、测试方法、问题分诊方法 | 泛化后允许 | 去除 C0/C1 后允许 |
| C4 框架资产 | 路由、治理、模板、公开安全 skill card | 允许 | 允许 |
| C5 通用思想 | 架构模式、可复用清单、抽象示例 | 允许 | 允许 |

## 3. Public Starter Allowlist

public starter 可以包含：

- 框架结构：`contract.md`、`routing.md`、`roles/`、`sops/`、`knowledge/`、`governance/`、`templates/`。
- 通用 QA SOP：功能测试、问题反馈分析、修复验证、用例设计。
- 公开安全工具 skill：缺陷写作规范、issue tracker 写入规范、协作表格操作模式；其中 URL、凭证、ID 和运行态必须用占位符。
- 保持 starter 干净可分享的治理规则。

public starter 禁止包含：

- 真实账号、密码、token、cookie、私钥、证书、连接串。
- 运行态、日志、本地缓存、含敏感信息的截图、一次性证据包。
- 真实内部链接、群 ID、文档 ID、服务器路径、IP、私有系统标识。
- 业务数据、客户数据、订单数据、事故细节，或能识别组织的截图。

## 4. Private Backup 规则

private backup 用于恢复，不是 secret 仓库。

可以包含：

- 更完整的本地框架文档。
- skills、templates、公开安全脚本、脱敏配置示例。
- 使用占位符的运行时配置模板。

仍然禁止：

- 凭证材料。
- 运行态噪音。
- 原始日志、原始报告、缓存目录、浏览器状态、会话状态。
- 一旦 private 仓泄露就需要轮换凭证的文件。

## 5. 导出流程

1. 先选择唯一 profile。
2. 通过 allowlist 生成 export tree。
3. 执行敏感内容扫描。
4. 复核 changed paths 和 commit 元数据。
5. 只有目标和历史策略清楚后才 push。
6. push 后回读远端分支、文件树和最新提交元数据。

