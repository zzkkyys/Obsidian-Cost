import { ItemView, WorkspaceLeaf, setIcon } from "obsidian";
import CostPlugin from "../main";
import { AccountInfo } from "../types";
import { TransactionInfo } from "../services/transactionService";

export const COST_MAIN_VIEW_TYPE = "cost-main-view";

type TabType = "transactions" | "accounts";

/**
 * 记账主视图
 * 包含两个子页：交易列表和账户列表
 */
export class CostMainView extends ItemView {
    private plugin: CostPlugin;
    private currentTab: TabType = "transactions";
    private selectedAccount: AccountInfo | null = null;

    constructor(leaf: WorkspaceLeaf, plugin: CostPlugin) {
        super(leaf);
        this.plugin = plugin;
    }

    getViewType(): string {
        return COST_MAIN_VIEW_TYPE;
    }

    getDisplayText(): string {
        return "记账";
    }

    getIcon(): string {
        return "coins";
    }

    async onOpen(): Promise<void> {
        this.contentEl.empty();
        this.contentEl.addClass("cost-main-view");

        await this.render();
    }

    async onClose(): Promise<void> {
        this.contentEl.empty();
    }

    /**
     * 选中账户并切换到账户标签页
     */
    async selectAccount(account: AccountInfo): Promise<void> {
        this.selectedAccount = account;
        this.currentTab = "accounts";
        await this.render();
    }

    /**
     * 渲染主视图
     */
    async render(): Promise<void> {
        this.contentEl.empty();

        // 标签栏
        this.renderTabs();

        // 内容区域
        const content = this.contentEl.createDiv({ cls: "cost-view-content" });

        if (this.currentTab === "transactions") {
            await this.renderTransactionsTab(content);
        } else {
            await this.renderAccountsTab(content);
        }
    }

    /**
     * 渲染标签栏
     */
    private renderTabs(): void {
        const tabBar = this.contentEl.createDiv({ cls: "cost-tab-bar" });

        // 交易标签
        const txnTab = tabBar.createDiv({ 
            cls: `cost-tab ${this.currentTab === "transactions" ? "is-active" : ""}` 
        });
        txnTab.createSpan({ text: "交易" });
        txnTab.addEventListener("click", () => {
            this.currentTab = "transactions";
            this.selectedAccount = null;
            this.render();
        });

        // 账户标签
        const accTab = tabBar.createDiv({ 
            cls: `cost-tab ${this.currentTab === "accounts" ? "is-active" : ""}` 
        });
        accTab.createSpan({ text: "账户" });
        accTab.addEventListener("click", () => {
            this.currentTab = "accounts";
            this.selectedAccount = null;
            this.render();
        });

        // 刷新按钮
        const refreshBtn = tabBar.createDiv({ cls: "cost-tab-refresh" });
        setIcon(refreshBtn, "refresh-cw");
        refreshBtn.title = "刷新数据";
        refreshBtn.addEventListener("click", async () => {
            await this.plugin.accountService.scanAccounts();
            await this.plugin.transactionService.scanTransactions();
            await this.render();
        });
    }

    /**
     * 渲染交易标签页
     */
    private async renderTransactionsTab(container: HTMLElement): Promise<void> {
        const transactions = this.plugin.transactionService.getTransactions();

        if (transactions.length === 0) {
            container.createDiv({ cls: "cost-empty-message", text: "暂无交易记录" });
            return;
        }

        // 计算所有账户的运行余额
        const accountOpeningBalances = this.getAccountOpeningBalances();
        const allRunningBalances = this.plugin.transactionService.calculateAllAccountsRunningBalances(accountOpeningBalances);

        // 按日期分组
        const grouped = this.plugin.transactionService.getTransactionsGroupedByDate();

        for (const [date, txns] of grouped) {
            this.renderDateGroupWithBalances(container, date, txns, allRunningBalances);
        }
    }

    /**
     * 获取所有账户的期初余额映射
     */
    private getAccountOpeningBalances(): Map<string, number> {
        const balances = new Map<string, number>();
        const accounts = this.plugin.accountService.getAccounts();
        for (const account of accounts) {
            balances.set(account.fileName, account.openingBalance);
        }
        return balances;
    }

    /**
     * 渲染日期分组（带所有账户余额变化）
     */
    private renderDateGroupWithBalances(
        container: HTMLElement, 
        date: string, 
        transactions: TransactionInfo[],
        allRunningBalances: Map<string, Map<string, { before: number; after: number }>>
    ): void {
        const group = container.createDiv({ cls: "cost-date-group" });

        // 日期标题
        const header = group.createDiv({ cls: "cost-date-header" });
        header.createSpan({ cls: "cost-date-text", text: date });
        
        // 计算当日收支
        const income = transactions
            .filter(t => t.txnType === "收入")
            .reduce((sum, t) => sum + t.amount, 0);
        const expense = transactions
            .filter(t => t.txnType === "支出")
            .reduce((sum, t) => sum + (t.amount - t.refund), 0);
        
        const summaryEl = header.createDiv({ cls: "cost-date-summary" });
        if (income > 0) {
            summaryEl.createSpan({ cls: "cost-income", text: `+${income.toFixed(2)}` });
        }
        if (expense > 0) {
            summaryEl.createSpan({ cls: "cost-expense", text: `-${expense.toFixed(2)}` });
        }

        // 交易列表
        const list = group.createDiv({ cls: "cost-transactions-list" });
        for (const txn of transactions) {
            this.renderTransactionItemWithBalances(list, txn, allRunningBalances);
        }
    }

    /**
     * 渲染单个交易项（带所有账户余额变化）
     */
    private renderTransactionItemWithBalances(
        container: HTMLElement, 
        txn: TransactionInfo,
        allRunningBalances: Map<string, Map<string, { before: number; after: number }>>
    ): void {
        const item = container.createDiv({ cls: `cost-transaction-item cost-txn-${txn.txnType}` });

        // 分类图标
        const iconEl = item.createDiv({ cls: "cost-txn-icon" });
        iconEl.setText(this.getCategoryIcon(txn.category));

        // 交易信息
        const infoEl = item.createDiv({ cls: "cost-txn-info" });
        
        const topRow = infoEl.createDiv({ cls: "cost-txn-top-row" });
        topRow.createSpan({ cls: "cost-txn-category", text: txn.category || "未分类" });
        
        // 显示时间
        if (txn.time) {
            topRow.createSpan({ cls: "cost-txn-time", text: txn.time.substring(0, 5) });
        }
        
        if (txn.payee) {
            const payeeEl = topRow.createSpan({ cls: "cost-txn-payee" });
            payeeEl.createSpan({ cls: "cost-txn-location-icon", text: "📍" });
            payeeEl.createSpan({ text: txn.payee });
        }

        const bottomRow = infoEl.createDiv({ cls: "cost-txn-bottom-row" });
        if (txn.memo) {
            bottomRow.createSpan({ cls: "cost-txn-memo", text: txn.memo });
        }
        
        // 显示账户名（不含余额）
        const txnBalances = allRunningBalances.get(txn.path);
        if (txn.from || txn.to) {
            const accountBubble = bottomRow.createSpan({ cls: "cost-txn-account-bubble" });
            
            if (txn.txnType === "转账" || txn.txnType === "还款") {
                // 转账/还款：显示两个账户的 icon
                const fromAccount = this.findAccountByName(txn.from);
                const toAccount = this.findAccountByName(txn.to);
                
                const fromIconEl = accountBubble.createSpan({ cls: "cost-txn-account-icon-small" });
                if (fromAccount?.icon) {
                    this.renderCustomIcon(fromIconEl, fromAccount.icon);
                } else if (fromAccount) {
                    fromIconEl.setText(this.getAccountIcon(fromAccount.accountKind));
                }
                accountBubble.createSpan({ text: `${txn.from} → ` });
                
                const toIconEl = accountBubble.createSpan({ cls: "cost-txn-account-icon-small" });
                if (toAccount?.icon) {
                    this.renderCustomIcon(toIconEl, toAccount.icon);
                } else if (toAccount) {
                    toIconEl.setText(this.getAccountIcon(toAccount.accountKind));
                }
                accountBubble.createSpan({ text: txn.to });
            } else {
                // 单账户：显示一个 icon
                const accountName = txn.from || txn.to;
                const account = this.findAccountByName(accountName);
                
                const iconEl = accountBubble.createSpan({ cls: "cost-txn-account-icon-small" });
                if (account?.icon) {
                    this.renderCustomIcon(iconEl, account.icon);
                } else if (account) {
                    iconEl.setText(this.getAccountIcon(account.accountKind));
                }
                accountBubble.createSpan({ text: accountName });
            }
        }
        
        // 显示退款信息
        if (txn.refund > 0) {
            bottomRow.createSpan({ cls: "cost-txn-refund", text: `退款 ${txn.refund.toFixed(2)}` });
        }

        // 金额
        const amountCol = item.createDiv({ cls: "cost-txn-amount-col" });
        
        const amountEl = amountCol.createDiv({ cls: "cost-txn-amount" });
        const prefix = txn.txnType === "收入" ? "+" : (txn.txnType === "支出" || txn.txnType === "还款" ? "-" : "");
        if (txn.txnType === "支出" && txn.refund > 0) {
            const netAmount = txn.amount - txn.refund;
            amountEl.setText(`${prefix}${netAmount.toFixed(2)}`);
            const originalEl = amountCol.createDiv({ cls: "cost-txn-original-amount" });
            originalEl.setText(`原 ${txn.amount.toFixed(2)}`);
        } else {
            amountEl.setText(`${prefix}${txn.amount.toFixed(2)}`);
        }
        amountEl.addClass(`cost-amount-${txn.txnType}`);

        // 在金额下方显示账户余额变化（只显示余额变化，不显示账户名）
        if (txnBalances && txnBalances.size > 0) {
            const balanceChangesEl = amountCol.createDiv({ cls: "cost-txn-balance-changes" });
            const entries: Array<[string, { before: number; after: number }]> = Array.from(txnBalances.entries());
            
            entries.forEach((entry) => {
                const accountName = entry[0];
                const balance = entry[1];
                const changeEl = balanceChangesEl.createSpan({ cls: "cost-txn-balance-bubble" });
                changeEl.setText(`${balance.before.toFixed(0)}→${balance.after.toFixed(0)}`);
                
                // 根据账户类型和余额变化方向设置颜色
                const account = this.findAccountByName(accountName);
                const isCredit = account?.accountKind === "credit";
                const change = balance.after - balance.before;
                
                if (isCredit) {
                    // 信用卡（负债）：余额增加表示负债减少（浅绿），余额减少表示负债增加（红色）
                    if (change > 0) {
                        changeEl.addClass("cost-balance-bubble-positive");
                    } else if (change < 0) {
                        changeEl.addClass("cost-balance-bubble-negative");
                    }
                } else {
                    // 普通账户（净资产）：余额增加（浅绿），余额减少（红色）
                    if (change > 0) {
                        changeEl.addClass("cost-balance-bubble-positive");
                    } else if (change < 0) {
                        changeEl.addClass("cost-balance-bubble-negative");
                    }
                }
            });
        }

        // 点击打开交易文件
        item.addEventListener("click", () => {
            const file = this.app.vault.getAbstractFileByPath(txn.path);
            if (file) {
                this.app.workspace.getLeaf().openFile(file as any);
            }
        });
    }

    /**
     * 渲染日期分组（针对特定账户，显示账户余额变化）
     */
    private renderDateGroupForAccount(
        container: HTMLElement, 
        date: string, 
        transactions: TransactionInfo[], 
        accountName: string,
        runningBalances?: Map<string, { before: number; after: number }>
    ): void {
        const group = container.createDiv({ cls: "cost-date-group" });

        // 日期标题
        const header = group.createDiv({ cls: "cost-date-header" });
        header.createSpan({ cls: "cost-date-text", text: date });
        
        // 计算当日该账户的余额变化
        let dailyChange = 0;
        for (const txn of transactions) {
            dailyChange += this.getTransactionBalanceChange(txn, accountName);
        }
        
        if (dailyChange !== 0) {
            const summaryEl = header.createDiv({ cls: "cost-date-summary" });
            const prefix = dailyChange > 0 ? "+" : "";
            const changeSpan = summaryEl.createSpan({ 
                cls: dailyChange > 0 ? "cost-income" : "cost-expense", 
                text: `${prefix}${dailyChange.toFixed(2)}` 
            });
        }

        // 交易列表
        const list = group.createDiv({ cls: "cost-transactions-list" });
        for (const txn of transactions) {
            this.renderTransactionItem(list, txn, accountName, runningBalances);
        }
    }

    /**
     * 渲染单个交易项
     * @param forAccount 如果指定，显示该账户的余额变化
     * @param runningBalances 运行余额映射（交易路径 -> {before, after}）
     */
    private renderTransactionItem(
        container: HTMLElement, 
        txn: TransactionInfo, 
        forAccount?: string,
        runningBalances?: Map<string, { before: number; after: number }>
    ): void {
        const item = container.createDiv({ cls: `cost-transaction-item cost-txn-${txn.txnType}` });

        // 分类图标
        const iconEl = item.createDiv({ cls: "cost-txn-icon" });
        iconEl.setText(this.getCategoryIcon(txn.category));

        // 交易信息
        const infoEl = item.createDiv({ cls: "cost-txn-info" });
        
        const topRow = infoEl.createDiv({ cls: "cost-txn-top-row" });
        topRow.createSpan({ cls: "cost-txn-category", text: txn.category || "未分类" });
        
        // 显示时间
        if (txn.time) {
            topRow.createSpan({ cls: "cost-txn-time", text: txn.time.substring(0, 5) }); // 显示 HH:MM
        }
        
        if (txn.payee) {
            const payeeEl = topRow.createSpan({ cls: "cost-txn-payee" });
            payeeEl.createSpan({ cls: "cost-txn-location-icon", text: "📍" });
            payeeEl.createSpan({ text: txn.payee });
        }

        const bottomRow = infoEl.createDiv({ cls: "cost-txn-bottom-row" });
        if (txn.memo) {
            bottomRow.createSpan({ cls: "cost-txn-memo", text: txn.memo });
        }
        
        // 显示账户名（带图标，使用统一的气泡样式）
        if (txn.from || txn.to) {
            const accountBubble = bottomRow.createSpan({ cls: "cost-txn-account-bubble" });
            
            if (txn.txnType === "转账" || txn.txnType === "还款") {
                // 转账/还款：显示两个账户的 icon
                const fromAccount = this.findAccountByName(txn.from);
                const toAccount = this.findAccountByName(txn.to);
                
                const fromIconEl = accountBubble.createSpan({ cls: "cost-txn-account-icon-small" });
                if (fromAccount?.icon) {
                    this.renderCustomIcon(fromIconEl, fromAccount.icon);
                } else if (fromAccount) {
                    fromIconEl.setText(this.getAccountIcon(fromAccount.accountKind));
                }
                accountBubble.createSpan({ text: `${txn.from} → ` });
                
                const toIconEl = accountBubble.createSpan({ cls: "cost-txn-account-icon-small" });
                if (toAccount?.icon) {
                    this.renderCustomIcon(toIconEl, toAccount.icon);
                } else if (toAccount) {
                    toIconEl.setText(this.getAccountIcon(toAccount.accountKind));
                }
                accountBubble.createSpan({ text: txn.to });
            } else {
                // 单账户：显示一个 icon
                const accountName = txn.from || txn.to;
                const account = this.findAccountByName(accountName);
                
                const acctIconEl = accountBubble.createSpan({ cls: "cost-txn-account-icon-small" });
                if (account?.icon) {
                    this.renderCustomIcon(acctIconEl, account.icon);
                } else if (account) {
                    acctIconEl.setText(this.getAccountIcon(account.accountKind));
                }
                accountBubble.createSpan({ text: accountName });
            }
        }
        
        // 显示退款信息
        if (txn.refund > 0) {
            bottomRow.createSpan({ cls: "cost-txn-refund", text: `退款 ${txn.refund.toFixed(2)}` });
        }

        // 金额和余额变化
        const amountCol = item.createDiv({ cls: "cost-txn-amount-col" });
        
        // 交易金额（如果有退款，显示实际支出）
        const amountEl = amountCol.createDiv({ cls: "cost-txn-amount" });
        const prefix = txn.txnType === "收入" ? "+" : (txn.txnType === "支出" || txn.txnType === "还款" ? "-" : "");
        if (txn.txnType === "支出" && txn.refund > 0) {
            // 显示实际支出金额
            const netAmount = txn.amount - txn.refund;
            amountEl.setText(`${prefix}${netAmount.toFixed(2)}`);
            // 添加原始金额的删除线
            const originalEl = amountCol.createDiv({ cls: "cost-txn-original-amount" });
            originalEl.setText(`原 ${txn.amount.toFixed(2)}`);
        } else {
            amountEl.setText(`${prefix}${txn.amount.toFixed(2)}`);
        }
        amountEl.addClass(`cost-amount-${txn.txnType}`);

        // 账户余额变化（使用统一的气泡样式）
        if (forAccount && runningBalances) {
            // 显示运行余额气泡
            const balance = runningBalances.get(txn.path);
            if (balance) {
                const balanceChangesEl = amountCol.createDiv({ cls: "cost-txn-balance-changes" });
                const changeEl = balanceChangesEl.createSpan({ cls: "cost-txn-balance-bubble" });
                changeEl.setText(`${balance.before.toFixed(0)}→${balance.after.toFixed(0)}`);
                
                // 根据账户类型和余额变化方向设置颜色
                const account = this.findAccountByName(forAccount);
                const isCredit = account?.accountKind === "credit";
                const change = balance.after - balance.before;
                
                if (isCredit) {
                    // 信用卡（负债）
                    if (change > 0) {
                        changeEl.addClass("cost-balance-bubble-positive");
                    } else if (change < 0) {
                        changeEl.addClass("cost-balance-bubble-negative");
                    }
                } else {
                    // 普通账户（净资产）
                    if (change > 0) {
                        changeEl.addClass("cost-balance-bubble-positive");
                    } else if (change < 0) {
                        changeEl.addClass("cost-balance-bubble-negative");
                    }
                }
            }
        }

        // 点击打开交易文件
        item.addEventListener("click", () => {
            const file = this.app.vault.getAbstractFileByPath(txn.path);
            if (file) {
                this.app.workspace.getLeaf().openFile(file as any);
            }
        });
    }

    /**
     * 获取交易对指定账户的余额变化
     */
    private getTransactionBalanceChange(txn: TransactionInfo, accountName: string): number {
        const fromName = txn.from?.replace(/\[\[|\]\]/g, "") || "";
        const toName = txn.to?.replace(/\[\[|\]\]/g, "") || "";
        
        switch (txn.txnType) {
            case "收入":
                // 收入：to 账户增加
                if (toName === accountName || fromName === accountName) {
                    return txn.amount;
                }
                break;
            case "支出":
                // 支出：from 账户减少（考虑退款）
                if (fromName === accountName || toName === accountName) {
                    return -(txn.amount - txn.refund);
                }
                break;
            case "还款":
                // 还款：from 账户减少，to 账户增加（信用卡负债减少）
                if (fromName === accountName && toName === accountName) {
                    return 0;
                }
                if (fromName === accountName) {
                    return -txn.amount;
                }
                if (toName === accountName) {
                    return txn.amount;
                }
                break;
            case "转账":
                // 转账：from 减少，to 增加
                if (fromName === accountName) {
                    return -txn.amount;
                }
                if (toName === accountName) {
                    return txn.amount;
                }
                break;
        }
        return 0;
    }

    /**
     * 渲染所有相关账户的余额变化
     */
    private renderAllAccountChanges(container: HTMLElement, txn: TransactionInfo): void {
        const changes: { account: string; change: number }[] = [];
        
        const fromName = txn.from?.replace(/\[\[|\]\]/g, "") || "";
        const toName = txn.to?.replace(/\[\[|\]\]/g, "") || "";
        
        switch (txn.txnType) {
            case "收入":
                if (toName) {
                    changes.push({ account: toName, change: txn.amount });
                } else if (fromName) {
                    changes.push({ account: fromName, change: txn.amount });
                }
                break;
            case "支出":
                if (fromName) {
                    changes.push({ account: fromName, change: -(txn.amount - txn.refund) });
                } else if (toName) {
                    changes.push({ account: toName, change: -(txn.amount - txn.refund) });
                }
                break;
            case "还款":
                // 还款：from 减少，to 增加（信用卡负债减少）
                if (fromName) {
                    changes.push({ account: fromName, change: -txn.amount });
                }
                if (toName) {
                    changes.push({ account: toName, change: txn.amount });
                }
                break;
            case "转账":
                if (fromName) {
                    changes.push({ account: fromName, change: -txn.amount });
                }
                if (toName) {
                    changes.push({ account: toName, change: txn.amount });
                }
                break;
        }
        
        if (changes.length > 0) {
            const changesContainer = container.createDiv({ cls: "cost-txn-account-changes" });
            for (const { account, change } of changes) {
                const changeEl = changesContainer.createDiv({ cls: "cost-txn-account-change" });
                const prefix = change > 0 ? "+" : "";
                changeEl.setText(`${account}: ${prefix}${change.toFixed(2)}`);
                changeEl.addClass(change > 0 ? "cost-balance-positive" : "cost-balance-negative");
            }
        }
    }

    /**
     * 渲染账户标签页 - 左右两列布局
     */
    private async renderAccountsTab(container: HTMLElement): Promise<void> {
        const accounts = this.plugin.accountService.getAccounts();

        // 渲染总余额汇总卡片
        this.renderBalanceSummary(container, accounts);

        // 创建两列布局
        const layout = container.createDiv({ cls: "cost-accounts-layout" });

        // 左侧：账户列表
        const leftCol = layout.createDiv({ cls: "cost-accounts-left" });
        this.renderAccountsListColumn(leftCol, accounts);

        // 右侧：交易列表
        const rightCol = layout.createDiv({ cls: "cost-accounts-right" });
        this.renderAccountTransactionsColumn(rightCol);
    }

    /**
     * 渲染总余额汇总卡片
     */
    private renderBalanceSummary(container: HTMLElement, accounts: AccountInfo[]): void {
        const summaryCard = container.createDiv({ cls: "cost-balance-summary-card" });

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
     * 渲染账户列表列
     */
    private renderAccountsListColumn(container: HTMLElement, accounts: AccountInfo[]): void {
        const header = container.createDiv({ cls: "cost-col-header" });
        header.createEl("h4", { text: "账户" });

        if (accounts.length === 0) {
            container.createDiv({ cls: "cost-empty-message", text: "暂无账户" });
            return;
        }

        const list = container.createDiv({ cls: "cost-accounts-col-list" });

        // 按账户类型分组
        const grouped = this.groupAccountsByKind(accounts);

        // 按优先级顺序渲染分组
        for (const kind of this.accountKindOrder) {
            const groupAccounts = grouped.get(kind);
            if (groupAccounts && groupAccounts.length > 0) {
                this.renderAccountGroupInList(list, kind, groupAccounts);
            }
        }

        // 渲染未知类型的账户
        for (const [kind, groupAccounts] of grouped) {
            if (!this.accountKindOrder.includes(kind) && groupAccounts.length > 0) {
                this.renderAccountGroupInList(list, kind, groupAccounts);
            }
        }
    }

    /**
     * 渲染账户分组（在列表中）
     */
    private renderAccountGroupInList(container: HTMLElement, kind: string, accounts: AccountInfo[]): void {
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
        totalEl.setText(totalBalance.toFixed(2));
        if (totalBalance >= 0) {
            totalEl.addClass("cost-balance-positive");
        } else {
            totalEl.addClass("cost-balance-negative");
        }

        // 账户列表
        const listEl = groupEl.createDiv({ cls: "cost-account-group-list" });
        for (const account of accounts) {
            const isSelected = this.selectedAccount?.path === account.path;
            this.renderAccountListItem(listEl, account, isSelected);
        }
    }

    /**
     * 渲染账户列表项
     */
    private renderAccountListItem(container: HTMLElement, account: AccountInfo, isSelected: boolean): void {
        const item = container.createDiv({ 
            cls: `cost-account-list-item ${isSelected ? "is-selected" : ""}` 
        });

        // 图标（优先使用自定义图标）
        const iconEl = item.createDiv({ cls: "cost-account-list-icon" });
        this.renderAccountIcon(iconEl, account);

        // 信息
        const infoEl = item.createDiv({ cls: "cost-account-list-info" });
        
        const topRow = infoEl.createDiv({ cls: "cost-account-list-top" });
        const nameEl = topRow.createSpan({ cls: "cost-account-list-name" });
        nameEl.setText(account.displayName);

        // 余额
        const balance = this.calculateBalance(account);
        const balanceEl = topRow.createSpan({ cls: "cost-account-list-balance" });
        balanceEl.setText(`${balance.toFixed(2)}`);
        if (balance >= 0) {
            balanceEl.addClass("cost-balance-positive");
        } else {
            balanceEl.addClass("cost-balance-negative");
        }

        // 交易数量
        const txnCount = this.plugin.transactionService.getTransactionsByAccount(account.fileName).length;
        const countEl = infoEl.createDiv({ cls: "cost-account-list-count" });
        countEl.setText(`${txnCount} 笔交易`);

        // 点击选中账户
        item.addEventListener("click", () => {
            this.selectedAccount = account;
            this.render();
        });
    }

    /**
     * 计算账户余额
     */
    private calculateBalance(account: AccountInfo): number {
        const change = this.plugin.transactionService.calculateBalanceChange(account.fileName);
        return account.openingBalance + change;
    }

    /**
     * 渲染交易列表列
     */
    private renderAccountTransactionsColumn(container: HTMLElement): void {
        const header = container.createDiv({ cls: "cost-col-header" });
        header.createEl("h4", { text: this.selectedAccount ? this.selectedAccount.displayName + " 的交易" : "交易" });

        if (!this.selectedAccount) {
            container.createDiv({ cls: "cost-empty-message cost-select-hint", text: "← 请选择一个账户查看交易" });
            return;
        }

        // 获取账户交易
        const transactions = this.plugin.transactionService.getTransactionsByAccount(this.selectedAccount.fileName);

        if (transactions.length === 0) {
            container.createDiv({ cls: "cost-empty-message", text: "该账户暂无交易记录" });
            return;
        }

        // 计算运行余额
        const runningBalances = this.plugin.transactionService.calculateRunningBalances(
            this.selectedAccount.fileName,
            this.selectedAccount.openingBalance
        );

        const listContainer = container.createDiv({ cls: "cost-txn-col-list" });

        // 按日期分组显示交易
        const grouped = new Map<string, TransactionInfo[]>();
        for (const txn of transactions) {
            const date = txn.date || "未知日期";
            if (!grouped.has(date)) {
                grouped.set(date, []);
            }
            grouped.get(date)!.push(txn);
        }

        for (const [date, txns] of grouped) {
            this.renderDateGroupForAccount(listContainer, date, txns, this.selectedAccount!.fileName, runningBalances);
        }
    }

    /**
     * 渲染账户列表（旧方法，保留兼容）
     */
    private renderAccountsList(container: HTMLElement): void {
        const accounts = this.plugin.accountService.getAccounts();

        if (accounts.length === 0) {
            container.createDiv({ cls: "cost-empty-message", text: "暂无账户" });
            return;
        }

        const list = container.createDiv({ cls: "cost-accounts-grid" });

        for (const account of accounts) {
            this.renderAccountCard(list, account);
        }
    }

    /**
     * 渲染账户卡片
     */
    private renderAccountCard(container: HTMLElement, account: AccountInfo): void {
        const card = container.createDiv({ cls: "cost-account-card" });

        // 图标（优先使用自定义图标）
        const iconEl = card.createDiv({ cls: "cost-account-card-icon" });
        this.renderAccountIcon(iconEl, account);

        // 名称
        const nameEl = card.createDiv({ cls: "cost-account-card-name" });
        nameEl.setText(account.displayName);

        // 类型
        if (account.accountKind) {
            const typeEl = card.createDiv({ cls: "cost-account-card-type" });
            typeEl.setText(account.accountKind);
        }

        // 交易数量
        const txnCount = this.plugin.transactionService.getTransactionsByAccount(account.fileName).length;
        const countEl = card.createDiv({ cls: "cost-account-card-count" });
        countEl.setText(`${txnCount} 笔交易`);

        // 点击查看账户交易
        card.addEventListener("click", () => {
            this.selectedAccount = account;
            this.render();
        });
    }

    /**
     * 渲染账户的交易列表
     */
    private renderAccountTransactions(container: HTMLElement): void {
        if (!this.selectedAccount) return;

        // 返回按钮
        const backBtn = container.createDiv({ cls: "cost-back-btn" });
        backBtn.createSpan({ text: "← 返回账户列表" });
        backBtn.addEventListener("click", () => {
            this.selectedAccount = null;
            this.render();
        });

        // 账户标题
        const header = container.createDiv({ cls: "cost-account-header" });
        header.createEl("h3", { text: this.selectedAccount.displayName });

        // 获取账户交易
        const transactions = this.plugin.transactionService.getTransactionsByAccount(this.selectedAccount.fileName);

        if (transactions.length === 0) {
            container.createDiv({ cls: "cost-empty-message", text: "该账户暂无交易记录" });
            return;
        }

        // 按日期分组显示交易
        const grouped = new Map<string, TransactionInfo[]>();
        for (const txn of transactions) {
            const date = txn.date || "未知日期";
            if (!grouped.has(date)) {
                grouped.set(date, []);
            }
            grouped.get(date)!.push(txn);
        }

        for (const [date, txns] of grouped) {
            this.renderDateGroupForAccount(container, date, txns, this.selectedAccount.fileName);
        }
    }

    /**
     * 获取分类图标
     */
    private getCategoryIcon(category: string): string {
        const icons: Record<string, string> = {
            "餐饮": "🍜",
            "交通": "🚗",
            "购物": "🛒",
            "娱乐": "🎮",
            "医疗": "🏥",
            "教育": "📚",
            "工资": "💼",
            "投资": "📈",
            "转账": "🔄",
            "其他": "📝",
        };
        return icons[category] || "💰";
    }

    /**
     * 获取账户图标
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
     * 渲染账户图标（优先使用自定义图标）
     */
    private renderAccountIcon(container: HTMLElement, account: AccountInfo): void {
        if (account.icon) {
            this.renderCustomIcon(container, account.icon);
        } else {
            container.setText(this.getAccountIcon(account.accountKind));
        }
    }

    /**
     * 渲染自定义图标（从 wiki link 格式解析图片）
     */
    private renderCustomIcon(container: HTMLElement, iconLink: string): void {
        const match = iconLink.match(/\[\[(.+?)\]\]/);
        if (match && match[1]) {
            const fileName: string = match[1];
            const files = this.app.vault.getFiles();
            const imageFile = files.find(f => f.name === fileName || f.path.endsWith(fileName));
            if (imageFile) {
                const img = container.createEl("img", { cls: "cost-account-custom-icon" });
                img.src = this.app.vault.getResourcePath(imageFile);
                img.alt = fileName;
                return;
            }
        }
        container.innerHTML = "💰";
    }

    /**
     * 根据账户名查找账户信息
     */
    private findAccountByName(accountName: string): AccountInfo | undefined {
        const accounts = this.plugin.accountService.getAccounts();
        return accounts.find(a => a.fileName === accountName || a.displayName === accountName);
    }
}
