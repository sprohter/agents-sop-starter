# roles/

> 岗位卡目录。每个岗位一份文件，描述这个岗位什么时候接管任务、常用 SOP、输出标准和风险边界。

## 什么时候新增岗位卡

满足任一条件即可新增：

- 这个岗位有稳定职责边界。
- 经常有同类请求需要同一个处理方式。
- 这个岗位需要维护自己的 SOP 列表。
- 路由表中已经多次出现同一类岗位触发词。

## 创建步骤

1. 复制 `../templates/role-card.template.md`。
2. 命名为 `roles/<role-name>.md`。
3. 填写职责、触发词、输入、输出和风险边界。
4. 把岗位触发词补充到 `../routing.md`。
5. 后续新增 SOP 时，把 SOP 链接补回岗位卡。

## 命名建议

使用短横线命名：

```text
roles/product.md
roles/qa.md
roles/development.md
roles/operations.md
roles/customer-support.md
roles/data-analysis.md
```

以上只是示例命名，不代表必须创建这些岗位。

## 岗位卡不放什么

- 不放完整 SOP 步骤。
- 不放账号密钥。
- 不放业务数据样例。
- 不放一次性任务记录。

岗位卡只做“入口”和“边界”，具体流程写到 `sops/`。

