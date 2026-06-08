# 治理规则索引

> 这里放框架级规则，用来保证 starter 长期安全、可复用、可维护。

## 推荐入口

| 场景 | 先读文件 |
|------|----------|
| 判断内容能不能分享 | `privacy-and-share-boundary.md` |
| 判断内容应该进 public、private 还是内部包 | `export-profiles.md` |
| 修改治理、路由、skill、自动化或共享结构 | `change-control.md` |
| 创建定时任务、后台同步或监控 | `automation-rules.md` |
| 创建、共享或退役 skill | `skill-governance.md` |
| 维护触发词和入口路由 | `routing-maintenance.md` |
| 判断经验应沉淀到哪里 | `sedimentation.md` |
| 维护资产目录且避免泄露敏感信息 | `asset-registry.md` |
| 维护 starter 目录结构 | `maintenance-rules.md` |

## 基线原则

- 对外分享内容保持骨架级、通用化、去业务化。
- 私人备份可以更完整，但仍不保存凭证密钥和运行态噪音。
- 治理变更要同步检查 `routing.md`，确保 agent 能找到新规则。
- 任何规则都不保存密码、token、cookie、私钥、原始日志、本地缓存或会话状态。

