import { BaseComponent } from '../BaseComponent';
import { TransactionInfo } from '../../services/transactionService';
import { formatCompact } from '../../utils/format';

export class KPICardsWidget extends BaseComponent {
    private transactions: TransactionInfo[];

    constructor(containerEl: HTMLElement, transactions: TransactionInfo[]) {
        super(containerEl);
        this.transactions = transactions;
    }

    protected render(): void {
        const wrapper = this.containerEl.createDiv({ cls: "cost-kpi-cards-wrapper" });

        // Calculate Stats
        const now = new Date();
        const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

        const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const lastMonth = `${lastMonthDate.getFullYear()}-${String(lastMonthDate.getMonth() + 1).padStart(2, '0')}`;

        let thisMonthExpense = 0;
        let lastMonthExpense = 0;
        let maxExpense = 0;
        let expenseCount = 0;

        for (const txn of this.transactions) {
            if (txn.txnType === '支出') {
                const amount = txn.amount - (txn.refund || 0);
                if (txn.date.startsWith(thisMonth)) {
                    thisMonthExpense += amount;
                    if (amount > maxExpense) maxExpense = amount;
                    expenseCount++;
                } else if (txn.date.startsWith(lastMonth)) {
                    lastMonthExpense += amount;
                }
            }
        }

        // 1. Month Expense vs Last Month
        const expenseCard = wrapper.createDiv({ cls: "cost-kpi-card" });
        expenseCard.createDiv({ cls: "cost-kpi-label", text: "本月支出" });
        expenseCard.createDiv({ cls: "cost-kpi-value", text: `¥${formatCompact(thisMonthExpense)}` });

        const diff = thisMonthExpense - lastMonthExpense;
        const percent = lastMonthExpense > 0 ? (diff / lastMonthExpense * 100).toFixed(0) : "0";
        // Expense increase is "bad" usually, but technically "up"
        const trendIcon = diff > 0 ? "⬆" : "⬇";
        const trendClass = diff > 0 ? "cost-trend-up" : "cost-trend-down"; // up might be red for expense?

        // Usually for expense: Higher = Red, Lower = Green
        // But let's stick to neutral up/down classes or reuse balance classes
        const colorClass = diff > 0 ? "cost-balance-negative" : "cost-balance-positive";

        const trendEl = expenseCard.createDiv({ cls: `cost-kpi-trend ${colorClass}` });
        trendEl.setText(`${trendIcon} ${Math.abs(Number(percent))}% vs 上月`);

        // 2. Daily Average
        const daysPassed = now.getDate();
        const dailyAvg = thisMonthExpense / (daysPassed || 1);

        const avgCard = wrapper.createDiv({ cls: "cost-kpi-card" });
        avgCard.createDiv({ cls: "cost-kpi-label", text: "日均支出" });
        avgCard.createDiv({ cls: "cost-kpi-value", text: `¥${formatCompact(dailyAvg)}` });
        avgCard.createDiv({ cls: "cost-kpi-sub", text: `${expenseCount} 笔消费` });

        // 3. Max Expense
        const maxCard = wrapper.createDiv({ cls: "cost-kpi-card" });
        maxCard.createDiv({ cls: "cost-kpi-label", text: "最大单笔" });
        maxCard.createDiv({ cls: "cost-kpi-value", text: `¥${formatCompact(maxExpense)}` });
        maxCard.createDiv({ cls: "cost-kpi-sub", text: "本月" });
    }
}
