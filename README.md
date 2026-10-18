# dsh-usage-breakdown

DSH（DeepSeek Harness）插件：**按「会话 × 供应商 × 模型」拆解调用次数与 token 用量**。

一个会话里同时用了 DeepSeek、WorkBuddy、Radeon 好几条路由？面板会告诉你每条路由各被调用了多少次、吃了多少输入/缓存/输出、花了多少钱。

---

## 它解决什么

DSH 本身只告诉你「这一轮花了多少」，`dsh-cost-meter` 告诉你「今天花了多少」。但当你想知道**同一个会话里，究竟是哪个供应商、哪个模型在烧钱**时，这两个都不够。

本插件补的就是这一层：把 cost-meter 的账本重新切成 `会话 → provider:model` 的二维视图，不采集、不写入、不重复计价。

## 功能

- **会话内拆解**：每个会话一张卡片，卡内按 `provider:model` 列出调用次数、输入、缓存读取、输出与成本，横条表示调用量占比
- **当日概览**：会话数、调用次数、输入 token、缓存读取、合计成本
- **日期切换**：可回看账本里任意一天
- **单会话聚焦**：`?session=<id>` 只显示一个会话
- **三种入口**：会话顶部快捷栏、输入框下方、设置 → 插件
- **快捷键**：`Ctrl+Shift+U` 直接打开
- **浮层显示**：面板盖在 DSH 界面里，Esc 或点遮罩关闭

## 前提

需要先安装并运行 **[dsh-cost-meter](https://www.npmjs.com/package/dsh-cost-meter)**，且账本里有数据（`~/.dsh/storages/cost-meter/ledger.json`）。

没有账本时面板会明确提示「找不到账本 + 试过的路径」，而不是空白页。

## 安装

本插件暂未发布到 npm，手动安装：

```bash
# 1. 放进 profile 的 node_modules
git clone https://github.com/qigai74/dsh-usage-breakdown.git \
  ~/.dsh/profiles/desktop/node_modules/dsh-usage-breakdown

# 2. 在 profile 的 cordis.patch.yml 末尾追加
#    （~/.dsh/profiles/desktop/cordis.patch.yml）
- insert:
    - id: dsh-usage-breakdown
      name: dsh-usage-breakdown

# 3. 重启 DSH
```

> Windows 路径形如 `C:\Users\<你>\.dsh\profiles\desktop\node_modules\`。

## 使用

| 操作 | 行为 |
| --- | --- |
| 左键点「会话用量」 | 只看当前会话 |
| 右键点「会话用量」 | 打开完整面板（当天全部会话） |
| `Ctrl+Shift+U` | 直接打开面板 |
| `Esc` / 点遮罩 | 关闭 |

面板直达地址：`http://127.0.0.1:<DSH端口>/plugins/dsh-usage-breakdown/panel`

> DSH 的 web 端口每次重启都会变，建议用界面入口或快捷键，别收藏固定 URL。

## 数据来源

只读 `~/.dsh/storages/cost-meter/ledger.json` 的这段结构：

```
days["YYYY-MM-DD"]
  ├─ calls / cost / input / cacheRead / output     当日合计
  └─ sessions[]
       └─ { id, calls, cost, input, cacheRead, output,
            byProviderModel: {
              "provider:model": { calls, cost, input, cacheRead, output }
            } }
```

`byProviderModel` 的键就是 `provider:model`，这正是本插件展示的核心维度。

## 设计取舍

**为什么不做采集。** 会话日志解析、增量同步、计价、余额查询，`dsh-cost-meter` 已经做好了，而且是它的本职。本插件只做「另一个视角的展示」，好处是：cost-meter 升级不影响它，两个插件的账本不会打架，也不会出现两份互相矛盾的用量数字。

**为什么不改 cost-meter。** 改第三方插件的代码，升级就丢。只读它的公开数据文件，是一份不会随对方发版失效的契约。

**为什么路由只接受 loopback。** 两个 HTTP 路由都校验 `Host` 是 `127.0.0.1` / `localhost` / `[::1]`，避免被任意网页当作数据源读走账本。

## 已知限制

- 只能按天看，不能跨天汇总同一会话（账本是按天的）
- 面板依赖 `dsh-cost-meter` 的账本格式；若其格式变更，需要同步适配
- 入口依赖宿主的 UI 插槽；若某个版本插槽变更导致按钮不显示，面板仍可通过直达 URL 或 `Ctrl+Shift+U` 访问

## 开发

```
lib/index.js    Host 端：读账本 + 两个路由（/data、/panel）+ 面板页
lib/client.js   浏览器端：入口按钮、浮层、快捷键
```

`lib/client.js` 用 `react.createElement` 而不是 jsx runtime —— 后者的 `jsx(type, props, key)` 第三参数是 `key`，把 children 传进去会让组件渲染成空白，且 `apply`/`register` 全都不报错，极难排查。

调试打点：`lib/client.js` 会在 boot / apply / 每个插槽注册处向 `/plugins/dsh-usage-breakdown/ping` 上报，记录落在 `~/.dsh/.session-usage-ping.log`。

## License

MIT
