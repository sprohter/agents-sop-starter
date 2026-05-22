# Agent 入口模板

> 把本段复制到本地 agent 的入口文件中，并替换路径占位符。

## Agents SOP Framework

本机已接入通用 SOP 框架：

```text
<agents-sop-root>
```

执行任务前默认读取：

1. `<agents-sop-root>/README.md`
2. `<agents-sop-root>/contract.md`
3. `<agents-sop-root>/routing.md`

然后根据 `routing.md` 命中结果读取：

- `roles/`
- `sops/`
- `knowledge/`
- `governance/`

通用要求：

- 先结论后依据。
- 不写入账号、密码、token、cookie、个人路径或真实业务资料。
- 新增岗位或 SOP 后，同步更新 `routing.md`。
- 稳定经验按 `governance/sedimentation.md` 沉淀。

