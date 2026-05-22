# Agents SOP Starter

> 通用、去业务化、可分享的岗位 SOP 基础框架。
> 目标：让不同岗位能在同一套规则下创建、执行、沉淀自己的 SOP。

## 结论

这是一套最小可用框架，不包含任何业务资料、客户资料、账号密钥或个人路径。

它只保留三类基础能力：

| 能力 | 文件 |
|------|------|
| 通用规则 | `contract.md` |
| 任务路由 | `routing.md` |
| SOP 与经验沉淀 | `roles/`、`sops/`、`knowledge/`、`governance/` |

## 目录结构

```text
agents-sop-starter/
├── README.md
├── contract.md
├── routing.md
├── roles/
│   └── README.md
├── sops/
│   └── README.md
├── knowledge/
│   └── README.md
├── governance/
│   ├── maintenance-rules.md
│   ├── privacy-and-share-boundary.md
│   ├── routing-maintenance.md
│   └── sedimentation.md
├── templates/
│   ├── decision-record.template.md
│   ├── knowledge-card.template.md
│   ├── role-card.template.md
│   ├── route-entry.template.md
│   └── sop.template.md
└── config-templates/
    ├── agent-entry.template.md
    └── local-config.example.jsonc
```

## 推荐读取顺序

1. `README.md`
2. `contract.md`
3. `routing.md`
4. 按任务读取对应 `roles/`、`sops/`、`knowledge/` 或 `governance/`

## 最小使用流程

1. 复制整个 `agents-sop-starter/` 到团队共享目录或项目本地 `.agents/` 下。
2. 用 `templates/role-card.template.md` 创建岗位卡，放到 `roles/<role-name>.md`。
3. 用 `templates/sop.template.md` 创建 SOP，放到 `sops/<domain>/<sop-name>.md`。
4. 在 `routing.md` 增加触发词和入口文件。
5. 执行后把稳定经验写入 `knowledge/`，把规则调整写入 `governance/`。

## 不包含什么

- 真实业务流程细节
- 客户、订单、项目、系统、库表、接口等业务资料
- 账号、密码、token、cookie、证书、连接串
- 个人本机绝对路径
- 一次性排查记录、临时脚本和历史噪音

## 核心工作闭环

```text
用户请求
  ↓
routing.md 定位入口
  ↓
读取岗位卡 roles/
  ↓
执行 SOP sops/
  ↓
输出结论、证据、风险、下一步
  ↓
稳定经验沉淀到 knowledge/
  ↓
必要时更新 routing.md / governance/
```

## 适合谁用

适合任何需要把个人经验整理为岗位 SOP 的团队，例如：

- 产品
- 测试
- 开发
- 运维
- 客服
- 数据分析
- 项目管理

岗位只需要各自补充自己的 SOP 内容，不需要改框架结构。

