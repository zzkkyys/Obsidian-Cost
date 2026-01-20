import { ItemView, WorkspaceLeaf, setIcon, Menu } from "obsidian";
import CostPlugin from "../main";
import { AccountInfo } from "../types";
import { TransactionInfo } from "../services/transactionService";

export const COST_STATS_VIEW_TYPE = "cost-stats-view";

/**
 * 统计视图
 * 包含资产汇总、日历和分类统计（主要用于移动端）
 */
export class CostStatsView extends ItemView {
    private plugin: CostPlugin;

    // 日历视图状态
    private calendarYear: number = new Date().getFullYear();
    private calendarMonth: number = new Date().getMonth();  // 0-11

    // 分类统计时间范围状态
    private statsRangeType: "month" | "year" | "all" = "month";  // 当月/当年/全部
    private statsYear: number = new Date().getFullYear();
    private statsMonth: number = new Date().getMonth();  // 0-11

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
        this.contentEl.style.padding = "10px";
        this.contentEl.style.overflowY = "auto";
        this.contentEl.style.display = "flex";
        this.contentEl.style.flexDirection = "column";
        this.contentEl.style.gap = "16px";

        await this.render();
    }

    async onClose(): Promise<void> {
        this.contentEl.empty();
    }

    /**
     * 渲染视图
     */
    async render(): Promise<void> {
        this.contentEl.empty();

        const transactions = this.plugin.transactionService.getTransactions();
        const accounts = this.plugin.accountService.getAccounts();

        // 1. 资产汇总卡片
        this.renderBalanceSummary(this.contentEl, accounts);

        // 2. 迷你日历
        this.renderMiniCalendar(this.contentEl);

        // 3. 分类消费统计
        this.renderCategoryStats(this.contentEl, transactions);
    }

    /**
     * 千分位格式化
     */
    private formatThousands(num: number, fixed = 0): string {
        if (typeof num !== "number" || isNaN(num)) return "0";
        return num.toFixed(fixed).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
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

    // ============================================================
    // 资产汇总逻辑 (复制自 CostMainView)
    // ============================================================

    private renderBalanceSummary(container: HTMLElement, accounts: AccountInfo[]): void {
        const card = container.createDiv({ cls: "cost-balance-summary-card" });

        // 计算所有账户总余额（开户余额 + 交易流水）
        // 这里的逻辑简化处理：先获取当前所有交易产生的余额变动
        const transactions = this.plugin.transactionService.getTransactions();
        let totalIncome = 0;
        let totalExpense = 0;

        for (const txn of transactions) {
            if (txn.txnType === "收入") totalIncome += txn.amount;
            else if (txn.txnType === "支出") totalExpense += txn.amount - txn.refund;
        }

        let totalOpeningBalance = 0;
        let totalAsset = 0; // 资产（正数余额账户之和）
        let totalLiability = 0; // 负债（负数余额账户之和） - 这里只是近似，更精确应该按账户算

        // 计算每个账户的当前余额
        const accountBalances = new Map<string, number>();

        // 初始化开户余额
        for (const acc of accounts) {
            accountBalances.set(acc.fileName, acc.openingBalance);
            totalOpeningBalance += acc.openingBalance;
        }

        // 累加交易
        for (const txn of transactions) {
            const amount = txn.amount;
            if (txn.txnType === "支出") {
                const bal = accountBalances.get(txn.from) || 0;
                accountBalances.set(txn.from, bal - (amount - txn.refund));
            } else if (txn.txnType === "收入") {
                const bal = accountBalances.get(txn.to) || 0;
                accountBalances.set(txn.to, bal + amount);
            } else if (txn.txnType === "转账" || txn.txnType === "还款") {
                const fromBal = accountBalances.get(txn.from) || 0;
                accountBalances.set(txn.from, fromBal - amount);
                const toBal = accountBalances.get(txn.to) || 0;
                accountBalances.set(txn.to, toBal + amount);
            }
        }

        // 汇总净资产、总资产、总负债
        let netWorth = 0;
        for (const balance of accountBalances.values()) {
            netWorth += balance;
            if (balance >= 0) totalAsset += balance;
            else totalLiability += balance; // 负数
        }

        // 主数字：净资产
        const mainSection = card.createDiv({ cls: "cost-summary-main" });
        mainSection.createDiv({ cls: "cost-summary-main-label", text: "净资产" });
        const valueEl = mainSection.createDiv({
            cls: `cost-summary-main-value ${netWorth < 0 ? "cost-summary-negative" : ""}`
        });
        valueEl.createSpan({ cls: "cost-summary-currency", text: "CNY" });
        valueEl.createSpan({
            cls: `cost-summary-amount ${netWorth >= 0 ? "cost-balance-positive" : "cost-balance-negative"}`,
            text: this.formatThousands(Math.abs(netWorth), 2)
        });

        // 进度条（资产 vs 负债比例）
        const totalVolume = totalAsset + Math.abs(totalLiability);
        let assetPercent = 100;
        if (totalVolume > 0) {
            assetPercent = (totalAsset / totalVolume) * 100;
        }

        const progressEl = card.createDiv({ cls: "cost-summary-progress" });
        const bar = progressEl.createDiv({ cls: "cost-summary-progress-bar" });
        bar.createDiv({
            cls: "cost-summary-progress-asset",
            attr: { style: `width: ${assetPercent}%` }
        });

        // 底部详情：总资产 | 总负债
        const details = card.createDiv({ cls: "cost-summary-detail" });

        // 总资产
        const assetItem = details.createDiv({ cls: "cost-summary-detail-item" });
        assetItem.createDiv({ cls: "cost-summary-detail-dot cost-dot-asset" });
        assetItem.createDiv({ cls: "cost-summary-detail-label", text: "总资产" });
        assetItem.createDiv({ cls: "cost-summary-detail-value", text: this.formatThousands(totalAsset) });

        // 总负债
        const liabilityItem = details.createDiv({ cls: "cost-summary-detail-item" });
        liabilityItem.createDiv({ cls: "cost-summary-detail-dot cost-dot-liability" });
        liabilityItem.createDiv({ cls: "cost-summary-detail-label", text: "总负债" });
        liabilityItem.createDiv({
            cls: "cost-summary-detail-value",
            text: this.formatThousands(Math.abs(totalLiability))
        });
    }

    // ============================================================
    // 迷你日历逻辑
    // ============================================================

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
            }
        }

        // 填充下月的空白日期
        const endWeekday = lastDay.getDay();
        for (let i = endWeekday + 1; i < 7; i++) {
            container.createDiv({ cls: "cost-mini-day cost-mini-day-empty" });
        }
    }

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

    // ============================================================
    // 分类统计逻辑
    // ============================================================

    private renderCategoryStats(container: HTMLElement, transactions: TransactionInfo[]): void {
        const widget = container.createDiv({ cls: "cost-category-stats" });

        // 标题行：标题 + 时间范围选择器
        const header = widget.createDiv({ cls: "cost-category-stats-header" });
        header.createSpan({ cls: "cost-category-stats-title", text: "分类统计" });

        // 时间范围选择器
        const rangeSelector = header.createDiv({ cls: "cost-stats-range-selector" });
        this.renderStatsRangeSelector(rangeSelector);

        // 根据时间范围筛选交易
        const filteredTransactions = this.filterTransactionsByRange(transactions);

        // 只统计支出
        const expenses = filteredTransactions.filter(t => t.txnType === "支出");

        if (expenses.length === 0) {
            widget.createDiv({ cls: "cost-category-stats-empty", text: "该时间段暂无支出记录" });
            return;
        }

        // 按分类汇总
        const categoryMap = new Map<string, number>();
        let totalExpense = 0;

        for (const txn of expenses) {
            const category = txn.category?.split("/")[0] || "未分类";
            const amount = txn.amount - txn.refund;
            categoryMap.set(category, (categoryMap.get(category) || 0) + amount);
            totalExpense += amount;
        }

        // 排序（按金额降序）
        const sorted = Array.from(categoryMap.entries()).sort((a, b) => b[1] - a[1]);

        // 颜色数组
        const colors: string[] = [
            "#4CAF50", "#2196F3", "#FF9800", "#E91E63",
            "#9C27B0", "#00BCD4", "#FF5722", "#795548",
            "#607D8B", "#3F51B5"
        ];

        // 主体内容：饼图（带折线标签）
        const contentEl = widget.createDiv({ cls: "cost-category-content" });

        // 饼图容器（包含SVG饼图和折线标签）
        const chartEl = contentEl.createDiv({ cls: "cost-category-chart" });
        this.renderPieChart(chartEl, sorted, colors, totalExpense);
    }

    private renderStatsRangeSelector(container: HTMLElement): void {
        // 当前显示的范围文字
        let rangeText = "";
        if (this.statsRangeType === "month") {
            rangeText = `${this.statsYear}年${this.statsMonth + 1}月`;
        } else if (this.statsRangeType === "year") {
            rangeText = `${this.statsYear}年`;
        } else {
            rangeText = "全部";
        }

        const rangeBtn = container.createDiv({ cls: "cost-stats-range-btn" });
        rangeBtn.setText(rangeText);
        rangeBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            this.showStatsRangeMenu(e);
        });
    }

    private showStatsRangeMenu(e: MouseEvent): void {
        const menu = new Menu();

        const now = new Date();
        const currentYear = now.getFullYear();
        const currentMonth = now.getMonth();

        // 当月
        menu.addItem(item => {
            item.setTitle(`本月 (${currentYear}年${currentMonth + 1}月)`);
            item.setIcon(this.statsRangeType === "month" &&
                this.statsYear === currentYear &&
                this.statsMonth === currentMonth ? "check" : "calendar");
            item.onClick(() => {
                this.statsRangeType = "month";
                this.statsYear = currentYear;
                this.statsMonth = currentMonth;
                this.render();
            });
        });

        // 上月
        const lastMonth = currentMonth === 0 ? 11 : currentMonth - 1;
        const lastMonthYear = currentMonth === 0 ? currentYear - 1 : currentYear;
        menu.addItem(item => {
            item.setTitle(`上月 (${lastMonthYear}年${lastMonth + 1}月)`);
            item.setIcon(this.statsRangeType === "month" &&
                this.statsYear === lastMonthYear &&
                this.statsMonth === lastMonth ? "check" : "calendar");
            item.onClick(() => {
                this.statsRangeType = "month";
                this.statsYear = lastMonthYear;
                this.statsMonth = lastMonth;
                this.render();
            });
        });

        menu.addSeparator();

        // 今年
        menu.addItem(item => {
            item.setTitle(`今年 (${currentYear}年)`);
            item.setIcon(this.statsRangeType === "year" && this.statsYear === currentYear ? "check" : "calendar-range");
            item.onClick(() => {
                this.statsRangeType = "year";
                this.statsYear = currentYear;
                this.render();
            });
        });

        // 去年
        menu.addItem(item => {
            item.setTitle(`去年 (${currentYear - 1}年)`);
            item.setIcon(this.statsRangeType === "year" && this.statsYear === currentYear - 1 ? "check" : "calendar-range");
            item.onClick(() => {
                this.statsRangeType = "year";
                this.statsYear = currentYear - 1;
                this.render();
            });
        });

        menu.addSeparator();

        // 全部
        menu.addItem(item => {
            item.setTitle("全部时间");
            item.setIcon(this.statsRangeType === "all" ? "check" : "infinity");
            item.onClick(() => {
                this.statsRangeType = "all";
                this.render();
            });
        });

        menu.showAtMouseEvent(e);
    }

    private filterTransactionsByRange(transactions: TransactionInfo[]): TransactionInfo[] {
        if (this.statsRangeType === "all") {
            return transactions;
        }

        return transactions.filter(txn => {
            if (!txn.date) return false;

            const [yearStr, monthStr] = txn.date.split("-");
            const txnYear = parseInt(yearStr || "0", 10);
            const txnMonth = parseInt(monthStr || "0", 10) - 1;  // 转为 0-11

            if (this.statsRangeType === "year") {
                return txnYear === this.statsYear;
            } else if (this.statsRangeType === "month") {
                return txnYear === this.statsYear && txnMonth === this.statsMonth;
            }

            return true;
        });
    }

    private renderPieChart(
        container: HTMLElement,
        data: [string, number][],
        colors: string[],
        total: number
    ): void {
        const size = 240;
        const center = size / 2;
        const radius = 90;
        const innerRadius = 58; // 环形图
        const labelRadius = 93; // 折线起点
        const labelOuterRadius = 108; // 折线拐点

        const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        svg.setAttribute("viewBox", `0 0 ${size} ${size}`);
        svg.setAttribute("class", "cost-pie-chart");

        let currentAngle = -90; // 从顶部开始

        const displayData = data.slice(0, 6);
        let otherTotal = 0;
        for (let i = 6; i < data.length; i++) {
            const entry = data[i];
            if (entry) otherTotal += entry[1];
        }
        if (otherTotal > 0) {
            displayData.push(["其他", otherTotal]);
        }

        const labels: { midAngle: number; percent: number; category: string; color: string; value: number }[] = [];

        for (let i = 0; i < displayData.length; i++) {
            const entry = displayData[i];
            if (!entry) continue;
            const category = entry[0];
            const value = entry[1];
            const percent = total > 0 ? value / total : 0;
            const angle = percent * 360;
            const color = colors[i % colors.length] || "#607D8B";

            if (angle > 0) {
                const path = this.createArcPath(center, center, radius, innerRadius, currentAngle, currentAngle + angle);
                const pathEl = document.createElementNS("http://www.w3.org/2000/svg", "path");
                pathEl.setAttribute("d", path);
                pathEl.setAttribute("fill", color);
                svg.appendChild(pathEl);

                const midAngle = currentAngle + angle / 2;
                labels.push({ midAngle, percent, category, color, value });

                currentAngle += angle;
            }
        }

        const toRad = (deg: number) => (deg * Math.PI) / 180;

        for (const label of labels) {
            const percentValue = label.percent * 100;
            if (percentValue < 3) continue;

            const midAngle = label.midAngle;
            const radMid = toRad(midAngle);

            const startX = center + labelRadius * Math.cos(radMid);
            const startY = center + labelRadius * Math.sin(radMid);
            const midX = center + labelOuterRadius * Math.cos(radMid);
            const midY = center + labelOuterRadius * Math.sin(radMid);

            const isRight = midAngle > -90 && midAngle < 90;
            const horizontalLength = 8;
            const endX = isRight ? midX + horizontalLength : midX - horizontalLength;
            const endY = midY;

            const line = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
            line.setAttribute("points", `${startX},${startY} ${midX},${midY} ${endX},${endY}`);
            line.setAttribute("fill", "none");
            line.setAttribute("stroke", label.color);
            line.setAttribute("stroke-width", "1.5");
            svg.appendChild(line);

            const percentRadius = (radius + innerRadius) / 2;
            const percentX = center + percentRadius * Math.cos(radMid);
            const percentY = center + percentRadius * Math.sin(radMid);

            if (percentValue >= 8) {
                const percentText = document.createElementNS("http://www.w3.org/2000/svg", "text");
                percentText.setAttribute("x", String(percentX));
                percentText.setAttribute("y", String(percentY + 3));
                percentText.setAttribute("text-anchor", "middle");
                percentText.setAttribute("class", "cost-pie-percent");
                percentText.textContent = `${percentValue.toFixed(0)}%`;
                svg.appendChild(percentText);
            }

            const labelText = document.createElementNS("http://www.w3.org/2000/svg", "text");
            labelText.setAttribute("x", String(endX + (isRight ? 4 : -4)));
            labelText.setAttribute("y", String(endY + 4));
            labelText.setAttribute("text-anchor", isRight ? "start" : "end");
            labelText.setAttribute("class", "cost-pie-category-label");
            labelText.textContent = label.category;
            svg.appendChild(labelText);
        }

        const textGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");

        const labelText = document.createElementNS("http://www.w3.org/2000/svg", "text");
        labelText.setAttribute("x", String(center));
        labelText.setAttribute("y", String(center - 6));
        labelText.setAttribute("text-anchor", "middle");
        labelText.setAttribute("class", "cost-pie-label");
        labelText.textContent = "总支出";
        textGroup.appendChild(labelText);

        const valueText = document.createElementNS("http://www.w3.org/2000/svg", "text");
        valueText.setAttribute("x", String(center));
        valueText.setAttribute("y", String(center + 14));
        valueText.setAttribute("text-anchor", "middle");
        valueText.setAttribute("class", "cost-pie-value");
        valueText.textContent = `¥${this.formatCompact(total)}`;
        textGroup.appendChild(valueText);

        svg.appendChild(textGroup);
        container.appendChild(svg);
    }

    private createArcPath(
        cx: number, cy: number,
        outerRadius: number, innerRadius: number,
        startAngle: number, endAngle: number
    ): string {
        const toRad = (deg: number) => (deg * Math.PI) / 180;

        const startOuter = {
            x: cx + outerRadius * Math.cos(toRad(startAngle)),
            y: cy + outerRadius * Math.sin(toRad(startAngle))
        };
        const endOuter = {
            x: cx + outerRadius * Math.cos(toRad(endAngle)),
            y: cy + outerRadius * Math.sin(toRad(endAngle))
        };
        const startInner = {
            x: cx + innerRadius * Math.cos(toRad(endAngle)),
            y: cy + innerRadius * Math.sin(toRad(endAngle))
        };
        const endInner = {
            x: cx + innerRadius * Math.cos(toRad(startAngle)),
            y: cy + innerRadius * Math.sin(toRad(startAngle))
        };

        const largeArc = (endAngle - startAngle) > 180 ? 1 : 0;

        return [
            `M ${startOuter.x} ${startOuter.y}`,
            `A ${outerRadius} ${outerRadius} 0 ${largeArc} 1 ${endOuter.x} ${endOuter.y}`,
            `L ${startInner.x} ${startInner.y}`,
            `A ${innerRadius} ${innerRadius} 0 ${largeArc} 0 ${endInner.x} ${endInner.y}`,
            `Z`
        ].join(' ');
    }
}
