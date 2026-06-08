# 工具与配置总览

> 本文件面向团队分享，统一“哪些能力建议走 MCP，哪些能力更适合走 skill / runbook / 本地脚本”。
> 本文件不包含账号密码。

---

## 1. 总体原则

- 把“能力接入方式”和“账号密码”分开管理
- 共享文档中只保留配置形态、接入方式、命名口径
- 凭证只放环境变量、本地忽略文件或团队私有凭证系统

---

## 2. 推荐工具分层

| 能力 | 推荐方式 | 说明 |
|------|---------|------|
| MySQL（测试 / 生产只读） | MCP | 适合结构化查询、表结构查看 |
| 禅道 | skill / API 封装 | 适合任务、Bug、用例查询与流转 |
| OA 公告维护 | runbook + 浏览器自动化 | 适合按步骤维护草稿，不把凭证写入共享包 |
| Seafile 用例归档 | runbook | 适合沉淀归档路径、目录规则、归档时机 |
| DingTalk AI 表格 | runbook / 视图说明 | 适合台账维护、周评审视图查看 |
| Redis / SSH / RabbitMQ / Grafana / ELK | skill 优先 | 适合观察取证，不默认做高风险写操作 |

---

## 3. 推荐配置边界

### 3.1 可以共享的

- MCP server 名称
- 工具用途
- 推荐命名
- 需要的环境变量名
- 本地文件布局建议
- 哪些操作默认只读

### 3.2 不应共享的

- 明文密码
- token / cookie
- 个人账号
- 含密钥的本机配置文件
- 个人专属绝对路径

---

## 4. 推荐命名口径

| 能力 | 推荐命名示例 |
|------|-------------|
| 测试库 | `test-db` |
| 生产只读库 | `prod-db` |
| 禅道能力 | `zentao-ops-cli` |
| OA 公告 | `oa-announcement` |
| Seafile 用例归档 | `seafile-testcases` |
| AI 表格 | `dingtalk-aitable` |

---

## 5. 本地接入建议

### 5.0 MCP 模板前置检查

在直接复用 `../config-templates/mcp.template.jsonc` 前，至少确认：

- 本机已安装 `node`
- 本机已有可执行的 MySQL MCP server 脚本目录
- `<mcp-server-root>/mysql-server/index.js` 这条路径已实际存在
- 运行该 server 所需依赖已安装完成
- 本机已准备好测试库 / 生产只读库的环境变量或本地私有配置
- 生产相关连接仅保留只读口径

如果以上任一项不满足，先补环境，再接入模板。

### MySQL

- 推荐走 MCP
- 凭证通过环境变量或本地忽略配置注入
- 只共享模板，不共享真实连接信息

模板见：`../config-templates/mcp.template.jsonc`

### 禅道

- 推荐保留统一 `zentao-ops-cli` skill / CLI 入口
- 共享 base URL、模块口径、字段口径
- 不共享账号密码

### OA

- 推荐以 runbook 或浏览器自动化形式维护
- 共享登录地址、页面定位思路、状态流转口径
- 凭证本地注入

### Seafile

- 共享“什么时候归档、归到哪类目录、目录命名建议”
- 不把个人本机挂载路径写死在共享包里

### DingTalk AI 表格

- 共享表格用途、视图用途、回填口径
- token、appKey、secret 只放本地私有配置

---

## 6. 推荐本地文件布局

```text
<team-assets>/
  agents-share/
  local-secrets/
  local-config/
```

建议：

- `agents-share/`：放共享包正文
- `local-secrets/`：放凭证和本地私有配置
- `local-config/`：放不含密但与本机强绑定的映射

---

## 7. 推荐环境变量示例

```text
TEST_DB_HOST
TEST_DB_PORT
TEST_DB_USER
TEST_DB_PASSWORD
TEST_DB_DATABASE

PROD_DB_HOST
PROD_DB_PORT
PROD_DB_USER
PROD_DB_PASSWORD
PROD_DB_DATABASE
```

团队可按实际习惯替换命名，只要统一即可。

---

## 8. 接入分享包时最常用的两个文件

- `../config-templates/agent-entry.template.md`
- `../config-templates/mcp.template.jsonc`
- `issue-board-update.md`
- `oa-announcement-maintenance.md`
- `seafile-testcase-archival.md`

---

## 9. 默认安全口径

- 生产相关能力默认只读
- 高风险写操作不作为共享包默认动作
- 配置模板允许发给团队，凭证不允许进入版本库
