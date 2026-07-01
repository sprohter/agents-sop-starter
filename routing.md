# 统一任务路由

> 本文件是任务从请求进入 SOP 的统一入口。

## 默认原则

1. 先匹配具体触发词。
2. 再匹配岗位。
3. 再匹配通用 SOP。
4. 仍无法匹配时，先输出澄清问题，并建议新增路由。

## 通用路由表

| 触发词 / 场景 | 入口文件 | 说明 |
|---------------|----------|------|
| 新增岗位、岗位职责、岗位边界、岗位 SOP | `roles/README.md` | 创建或维护岗位卡 |
| 新建 SOP、流程、标准作业、操作步骤、处理规范 | `sops/README.md` | 创建或维护 SOP |
| 框架结构、目录说明、完整性、底座缺什么 | `governance/architecture.md` | 理解框架分层 |
| 检查框架完整性、starter 是否够完整、缺哪些基础件 | `governance/integrity-checklist.md` | 完整性清单 |
| 沉淀经验、复盘、知识库、规则沉淀、口径沉淀 | `governance/sedimentation.md` | 判断沉淀位置和写法 |
| 查找已有经验、术语、口径、案例摘要 | `knowledge/README.md` | 读取知识卡 |
| 路由不准、触发词冲突、任务不知道读哪里 | `governance/routing-maintenance.md` | 维护路由表 |
| agent 走错路、证据不足、结论不稳、输出偏移、遗漏规则 | `governance/self-correction.md` | 自动纠偏机制 |
| 分享前检查、脱敏、能不能外发 | `governance/privacy-and-share-boundary.md` | 检查分享边界 |
| public 分享、private 备份、内部包、导出 profile、旧分享仓 | `governance/export-profiles.md` | 按可见性选择导出范围 |
| 修改治理规则、框架变更、推送、删除、合并、force-with-lease | `governance/change-control.md` | 变更分级和外部写入门禁 |
| 定时任务、自动同步、后台任务、watchdog、不要新开会话 | `governance/automation-rules.md` | 自动化登记和静默运行规则 |
| 创建 skill、共享 skill、skill 生命周期、技能退役 | `governance/skill-governance.md` | 技能治理规则 |
| 脚本能力、工具能力、adapter 能力、能力发布、capability、公开能力边界 | `governance/capability-publication.md` | 能力发布与工具边界 |
| 多 agent 协作、复核、reviewer、worker、人工确认、高影响动作分级 | `governance/multi-agent-review.md` | 协作复核触发和降级规则 |
| 会话留存、运行态留存、聊天记录、临时输出、缓存清理、协作账本 | `governance/session-retention.md` | 会话与运行态留存规则 |
| 底座体检、治理体检、季度检查、文档变乱、重复资产、归档候选 | `governance/governance-health-check.md` | 周期治理检查清单 |
| adapter、Codex 接入、Claude 接入、多宿主 | `adapters/README.md` | 接入层说明 |
| 工具索引、脚本说明、工具卡 | `tools/README.md` | 工具层说明 |
| runtime、缓存、日志、本机配置、运行态噪音 | `runtime/README.md` | 运行态边界 |
| 多 agent 协作、交接、复核 | `collab/README.md` | 协作骨架 |
| LAN P2P、P2P peer、trusted peer、同事 agent 接入、可信 agent 互通 | `mesh/p2p-peer-onboarding-card.md` | 少量可信 peer 接入卡 |
| 案例、复盘、脱敏样例 | `case-studies/README.md` | 案例骨架 |
| 归档、退役、历史方案 | `archive/README.md` | 归档规则 |
| 资产登记、治理面板、文件状态、public/private 标记 | `governance/asset-registry.md` | 轻量资产目录规则 |
| 框架怎么维护、目录怎么放、版本怎么管 | `governance/maintenance-rules.md` | 框架治理 |
| 本地 agent 接入、入口文件、配置样板 | `config-templates/agent-entry.template.md` | 接入宿主 agent |

## 岗位路由占位区

> 团队接入后在这里追加岗位路由。

| 岗位 / 触发词 | 入口文件 | 备注 |
|---------------|----------|------|
| 测试、QA、测试负责人、质量负责人 | `roles/qa.example.md` | 内置测试岗位示例 |
| `<role-name>`、`<role-trigger>` | `roles/<role-name>.md` | 复制 `templates/role-card.template.md` 创建 |

## SOP 路由占位区

> 团队接入后在这里追加具体 SOP 路由。

| 场景 / 触发词 | 入口文件 | 备注 |
|---------------|----------|------|
| 功能测试、测试执行、验收、Bug 回归 | `sops/qa/functional-test-sop.example.md` | 内置测试 SOP 示例 |
| 问题反馈、问题分析、线上反馈分诊、缺陷分析 | `sops/qa/issue-feedback-analysis-sop.example.md` | 内置测试 SOP 示例 |
| 反馈自动建单、反馈转缺陷、自动创建缺陷、issue tracker 写入 | `sops/qa/business-feedback-to-zentao-sop.example.md` | 内置公开安全示例 |
| `<scenario>`、`<trigger>` | `sops/<domain>/<sop-name>.md` | 复制 `templates/sop.template.md` 创建 |

## 路由输出要求

命中路由后，agent 应在内部按以下顺序读取：

1. 命中的岗位卡或 SOP
2. SOP 引用的知识卡
3. 相关治理规则

对用户输出时，不必展示完整读取过程，只给结论、依据、风险和下一步。

## 路由冲突处理

如果一个请求命中多个入口：

1. 优先选择更具体的 SOP。
2. 若 SOP 同级冲突，选择与用户当前对象最接近的岗位。
3. 若仍冲突，先说明冲突点并请求确认。
4. 处理完成后，在 `governance/routing-maintenance.md` 记录是否需要补路由。
