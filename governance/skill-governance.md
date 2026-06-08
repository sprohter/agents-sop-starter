# Skill 治理规则

> Skill 是按需激活的可复用能力卡。它应该聚焦、公开安全、容易路由。

## 1. 什么适合做成 Skill

当 agent 需要重复使用某个能力时，可以做成 skill，例如：

- 创建或更新 issue tracker 记录。
- 按统一风格编写缺陷或反馈。
- 操作公开安全的协作表格流程。
- 执行固定的问题分析或验证 playbook。

不适合做成 skill：

- 一次性任务记录。
- 原始项目证据。
- 凭证、运行时配置、日志、截图。
- 已经更适合放在 `sops/` 的大型流程。

## 2. 最小结构

```text
skills/<skill-name>/
└── SKILL.md
```

推荐可选结构：

```text
skills/<skill-name>/
├── README.md
├── references/
└── scripts/
```

规则：

- skill 名称使用 `kebab-case`。
- `SKILL.md` 要足够短，方便 agent 快速读取。
- 长参考资料放到 `references/`。
- 可执行 helper 放到 `scripts/`，并说明输入要求。
- URL、凭证、ID、本机路径统一用占位符。

## 3. 生命周期

| 阶段 | 含义 | 默认动作 |
|------|------|----------|
| `draft` | 新建或未充分验证 | 手动使用，收集反馈 |
| `active` | 稳定且可复用 | 补路由和索引，保持示例有效 |
| `deprecated` | 已替代或不再推荐 | 保留替代入口，从默认路由移除 |

## 4. Public 分享规则

public skill 可以描述：

- 通用工作流。
- 输入字段和输出格式。
- 写作规范。
- 使用占位符的安全 API 调用模式。

public skill 禁止包含：

- 真实凭证、cookie、token、私钥、连接串。
- 真实工作区路径、内部主机、私有文档链接、群 ID。
- 原始业务示例、客户数据、订单数据、事故证据。

## 5. 路由与评审

新增或修改 skill 时：

1. 先判断是否能更新已有 skill。
2. 如果 public 索引变化，同步更新 `skills/README.md`。
3. 如果需要从用户语言命中，更新 `routing.md`。
4. 分享前做敏感内容扫描。
5. 未验证假设标为 `draft`，不要当稳定规则发布。

