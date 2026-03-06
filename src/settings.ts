import { App, PluginSettingTab, Setting } from "obsidian";
import CostPlugin from "./main";

export interface KnownAccountInfo {
	fileName: string;
	displayName: string;
	accountKind: string;
	institution: string;
	currency: string;
}

export interface CostPluginSettings {
	/** Finance 文件夹路径 */
	financePath: string;
	/** Accounts 文件夹路径 */
	accountsPath: string;
	/** Transactions 文件夹路径 */
	transactionsPath: string;
	/** 自定义图标文件夹路径 */
	customIconPath: string;
	expenseCategories: string[];
	incomeCategories: string[];
	/** AI Skill 用：已知账户列表（不含余额） */
	knownAccounts: KnownAccountInfo[];
	/** AI Skill 用：已知分类（按交易类型分组） */
	knownCategories: Record<string, string[]>;
	/** AI Skill 用：已知商家 */
	knownPayees: string[];
	/** AI Skill 用：已知标签/人物 */
	knownPersons: string[];
	/** 统计页面 Widget 排列顺序 */
	statsLayout: string[];
}

export const DEFAULT_SETTINGS: CostPluginSettings = {
	financePath: "Finance",
	accountsPath: "Finance/Accounts",
	transactionsPath: "Finance/Transactions",
	customIconPath: "Finance/Icons",
	expenseCategories: ["办公", "餐饮", "订阅", "度假", "对齐", "服饰", "服务器", "购物", "还款", "交通", "科研", "快递", "人生", "日用", "生活", "数码", "水果", "通信", "维修", "闲鱼", "学习", "医疗", "意外", "饮食", "娱乐", "住房", "转账"],
	incomeCategories: ["工资", "奖金", "理财", "收回", "退款", "意外", "悦刻", "闲鱼"],
	knownAccounts: [],
	knownCategories: {},
	knownPayees: [],
	knownPersons: [],
	statsLayout: ["balance", "kpi", "trends", "analysis", "heatmap", "calendar"],
};

export class CostSettingTab extends PluginSettingTab {
	plugin: CostPlugin;

	constructor(app: App, plugin: CostPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		containerEl.createEl("h2", { text: "记账插件设置" });

		new Setting(containerEl)
			.setName("Finance 文件夹路径")
			.setDesc("存放所有财务相关文件的根目录")
			.addText((text) =>
				text
					.setPlaceholder("Finance")
					.setValue(this.plugin.settings.financePath)
					.onChange(async (value) => {
						this.plugin.settings.financePath = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Accounts 文件夹路径")
			.setDesc("存放账户文件的目录")
			.addText((text) =>
				text
					.setPlaceholder("Finance/Accounts")
					.setValue(this.plugin.settings.accountsPath)
					.onChange(async (value) => {
						this.plugin.settings.accountsPath = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Transactions 文件夹路径")
			.setDesc("存放交易记录文件的目录")
			.addText((text) =>
				text
					.setPlaceholder("Finance/Transactions")
					.setValue(this.plugin.settings.transactionsPath)
					.onChange(async (value) => {
						this.plugin.settings.transactionsPath = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("自定义图标文件夹路径")
			.setDesc("存放自定义分类图标的目录 (e.g. 餐饮.png, 餐饮-早餐.png)")
			.addText((text) =>
				text
					.setPlaceholder("Finance/Icons")
					.setValue(this.plugin.settings.customIconPath)
					.onChange(async (value) => {
						this.plugin.settings.customIconPath = value;
						await this.plugin.saveSettings();
					})
			);
	}
}
