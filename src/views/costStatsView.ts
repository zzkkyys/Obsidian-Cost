import { ItemView, WorkspaceLeaf } from "obsidian";
import CostPlugin from "../main";
import { BalanceCard } from "../components/dashboard/BalanceCard";
import { TrendChart, TrendDataPoint } from "../components/charts/TrendChart";
import { CalendarWidget } from "../components/dashboard/CalendarWidget";
import { CategoryStatsCard } from "../components/dashboard/CategoryStatsCard";
import { TransactionInfo } from "../services/transactionService";

export const COST_STATS_VIEW_TYPE = "cost-stats-view";

export class CostStatsView extends ItemView {
    private plugin: CostPlugin;

    constructor(leaf: WorkspaceLeaf, plugin: CostPlugin) {
        super(leaf);
        this.plugin = plugin;
    }

    getViewType(): string {
        return COST_STATS_VIEW_TYPE;
    }

    getDisplayText(): string {
        return "账本统计";
    }

    getIcon(): string {
        return "bar-chart-2";
    }

    async onOpen(): Promise<void> {
        this.contentEl.empty();
        this.contentEl.addClass("cost-stats-view");
        this.render();
    }

    async onClose(): Promise<void> {
        this.contentEl.empty();
    }

    public update(): void {
        this.render();
    }

    private render(): void {
        this.contentEl.empty();
        const transactions = this.plugin.transactionService.getTransactions();
        const accounts = this.plugin.accountService.getAccounts();

        // 1. Balance Section
        const balanceSection = this.contentEl.createDiv({ cls: 'cost-stats-section' });
        new BalanceCard(balanceSection, accounts, transactions).mount();

        // 2. Trends Section
        const trendsSection = this.contentEl.createDiv({ cls: 'cost-stats-grid-row' });

        // Income Trend
        const incomeContainer = trendsSection.createDiv({ cls: 'cost-stats-card' });
        incomeContainer.createEl('h3', { text: '收入趋势', cls: 'cost-card-title' });
        const incomeData = this.calculateTrendData(transactions, '收入');
        new TrendChart(incomeContainer, incomeData, 'var(--color-green)').mount();

        // Expense Trend
        const expenseContainer = trendsSection.createDiv({ cls: 'cost-stats-card' });
        expenseContainer.createEl('h3', { text: '支出趋势', cls: 'cost-card-title' });
        const expenseData = this.calculateTrendData(transactions, '支出');
        new TrendChart(expenseContainer, expenseData, 'var(--color-red)').mount();

        // 3. Bottom Section
        const bottomSection = this.contentEl.createDiv({ cls: 'cost-stats-grid-row' });

        // Calendar
        const calendarContainer = bottomSection.createDiv({ cls: 'cost-stats-card' });
        new CalendarWidget(calendarContainer, transactions).mount();

        // Category Stats
        const categoryContainer = bottomSection.createDiv({ cls: 'cost-stats-card' });
        new CategoryStatsCard(categoryContainer, transactions).mount();
    }

    private calculateTrendData(transactions: TransactionInfo[], type: '收入' | '支出'): TrendDataPoint[] {
        const now = new Date();
        const data: TrendDataPoint[] = [];

        // Latest 6 months
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
}
