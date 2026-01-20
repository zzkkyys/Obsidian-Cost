import { Notice, Plugin } from "obsidian";
import { DEFAULT_SETTINGS, CostPluginSettings, CostSettingTab } from "./settings";
import { AccountService } from "./services/accountService";
import { TransactionService } from "./services/transactionService";
import { AccountSuggester } from "./suggesters/accountSuggester";
import { registerPropertyWidgets } from "./widgets/propertyWidget";
import { AccountsSidebarView, ACCOUNTS_SIDEBAR_VIEW_TYPE } from "./views/accountsSidebarView";
import { CostMainView, COST_MAIN_VIEW_TYPE } from "./views/costMainView";
import { CostStatsView, COST_STATS_VIEW_TYPE } from "./views/costStatsView";

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

		// 监听文件变化，更新缓存
		this.registerEvent(
			this.app.metadataCache.on("changed", async (file) => {
				const cache = this.app.metadataCache.getFileCache(file);
				if (cache?.frontmatter?.type === "account") {
					await this.accountService.scanAccounts();
				}
				if (cache?.frontmatter?.type === "txn") {
					await this.transactionService.scanTransactions();
				}
			})
		);

		// 监听文件创建
		this.registerEvent(
			this.app.vault.on("create", async () => {
				await this.accountService.scanAccounts();
				await this.transactionService.scanTransactions();
			})
		);

		// 监听文件删除
		this.registerEvent(
			this.app.vault.on("delete", async () => {
				await this.accountService.scanAccounts();
				await this.transactionService.scanTransactions();
			})
		);

		// 添加侧边栏图标
		const ribbonIcon = this.addRibbonIcon("wallet", "打开账户侧边栏", () => {
			this.activateAccountsSidebar();
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

	async saveSettings() {
		await this.saveData(this.settings);
		// 更新服务的目录路径
		this.accountService.setAccountsPath(this.settings.accountsPath);
		this.transactionService.setTransactionsPath(this.settings.transactionsPath);
		// 重新扫描数据
		await this.accountService.scanAccounts();
		await this.transactionService.scanTransactions();
	}
}
