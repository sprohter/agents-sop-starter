# Adapters

> 这里说明不同 agent、IDE、CLI 或桌面环境如何接入本 starter。

## 放什么

- Codex / Claude / 其他 agent 的入口说明。
- 本地入口文件应如何引用 `README.md`、`contract.md`、`routing.md`。
- 多宿主差异：哪些规则通用，哪些配置只属于某个宿主。

## 不放什么

- 真实账号、token、cookie、私钥。
- 真实本机绝对路径。
- 含敏感信息的 MCP、浏览器、SSH 或 API 配置。
- 某个团队内部专用 adapter 的完整私有配置。

## 推荐写法

新增 adapter 文档时，至少说明：

1. 适用宿主。
2. 入口文件位置。
3. 需要读取的 starter 三件套。
4. 本机私有配置应放在哪里。
5. 不支持或需要人工确认的动作。

