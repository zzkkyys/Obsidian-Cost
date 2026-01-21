import { ItemView, WorkspaceLeaf, setIcon, Menu, App, Notice } from "obsidian";
import CostPlugin from "../main";
import { AccountInfo } from "../types";
import { TransactionList } from "../components/lists/TransactionList";
import { AccountList } from "../components/lists/AccountList";
import { BalanceCard } from "../components/dashboard/BalanceCard";
import { TrendChart, TrendDataPoint } from "../components/charts/TrendChart";
import { CalendarWidget } from "../components/dashboard/CalendarWidget";
import { CategoryStatsCard } from "../components/dashboard/CategoryStatsCard";
import { TransactionInfo } from "../services/transactionService";

export const COST_MAIN_VIEW_TYPE = "cost-main-view";

import { TopPayeesWidget } from "../components/dashboard/TopPayeesWidget";
import { KPICardsWidget } from "../components/dashboard/KPICardsWidget";
import { AnnualHeatmapWidget } from "../components/dashboard/AnnualHeatmapWidget";
import { TransactionEditModal } from "../modals/TransactionEditModal";
import { TransactionTable } from "../components/lists/TransactionTable";
import { BatchEditModal } from "../modals/BatchEditModal";

type TabType = "transactions" | "accounts" | "stats" | "management";

export class CostMainView extends ItemView {
    private plugin: CostPlugin;
    private currentTab: TabType = "transactions";
    private selectedAccount: AccountInfo | null = null;

    // Management Filters
    private filters = {
        startDate: "",
        endDate: "",
        type: "all", // all, 支出, 收入, 转账, 还款
        account: "all",
        keyword: ""
    };

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
     * Public API for sidebar view
     */
    public async selectAccount(account: AccountInfo): Promise<void> {
        this.selectedAccount = account;
        this.currentTab = "accounts";
        await this.render();
    }

    public async update(): Promise<void> {
        await this.render();
    }

    private async render(): Promise<void> {
        this.contentEl.empty();
        this.renderTabs();
        const content = this.contentEl.createDiv({ cls: "cost-view-content" });

        if (this.currentTab === "transactions") {
            this.renderTransactionsTab(content);
        } else if (this.currentTab === "accounts") {
            this.renderAccountsTab(content);
        } else if (this.currentTab === "stats") {
            this.renderStatsTab(content);
        } else if (this.currentTab === "management") {
            this.renderManagementTab(content);
        }
    }

    private renderTabs(): void {
        const tabBar = this.contentEl.createDiv({ cls: "cost-tab-bar" });
        const tabs: { id: TabType; label: string }[] = [
            { id: "transactions", label: "交易" },
            { id: "accounts", label: "账户" },
            { id: "stats", label: "统计" },
            { id: "management", label: "管理" }
        ];

        tabs.forEach(tab => {
            const tabEl = tabBar.createDiv({
                cls: `cost-tab ${this.currentTab === tab.id ? "is-active" : ""}`,
                text: tab.label
            });
            tabEl.onclick = () => {
                this.currentTab = tab.id;
                this.selectedAccount = null;
                this.render();
            };
        });

        // Add Transaction Button
        const addBtn = tabBar.createDiv({ cls: "cost-tab-action" });
        setIcon(addBtn, "plus");
        addBtn.onclick = () => {
            // 触发命令打开模态框
            (this.app as any).commands.executeCommandById(this.plugin.manifest.id + ":create-transaction");
        };

        const refreshBtn = tabBar.createDiv({ cls: "cost-tab-refresh" });
        setIcon(refreshBtn, "refresh-cw");
        refreshBtn.onclick = async () => {
            refreshBtn.addClass("is-loading");
            await this.plugin.transactionService.scanTransactions();
            await this.plugin.accountService.scanAccounts();
            refreshBtn.removeClass("is-loading");
            this.render();
        };
    }

    private renderTransactionsTab(container: HTMLElement): void {
        const transactions = this.plugin.transactionService.getTransactions();
        new Notice(`Debug: Loaded ${transactions.length} transactions`);
        const accounts = this.plugin.accountService.getAccounts();

        // Calculate running balances
        const openingBalances = new Map<string, number>();
        accounts.forEach(acc => {
            openingBalances.set(acc.fileName, acc.openingBalance);
        });
        const runningBalances = this.plugin.transactionService.calculateAllAccountsRunningBalances(openingBalances);

        new TransactionList(container, this.app, transactions, accounts, runningBalances, {
            onTransactionClick: (txn) => {
                new TransactionEditModal(this.app, txn, this.plugin.transactionService, this.plugin.accountService, async () => {
                    await this.plugin.transactionService.scanTransactions();
                    this.plugin.refreshViews();
                }).open();
            },
            onAccountClick: (name, field, txn) => this.handleAccountClick(name),
            customIconPath: this.plugin.settings.customIconPath
        }).mount();
    }

    private renderAccountsTab(container: HTMLElement): void {
        const layout = container.createDiv({ cls: "cost-accounts-layout" });
        const leftCol = layout.createDiv({ cls: "cost-accounts-left" });
        const rightCol = layout.createDiv({ cls: "cost-accounts-right" });

        const accounts = this.plugin.accountService.getAccounts();

        // Prepare data for AccountList
        const balances = new Map<string, number>();
        const itemCounts = new Map<string, number>();

        accounts.forEach(acc => {
            const change = this.plugin.transactionService.calculateBalanceChange(acc.fileName);
            const bal = change + acc.openingBalance;
            balances.set(acc.fileName, bal);
            const count = this.plugin.transactionService.getTransactionsByAccount(acc.fileName).length;
            itemCounts.set(acc.fileName, count);
        });

        // Account List
        new AccountList(leftCol, this.app, accounts, itemCounts, balances, {
            selectedAccount: this.selectedAccount,
            onAccountClick: (acc) => {
                this.selectedAccount = acc;
                this.render();
            }
        }).mount();

        // Right Column (Transactions for selected account)
        if (this.selectedAccount) {
            rightCol.createEl("h4", { text: `${this.selectedAccount.displayName} 的交易` });
            const accountTxns = this.plugin.transactionService.getTransactionsByAccount(this.selectedAccount.fileName);

            // Calculate running balances (reuse generally or pass specific?)
            // For simplicity, we can pass the global running balances, the list will pick what it needs by txn path
            const openingBalances = new Map<string, number>();
            accounts.forEach(acc => {
                openingBalances.set(acc.fileName, acc.openingBalance);
            });
            const runningBalances = this.plugin.transactionService.calculateAllAccountsRunningBalances(openingBalances);

            new TransactionList(rightCol, this.app, accountTxns, accounts, runningBalances, {
                onTransactionClick: (txn) => {
                    new TransactionEditModal(this.app, txn, this.plugin.transactionService, this.plugin.accountService, async () => {
                        await this.plugin.transactionService.scanTransactions();
                        this.plugin.refreshViews();
                    }).open();
                },
                customIconPath: this.plugin.settings.customIconPath
            }).mount();
        } else {
            rightCol.createDiv({ cls: "cost-empty-message cost-select-hint", text: "← 请选择一个账户查看交易" });
        }
    }

    private renderStatsTab(container: HTMLElement): void {
        container.addClass("cost-stats-view");

        const transactions = this.plugin.transactionService.getTransactions();
        const accounts = this.plugin.accountService.getAccounts();

        // 1. Balance Section
        const balanceSection = container.createDiv({ cls: 'cost-stats-section' });
        new BalanceCard(balanceSection, accounts, transactions).mount();

        // 2. KPI Cards
        const kpiSection = container.createDiv({ cls: 'cost-stats-section' });
        new KPICardsWidget(kpiSection, transactions).mount();

        // 3. Trends Section
        const trendsSection = container.createDiv({ cls: 'cost-stats-grid-row' });

        const incomeContainer = trendsSection.createDiv({ cls: 'cost-stats-card' });
        incomeContainer.createEl('h3', { text: '收入趋势', cls: 'cost-card-title' });
        const incomeData = this.calculateTrendData(transactions, '收入');
        new TrendChart(incomeContainer, incomeData, 'var(--color-green)').mount();

        const expenseContainer = trendsSection.createDiv({ cls: 'cost-stats-card' });
        expenseContainer.createEl('h3', { text: '支出趋势', cls: 'cost-card-title' });
        const expenseData = this.calculateTrendData(transactions, '支出');
        new TrendChart(expenseContainer, expenseData, 'var(--color-red)').mount();

        // 4. Analysis Section (Rankings + Category)
        const analysisSection = container.createDiv({ cls: 'cost-stats-grid-row' });

        // Row 1: Expense
        const expenseRankContainer = analysisSection.createDiv({ cls: 'cost-stats-card' });
        new TopPayeesWidget(expenseRankContainer, transactions, '支出').mount();

        const expenseCatContainer = analysisSection.createDiv({ cls: 'cost-stats-card' });
        new CategoryStatsCard(expenseCatContainer, transactions, '支出').mount();

        // Row 2: Income
        // Create new row for Income
        const incomeAnalysisSection = container.createDiv({ cls: 'cost-stats-grid-row' });

        const incomeRankContainer = incomeAnalysisSection.createDiv({ cls: 'cost-stats-card' });
        new TopPayeesWidget(incomeRankContainer, transactions, '收入').mount();

        const incomeCatContainer = incomeAnalysisSection.createDiv({ cls: 'cost-stats-card' });
        new CategoryStatsCard(incomeCatContainer, transactions, '收入').mount();

        // 5. Heatmap Section
        const heatmapSection = container.createDiv({ cls: 'cost-stats-section' });
        const heatmapContainer = heatmapSection.createDiv({ cls: 'cost-stats-card' });
        new AnnualHeatmapWidget(heatmapContainer, transactions).mount();

        // 6. Bottom Section
        const bottomSection = container.createDiv({ cls: 'cost-stats-grid-row' });

        const calendarContainer = bottomSection.createDiv({ cls: 'cost-stats-card' });
        new CalendarWidget(calendarContainer, transactions).mount();
    }


    private calculateTrendData(transactions: TransactionInfo[], type: '收入' | '支出'): TrendDataPoint[] {
        const now = new Date();
        const data: TrendDataPoint[] = [];

        for (let i = 5; i >= 0; i--) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const year = d.getFullYear();
            const month = d.getMonth();
            const monthStr = `${year}-${String(month + 1).padStart(2, '0')}`;

            let total = 0;
            for (const txn of transactions) {
                if (txn.date?.startsWith(monthStr)) {
                    if (type === '收入' && txn.txnType === '收入') {
                        total += txn.amount;
                    } else if (type === '支出' && txn.txnType === '支出') {
                        total += txn.amount - (txn.refund || 0);
                    }
                }
            }
            data.push({
                month: `${month + 1}月`,
                value: total
            });
        }
        return data;
    }

    private renderManagementTab(container: HTMLElement): void {
        const wrapper = container.createDiv({ cls: "cost-management-view" });

        // 1. Filter Bar
        const filterBar = wrapper.createDiv({ cls: "cost-filter-bar" });

        // Date Range
        const dateSpan = filterBar.createSpan({ cls: "cost-filter-group" });
        dateSpan.createSpan({ text: "日期: " });
        const startInput = dateSpan.createEl("input", { type: "date" });
        startInput.value = this.filters.startDate;
        startInput.onchange = () => { this.filters.startDate = startInput.value; this.render(); };

        dateSpan.createSpan({ text: " - " });
        const endInput = dateSpan.createEl("input", { type: "date" });
        endInput.value = this.filters.endDate;
        endInput.onchange = () => { this.filters.endDate = endInput.value; this.render(); };

        // Type
        const typeSelect = filterBar.createEl("select", { cls: "cost-filter-select" });
        ["all", "支出", "收入", "转账", "还款"].forEach(t => {
            const opt = typeSelect.createEl("option", { value: t, text: t === "all" ? "所有类型" : t });
            if (this.filters.type === t) opt.selected = true;
        });
        typeSelect.onchange = () => { this.filters.type = typeSelect.value; this.render(); };

        // Account
        const accSelect = filterBar.createEl("select", { cls: "cost-filter-select" });
        accSelect.createEl("option", { value: "all", text: "所有账户" });
        this.plugin.accountService.getAccounts().forEach(acc => {
            const opt = accSelect.createEl("option", { value: acc.fileName, text: acc.displayName });
            if (this.filters.account === acc.fileName) opt.selected = true;
        });
        accSelect.onchange = () => { this.filters.account = accSelect.value; this.render(); };

        // Keyword
        const keywordWrapper = filterBar.createDiv({ cls: "cost-filter-group cost-search-wrapper" });
        const keywordInput = keywordWrapper.createEl("input", { type: "text", cls: "cost-filter-search" });
        keywordInput.placeholder = "搜索备注/商家/分类... (回车搜索)";
        keywordInput.value = this.filters.keyword;

        const searchBtn = keywordWrapper.createEl("button", { cls: "cost-search-btn" });
        setIcon(searchBtn, "search");

        const triggerSearch = () => {
            this.filters.keyword = keywordInput.value;
            new Notice(`正在搜索: ${this.filters.keyword}`); // Feedback
            updateTable();
        };

        keywordInput.onkeydown = (e) => {
            if (e.key === "Enter") triggerSearch();
        };

        searchBtn.onclick = triggerSearch;

        // 2. Action Bar (Batch Edit)
        const actionBar = wrapper.createDiv({ cls: "cost-action-bar" });
        const batchEditBtn = actionBar.createEl("button", { text: "批量修改", cls: "mod-cta" });
        batchEditBtn.disabled = true;


        // 4. Data Table
        const tableContainer = wrapper.createDiv({ cls: "cost-table-wrapper" });
        const table = new TransactionTable(tableContainer, [], { // Start empty, will fill via updateTable
            onSelectionChange: (selected) => {
                batchEditBtn.disabled = selected.size === 0;
                batchEditBtn.setText(`批量修改 (${selected.size})`);
            },
            onTransactionClick: (txn) => {
                new TransactionEditModal(this.app, txn, this.plugin.transactionService, this.plugin.accountService, async () => {
                    await this.plugin.transactionService.scanTransactions();
                    this.plugin.refreshViews();
                }).open();
            }
        });
        table.mount();

        // Update Function
        const updateTable = () => {
            let transactions = this.plugin.transactionService.getTransactions();

            // Verify Data
            let total = transactions.length;

            // Date Filter
            if (this.filters.startDate) transactions = transactions.filter(t => t.date >= this.filters.startDate);
            if (this.filters.endDate) transactions = transactions.filter(t => t.date <= this.filters.endDate);

            // Type Filter
            if (this.filters.type !== "all") transactions = transactions.filter(t => t.txnType === this.filters.type);

            // Account Filter
            if (this.filters.account !== "all") {
                transactions = transactions.filter(t => t.from === this.filters.account || t.to === this.filters.account);
            }

            const countBeforeKeyword = transactions.length;

            // Keyword Filter
            if (this.filters.keyword) {
                const k = this.filters.keyword.toLowerCase().trim();
                transactions = transactions.filter(t =>
                    String(t.note || "").toLowerCase().includes(k) ||
                    String(t.payee || "").toLowerCase().includes(k) ||
                    String(t.category || "").toLowerCase().includes(k) ||
                    String(t.from || "").toLowerCase().includes(k) ||
                    String(t.to || "").toLowerCase().includes(k) ||
                    String(t.path || "").toLowerCase().includes(k) ||
                    (t.amount !== undefined && t.amount !== null && t.amount.toString().includes(k))
                );

                // new Notice(`Debug: 预筛选后 ${countBeforeKeyword} 条 -> 关键词筛选后 ${transactions.length} 条 (关键词: "${k}")`);
            } else {
                // new Notice(`Debug: 总数 ${total} -> 筛选后 ${transactions.length}`);
            }

            actionBar.empty(); // Clear count
            actionBar.createSpan({ cls: "cost-filter-count", text: `共 ${transactions.length} 条记录` });
            actionBar.appendChild(batchEditBtn); // Re-append button

            table.setTransactions(transactions, this.filters.keyword.trim());
        };

        // Attach Handlers
        startInput.onchange = () => { this.filters.startDate = startInput.value; updateTable(); };
        endInput.onchange = () => { this.filters.endDate = endInput.value; updateTable(); };
        typeSelect.onchange = () => { this.filters.type = typeSelect.value; updateTable(); };
        accSelect.onchange = () => { this.filters.account = accSelect.value; updateTable(); };
        // keywordInput handled by onkeydown above

        batchEditBtn.onclick = () => {
            const selected = table.getSelectedPaths();
            if (selected.size > 0) {
                new BatchEditModal(this.app, this.plugin.transactionService, Array.from(selected), async () => {
                    await this.plugin.transactionService.scanTransactions();
                    this.plugin.refreshViews();
                }).open();
            }
        };

        // Initial Load
        updateTable();
    }


    private handleAccountClick(accountName: string): void {
        const account = this.plugin.accountService.getAccounts().find(a => a.fileName === accountName || a.displayName === accountName);
        if (account) {
            this.selectedAccount = account;
            this.currentTab = "accounts";
            this.render();
        }
    }
}
