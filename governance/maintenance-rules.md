# 框架维护规则

> 让这套基础框架长期保持可分享、可扩展、无业务污染。

## 1. 维护目标

- 可直接发给其他人。
- 可被 agent 快速读取。
- 岗位和 SOP 可以持续增长。
- 不混入个人资料、业务资料和临时噪音。

## 2. 分层规则

| 问题 | 放哪里 |
|------|--------|
| 谁负责、什么时候接管 | `roles/` |
| 事情怎么一步步做 | `sops/` |
| 稳定事实、术语、口径 | `knowledge/` |
| 框架怎么维护 | `governance/` |
| 可复制空模板 | `templates/` |
| agent 怎么接入 | `config-templates/` |
| 多宿主接入说明 | `adapters/` |
| 工具说明和脚本索引 | `tools/` |
| 运行态边界说明 | `runtime/` |
| 多 agent 协作协议 | `collab/` |
| 脱敏案例摘要 | `case-studies/` |
| 退役内容和历史方案 | `archive/` |

## 2.1 治理规则索引

| 问题 | 入口 |
|------|------|
| 能不能分享、怎么脱敏 | `privacy-and-share-boundary.md` |
| public / private / internal 怎么分 | `export-profiles.md` |
| 改治理、路由、skill 或同步任务前怎么控风险 | `change-control.md` |
| 定时任务、后台任务、自动同步怎么登记 | `automation-rules.md` |
| skill 怎么创建、共享、退役 | `skill-governance.md` |
| 脚本、工具、adapter 或 peer 能力怎么安全共享 | `capability-publication.md` |
| 什么时候需要多 agent 复核或人工确认 | `multi-agent-review.md` |
| 会话、协作账本、运行态和临时输出怎么留存 | `session-retention.md` |
| 资产目录怎么登记，避免泄露运行态 | `asset-registry.md` |
| 底座是否变乱、变重、重复或偏离分享边界 | `governance-health-check.md` |
| agent 走错路、证据不足或输出偏移怎么纠正 | `self-correction.md` |
| 框架结构是否完整 | `architecture.md`、`integrity-checklist.md` |

## 3. 新增内容前检查

新增文件前先问：

1. 是否已有相同主题？
2. 是否应该补到已有 SOP，而不是新建？
3. 是否需要同步更新 `routing.md`？
4. 是否包含敏感信息或业务资料？
5. 是否能被其他岗位复用？
6. 是否暴露出需要补充的纠偏规则？

## 4. 最小联动

新增或显著修改文件后，至少检查：

- `README.md` 是否需要补目录说明
- `routing.md` 是否需要补路由
- 相关 `roles/*.md` 是否需要补 SOP 链接
- 是否违反 `privacy-and-share-boundary.md`

## 5. 版本建议

- 小改：直接更新对应文件。
- 大改目录结构：补一条决策记录，使用 `templates/decision-record.template.md`。
- 废弃文件：保留替代入口，状态标记为 `deprecated`。

## 6. 禁止事项

- 在多个文件重复定义同一条规则。
- 把岗位卡写成完整流程文档。
- 把 SOP 写成历史流水账。
- 把真实业务资料当示例。
- 把个人本机路径写成团队标准。
- 把凭证密钥或运行态噪音当作可备份框架资产。
