import { Menu, setIcon } from "obsidian";
import { BaseComponent } from '../BaseComponent';
import { TransactionInfo } from '../../services/transactionService';
import { PieChart } from '../charts/PieChart';

export class CategoryStatsCard extends BaseComponent {
    private transactions: TransactionInfo[];
    private rangeType: "month" | "year" | "all" = "month";
    private year: number;
    private month: number;

    constructor(
        containerEl: HTMLElement,
        transactions: TransactionInfo[]
    ) {
        super(containerEl);
        this.transactions = transactions;
        const now = new Date();
        this.year = now.getFullYear();
        this.month = now.getMonth();
    }

    protected render(): void {
        const widget = this.containerEl.createDiv({ cls: "cost-category-stats" });

        // Header
        const header = widget.createDiv({ cls: "cost-category-stats-header" });
        header.createSpan({ cls: "cost-category-stats-title", text: "分类统计" });

        // Range Selector
        const rangeSelector = header.createDiv({ cls: "cost-stats-range-selector" });
        this.renderRangeSelector(rangeSelector);

        // Filter Data
        const filtered = this.filterTransactions();

        // Filter Expenses
        const expenses = filtered.filter(t => t.txnType === "支出");

        if (expenses.length === 0) {
            widget.createDiv({ cls: "cost-category-stats-empty", text: "该时间段暂无支出记录" });
            return;
        }

        // Aggregate
        const categoryMap = new Map<string, number>();
        let totalExpense = 0;
        for (const txn of expenses) {
            const category = txn.category?.split("/")[0] || "未分类";
            const amount = txn.amount - txn.refund;
            categoryMap.set(category, (categoryMap.get(category) || 0) + amount);
            totalExpense += amount;
        }

        // Sort
        const sorted = Array.from(categoryMap.entries()).sort((a, b) => b[1] - a[1]);

        // Colors
        const colors: string[] = [
            "#4CAF50", "#2196F3", "#FF9800", "#E91E63",
            "#9C27B0", "#00BCD4", "#FF5722", "#795548",
            "#607D8B", "#3F51B5"
        ];

        // Content
        const contentEl = widget.createDiv({ cls: "cost-category-content" });

        // Pie Chart
        // We create a container for PieChart and mount it
        // Since PieChart is a BaseComponent, we can instantiate it
        // PieChart expects a container to render INTO.
        // So we pass contentEl as container. But PieChart creates "cost-category-chart" div inside.
        // Let's check PieChart implementation.
        // PieChart: const chartWrapper = this.containerEl.createDiv({ cls: "cost-category-chart" });
        // So yes, we pass contentEl.

        new PieChart(contentEl, sorted, colors, totalExpense).mount();
    }

    private renderRangeSelector(container: HTMLElement): void {
        let rangeText = "";
        if (this.rangeType === "month") {
            rangeText = `${this.year}年${this.month + 1}月`;
        } else if (this.rangeType === "year") {
            rangeText = `${this.year}年`;
        } else {
            rangeText = "全部";
        }

        const rangeBtn = container.createDiv({ cls: "cost-stats-range-btn" });
        rangeBtn.setText(rangeText);
        rangeBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            this.showRangeMenu(e);
        });
    }

    private showRangeMenu(e: MouseEvent): void {
        const menu = new Menu();
        const now = new Date();
        const currentYear = now.getFullYear();
        const currentMonth = now.getMonth();

        // Month
        menu.addItem(item => {
            item.setTitle(`本月 (${currentYear}年${currentMonth + 1}月)`);
            item.setIcon(this.rangeType === "month" && this.year === currentYear && this.month === currentMonth ? "check" : "calendar");
            item.onClick(() => {
                this.rangeType = "month";
                this.year = currentYear;
                this.month = currentMonth;
                this.update();
            });
        });

        // Last Month
        const lastMonth = currentMonth === 0 ? 11 : currentMonth - 1;
        const lastMonthYear = currentMonth === 0 ? currentYear - 1 : currentYear;
        menu.addItem(item => {
            item.setTitle(`上月 (${lastMonthYear}年${lastMonth + 1}月)`);
            item.setIcon(this.rangeType === "month" && this.year === lastMonthYear && this.month === lastMonth ? "check" : "calendar");
            item.onClick(() => {
                this.rangeType = "month";
                this.year = lastMonthYear;
                this.month = lastMonth;
                this.update();
            });
        });

        menu.addSeparator();

        // Year
        menu.addItem(item => {
            item.setTitle(`今年 (${currentYear}年)`);
            item.setIcon(this.rangeType === "year" && this.year === currentYear ? "check" : "calendar-range");
            item.onClick(() => {
                this.rangeType = "year";
                this.update();
            });
        });

        // Last Year
        menu.addItem(item => {
            item.setTitle(`去年 (${currentYear - 1}年)`);
            item.setIcon(this.rangeType === "year" && this.year === currentYear - 1 ? "check" : "calendar-range");
            item.onClick(() => {
                this.rangeType = "year";
                this.year = currentYear - 1;
                this.update();
            });
        });

        menu.addSeparator();

        // All
        menu.addItem(item => {
            item.setTitle("全部时间");
            item.setIcon(this.rangeType === "all" ? "check" : "infinity");
            item.onClick(() => {
                this.rangeType = "all";
                this.update();
            });
        });

        menu.showAtMouseEvent(e);
    }

    private filterTransactions(): TransactionInfo[] {
        if (this.rangeType === "all") return this.transactions;
        return this.transactions.filter(txn => {
            if (!txn.date) return false;
            const parts = txn.date.split("-");
            if (parts.length < 2) return false;
            const y = parseInt(parts[0]!);
            const m = parseInt(parts[1]!);

            if (this.rangeType === "year") return y === this.year;
            if (this.rangeType === "month") return y === this.year && (m - 1) === this.month;
            return false;
        });
    }
}
