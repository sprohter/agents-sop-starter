# 框架完整性检查清单

> 用于检查 starter 是否具备可分享、可扩展、可维护的基本结构。

## 1. 必备入口

| 检查项 | 通过标准 |
|--------|----------|
| `README.md` | 说明用途、目录结构、读取顺序和示例入口 |
| `contract.md` | 说明输出、证据、安全、高风险动作和交付自检 |
| `routing.md` | 能把常见请求导向岗位、SOP、knowledge 或 governance |

## 2. 执行与知识

| 检查项 | 通过标准 |
|--------|----------|
| `roles/` | 至少有 README 和一个岗位示例 |
| `sops/` | 至少有 README 和一个 SOP 示例 |
| `knowledge/` | 至少有 README 和一组知识卡示例 |
| `templates/` | 至少包含 SOP、岗位卡、知识卡、路由项和决策记录模板 |

## 3. 治理覆盖

| 能力 | 推荐文件 |
|------|----------|
| 结构说明 | `governance/architecture.md` |
| 完整性检查 | `governance/integrity-checklist.md` |
| 维护规则 | `governance/maintenance-rules.md` |
| 沉淀规则 | `governance/sedimentation.md` |
| 自动纠偏 | `governance/self-correction.md` |
| 分享边界 | `governance/privacy-and-share-boundary.md` |
| 导出 profile | `governance/export-profiles.md` |
| 变更控制 | `governance/change-control.md` |
| 自动化规则 | `governance/automation-rules.md` |
| skill 治理 | `governance/skill-governance.md` |
| 资产目录 | `governance/asset-registry.md` |
| 路由维护 | `governance/routing-maintenance.md` |

## 4. 扩展骨架

| 目录 | 最小要求 |
|------|----------|
| `adapters/` | 有 README，说明多宿主接入边界 |
| `tools/` | 有 README，说明工具索引和凭证边界 |
| `runtime/` | 有 README，说明运行态不入库 |
| `collab/` | 有 README，说明协作、交接和复核 |
| `case-studies/` | 有 README，说明只能放脱敏案例摘要 |
| `archive/` | 有 README，说明退役内容和替代入口 |

## 5. 安全检查

分享前至少确认：

- 不含密码、token、cookie、私钥、连接串。
- 不含真实内部链接、群 ID、服务器路径、IP、个人路径。
- 不含客户、订单、业务数据、事故现场、原始日志。
- 不含运行态缓存、临时导出、浏览器状态或会话状态。
- Git author / committer 元数据不暴露个人或组织敏感信息。

## 6. 收口检查

修改 starter 后至少确认：

1. README 目录结构仍准确。
2. 新增入口已补 `routing.md`。
3. 新增治理文件已补 `governance/README.md`。
4. public export dry-run 敏感扫描为 0。
5. push 后已回读远端分支、文件树和最新提交元数据。
