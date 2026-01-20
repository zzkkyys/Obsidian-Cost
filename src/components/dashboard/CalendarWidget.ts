import { setIcon } from "obsidian";
import { BaseComponent } from '../BaseComponent';
import { TransactionInfo } from '../../services/transactionService';
import { formatCompact } from '../../utils/format';

export class CalendarWidget extends BaseComponent {
    private transactions: TransactionInfo[];
    private year: number;
    private month: number; // 0-11

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
        const calendarWidget = this.containerEl.createDiv({ cls: "cost-mini-calendar" });

        // Header
        const header = calendarWidget.createDiv({ cls: "cost-mini-calendar-header" });

        // Prev Button
        const prevBtn = header.createDiv({ cls: "cost-mini-calendar-nav" });
        setIcon(prevBtn, "chevron-left");
        prevBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            this.month--;
            if (this.month < 0) {
                this.month = 11;
                this.year--;
            }
            this.update();
        });

        // Title
        const titleEl = header.createDiv({ cls: "cost-mini-calendar-title" });
        titleEl.setText(`${this.year}年${this.month + 1}月`);

        // Next Button
        const nextBtn = header.createDiv({ cls: "cost-mini-calendar-nav" });
        setIcon(nextBtn, "chevron-right");
        nextBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            this.month++;
            if (this.month > 11) {
                this.month = 0;
                this.year++;
            }
            this.update();
        });

        // Month Stats
        const monthStats = this.calculateMonthStats(this.year, this.month);
        const statsEl = calendarWidget.createDiv({ cls: "cost-mini-calendar-stats" });
        statsEl.createSpan({ cls: "cost-mini-stat cost-income", text: `+${formatCompact(monthStats.income)}` });
        statsEl.createSpan({ cls: "cost-mini-stat cost-expense", text: `-${formatCompact(monthStats.expense)}` });
        statsEl.createSpan({ cls: "cost-mini-stat", text: `${monthStats.count}笔` });

        // Weekday Header
        const weekHeader = calendarWidget.createDiv({ cls: "cost-mini-calendar-weekdays" });
        const weekdays = ["日", "一", "二", "三", "四", "五", "六"];
        for (const day of weekdays) {
            weekHeader.createDiv({ cls: "cost-mini-weekday", text: day });
        }

        // Grid
        const grid = calendarWidget.createDiv({ cls: "cost-mini-calendar-grid" });
        this.renderGrid(grid, this.year, this.month);
    }

    private renderGrid(container: HTMLElement, year: number, month: number): void {
        const today = new Date();
        const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

        const firstDay = new Date(year, month, 1);
        const lastDay = new Date(year, month + 1, 0);
        const dailyStats = this.getDailyStats(year, month);

        // Empty cells for previous month
        const startWeekday = firstDay.getDay();
        for (let i = 0; i < startWeekday; i++) {
            container.createDiv({ cls: "cost-mini-day cost-mini-day-empty" });
        }

        // Days
        for (let day = 1; day <= lastDay.getDate(); day++) {
            const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
            const stats = dailyStats.get(dateStr);
            const isToday = dateStr === todayStr;

            const dayEl = container.createDiv({
                cls: `cost-mini-day ${isToday ? "cost-mini-day-today" : ""} ${stats ? "cost-mini-day-has-data" : ""}`
            });

            dayEl.createDiv({ cls: "cost-mini-day-num", text: String(day) });

            if (stats) {
                const statsEl = dayEl.createDiv({ cls: "cost-mini-day-stats" });
                statsEl.createDiv({ cls: "cost-mini-day-income", text: `+${stats.income > 0 ? formatCompact(stats.income) : "0"}` });
                statsEl.createDiv({ cls: "cost-mini-day-expense", text: `-${stats.expense > 0 ? formatCompact(stats.expense) : "0"}` });
                statsEl.createDiv({ cls: "cost-mini-day-count", text: `${stats.count}笔` });
            }
        }

        // Empty cells for next month is not strictly necessary for grid layout usually, 
        // but helps if we want a fixed grid. The original code did it.
        const endWeekday = lastDay.getDay();
        for (let i = endWeekday + 1; i < 7; i++) {
            container.createDiv({ cls: "cost-mini-day cost-mini-day-empty" });
        }
    }

    private calculateMonthStats(year: number, month: number): { income: number; expense: number; count: number } {
        const monthStr = `${year}-${String(month + 1).padStart(2, "0")}`;
        let income = 0;
        let expense = 0;
        let count = 0;

        for (const txn of this.transactions) {
            if (txn.date.startsWith(monthStr)) {
                count++;
                if (txn.txnType === "收入") income += txn.amount;
                else if (txn.txnType === "支出") expense += txn.amount - txn.refund;
            }
        }
        return { income, expense, count };
    }

    private getDailyStats(year: number, month: number): Map<string, { income: number; expense: number; count: number }> {
        const monthStr = `${year}-${String(month + 1).padStart(2, "0")}`;
        const stats = new Map<string, { income: number; expense: number; count: number }>();

        for (const txn of this.transactions) {
            if (txn.date.startsWith(monthStr)) {
                if (!stats.has(txn.date)) {
                    stats.set(txn.date, { income: 0, expense: 0, count: 0 });
                }
                const dayStat = stats.get(txn.date)!;
                dayStat.count++;
                if (txn.txnType === "收入") dayStat.income += txn.amount;
                else if (txn.txnType === "支出") dayStat.expense += txn.amount - txn.refund;
            }
        }
        return stats;
    }
}
