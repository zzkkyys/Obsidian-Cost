import { App, PluginSettingTab, Setting } from "obsidian";
import CostPlugin from "./main";

export interface CostPluginSettings {
	/** Finance 文件夹路径 */
	financePath: string;
	/** Accounts 文件夹路径 */
	accountsPath: string;
	/** Transactions 文件夹路径 */
	transactionsPath: string;
}

export const DEFAULT_SETTINGS: CostPluginSettings = {
	financePath: "Finance",
	accountsPath: "Finance/Accounts",
	transactionsPath: "Finance/Transactions",
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
	}
}
