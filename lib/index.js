/**
 * dsh-usage-breakdown —— 会话 × 供应商 × 模型 的用量面板。
 *
 * 数据来源是 dsh-cost-meter 的账本（只读），本插件不采集、不写入、不改任何
 * 现有插件：cost-meter 负责采集与计价，这里只做另一视角的展示。
 *
 * 两个路由：
 *   GET /plugins/dsh-usage-breakdown/data?day=YYYY-MM-DD   账本快照
 *   GET /plugins/dsh-usage-breakdown/panel                 面板页面
 */

import fs from "node:fs";
import path from "node:path";
import os from "node:os";

export const name = "dsh-usage-breakdown";

const DATA_PATH = "/plugins/dsh-usage-breakdown/data";
const PANEL_PATH = "/plugins/dsh-usage-breakdown/panel";
const PING_PATH = "/plugins/dsh-usage-breakdown/ping";

/** 前端是否真的被加载了 —— 浏览器半边启动时会打一次，落盘可查。 */
const PING_LOG = path.join(os.homedir(), ".dsh", ".session-usage-ping.log");

function pingHandler(req, res) {
	try {
		let query = "";
		try {
			query = new URL(req.url ?? "/", "http://127.0.0.1").search.replace(/^\?/u, "");
		} catch {}
		fs.appendFileSync(PING_LOG, `${new Date().toISOString()} ${query === "" ? "stage=?" : query}\n`);
	} catch {}
	res.writeHead(204, { "Cache-Control": "no-store" });
	res.end();
}

/** 账本可能落在 DSH_HOME 或 ~/.dsh 下，两个都试。 */
function ledgerCandidates() {
	const list = [];
	const env = process.env.DSH_HOME;
	if (typeof env === "string" && env !== "") list.push(path.join(env, "storages", "cost-meter", "ledger.json"));
	list.push(path.join(os.homedir(), ".dsh", "storages", "cost-meter", "ledger.json"));
	return list;
}

function readLedger() {
	for (const file of ledgerCandidates()) {
		try {
			if (!fs.existsSync(file)) continue;
			return { file, ledger: JSON.parse(fs.readFileSync(file, "utf8")) };
		} catch {
			/* 换下一个候选 */
		}
	}
	return void 0;
}

/** 把账本压成面板需要的形状：只取用得到的字段，不把整个账本发给浏览器。 */
function snapshot(day) {
	const found = readLedger();
	if (found === void 0) return { ok: false, reason: "ledger-missing", tried: ledgerCandidates() };
	const days = Object.keys(found.ledger.days ?? {}).sort();
	if (days.length === 0) return { ok: false, reason: "ledger-empty", source: found.file };
	const target = typeof day === "string" && found.ledger.days[day] !== void 0 ? day : days[days.length - 1];
	const entry = found.ledger.days[target];
	const sessions = (entry.sessions ?? []).map((session) => ({
		id: String(session.id ?? ""),
		at: session.at ?? 0,
		calls: session.calls ?? 0,
		cost: session.cost ?? 0,
		input: session.input ?? 0,
		output: session.output ?? 0,
		cacheRead: session.cacheRead ?? 0,
		cacheWrite: session.cacheWrite ?? 0,
		reasoning: session.reasoning ?? 0,
		routes: Object.entries(session.byProviderModel ?? {}).map(([route, m]) => ({
			route,
			calls: m.calls ?? 0,
			cost: m.cost ?? 0,
			input: m.input ?? 0,
			output: m.output ?? 0,
			cacheRead: m.cacheRead ?? 0,
			cacheWrite: m.cacheWrite ?? 0,
			reasoning: m.reasoning ?? 0
		})).sort((a, b) => b.cost - a.cost || b.calls - a.calls)
	})).sort((a, b) => b.cost - a.cost || b.calls - a.calls);
	return {
		ok: true,
		source: found.file,
		days,
		day: target,
		totals: {
			calls: entry.calls ?? 0,
			cost: entry.cost ?? 0,
			input: entry.input ?? 0,
			output: entry.output ?? 0,
			cacheRead: entry.cacheRead ?? 0,
			sessions: sessions.length
		},
		sessions
	};
}

function json(res, status, body) {
	const payload = JSON.stringify(body);
	res.writeHead(status, {
		"Content-Type": "application/json; charset=utf-8",
		"Content-Length": Buffer.byteLength(payload),
		"Cache-Control": "no-store"
	});
	res.end(payload);
}

function html(res, status, body) {
	res.writeHead(status, {
		"Content-Type": "text/html; charset=utf-8",
		"Cache-Control": "no-store"
	});
	res.end(body);
}

/** 只接受本机回环来源，避免被任意网页当数据源读走账本。 */
function loopbackOnly(req) {
	const host = req.headers.host;
	if (typeof host !== "string") return false;
	const hostname = host.replace(/:\d+$/u, "").toLowerCase();
	return hostname === "127.0.0.1" || hostname === "localhost" || hostname === "[::1]";
}

function dataHandler(req, res) {
	if (req.method !== "GET") return json(res, 405, { error: "method not allowed" });
	if (!loopbackOnly(req)) return json(res, 403, { error: "loopback only" });
	let day;
	try {
		day = new URL(req.url ?? "/", "http://127.0.0.1").searchParams.get("day") ?? void 0;
	} catch {
		day = void 0;
	}
	try {
		return json(res, 200, snapshot(day));
	} catch (error) {
		return json(res, 500, { error: String(error?.message ?? error) });
	}
}

function panelHandler(req, res) {
	if (req.method !== "GET") return json(res, 405, { error: "method not allowed" });
	if (!loopbackOnly(req)) return json(res, 403, { error: "loopback only" });
	return html(res, 200, PANEL_HTML);
}

export function apply(ctx) {
	ctx.inject(["webServer"], (webCtx) => {
		webCtx.effect(() => {
			const disposers = [];
			try {
				disposers.push(webCtx.webServer.register({ kind: "exact", path: DATA_PATH, handler: dataHandler }));
			} catch (error) {
				ctx.logger?.warn(`dsh-usage-breakdown: data route failed: ${error?.message ?? error}`);
			}
			try {
				disposers.push(webCtx.webServer.register({ kind: "exact", path: PANEL_PATH, handler: panelHandler }));
			} catch (error) {
				ctx.logger?.warn(`dsh-usage-breakdown: panel route failed: ${error?.message ?? error}`);
			}
			try {
				disposers.push(webCtx.webServer.register({ kind: "exact", path: PING_PATH, handler: pingHandler }));
			} catch (error) {
				ctx.logger?.warn(`dsh-usage-breakdown: ping route failed: ${error?.message ?? error}`);
			}
			return () => {
				for (const dispose of disposers) try {
					dispose();
				} catch {}
			};
		});
	});
}

const PANEL_HTML = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>会话用量</title>
<style>
  :root {
    --bg: #f7f7f5; --panel: #ffffff; --line: rgba(0,0,0,.10); --line-soft: rgba(0,0,0,.06);
    --fg: #1c1c1a; --fg2: #5f5e5a; --fg3: #8c8a84;
    --accent: #185fa5; --bar: #b5d4f4;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #1a1a19; --panel: #242423; --line: rgba(255,255,255,.14); --line-soft: rgba(255,255,255,.08);
      --fg: #f0efec; --fg2: #b4b2a9; --fg3: #888780; --accent: #85b7eb; --bar: #185fa5;
    }
  }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg); color: var(--fg); font: 13px/1.6 -apple-system, "Segoe UI", "Microsoft YaHei", sans-serif; }
  .wrap { max-width: 1080px; margin: 0 auto; padding: 24px 20px 60px; }
  header { display: flex; align-items: baseline; gap: 14px; flex-wrap: wrap; margin-bottom: 18px; }
  h1 { font-size: 17px; font-weight: 500; margin: 0; }
  .sub { color: var(--fg3); font-size: 12px; }
  select, button { font: inherit; color: var(--fg); background: var(--panel); border: 1px solid var(--line); border-radius: 8px; padding: 5px 10px; cursor: pointer; }
  .cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; margin-bottom: 20px; }
  .card { background: var(--panel); border: 1px solid var(--line-soft); border-radius: 12px; padding: 12px 14px; }
  .card .k { color: var(--fg3); font-size: 12px; }
  .card .v { font-size: 20px; font-weight: 500; margin-top: 2px; font-variant-numeric: tabular-nums; }
  .session { background: var(--panel); border: 1px solid var(--line-soft); border-radius: 12px; margin-bottom: 14px; overflow: hidden; }
  .s-head { display: flex; align-items: baseline; gap: 12px; padding: 12px 16px; border-bottom: 1px solid var(--line-soft); flex-wrap: wrap; }
  .s-id { font-family: ui-monospace, Consolas, monospace; font-size: 12px; color: var(--fg2); }
  .s-meta { margin-left: auto; color: var(--fg2); font-size: 12px; font-variant-numeric: tabular-nums; }
  table { width: 100%; border-collapse: collapse; }
  th, td { text-align: right; padding: 7px 12px; font-variant-numeric: tabular-nums; white-space: nowrap; }
  th { color: var(--fg3); font-weight: 400; font-size: 12px; border-bottom: 1px solid var(--line-soft); }
  th:first-child, td:first-child { text-align: left; white-space: normal; }
  tbody tr + tr td { border-top: 1px solid var(--line-soft); }
  .route { font-family: ui-monospace, Consolas, monospace; font-size: 12px; }
  .bar { height: 4px; border-radius: 2px; background: var(--bar); margin-top: 5px; min-width: 2px; }
  .empty { background: var(--panel); border: 1px solid var(--line-soft); border-radius: 12px; padding: 28px; text-align: center; color: var(--fg2); }
  .empty code { font-family: ui-monospace, Consolas, monospace; font-size: 12px; color: var(--fg); }
  .hint { color: var(--fg3); font-size: 12px; margin-top: 22px; }
</style>
</head>
<body>
<div class="wrap">
  <header>
    <h1>会话用量</h1>
    <span class="sub">按 会话 × 供应商 × 模型 拆分，数据只读自 cost-meter 账本</span>
    <span class="sub" id="scope"></span>
    <span style="margin-left:auto"></span>
    <select id="day"></select>
    <button id="reload">刷新</button>
  </header>
  <div class="cards" id="cards"></div>
  <div id="list"></div>
  <p class="hint" id="hint"></p>
</div>
<script>
const fmt = (v) => {
  if (!v) return '0';
  if (v >= 1e6) return (v / 1e6).toFixed(2) + 'M';
  if (v >= 1e3) return (v / 1e3).toFixed(1) + 'k';
  return String(v);
};
const money = (v) => '¥' + (v || 0).toFixed(3);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

async function load(day) {
  const url = '/plugins/dsh-usage-breakdown/data' + (day ? '?day=' + encodeURIComponent(day) : '');
  const res = await fetch(url, { cache: 'no-store' });
  const data = await res.json();
  const daySel = document.getElementById('day');
  const list = document.getElementById('list');
  const cards = document.getElementById('cards');
  const hint = document.getElementById('hint');

  if (!data.ok) {
    cards.innerHTML = '';
    daySel.style.display = 'none';
    const why = data.reason === 'ledger-missing'
      ? '没有找到账本：<code>' + esc((data.tried || [])[0] || '') + '</code><br>先安装并运行 dsh-cost-meter 插件，产生一次对话后再回来。'
      : '账本存在但还没有数据。';
    list.innerHTML = '<div class="empty">' + why + '</div>';
    hint.textContent = '';
    return;
  }

  daySel.style.display = '';
  daySel.innerHTML = data.days.slice().reverse().map((d) => '<option value="' + d + '"' + (d === data.day ? ' selected' : '') + '>' + d + '</option>').join('');

  const focus = new URLSearchParams(location.search).get('session');
  const visible = focus ? data.sessions.filter((s) => s.id === focus || s.id.indexOf(focus) !== -1) : data.sessions;
  const t = focus !== null && visible.length === 1
    ? { sessions: 1, calls: visible[0].calls, cost: visible[0].cost, input: visible[0].input, cacheRead: visible[0].cacheRead }
    : data.totals;

  const scope = document.getElementById('scope');
  if (focus !== null) {
    scope.innerHTML = '仅当前会话 · <a href="' + location.pathname + '" style="color:inherit">查看全部</a>';
  } else {
    scope.textContent = '';
  }
  cards.innerHTML = [
    ['会话数', t.sessions],
    ['调用次数', t.calls],
    ['输入 token', fmt(t.input)],
    ['缓存读取', fmt(t.cacheRead)],
    ['合计成本', money(t.cost)]
  ].map(([k, v]) => '<div class="card"><div class="k">' + k + '</div><div class="v">' + v + '</div></div>').join('');

  if (visible.length === 0) {
    list.innerHTML = '<div class="empty">这一天没有记录。</div>';
    return;
  }

  list.innerHTML = visible.map((s) => {
    const max = Math.max(1, ...s.routes.map((r) => r.calls));
    const rows = s.routes.map((r) => {
      const pct = Math.max(2, Math.round((r.calls / max) * 100));
      return '<tr>' +
        '<td><div class="route">' + esc(r.route) + '</div><div class="bar" style="width:' + pct + '%"></div></td>' +
        '<td>' + r.calls + '</td>' +
        '<td>' + fmt(r.input) + '</td>' +
        '<td>' + fmt(r.cacheRead) + '</td>' +
        '<td>' + fmt(r.output) + '</td>' +
        '<td>' + money(r.cost) + '</td>' +
      '</tr>';
    }).join('');
    return '<div class="session">' +
      '<div class="s-head"><span class="s-id">' + esc(s.id) + '</span>' +
      '<span class="s-meta">' + s.calls + ' 次 · ' + money(s.cost) + '</span></div>' +
      '<table><thead><tr><th>供应商 : 模型</th><th>调用</th><th>输入</th><th>缓存</th><th>输出</th><th>成本</th></tr></thead>' +
      '<tbody>' + rows + '</tbody></table></div>';
  }).join('');

  hint.textContent = '账本：' + data.source;
}

document.getElementById('day').addEventListener('change', (e) => load(e.target.value));
document.getElementById('reload').addEventListener('click', () => load(document.getElementById('day').value || undefined));
load();
</script>
</body>
</html>`;
