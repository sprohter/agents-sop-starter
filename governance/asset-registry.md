# 资产目录规则

> 资产目录用于登记稳定框架资产，不用于保存 secret、运行态或原始证据。

## 1. 目标

资产目录回答：

- 现在有哪些文件、skill、SOP、模板或自动化？
- 资产 owner 或目标受众是谁？
- 它是 public-safe、private-only、draft、active 还是 deprecated？
- 维护者更新时应该看哪里？

资产目录不回答：

- 真实密码、token、cookie、私钥、连接串是什么。
- 当前运行态缓存值是什么。
- 某个私有事故、客户案例或业务现场发生了什么。

## 2. 最小字段

团队需要资产目录时，使用下表即可：

| Asset | Type | Status | Visibility | Owner | Notes |
|-------|------|--------|------------|-------|-------|
| `<path-or-name>` | `<sop/skill/template/governance/automation>` | `<draft/active/deprecated>` | `<public/private/internal>` | `<role-or-team>` | `<short-note>` |

## 3. Visibility 口径

| 值 | 含义 |
|----|------|
| `public` | 敏感扫描后可进入 public starter |
| `internal` | 只适合可信组织或团队内部包 |
| `private` | 个人或本地使用，但仍不能含凭证 |
| `runtime` | 生成态或状态型内容；只做抽象引用，不登记真实值 |

## 4. 应登记什么

登记稳定框架资产：

- 核心入口文件。
- active SOP 和岗位卡。
- 可复用 skill。
- 共享模板。
- 治理规则。
- 已明确 owner、schedule、state、logs、stop method 的自动化。

不登记原始运行态：

- 日志内容。
- 缓存文件。
- 浏览器或会话状态。
- 生成报告，除非它已经沉淀成稳定模板。
- secret 位置之外的真实敏感值；位置也应写成 `<local-secret-store>` 这类占位符。

## 5. 维护触发

以下情况需要更新资产目录或索引：

- 新增或退役 public 资产。
- skill 生命周期变化。
- 自动化创建、暂停或删除。
- 文件移动导致路由或索引可能失效。

