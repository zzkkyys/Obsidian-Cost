import { ItemView, WorkspaceLeaf, setIcon, Menu } from "obsidian";
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
    
    // 日历视图状态
    private calendarYear: number = new Date().getFullYear();
    private calendarMonth: number = new Date().getMonth();  // 0-11
    
    // 性能优化：缓存
    private iconCache: Map<string, string> = new Map();  // icon link -> resource path
    private accountNameCache: Map<string, AccountInfo> = new Map();  // account name -> account info
    private lastCacheTime: number = 0;
    private readonly CACHE_DURATION = 5000;  // 5秒缓存

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
        
        // 刷新缓存
        this.refreshCacheIfNeeded();

        // 标签栏
        this.renderTabs();

        // 内容区域
        const content = this.contentEl.createDiv({ cls: "cost-view-content" });

        if (this.currentTab === "transactions") {
            await this.renderTransactionsTab(content);
        } else if (this.currentTab === "accounts") {
            await this.renderAccountsTab(content);
        }
    }

    /**
     * 刷新缓存（如果需要）
     */
    private refreshCacheIfNeeded(): void {
        const now = Date.now();
        if (now - this.lastCacheTime > this.CACHE_DURATION) {
            this.rebuildAccountNameCache();
            this.lastCacheTime = now;
        }
    }

    /**
     * 重建账户名缓存
     */
    private rebuildAccountNameCache(): void {
        this.accountNameCache.clear();
        const accounts = this.plugin.accountService.getAccounts();
        for (const account of accounts) {
            this.accountNameCache.set(account.fileName, account);
            if (account.displayName !== account.fileName) {
                this.accountNameCache.set(account.displayName, account);
            }
        }
    }

    /**
     * 强制刷新缓存
     */
    public invalidateCache(): void {
        this.lastCacheTime = 0;
        this.iconCache.clear();
        this.accountNameCache.clear();
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

        // 添加交易按钮
        const addTxnBtn = tabBar.createDiv({ cls: "cost-tab-action" });
        setIcon(addTxnBtn, "plus");
        addTxnBtn.title = "添加交易";
        addTxnBtn.addEventListener("click", () => {
            this.createNewTransaction();
        });

        // 刷新按钮
        const refreshBtn = tabBar.createDiv({ cls: "cost-tab-refresh" });
        setIcon(refreshBtn, "refresh-cw");
        refreshBtn.title = "刷新数据";
        refreshBtn.addEventListener("click", async () => {
            this.invalidateCache();  // 清除缓存
            await this.plugin.accountService.scanAccounts();
            await this.plugin.transactionService.scanTransactions();
            await this.render();
        });
    }

    /**
     * 渲染交易标签页 - 两列布局
     */
    private async renderTransactionsTab(container: HTMLElement): Promise<void> {
        const transactions = this.plugin.transactionService.getTransactions();
        const accounts = this.plugin.accountService.getAccounts();

        // 两列布局
        const layout = container.createDiv({ cls: "cost-txn-layout" });
        
        // 左侧栏：资产汇总 + 日历
        const leftCol = layout.createDiv({ cls: "cost-txn-left-col" });
        
        // 资产汇总卡片
        this.renderBalanceSummary(leftCol, accounts);
        
        // 迷你日历
        this.renderMiniCalendar(leftCol);
        
        // 右侧栏：交易列表
        const rightCol = layout.createDiv({ cls: "cost-txn-right-col" });
        
        if (transactions.length === 0) {
            rightCol.createDiv({ cls: "cost-empty-message", text: "暂无交易记录" });
            return;
        }

        // 计算所有账户的运行余额
        const accountOpeningBalances = this.getAccountOpeningBalances();
        const allRunningBalances = this.plugin.transactionService.calculateAllAccountsRunningBalances(accountOpeningBalances);

        // 按日期分组
        const grouped = this.plugin.transactionService.getTransactionsGroupedByDate();

        for (const [date, txns] of grouped) {
            this.renderDateGroupWithBalances(rightCol, date, txns, allRunningBalances);
        }
    }

    /**
     * 渲染迷你日历（用于交易页左侧栏）
     */
    private renderMiniCalendar(container: HTMLElement): void {
        const calendarWidget = container.createDiv({ cls: "cost-mini-calendar" });
        
        // 日历头部
        const header = calendarWidget.createDiv({ cls: "cost-mini-calendar-header" });
        
        // 上个月按钮
        const prevBtn = header.createDiv({ cls: "cost-mini-calendar-nav" });
        setIcon(prevBtn, "chevron-left");
        prevBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            this.calendarMonth--;
            if (this.calendarMonth < 0) {
                this.calendarMonth = 11;
                this.calendarYear--;
            }
            this.render();
        });
        
        // 当前年月
        const titleEl = header.createDiv({ cls: "cost-mini-calendar-title" });
        titleEl.setText(`${this.calendarYear}年${this.calendarMonth + 1}月`);
        
        // 下个月按钮
        const nextBtn = header.createDiv({ cls: "cost-mini-calendar-nav" });
        setIcon(nextBtn, "chevron-right");
        nextBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            this.calendarMonth++;
            if (this.calendarMonth > 11) {
                this.calendarMonth = 0;
                this.calendarYear++;
            }
            this.render();
        });
        
        // 月度统计
        const monthStats = this.calculateMonthStats(this.calendarYear, this.calendarMonth);
        const statsEl = calendarWidget.createDiv({ cls: "cost-mini-calendar-stats" });
        statsEl.createSpan({ cls: "cost-mini-stat cost-income", text: `+${this.formatCompact(monthStats.income)}` });
        statsEl.createSpan({ cls: "cost-mini-stat cost-expense", text: `-${this.formatCompact(monthStats.expense)}` });
        statsEl.createSpan({ cls: "cost-mini-stat", text: `${monthStats.count}笔` });
        
        // 星期标题
        const weekHeader = calendarWidget.createDiv({ cls: "cost-mini-calendar-weekdays" });
        const weekdays = ["日", "一", "二", "三", "四", "五", "六"];
        for (const day of weekdays) {
            weekHeader.createDiv({ cls: "cost-mini-weekday", text: day });
        }
        
        // 日历网格
        const grid = calendarWidget.createDiv({ cls: "cost-mini-calendar-grid" });
        this.renderMiniCalendarGrid(grid, this.calendarYear, this.calendarMonth);
    }

    /**
     * 渲染迷你日历网格
     */
    private renderMiniCalendarGrid(container: HTMLElement, year: number, month: number): void {
        const today = new Date();
        const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
        
        const firstDay = new Date(year, month, 1);
        const lastDay = new Date(year, month + 1, 0);
        const dailyStats = this.getDailyStats(year, month);
        
        // 填充上月的空白日期
        const startWeekday = firstDay.getDay();
        for (let i = 0; i < startWeekday; i++) {
            container.createDiv({ cls: "cost-mini-day cost-mini-day-empty" });
        }
        
        // 渲染当月日期
        for (let day = 1; day <= lastDay.getDate(); day++) {
            const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
            const stats = dailyStats.get(dateStr);
            const isToday = dateStr === todayStr;
            
            const dayEl = container.createDiv({ 
                cls: `cost-mini-day ${isToday ? "cost-mini-day-today" : ""} ${stats ? "cost-mini-day-has-data" : ""}` 
            });
            
            // 日期数字
            dayEl.createDiv({ cls: "cost-mini-day-num", text: String(day) });
            
            // 有交易的日期显示统计
            if (stats) {
                const statsEl = dayEl.createDiv({ cls: "cost-mini-day-stats" });
                
                // 始终显示收入和支出
                statsEl.createDiv({ cls: "cost-mini-day-income", text: `+${stats.income > 0 ? this.formatCompact(stats.income) : "0"}` });
                statsEl.createDiv({ cls: "cost-mini-day-expense", text: `-${stats.expense > 0 ? this.formatCompact(stats.expense) : "0"}` });
                
                // 交易笔数
                statsEl.createDiv({ cls: "cost-mini-day-count", text: `${stats.count}笔` });
                
                // 点击滚动到对应日期
                dayEl.addEventListener("click", () => {
                    this.scrollToDate(dateStr);
                });
            }
        }
        
        // 填充下月的空白日期
        const endWeekday = lastDay.getDay();
        for (let i = endWeekday + 1; i < 7; i++) {
            container.createDiv({ cls: "cost-mini-day cost-mini-day-empty" });
        }
    }

    /**
     * 滚动到指定日期
     */
    private scrollToDate(dateStr: string): void {
        const dateHeaders = this.contentEl.querySelectorAll(".cost-date-text");
        for (const header of Array.from(dateHeaders)) {
            if (header.textContent === dateStr) {
                header.scrollIntoView({ behavior: "smooth", block: "start" });
                // 高亮效果
                const parent = header.closest(".cost-date-group");
                if (parent) {
                    parent.addClass("cost-date-group-highlight");
                    setTimeout(() => parent.removeClass("cost-date-group-highlight"), 1500);
                }
                break;
            }
        }
    }

    /**
     * 计算月度统计
     */
    private calculateMonthStats(year: number, month: number): { income: number; expense: number; count: number } {
        const transactions = this.plugin.transactionService.getTransactions();
        const monthStr = `${year}-${String(month + 1).padStart(2, "0")}`;
        
        let income = 0;
        let expense = 0;
        let count = 0;
        
        for (const txn of transactions) {
            if (txn.date.startsWith(monthStr)) {
                count++;
                if (txn.txnType === "收入") {
                    income += txn.amount;
                } else if (txn.txnType === "支出") {
                    expense += txn.amount - txn.refund;
                }
            }
        }
        
        return { income, expense, count };
    }

    /**
     * 获取每日统计
     */
    private getDailyStats(year: number, month: number): Map<string, { income: number; expense: number; count: number }> {
        const transactions = this.plugin.transactionService.getTransactions();
        const monthStr = `${year}-${String(month + 1).padStart(2, "0")}`;
        const stats = new Map<string, { income: number; expense: number; count: number }>();
        
        for (const txn of transactions) {
            if (txn.date.startsWith(monthStr)) {
                if (!stats.has(txn.date)) {
                    stats.set(txn.date, { income: 0, expense: 0, count: 0 });
                }
                const dayStat = stats.get(txn.date)!;
                dayStat.count++;
                if (txn.txnType === "收入") {
                    dayStat.income += txn.amount;
                } else if (txn.txnType === "支出") {
                    dayStat.expense += txn.amount - txn.refund;
                }
            }
        }
        
        return stats;
    }

    /**
     * 格式化紧凑数字（如 1.2k）
     */
    private formatCompact(num: number): string {
        if (num >= 10000) {
            return (num / 10000).toFixed(1) + "万";
        } else if (num >= 1000) {
            return (num / 1000).toFixed(1) + "k";
        }
        return num.toFixed(0);
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
        
        // 显示商家/收款方
        if (txn.payee) {
            topRow.createSpan({ cls: "cost-txn-payee", text: txn.payee });
        }
        
        // 显示地址（带位置图标）
        if (txn.address) {
            const addressEl = topRow.createSpan({ cls: "cost-txn-address" });
            const iconEl = addressEl.createSpan({ cls: "cost-txn-location-icon" });
            iconEl.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><path fill="#ee3616" d="M255.012 0c-73.325 0-135 53.75-135 147 0 94.523 118.633 232.035 123.683 237.844 5.97 6.867 16.657 6.879 22.637 0 5.05-5.809 123.68-143.32 123.68-237.844 0-92.39-62.805-147-135-147zm0 180c-24.813 0-45-20.188-45-45s20.187-45 45-45 45 20.188 45 45-20.188 45-45 45z"/></svg>';
            addressEl.createSpan({ text: txn.address });
        }

        // 第二行：日期、时间、账户、备注
        const bottomRow = infoEl.createDiv({ cls: "cost-txn-bottom-row" });
        
        // 日期部分（可点击编辑）
        const dateEl = bottomRow.createSpan({ cls: "cost-txn-date-clickable" });
        dateEl.setText(txn.date || "未设置日期");
        dateEl.addEventListener("click", (e) => {
            e.stopPropagation();
            this.showDatePicker(txn);
        });
        
        // 时间部分（可点击编辑）
        const timeEl = bottomRow.createSpan({ cls: "cost-txn-time-clickable" });
        timeEl.setText(txn.time || "--:--:--");
        timeEl.addEventListener("click", (e) => {
            e.stopPropagation();
            this.showTimePicker(txn);
        });
        
        // 显示账户名（不含余额）
        const txnBalances = allRunningBalances.get(txn.path);
        if (txn.from || txn.to) {
            const accountBubble = bottomRow.createSpan({ cls: "cost-txn-account-bubble cost-txn-account-clickable" });
            
            if (txn.txnType === "转账" || txn.txnType === "还款") {
                // 转账/还款：显示两个账户的 icon
                const fromAccount = this.findAccountByName(txn.from);
                const toAccount = this.findAccountByName(txn.to);
                
                // From 账户（可点击更改）
                const fromEl = accountBubble.createSpan({ cls: "cost-txn-account-editable" });
                const fromIconEl = fromEl.createSpan({ cls: "cost-txn-account-icon-small" });
                if (fromAccount?.icon) {
                    this.renderCustomIcon(fromIconEl, fromAccount.icon);
                } else if (fromAccount) {
                    fromIconEl.setText(this.getAccountIcon(fromAccount.accountKind));
                }
                fromEl.createSpan({ text: txn.from });
                fromEl.addEventListener("click", (e) => {
                    e.stopPropagation();
                    this.showAccountSelectionMenu(e, txn, "from");
                });
                
                accountBubble.createSpan({ text: " → " });
                
                // To 账户（可点击更改）
                const toEl = accountBubble.createSpan({ cls: "cost-txn-account-editable" });
                const toIconEl = toEl.createSpan({ cls: "cost-txn-account-icon-small" });
                if (toAccount?.icon) {
                    this.renderCustomIcon(toIconEl, toAccount.icon);
                } else if (toAccount) {
                    toIconEl.setText(this.getAccountIcon(toAccount.accountKind));
                }
                toEl.createSpan({ text: txn.to });
                toEl.addEventListener("click", (e) => {
                    e.stopPropagation();
                    this.showAccountSelectionMenu(e, txn, "to");
                });
            } else {
                // 单账户：显示一个 icon（可点击更改）
                const accountName = txn.from || txn.to;
                const account = this.findAccountByName(accountName);
                const field = txn.from ? "from" : "to";
                
                const accountEl = accountBubble.createSpan({ cls: "cost-txn-account-editable" });
                const iconEl = accountEl.createSpan({ cls: "cost-txn-account-icon-small" });
                if (account?.icon) {
                    this.renderCustomIcon(iconEl, account.icon);
                } else if (account) {
                    iconEl.setText(this.getAccountIcon(account.accountKind));
                }
                accountEl.createSpan({ text: accountName });
                accountEl.addEventListener("click", (e) => {
                    e.stopPropagation();
                    this.showAccountSelectionMenu(e, txn, field);
                });
            }
        }
        
        // 显示备注（note）
        if (txn.note) {
            bottomRow.createSpan({ cls: "cost-txn-note", text: txn.note });
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
                changeEl.createSpan({ text: balance.before.toFixed(0) });
                changeEl.createSpan({ cls: "cost-txn-balance-arrow", text: "→" });
                changeEl.createSpan({ text: balance.after.toFixed(0) });
                
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
        
        // 显示商家/收款方
        if (txn.payee) {
            topRow.createSpan({ cls: "cost-txn-payee", text: txn.payee });
        }
        
        // 显示地址（带位置图标）
        if (txn.address) {
            const addressEl = topRow.createSpan({ cls: "cost-txn-address" });
            const iconEl = addressEl.createSpan({ cls: "cost-txn-location-icon" });
            iconEl.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><path fill="#ee3616" d="M255.012 0c-73.325 0-135 53.75-135 147 0 94.523 118.633 232.035 123.683 237.844 5.97 6.867 16.657 6.879 22.637 0 5.05-5.809 123.68-143.32 123.68-237.844 0-92.39-62.805-147-135-147zm0 180c-24.813 0-45-20.188-45-45s20.187-45 45-45 45 20.188 45 45-20.188 45-45 45z"/></svg>';
            addressEl.createSpan({ text: txn.address });
        }

        // 第二行：日期、时间、账户、备注
        const bottomRow = infoEl.createDiv({ cls: "cost-txn-bottom-row" });
        
        // 日期部分（可点击编辑）
        const dateEl = bottomRow.createSpan({ cls: "cost-txn-date-clickable" });
        dateEl.setText(txn.date || "未设置日期");
        dateEl.addEventListener("click", (e) => {
            e.stopPropagation();
            this.showDatePicker(txn);
        });
        
        // 时间部分（可点击编辑）
        const timeEl = bottomRow.createSpan({ cls: "cost-txn-time-clickable" });
        timeEl.setText(txn.time || "--:--:--");
        timeEl.addEventListener("click", (e) => {
            e.stopPropagation();
            this.showTimePicker(txn);
        });
        
        // 显示账户名（带图标，使用统一的气泡样式，可点击更改）
        if (txn.from || txn.to) {
            const accountBubble = bottomRow.createSpan({ cls: "cost-txn-account-bubble cost-txn-account-clickable" });
            
            if (txn.txnType === "转账" || txn.txnType === "还款") {
                // 转账/还款：显示两个账户的 icon
                const fromAccount = this.findAccountByName(txn.from);
                const toAccount = this.findAccountByName(txn.to);
                
                // From 账户（可点击更改）
                const fromEl = accountBubble.createSpan({ cls: "cost-txn-account-editable" });
                const fromIconEl = fromEl.createSpan({ cls: "cost-txn-account-icon-small" });
                if (fromAccount?.icon) {
                    this.renderCustomIcon(fromIconEl, fromAccount.icon);
                } else if (fromAccount) {
                    fromIconEl.setText(this.getAccountIcon(fromAccount.accountKind));
                }
                fromEl.createSpan({ text: txn.from });
                fromEl.addEventListener("click", (e) => {
                    e.stopPropagation();
                    this.showAccountSelectionMenu(e, txn, "from");
                });
                
                accountBubble.createSpan({ text: " → " });
                
                // To 账户（可点击更改）
                const toEl = accountBubble.createSpan({ cls: "cost-txn-account-editable" });
                const toIconEl = toEl.createSpan({ cls: "cost-txn-account-icon-small" });
                if (toAccount?.icon) {
                    this.renderCustomIcon(toIconEl, toAccount.icon);
                } else if (toAccount) {
                    toIconEl.setText(this.getAccountIcon(toAccount.accountKind));
                }
                toEl.createSpan({ text: txn.to });
                toEl.addEventListener("click", (e) => {
                    e.stopPropagation();
                    this.showAccountSelectionMenu(e, txn, "to");
                });
            } else {
                // 单账户：显示一个 icon（可点击更改）
                const accountName = txn.from || txn.to;
                const account = this.findAccountByName(accountName);
                const field = txn.from ? "from" : "to";
                
                const accountEl = accountBubble.createSpan({ cls: "cost-txn-account-editable" });
                const acctIconEl = accountEl.createSpan({ cls: "cost-txn-account-icon-small" });
                if (account?.icon) {
                    this.renderCustomIcon(acctIconEl, account.icon);
                } else if (account) {
                    acctIconEl.setText(this.getAccountIcon(account.accountKind));
                }
                accountEl.createSpan({ text: accountName });
                accountEl.addEventListener("click", (e) => {
                    e.stopPropagation();
                    this.showAccountSelectionMenu(e, txn, field);
                });
            }
        }
        
        // 显示备注（note）
        if (txn.note) {
            bottomRow.createSpan({ cls: "cost-txn-note", text: txn.note });
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
                changeEl.createSpan({ text: balance.before.toFixed(0) });
                changeEl.createSpan({ cls: "cost-txn-balance-arrow", text: "→" });
                changeEl.createSpan({ text: balance.after.toFixed(0) });
                
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
        
        const nameEl = infoEl.createDiv({ cls: "cost-account-list-name" });
        nameEl.setText(account.displayName);

        // 交易数量
        const txnCount = this.plugin.transactionService.getTransactionsByAccount(account.fileName).length;
        const countEl = infoEl.createDiv({ cls: "cost-account-list-count" });
        countEl.setText(`${txnCount} 笔交易`);

        // 余额（放在右边）
        const balance = this.calculateBalance(account);
        const balanceEl = item.createDiv({ cls: "cost-account-list-balance" });
        balanceEl.setText(`${balance.toFixed(2)}`);
        if (balance >= 0) {
            balanceEl.addClass("cost-balance-positive");
        } else {
            balanceEl.addClass("cost-balance-negative");
        }

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
        
        const match = iconLink.match(/\[\[(.+?)\]\]/);
        if (match && match[1]) {
            const fileName: string = match[1];
            // 使用 metadataCache 的 getFirstLinkpathDest 更高效
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
        this.iconCache.set(iconLink, "__default__");  // 缓存默认值
        container.innerHTML = "💰";
    }

    /**
     * 根据账户名查找账户信息（使用缓存）
     */
    private findAccountByName(accountName: string): AccountInfo | undefined {
        if (!accountName) return undefined;
        
        // 先从缓存查找
        const cached = this.accountNameCache.get(accountName);
        if (cached) return cached;
        
        // 缓存未命中，重建缓存后再查找
        this.rebuildAccountNameCache();
        return this.accountNameCache.get(accountName);
    }

    /**
     * 显示账户选择菜单
     */
    private showAccountSelectionMenu(event: MouseEvent, txn: TransactionInfo, field: "from" | "to"): void {
        const menu = new Menu();
        const accounts = this.plugin.accountService.getAccounts();
        
        // 按账户类型分组
        const grouped = this.groupAccountsByKind(accounts);
        
        // 按优先级顺序添加菜单项
        for (const kind of this.accountKindOrder) {
            const groupAccounts = grouped.get(kind);
            if (groupAccounts && groupAccounts.length > 0) {
                const kindName = this.accountKindNames[kind] || kind;
                
                // 添加分组标题
                menu.addItem((item) => {
                    item.setTitle(`── ${kindName} ──`)
                        .setDisabled(true);
                });
                
                // 添加该分组下的账户
                for (const account of groupAccounts) {
                    const currentValue = field === "from" ? txn.from : txn.to;
                    const isSelected = account.fileName === currentValue;
                    
                    menu.addItem((item) => {
                        item.setTitle(`${isSelected ? "✓ " : "   "}${this.getAccountIcon(account.accountKind)} ${account.displayName}`)
                            .onClick(async () => {
                                await this.updateTransactionAccount(txn, field, account.fileName);
                            });
                    });
                }
            }
        }
        
        menu.showAtMouseEvent(event);
    }

    /**
     * 更新交易的账户
     */
    private async updateTransactionAccount(txn: TransactionInfo, field: "from" | "to", newAccountName: string): Promise<void> {
        const file = this.app.vault.getAbstractFileByPath(txn.path);
        if (!file) return;
        
        try {
            // 使用 processFrontMatter 更新 frontmatter
            await this.app.fileManager.processFrontMatter(file as any, (frontmatter) => {
                frontmatter[field] = newAccountName;
            });
            
            // 等待一小段时间让 metadata 缓存更新
            await new Promise(resolve => setTimeout(resolve, 100));
            
            // 刷新交易缓存
            await this.plugin.transactionService.scanTransactions();
            
            // 重新渲染视图
            this.render();
            
        } catch (error) {
            console.error("Failed to update transaction account:", error);
        }
    }

    /**
     * 显示日期选择器
     */
    private showDatePicker(txn: TransactionInfo): void {
        // 创建一个模态框或输入框来选择日期
        const modal = document.createElement("div");
        modal.className = "cost-date-picker-modal";
        
        const backdrop = document.createElement("div");
        backdrop.className = "cost-picker-backdrop";
        backdrop.addEventListener("click", () => {
            modal.remove();
            backdrop.remove();
        });
        
        const content = document.createElement("div");
        content.className = "cost-picker-content";
        
        const label = document.createElement("div");
        label.className = "cost-picker-label";
        label.textContent = "选择日期";
        content.appendChild(label);
        
        const input = document.createElement("input");
        input.type = "date";
        input.className = "cost-picker-input";
        input.value = txn.date || "";
        content.appendChild(input);
        
        const btnRow = document.createElement("div");
        btnRow.className = "cost-picker-buttons";
        
        const cancelBtn = document.createElement("button");
        cancelBtn.textContent = "取消";
        cancelBtn.className = "cost-picker-btn";
        cancelBtn.addEventListener("click", () => {
            modal.remove();
            backdrop.remove();
        });
        btnRow.appendChild(cancelBtn);
        
        const confirmBtn = document.createElement("button");
        confirmBtn.textContent = "确定";
        confirmBtn.className = "cost-picker-btn cost-picker-btn-primary";
        confirmBtn.addEventListener("click", async () => {
            if (input.value) {
                await this.updateTransactionDate(txn, input.value);
            }
            modal.remove();
            backdrop.remove();
        });
        btnRow.appendChild(confirmBtn);
        
        content.appendChild(btnRow);
        modal.appendChild(content);
        
        document.body.appendChild(backdrop);
        document.body.appendChild(modal);
        
        input.focus();
    }

    /**
     * 显示时间选择器
     */
    private showTimePicker(txn: TransactionInfo): void {
        const modal = document.createElement("div");
        modal.className = "cost-date-picker-modal";
        
        const backdrop = document.createElement("div");
        backdrop.className = "cost-picker-backdrop";
        backdrop.addEventListener("click", () => {
            modal.remove();
            backdrop.remove();
        });
        
        const content = document.createElement("div");
        content.className = "cost-picker-content";
        
        const label = document.createElement("div");
        label.className = "cost-picker-label";
        label.textContent = "选择时间";
        content.appendChild(label);
        
        const input = document.createElement("input");
        input.type = "time";
        input.step = "1";  // 支持秒
        input.className = "cost-picker-input";
        input.value = txn.time || "";
        content.appendChild(input);
        
        const btnRow = document.createElement("div");
        btnRow.className = "cost-picker-buttons";
        
        const cancelBtn = document.createElement("button");
        cancelBtn.textContent = "取消";
        cancelBtn.className = "cost-picker-btn";
        cancelBtn.addEventListener("click", () => {
            modal.remove();
            backdrop.remove();
        });
        btnRow.appendChild(cancelBtn);
        
        const confirmBtn = document.createElement("button");
        confirmBtn.textContent = "确定";
        confirmBtn.className = "cost-picker-btn cost-picker-btn-primary";
        confirmBtn.addEventListener("click", async () => {
            if (input.value) {
                await this.updateTransactionTime(txn, input.value);
            }
            modal.remove();
            backdrop.remove();
        });
        btnRow.appendChild(confirmBtn);
        
        content.appendChild(btnRow);
        modal.appendChild(content);
        
        document.body.appendChild(backdrop);
        document.body.appendChild(modal);
        
        input.focus();
    }

    /**
     * 更新交易日期
     */
    private async updateTransactionDate(txn: TransactionInfo, newDate: string): Promise<void> {
        const file = this.app.vault.getAbstractFileByPath(txn.path);
        if (!file) return;
        
        try {
            await this.app.fileManager.processFrontMatter(file as any, (frontmatter) => {
                frontmatter.date = newDate;
            });
            
            await new Promise(resolve => setTimeout(resolve, 100));
            await this.plugin.transactionService.scanTransactions();
            this.render();
            
        } catch (error) {
            console.error("Failed to update transaction date:", error);
        }
    }

    /**
     * 更新交易时间
     */
    private async updateTransactionTime(txn: TransactionInfo, newTime: string): Promise<void> {
        const file = this.app.vault.getAbstractFileByPath(txn.path);
        if (!file) return;
        
        try {
            await this.app.fileManager.processFrontMatter(file as any, (frontmatter) => {
                frontmatter.time = newTime;
            });
            
            await new Promise(resolve => setTimeout(resolve, 100));
            await this.plugin.transactionService.scanTransactions();
            this.render();
            
        } catch (error) {
            console.error("Failed to update transaction time:", error);
        }
    }

    /**
     * 创建新交易
     */
    private async createNewTransaction(): Promise<void> {
        const settings = this.plugin.settings;
        const now = new Date();
        
        // 生成唯一ID
        const id = this.generateTransactionId();
        
        // 格式化日期和时间
        const date = now.toISOString().split('T')[0];
        const time = now.toTimeString().split(' ')[0];
        
        // 构建文件路径
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const folderPath = `${settings.transactionsPath}/${year}/${year}-${month}/${year}-${month}-${day}`;
        const filePath = `${folderPath}/${id}.md`;
        
        // 构建frontmatter内容
        const content = `---
type: txn
uid: ${id}
date: ${date}
time: ${time}
txn_type: 支出
category: 
amount: 0
refund: 0
currency: CNY
from: 
to: 
payee: ""
address: 
tags: []
note: 
---

`;

        // 确保文件夹存在并创建文件
        try {
            // 创建文件夹（如果不存在）
            await this.ensureFolderExists(folderPath);
            
            // 创建文件
            const file = await this.app.vault.create(filePath, content);
            
            // 刷新交易列表
            await this.plugin.transactionService.scanTransactions();
            await this.render();
            
            // 打开新创建的文件
            const leaf = this.app.workspace.getLeaf(false);
            await leaf.openFile(file);
            
        } catch (error) {
            console.error("Failed to create transaction:", error);
        }
    }

    /**
     * 生成交易ID
     */
    private generateTransactionId(): string {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        let result = '';
        for (let i = 0; i < 16; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return result;
    }

    /**
     * 确保文件夹存在
     */
    private async ensureFolderExists(folderPath: string): Promise<void> {
        const folder = this.app.vault.getAbstractFileByPath(folderPath);
        if (!folder) {
            await this.app.vault.createFolder(folderPath);
        }
    }
}
