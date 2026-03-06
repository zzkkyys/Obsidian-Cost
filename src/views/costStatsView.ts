import { ItemView, WorkspaceLeaf, setIcon } from "obsidian";
import CostPlugin from "../main";
import { BalanceCard } from "../components/dashboard/BalanceCard";
import { TrendChart, TrendDataPoint } from "../components/charts/TrendChart";
import { CalendarWidget } from "../components/dashboard/CalendarWidget";
import { CategoryStatsCard } from "../components/dashboard/CategoryStatsCard";
import { TopPayeesWidget } from "../components/dashboard/TopPayeesWidget";
import { KPICardsWidget } from "../components/dashboard/KPICardsWidget";
import { AnnualHeatmapWidget } from "../components/dashboard/AnnualHeatmapWidget";
import { TransactionInfo } from "../services/transactionService";
import { netAmount } from "../utils/format";
import { DraggableGrid, WidgetDef } from "../components/dashboard/DraggableGrid";

export const COST_STATS_VIEW_TYPE = "cost-stats-view";

/** 所有可用 widget 的定义 */
const WIDGET_DEFS: WidgetDef[] = [
    { id: "balance", label: "余额总览", sizeType: "full" },
    { id: "kpi", label: "KPI 指标", sizeType: "full" },
    { id: "trends", label: "收支趋势", sizeType: "full" },
    { id: "analysis", label: "分析排行", sizeType: "full" },
    { id: "heatmap", label: "年度热力图", sizeType: "full" },
    { id: "calendar", label: "日历", sizeType: "full" },
];

const DEFAULT_LAYOUT = WIDGET_DEFS.map(d => d.id);

export class CostStatsView extends ItemView {
    private plugin: CostPlugin;
    private unsubscribeEvents: (() => void)[] = [];
    private draggableGrid: DraggableGrid | null = null;

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

        // 订阅事件总线
        this.unsubscribeEvents.push(
            this.plugin.eventBus.on("data-changed", () => this.update())
        );
    }

    async onClose(): Promise<void> {
        this.unsubscribeEvents.forEach(fn => fn());
        this.unsubscribeEvents = [];
        this.draggableGrid?.destroy();
        this.draggableGrid = null;
        this.contentEl.empty();
    }

    public update(): void {
        this.render();
    }

    // ─────────────────── Layout persistence ───────────────────

    private getLayout(): string[] {
        const saved = this.plugin.settings.statsLayout;
        if (saved && saved.length > 0) return saved;
        return DEFAULT_LAYOUT;
    }

    private async saveLayout(order: string[]): Promise<void> {
        this.plugin.settings.statsLayout = order;
        await this.plugin.saveData(this.plugin.settings);
    }

    private async resetLayout(): Promise<void> {
        this.plugin.settings.statsLayout = [...DEFAULT_LAYOUT];
        await this.plugin.saveData(this.plugin.settings);
        this.render();
    }

    // ─────────────────── Rendering ───────────────────

    private render(): void {
        this.contentEl.empty();
        this.draggableGrid?.destroy();

        const transactions = this.plugin.transactionService.getTransactions();
        const accounts = this.plugin.accountService.getAccounts();

        // ── Header bar ──
        const header = this.contentEl.createDiv({ cls: "cost-stats-header" });
        header.createEl("h3", { text: "统计面板", cls: "cost-stats-header-title" });

        const actions = header.createDiv({ cls: "cost-stats-header-actions" });
        const resetBtn = actions.createEl("button", {
            cls: "cost-stats-reset-btn",
            attr: { "aria-label": "重置布局" }
        });
        setIcon(resetBtn, "rotate-ccw");
        resetBtn.createSpan({ text: "重置布局" });
        resetBtn.addEventListener("click", () => this.resetLayout());

        // ── Widget container ──
        const widgetContainer = this.contentEl.createDiv({ cls: "cost-stats-widget-container" });

        // ── DraggableGrid ──
        this.draggableGrid = new DraggableGrid(
            widgetContainer,
            (newOrder) => this.saveLayout(newOrder)
        );

        // ── Build each widget ──
        const widgetBuilders: Record<string, () => HTMLElement> = {
            balance: () => {
                const el = createDiv("cost-stats-section");
                new BalanceCard(el, accounts, this.plugin.transactionService).mount();
                return el;
            },
            kpi: () => {
                const el = createDiv("cost-stats-section");
                new KPICardsWidget(el, transactions).mount();
                return el;
            },
            trends: () => {
                const el = createDiv("cost-stats-grid-row");
                // Income Trend
                const incomeCard = el.createDiv({ cls: "cost-stats-card" });
                incomeCard.createEl("h3", { text: "收入趋势", cls: "cost-card-title" });
                const incomeData = this.calculateTrendData(transactions, "收入");
                new TrendChart(incomeCard, incomeData, "var(--color-green)").mount();
                // Expense Trend
                const expenseCard = el.createDiv({ cls: "cost-stats-card" });
                expenseCard.createEl("h3", { text: "支出趋势", cls: "cost-card-title" });
                const expenseData = this.calculateTrendData(transactions, "支出");
                new TrendChart(expenseCard, expenseData, "var(--color-red)").mount();
                return el;
            },
            analysis: () => {
                const el = createDiv("cost-stats-grid-row");
                const payeesCard = el.createDiv({ cls: "cost-stats-card" });
                new TopPayeesWidget(payeesCard, transactions).mount();
                const categoryCard = el.createDiv({ cls: "cost-stats-card" });
                new CategoryStatsCard(categoryCard, transactions).mount();
                return el;
            },
            heatmap: () => {
                const el = createDiv("cost-stats-section");
                const card = el.createDiv({ cls: "cost-stats-card" });
                new AnnualHeatmapWidget(card, transactions).mount();
                return el;
            },
            calendar: () => {
                const el = createDiv("cost-stats-section");
                const card = el.createDiv({ cls: "cost-stats-card" });
                new CalendarWidget(card, transactions).mount();
                return el;
            },
        };

        // Register all widgets
        for (const def of WIDGET_DEFS) {
            const builder = widgetBuilders[def.id];
            if (builder) {
                const contentEl = builder();
                this.draggableGrid.addWidget(def, contentEl);
            }
        }

        // Render in saved order
        this.draggableGrid.renderOrder(this.getLayout());
    }

    private calculateTrendData(transactions: TransactionInfo[], type: "收入" | "支出"): TrendDataPoint[] {
        const now = new Date();
        const data: TrendDataPoint[] = [];

        // Latest 6 months
        for (let i = 5; i >= 0; i--) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const year = d.getFullYear();
            const month = d.getMonth();
            const monthStr = `${year}-${String(month + 1).padStart(2, "0")}`;

            let total = 0;
            for (const txn of transactions) {
                if (txn.date?.startsWith(monthStr)) {
                    if (type === "收入" && txn.txnType === "收入") {
                        total += txn.amount;
                    } else if (type === "支出" && txn.txnType === "支出") {
                        total += netAmount(txn.amount, txn.refund || 0);
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

/** Helper to create a div with optional class */
function createDiv(cls?: string): HTMLDivElement {
    const div = document.createElement("div");
    if (cls) div.className = cls;
    return div;
}

