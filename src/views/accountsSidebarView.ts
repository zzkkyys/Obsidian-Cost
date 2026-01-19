import { ItemView, WorkspaceLeaf } from "obsidian";
import CostPlugin from "../main";
import { AccountInfo } from "../types";
import { CostMainView, COST_MAIN_VIEW_TYPE } from "./costMainView";

export const ACCOUNTS_SIDEBAR_VIEW_TYPE = "cost-accounts-sidebar";

/**
 * 账户侧边栏视图
 * 显示所有账户列表
 */
export class AccountsSidebarView extends ItemView {
    private plugin: CostPlugin;
    private iconCache: Map<string, string> = new Map();  // 图标缓存

    constructor(leaf: WorkspaceLeaf, plugin: CostPlugin) {
        super(leaf);
        this.plugin = plugin;
    }

    getViewType(): string {
        return ACCOUNTS_SIDEBAR_VIEW_TYPE;
    }

    getDisplayText(): string {
        return "账户列表";
    }

    getIcon(): string {
        return "wallet";
    }

    async onOpen(): Promise<void> {
        this.contentEl.empty();
        this.contentEl.addClass("cost-accounts-sidebar");

        await this.render();
    }

    async onClose(): Promise<void> {
        this.contentEl.empty();
    }

    /**
     * 计算账户当前余额
     */
    private calculateBalance(account: AccountInfo): number {
        const change = this.plugin.transactionService.calculateBalanceChange(account.fileName);
        return account.openingBalance + change;
    }

    /**
     * 渲染总余额汇总卡片
     */
    private renderBalanceSummary(accounts: AccountInfo[]): void {
        const summaryCard = this.contentEl.createDiv({ cls: "cost-balance-summary-card" });

        // 计算各类余额
        let assetsTotal = 0;  // 资产（不含信用卡）
        let liabilitiesTotal = 0;  // 负债（信用卡欠款）

        for (const account of accounts) {
            const balance = this.calculateBalance(account);
            if (account.accountKind === "credit") {
                // 信用卡：负余额表示欠款
                liabilitiesTotal += Math.abs(Math.min(0, balance));
            } else {
                // 其他账户：正余额为资产
                assetsTotal += balance;
            }
        }

        const netWorth = assetsTotal - liabilitiesTotal;

        // 主数字区域 - 净资产
        const mainSection = summaryCard.createDiv({ cls: "cost-summary-main" });
        mainSection.createDiv({ cls: "cost-summary-main-label", text: "净资产" });
        const mainValue = mainSection.createDiv({ cls: "cost-summary-main-value" });
        mainValue.createSpan({ cls: "cost-summary-currency", text: "¥" });
        mainValue.createSpan({ 
            cls: `cost-summary-amount ${netWorth >= 0 ? "cost-balance-positive" : "cost-balance-negative"}`,
            text: this.formatNumber(Math.abs(netWorth))
        });
        if (netWorth < 0) {
            mainValue.addClass("cost-summary-negative");
        }

        // 进度条 - 资产与负债比例
        const total = assetsTotal + liabilitiesTotal;
        if (total > 0) {
            const progressSection = summaryCard.createDiv({ cls: "cost-summary-progress" });
            const assetPercent = (assetsTotal / total) * 100;
            const progressBar = progressSection.createDiv({ cls: "cost-summary-progress-bar" });
            const assetBar = progressBar.createDiv({ cls: "cost-summary-progress-asset" });
            assetBar.style.width = `${assetPercent}%`;
        }

        // 详情区域 - 资产和负债
        const detailSection = summaryCard.createDiv({ cls: "cost-summary-detail" });
        
        // 资产
        const assetItem = detailSection.createDiv({ cls: "cost-summary-detail-item" });
        assetItem.createDiv({ cls: "cost-summary-detail-dot cost-dot-asset" });
        assetItem.createDiv({ cls: "cost-summary-detail-label", text: "资产" });
        assetItem.createDiv({ 
            cls: "cost-summary-detail-value", 
            text: `¥${this.formatNumber(assetsTotal)}` 
        });

        // 负债
        const liabilityItem = detailSection.createDiv({ cls: "cost-summary-detail-item" });
        liabilityItem.createDiv({ cls: "cost-summary-detail-dot cost-dot-liability" });
        liabilityItem.createDiv({ cls: "cost-summary-detail-label", text: "负债" });
        liabilityItem.createDiv({ 
            cls: "cost-summary-detail-value", 
            text: `¥${this.formatNumber(liabilitiesTotal)}` 
        });
    }

    /**
     * 格式化数字（添加千分位分隔符）
     */
    private formatNumber(num: number): string {
        return num.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }

    /**
     * 账户类型显示名称
     */
    private readonly accountKindNames: Record<string, string> = {
        "bank": "银行卡",
        "credit": "信用卡",
        "wallet": "电子钱包",
        "cash": "现金",
        "investment": "投资账户",
        "prepaid": "预付卡",
        "other": "其他",
    };

    /**
     * 账户类型排序优先级
     */
    private readonly accountKindOrder: string[] = [
        "bank", "credit", "wallet", "cash", "prepaid", "investment", "other"
    ];

    /**
     * 渲染账户列表
     */
    async render(): Promise<void> {
        this.contentEl.empty();

        // 标题
        const header = this.contentEl.createDiv({ cls: "cost-sidebar-header" });
        header.createEl("h4", { text: "账户" });

        // 刷新按钮
        const refreshBtn = header.createEl("button", { cls: "cost-refresh-btn" });
        refreshBtn.innerHTML = "↻";
        refreshBtn.title = "刷新";
        refreshBtn.addEventListener("click", async () => {
            await this.plugin.accountService.scanAccounts();
            await this.plugin.transactionService.scanTransactions();
            await this.render();
        });

        // 获取账户数据
        const accounts = this.plugin.accountService.getAccounts();

        // 渲染总余额汇总卡片
        this.renderBalanceSummary(accounts);

        // 账户列表
        const listEl = this.contentEl.createDiv({ cls: "cost-accounts-list" });

        if (accounts.length === 0) {
            listEl.createDiv({ cls: "cost-empty-message", text: "暂无账户" });
            return;
        }

        // 按账户类型分组
        const grouped = this.groupAccountsByKind(accounts);

        // 按优先级顺序渲染分组
        for (const kind of this.accountKindOrder) {
            const groupAccounts = grouped.get(kind);
            if (groupAccounts && groupAccounts.length > 0) {
                this.renderAccountGroup(listEl, kind, groupAccounts);
            }
        }

        // 渲染未知类型的账户
        for (const [kind, groupAccounts] of grouped) {
            if (!this.accountKindOrder.includes(kind) && groupAccounts.length > 0) {
                this.renderAccountGroup(listEl, kind, groupAccounts);
            }
        }
    }

    /**
     * 按账户类型分组
     */
    private groupAccountsByKind(accounts: AccountInfo[]): Map<string, AccountInfo[]> {
        const grouped = new Map<string, AccountInfo[]>();

        for (const account of accounts) {
            const kind = account.accountKind || "other";
            if (!grouped.has(kind)) {
                grouped.set(kind, []);
            }
            grouped.get(kind)!.push(account);
        }

        return grouped;
    }

    /**
     * 渲染账户分组
     */
    private renderAccountGroup(container: HTMLElement, kind: string, accounts: AccountInfo[]): void {
        const groupEl = container.createDiv({ cls: "cost-account-group" });

        // 分组标题
        const groupHeader = groupEl.createDiv({ cls: "cost-account-group-header" });
        const kindName = this.accountKindNames[kind] || kind;
        const icon = this.getAccountIcon(kind);
        groupHeader.createSpan({ cls: "cost-account-group-icon", text: icon });
        groupHeader.createSpan({ cls: "cost-account-group-name", text: kindName });
        groupHeader.createSpan({ cls: "cost-account-group-count", text: `(${accounts.length})` });

        // 分组小计余额
        let totalBalance = 0;
        for (const account of accounts) {
            totalBalance += this.calculateBalance(account);
        }
        const totalEl = groupHeader.createSpan({ cls: "cost-account-group-total" });
        totalEl.setText(this.formatNumber(totalBalance));
        if (totalBalance >= 0) {
            totalEl.addClass("cost-balance-positive");
        } else {
            totalEl.addClass("cost-balance-negative");
        }

        // 账户列表
        const listEl = groupEl.createDiv({ cls: "cost-account-group-list" });
        for (const account of accounts) {
            this.renderAccountItem(listEl, account);
        }
    }

    /**
     * 渲染单个账户项
     */
    private renderAccountItem(container: HTMLElement, account: AccountInfo): void {
        const item = container.createDiv({ cls: "cost-account-item" });
        
        // 账户图标（优先使用自定义图标）
        const iconEl = item.createDiv({ cls: "cost-account-icon" });
        if (account.icon) {
            this.renderCustomIcon(iconEl, account.icon);
        } else {
            iconEl.innerHTML = this.getAccountIcon(account.accountKind);
        }

        // 账户信息
        const infoEl = item.createDiv({ cls: "cost-account-info" });
        
        const nameEl = infoEl.createDiv({ cls: "cost-account-name" });
        nameEl.setText(account.displayName);

        if (account.accountKind || account.institution) {
            const detailEl = infoEl.createDiv({ cls: "cost-account-detail" });
            const details = [account.accountKind, account.institution].filter(Boolean);
            detailEl.setText(details.join(" · "));
        }

        // 余额
        const balance = this.calculateBalance(account);
        const balanceEl = item.createDiv({ cls: "cost-account-balance" });
        balanceEl.setText(`${this.formatNumber(balance)} ${account.currency}`);
        if (balance >= 0) {
            balanceEl.addClass("cost-balance-positive");
        } else {
            balanceEl.addClass("cost-balance-negative");
        }

        // 点击跳转到主视图的账户标签页
        item.addEventListener("click", async () => {
            await this.openAccountInMainView(account);
        });
    }

    /**
     * 在主视图中打开账户
     */
    private async openAccountInMainView(account: AccountInfo): Promise<void> {
        const { workspace } = this.app;

        // 获取或创建主视图
        let leaf = workspace.getLeavesOfType(COST_MAIN_VIEW_TYPE)[0];

        if (!leaf) {
            leaf = workspace.getLeaf("tab");
            await leaf.setViewState({
                type: COST_MAIN_VIEW_TYPE,
                active: true,
            });
        }

        workspace.revealLeaf(leaf);

        // 选中账户
        const view = leaf.view as CostMainView;
        if (view && view.selectAccount) {
            await view.selectAccount(account);
        }
    }

    /**
     * 根据账户类型返回图标
     */
    private getAccountIcon(accountKind: string): string {
        const icons: Record<string, string> = {
            "bank": "🏦",
            "cash": "💵",
            "credit": "💳",
            "investment": "📈",
            "wallet": "👛",
            "prepaid": "🎫",
            "other": "💰",
        };
        return icons[accountKind] || "💰";
    }

    /**
     * 渲染自定义图标（从 wiki link 格式解析图片，带缓存）
     */
    private renderCustomIcon(container: HTMLElement, iconLink: string): void {
        // 先检查缓存
        const cachedPath = this.iconCache.get(iconLink);
        if (cachedPath) {
            if (cachedPath === "__default__") {
                container.innerHTML = "💰";
            } else {
                const img = container.createEl("img", { cls: "cost-account-custom-icon" });
                img.src = cachedPath;
            }
            return;
        }
        
        // 解析 [[filename.png]] 格式
        const match = iconLink.match(/\[\[(.+?)\]\]/);
        if (match && match[1]) {
            const fileName: string = match[1];
            // 使用 metadataCache 更高效
            const imageFile = this.app.metadataCache.getFirstLinkpathDest(fileName, "");
            if (imageFile) {
                const resourcePath = this.app.vault.getResourcePath(imageFile);
                this.iconCache.set(iconLink, resourcePath);  // 缓存
                const img = container.createEl("img", { cls: "cost-account-custom-icon" });
                img.src = resourcePath;
                img.alt = fileName;
                return;
            }
        }
        // 如果解析失败，缓存默认值
        this.iconCache.set(iconLink, "__default__");
        container.innerHTML = "💰";
    }
}
