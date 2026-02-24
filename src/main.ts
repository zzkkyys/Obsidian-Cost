import { Notice, Plugin, parseYaml, debounce, TFile } from "obsidian";
import { DEFAULT_SETTINGS, CostPluginSettings, CostSettingTab } from "./settings";
import { AccountService } from "./services/accountService";
import { TransactionService, TransactionInfo } from "./services/transactionService";
import { TransactionEditModal } from "./modals/TransactionEditModal";
import { AccountSuggester } from "./suggesters/accountSuggester";
import { registerPropertyWidgets } from "./widgets/propertyWidget";
import { AccountsSidebarView, ACCOUNTS_SIDEBAR_VIEW_TYPE } from "./views/accountsSidebarView";
import { CostMainView, COST_MAIN_VIEW_TYPE } from "./views/costMainView";
import { CostStatsView, COST_STATS_VIEW_TYPE } from "./views/costStatsView";
import { TransactionList } from "./components/lists/TransactionList";
import { generateSkillPrompt } from "./skill/transactionSkill";

export default class CostPlugin extends Plugin {
	settings: CostPluginSettings;
	accountService: AccountService;
	transactionService: TransactionService;

	async onload() {
		await this.loadSettings();

		// 初始化服务（使用设置中的目录路径）
		this.accountService = new AccountService(this.app, this.settings.accountsPath);
		this.transactionService = new TransactionService(this.app, this.settings.transactionsPath);

		// 注册视图
		this.registerView(
			ACCOUNTS_SIDEBAR_VIEW_TYPE,
			(leaf) => new AccountsSidebarView(leaf, this)
		);
		this.registerView(
			COST_MAIN_VIEW_TYPE,
			(leaf) => new CostMainView(leaf, this)
		);
		this.registerView(
			COST_STATS_VIEW_TYPE,
			(leaf) => new CostStatsView(leaf, this)
		);

		// 等待 metadata 缓存准备好后扫描数据
		this.app.workspace.onLayoutReady(async () => {
			const accounts = await this.accountService.scanAccounts();
			const transactions = await this.transactionService.scanTransactions();
			console.log("[Cost Plugin] 扫描到账户:", accounts.length, "交易:", transactions.length);

			// 注册 Properties 面板的账户建议（用于 Live Preview 模式）
			registerPropertyWidgets(this.app, this.accountService);
		});

		// 注册账户建议器（用于 Source Mode 下 from/to 字段自动补全）
		this.registerEditorSuggest(new AccountSuggester(this, this.accountService));

		// Debounced refresh function
		const requestRefresh = debounce(this.refreshViews.bind(this), 300, true);

		// 监听文件变化，更新缓存
		this.registerEvent(
			this.app.metadataCache.on("changed", async (file) => {
				if (!(file instanceof TFile)) return;

				const cache = this.app.metadataCache.getFileCache(file);
				let changed = false;

				// Check frontmatter type if available to route to correct service
				// Note: file cache might be updated asynchronously? 
				// Incremental refresh:
				if (cache?.frontmatter?.type === "account") {
					await this.accountService.refreshAccount(file);
					changed = true;
				} else if (cache?.frontmatter?.type === "txn") {
					await this.transactionService.refreshTransaction(file);
					changed = true;
				} else {
					// Fallback: Check paths if frontmatter isn't populated yet or malformed?
					// Or just try refresh both? Efficiency vs Safety.
					// If it's a markdown file, it might be relevant.
					// Let's rely on path or frontmatter. 
					// If checking folders:
					// if (file.path.startsWith(this.settings.accountsPath)) ...
				}

				if (changed) requestRefresh();
			})
		);

		// 监听文件创建
		this.registerEvent(
			this.app.vault.on("create", async (file) => {
				if (!(file instanceof TFile)) return;

				// Wait for metadata cache to populate? Or try parsing file directly?
				// TransactionService.parseTransactionFile uses metadataCache.
				// On create, metadata might not be ready instantly. 
				// However, `create` event usually comes after file is written.
				// A small delay might be needed or listen to metadata `resolve`?
				// Simple approach: Try refreshing. If metadata missing, it returns null.
				// But "changed" event usually follows.
				// Let's try explicit refresh.
				let changed = false;
				if (file.path.includes(this.settings.accountsPath)) {
					// It's likely an account, but we need metadata to confirm type usually.
					// But if it's in the folder...
					await this.accountService.refreshAccount(file);
					changed = true;
				} else if (file.path.includes(this.settings.transactionsPath)) {
					await this.transactionService.refreshTransaction(file);
					changed = true;
				}

				if (changed) requestRefresh();
			})
		);

		// 监听文件删除
		this.registerEvent(
			this.app.vault.on("delete", async (file) => {
				if (!(file instanceof TFile)) return;

				// Remove from caches
				this.accountService.removeAccount(file.path);
				this.transactionService.removeTransaction(file.path);
				requestRefresh();
			})
		);

		// 注册 Markdown Code Block Processor
		this.registerMarkdownCodeBlockProcessor("ob-cost", (source, el, ctx) => {
			let targetDate = "";
			let startDate = "";
			let endDate = "";

			// 1. Try to parse YAML config from source
			try {
				const config = parseYaml(source);
				if (typeof config === "object" && config !== null) {
					if (config.date) targetDate = String(config.date);
					if (config.startDate) startDate = String(config.startDate);
					if (config.endDate) endDate = String(config.endDate);
				} else if (typeof source === "string" && source.trim()) {
					// Backward compatibility: check if source is just a date string
					const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
					const trimmed = source.trim();
					if (dateRegex.test(trimmed)) {
						targetDate = trimmed;
					}
				}
			} catch (e) {
				// Not valid YAML, maybe just a date string?
				const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
				const trimmed = source.trim();
				if (dateRegex.test(trimmed)) {
					targetDate = trimmed;
				}
			}

			// 2. If no valid config, try fallback to filename
			if (!targetDate && !startDate && !endDate) {
				const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
				if (ctx.sourcePath) {
					const fileName = ctx.sourcePath.split("/").pop();
					if (fileName) {
						const namePart = fileName.split(".")[0];
						if (namePart && dateRegex.test(namePart)) {
							targetDate = namePart;
						}
					}
				}
			}

			if (!targetDate && !startDate && !endDate) {
				el.createDiv({ text: "Obsidian Cost: 请指定日期 (date 或 startDate/endDate)，或在日记文件中使用。", cls: "cost-error-message" });
				return;
			}

			// Render
			el.addClass("cost-code-block-view");

			const transactions = this.transactionService.getTransactions().filter(t => {
				if (targetDate) {
					return t.date === targetDate;
				} else if (startDate && endDate) {
					return t.date >= startDate && t.date <= endDate;
				} else if (startDate) {
					return t.date >= startDate;
				} else if (endDate) {
					return t.date <= endDate;
				}
				return false;
			});

			const accounts = this.accountService.getAccounts();

			new TransactionList(el, this.app, transactions, accounts, null, {
				customIconPath: this.settings.customIconPath,
				onTransactionClick: (txn) => {
					new TransactionEditModal(this.app, txn, this.transactionService, this.accountService, this.settings.customIconPath, this, async () => {
						await this.transactionService.scanTransactions();
						this.refreshViews();
					}).open();
				}
			}).mount();
		});

		// 添加侧边栏图标
		const ribbonIcon = this.addRibbonIcon("wallet", "打开账户侧边栏", () => {
			this.activateAccountsSidebar();
			this.activateMainView();
		});
		ribbonIcon.addClass("cost-ribbon-icon");

		// 添加设置页面
		this.addSettingTab(new CostSettingTab(this.app, this));

		// 添加命令
		this.addCommand({
			id: "refresh-data",
			name: "刷新数据",
			callback: async () => {
				const accounts = await this.accountService.scanAccounts();
				const transactions = await this.transactionService.scanTransactions();
				new Notice(`已刷新，找到 ${accounts.length} 个账户，${transactions.length} 笔交易`);
			},
		});

		this.addCommand({
			id: "open-accounts-sidebar",
			name: "打开账户侧边栏",
			callback: () => {
				this.activateAccountsSidebar();
			},
		});

		this.addCommand({
			id: "open-main-view",
			name: "打开记账主视图",
			callback: () => {
				this.activateMainView();
			},
		});

		this.addCommand({
			id: "open-stats-view",
			name: "打开账本统计",
			callback: () => {
				this.activateStatsView();
			},
		});

		this.addCommand({
			id: "create-transaction",
			name: "新建交易",
			callback: async () => {
				const file = await this.transactionService.createTransaction();
				// Mock info for new file
				const txn: TransactionInfo = {
					path: file.path,
					fileName: file.basename,
					uid: "",
					date: new Date().toISOString().split("T")[0] || "",
					time: (new Date().toTimeString().split(" ")[0] || "00:00:00").substring(0, 5),
					txnType: "支出",
					category: "",
					amount: 0,
					refund: 0,
					currency: "CNY",
					from: "",
					to: "",
					payee: "",
					address: "",
					memo: "",
					note: "",
					persons: []
				};

				new TransactionEditModal(this.app, txn, this.transactionService, this.accountService, this.settings.customIconPath, this, async () => {
					await this.transactionService.scanTransactions();
					this.refreshViews();
				}, true).open();
			},
		});

		this.addCommand({
			id: "copy-ai-skill-prompt",
			name: "复制 AI 记账 Skill 到剪贴板",
			callback: async () => {
				try {
					// 确保数据是最新的
					await this.accountService.scanAccounts();
					await this.transactionService.scanTransactions();

					const skillPrompt = generateSkillPrompt(
						this.accountService,
						this.transactionService,
						this.settings.transactionsPath,
						(this.app.vault.adapter as any).basePath || ""
					);

					await navigator.clipboard.writeText(skillPrompt);
					new Notice("AI 记账 Skill 已复制到剪贴板 ✓");
				} catch (e) {
					console.error("[Cost Plugin] 复制 Skill 失败:", e);
					new Notice("复制失败: " + e);
				}
			},
		});
	}

	onunload() {
		// 关闭视图
		this.app.workspace.detachLeavesOfType(ACCOUNTS_SIDEBAR_VIEW_TYPE);
		this.app.workspace.detachLeavesOfType(COST_MAIN_VIEW_TYPE);
		this.app.workspace.detachLeavesOfType(COST_STATS_VIEW_TYPE);
	}

	/**
	 * 激活账户侧边栏
	 */
	async activateAccountsSidebar(): Promise<void> {
		const { workspace } = this.app;

		let leaf = workspace.getLeavesOfType(ACCOUNTS_SIDEBAR_VIEW_TYPE)[0];

		if (!leaf) {
			const rightLeaf = workspace.getRightLeaf(false);
			if (rightLeaf) {
				leaf = rightLeaf;
				await leaf.setViewState({
					type: ACCOUNTS_SIDEBAR_VIEW_TYPE,
					active: true,
				});
			}
		}

		if (leaf) {
			workspace.revealLeaf(leaf);
		}
	}

	/**
	 * 激活主视图
	 */
	async activateMainView(): Promise<void> {
		const { workspace } = this.app;

		let leaf = workspace.getLeavesOfType(COST_MAIN_VIEW_TYPE)[0];

		if (!leaf) {
			leaf = workspace.getLeaf("tab");
			await leaf.setViewState({
				type: COST_MAIN_VIEW_TYPE,
				active: true,
			});
		}

		workspace.revealLeaf(leaf);
	}

	/**
	 * 激活统计视图
	 */
	async activateStatsView(): Promise<void> {
		const { workspace } = this.app;

		let leaf = workspace.getLeavesOfType(COST_STATS_VIEW_TYPE)[0];

		if (!leaf) {
			leaf = workspace.getLeaf("tab");
			await leaf.setViewState({
				type: COST_STATS_VIEW_TYPE,
				active: true,
			});
		}

		workspace.revealLeaf(leaf);
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData() as Partial<CostPluginSettings>);
	}

	async refreshViews() {
		this.app.workspace.getLeavesOfType(ACCOUNTS_SIDEBAR_VIEW_TYPE).forEach(leaf => {
			if (leaf.view instanceof AccountsSidebarView) {
				leaf.view.render();
			}
		});
		this.app.workspace.getLeavesOfType(COST_MAIN_VIEW_TYPE).forEach(leaf => {
			if (leaf.view instanceof CostMainView) {
				leaf.view.update();
			}
		});
		// Stats view might need update too
		this.app.workspace.getLeavesOfType(COST_STATS_VIEW_TYPE).forEach(leaf => {
			// Assuming stats view has update or render
			// (leaf.view as any).render?.(); 
		});
	}

	async saveSettings() {
		await this.saveData(this.settings);
		// 更新服务的目录路径
		this.accountService.setAccountsPath(this.settings.accountsPath);
		this.transactionService.setTransactionsPath(this.settings.transactionsPath);
		// 重新扫描数据
		await this.accountService.scanAccounts();
		await this.transactionService.scanTransactions();
		this.refreshViews();
	}
}
