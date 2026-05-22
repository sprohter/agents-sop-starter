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
| 沉淀经验、复盘、知识库、规则沉淀、口径沉淀 | `governance/sedimentation.md` | 判断沉淀位置和写法 |
| 查找已有经验、术语、口径、案例摘要 | `knowledge/README.md` | 读取知识卡 |
| 路由不准、触发词冲突、任务不知道读哪里 | `governance/routing-maintenance.md` | 维护路由表 |
| 分享前检查、脱敏、能不能外发 | `governance/privacy-and-share-boundary.md` | 检查分享边界 |
| 框架怎么维护、目录怎么放、版本怎么管 | `governance/maintenance-rules.md` | 框架治理 |
| 本地 agent 接入、入口文件、配置样板 | `config-templates/agent-entry.template.md` | 接入宿主 agent |

## 岗位路由占位区

> 团队接入后在这里追加岗位路由。

| 岗位 / 触发词 | 入口文件 | 备注 |
|---------------|----------|------|
| `<role-name>`、`<role-trigger>` | `roles/<role-name>.md` | 复制 `templates/role-card.template.md` 创建 |

## SOP 路由占位区

> 团队接入后在这里追加具体 SOP 路由。

| 场景 / 触发词 | 入口文件 | 备注 |
|---------------|----------|------|
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

