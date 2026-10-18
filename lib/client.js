/**
 * 前端半边：入口按钮 + 全屏浮层 + 快捷键。
 *
 * 交互：
 *   左键  —— 只看当前会话
 *   右键  —— 完整面板
 *   Ctrl+Shift+U —— 不依赖任何按钮，直接开面板（浮层不可用时退回浏览器）
 *
 * 全部用 react.createElement 构造，不用 jsx runtime ——
 * `jsx(type, props, key)` 的第三个参数是 key 而不是 children，用错会让
 * 组件渲染成空白（apply 正常、mount 无异常、界面上什么都没有）。
 */

window.__ModuleLoader__.load({
	id: "dsh-usage-breakdown",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");

		const PANEL_PATH = "/plugins/dsh-usage-breakdown/panel";
		const PING_PATH = "/plugins/dsh-usage-breakdown/ping";
		const LOCALE_NS = "session-usage";
		const HINT = "左键：本会话用量　右键：完整面板　Ctrl+Shift+U：直接打开";

		/** 打点：失败静默。 */
		function report(query) {
			try {
				fetch(`${PING_PATH}?${query}`, { cache: "no-store" }).catch(() => {});
			} catch {}
		}
		report("stage=boot&v=createElement");

		/** 浮层状态：模块级，所有入口共享。 */
		const subscribers = new Set();
		let view = { open: false, sessionId: void 0 };
		function publish(next) {
			view = next;
			for (const notify of subscribers) {
				try {
					notify(next);
				} catch {}
			}
		}
		function openPanel(sessionId) {
			publish({ open: true, sessionId: typeof sessionId === "string" && sessionId !== "" ? sessionId : void 0 });
		}
		function closePanel() {
			publish({ open: false, sessionId: void 0 });
		}
		function useView() {
			const [value, setValue] = react.useState(view);
			react.useEffect(() => {
				subscribers.add(setValue);
				setValue(view);
				return () => {
					subscribers.delete(setValue);
				};
			}, []);
			return value;
		}

		/** 兜底：浮层不渲染时，直接在浏览器打开面板。 */
		function openExternal(sessionId) {
			const url = sessionId === void 0 ? PANEL_PATH : `${PANEL_PATH}?session=${encodeURIComponent(sessionId)}`;
			try {
				const win = window.open(url, "_blank", "noopener");
				if (win === null || win === void 0) window.location.assign(url);
			} catch {}
		}

		function BarIcon() {
			return react.createElement("svg", {
				width: 14,
				height: 14,
				viewBox: "0 0 16 16",
				fill: "none",
				"aria-hidden": "true",
				style: { display: "block", flex: "0 0 auto" }
			}, react.createElement("path", {
				d: "M3 13V8M8 13V3M13 13V6",
				stroke: "currentColor",
				strokeWidth: 1.5,
				strokeLinecap: "round"
			}));
		}

		const headerButtonStyle = {
			display: "inline-flex",
			alignItems: "center",
			gap: "5px",
			background: "transparent",
			border: "1px solid transparent",
			borderRadius: "7px",
			padding: "4px 8px",
			fontSize: "12px",
			lineHeight: 1.4,
			color: "var(--color-text-secondary, #5f5e5a)",
			cursor: "pointer",
			whiteSpace: "nowrap"
		};

		const dockButtonStyle = {
			display: "inline-flex",
			alignItems: "center",
			gap: "5px",
			background: "transparent",
			border: "1px solid var(--color-border-tertiary, rgba(0,0,0,.15))",
			borderRadius: "8px",
			padding: "3px 9px",
			fontSize: "12px",
			lineHeight: 1.4,
			color: "var(--color-text-secondary, #5f5e5a)",
			cursor: "pointer",
			whiteSpace: "nowrap"
		};

		/** 顶部快捷栏入口。 */
		function UsageHeaderButton(props) {
			const sessionId = props?.sessionId;
			return react.createElement("button", {
				type: "button",
				onClick: () => openPanel(sessionId),
				onContextMenu: (event) => {
					event.preventDefault();
					openPanel(void 0);
				},
				title: HINT,
				style: headerButtonStyle
			}, react.createElement(BarIcon, null), react.createElement("span", null, "会话用量"));
		}

		/** 输入区下方入口（备用）。 */
		function UsageDockButton(props) {
			const sessionId = props?.sessionId;
			return react.createElement("button", {
				type: "button",
				onClick: () => openPanel(sessionId),
				onContextMenu: (event) => {
					event.preventDefault();
					openPanel(void 0);
				},
				title: HINT,
				style: dockButtonStyle
			}, "会话用量");
		}

		/** 插件配置区卡片（设置 → 插件）。 */
		function UsageConfigCard(props) {
			const sessionId = props?.sessionId;
			return react.createElement("div", {
				style: {
					display: "flex",
					alignItems: "center",
					gap: "10px",
					flexWrap: "wrap",
					padding: "2px 0",
					fontSize: "12px",
					color: "var(--color-text-secondary, #5f5e5a)"
				}
			}, react.createElement("span", null, "按 会话 × 供应商 × 模型 展示调用次数与用量，数据只读自 cost-meter 账本。"), react.createElement("button", {
				type: "button",
				onClick: () => openPanel(sessionId),
				title: HINT,
				style: dockButtonStyle
			}, "打开面板"));
		}

		/** 全屏浮层。 */
		function UsageOverlay() {
			const state = useView();
			react.useEffect(() => {
				if (!state.open) return void 0;
				const onKey = (event) => {
					if (event.key === "Escape") closePanel();
				};
				window.addEventListener("keydown", onKey);
				return () => window.removeEventListener("keydown", onKey);
			}, [state.open]);
			if (!state.open) return null;
			const src = state.sessionId === void 0 ? PANEL_PATH : `${PANEL_PATH}?session=${encodeURIComponent(state.sessionId)}`;
			return react.createElement("div", {
				onClick: closePanel,
				style: {
					position: "fixed",
					inset: 0,
					zIndex: 9999,
					display: "flex",
					alignItems: "center",
					justifyContent: "center",
					padding: "28px",
					background: "rgba(0,0,0,.42)"
				}
			}, react.createElement("div", {
				onClick: (event) => event.stopPropagation(),
				style: {
					position: "relative",
					width: "min(1080px, 100%)",
					height: "min(780px, 100%)",
					background: "var(--color-background-primary, #fff)",
					borderRadius: "14px",
					overflow: "hidden",
					boxShadow: "0 18px 60px rgba(0,0,0,.28)"
				}
			}, react.createElement("button", {
				key: "close",
				type: "button",
				onClick: closePanel,
				title: "关闭（Esc）",
				style: {
					position: "absolute",
					top: "8px",
					right: "10px",
					zIndex: 2,
					width: "28px",
					height: "28px",
					display: "flex",
					alignItems: "center",
					justifyContent: "center",
					background: "rgba(128,128,128,.12)",
					border: "none",
					borderRadius: "8px",
					color: "var(--color-text-secondary, #5f5e5a)",
					fontSize: "15px",
					lineHeight: 1,
					cursor: "pointer"
				}
			}, "×"), react.createElement("iframe", {
				key: "frame",
				src,
				title: "会话用量",
				style: { width: "100%", height: "100%", border: "none", display: "block" }
			})));
		}

		const name = "dsh-usage-breakdown-client";
		const inject = ["slots", "locale", "shortcuts"];

		function mount(ctx, slotName, id, order, component) {
			try {
				ctx.slots.inject(slotName, () => ctx.slots.register({
					name: slotName,
					id,
					order,
					locale: LOCALE_NS,
					inject: () => ({})
				}, component));
				report(`stage=mount&slot=${encodeURIComponent(slotName)}&ok=1`);
			} catch (error) {
				const msg = String(error?.message ?? error);
				console.error(`[dsh-usage-breakdown] slot "${slotName}" failed:`, error);
				report(`stage=mount&slot=${encodeURIComponent(slotName)}&ok=0&msg=${encodeURIComponent(msg.slice(0, 160))}`);
			}
		}

		function apply(ctx) {
			report("stage=apply");
			try {
				ctx.effect(() => ctx.locale.register(LOCALE_NS, { zh: {}, en: {} }), "dsh-usage-breakdown: dictionaries");
				report("stage=locale&ok=1");
			} catch (error) {
				report(`stage=locale&ok=0&msg=${encodeURIComponent(String(error?.message ?? error).slice(0, 160))}`);
			}

			mount(ctx, "conversation.session.header.actions", "dsh-usage-breakdown-header", 40, UsageHeaderButton);
			mount(ctx, "conversation.composer.dock", "dsh-usage-breakdown-dock", 30, UsageDockButton);
			mount(ctx, "plugins.row.config", "dsh-usage-breakdown-config", 10, UsageConfigCard);
			mount(ctx, "shell.overlay", "dsh-usage-breakdown-overlay", 50, UsageOverlay);

			try {
				ctx.effect(() => ctx.shortcuts.register({
					id: "dsh-usage-breakdown.openPanel",
					label: () => "打开会话用量面板",
					aliases: ["session usage", "usage panel", "会话用量"],
					defaults: {
						"desktop:windows": { code: "KeyU", modifiers: ["primary", "shift"] },
						"web:windows": { code: "KeyU", modifiers: ["primary", "shift"] },
						"desktop:macos": { code: "KeyU", modifiers: ["primary", "shift"] },
						"web:macos": { code: "KeyU", modifiers: ["primary", "shift"] },
						"desktop:linux": { code: "KeyU", modifiers: ["primary", "shift"] },
						"web:linux": { code: "KeyU", modifiers: ["primary", "shift"] }
					},
					regions: ["page", "editable"],
					modals: [],
					resolve: () => ({
						status: "handled",
						run: () => {
							report("stage=shortcut&fired=1");
							openPanel();
							setTimeout(() => {
								if (!view.open) openExternal();
							}, 400);
						}
					})
				}), "dsh-usage-breakdown: open panel command");
				report("stage=shortcut&ok=1");
			} catch (error) {
				report(`stage=shortcut&ok=0&msg=${encodeURIComponent(String(error?.message ?? error).slice(0, 160))}`);
			}
		}

		exports.apply = apply;
		exports.inject = inject;
		exports.name = name;
		return module.exports;
	}
});
