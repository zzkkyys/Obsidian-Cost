import { BaseComponent } from '../BaseComponent';
import { TransactionInfo } from '../../services/transactionService';
import { formatCompact } from '../../utils/format';

export class TopPayeesWidget extends BaseComponent {
    private transactions: TransactionInfo[];

    constructor(containerEl: HTMLElement, transactions: TransactionInfo[]) {
        super(containerEl);
        this.transactions = transactions;
    }

    protected render(): void {
        const container = this.containerEl;
        container.addClass("cost-top-payees-widget");

        container.createEl("h3", { text: "消费排行榜", cls: "cost-card-title" });

        // Calculate
        const payeeMap = new Map<string, number>();
        for (const txn of this.transactions) {
            if (txn.txnType === '支出' && txn.payee) {
                const amount = txn.amount - (txn.refund || 0);
                payeeMap.set(txn.payee, (payeeMap.get(txn.payee) || 0) + amount);
            }
        }

        const sorted = Array.from(payeeMap.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5);
        if (sorted.length === 0) {
            container.createDiv({ text: "暂无数据", cls: "cost-empty-message" });
            return;
        }

        const maxVal = sorted[0]?.[1] || 0;

        const list = container.createDiv({ cls: "cost-top-payees-list" });

        sorted.forEach(([payee, amount], index) => {
            const row = list.createDiv({ cls: "cost-payee-row" });

            // 1. Name
            row.createDiv({ cls: "cost-payee-name", text: `${index + 1}. ${payee}` });

            // 2. Bar Container
            const barContainer = row.createDiv({ cls: "cost-payee-bar-container" });
            const percent = (amount / maxVal) * 100;
            const bar = barContainer.createDiv({ cls: "cost-payee-bar" });
            bar.style.width = `${percent}%`;

            // 3. Amount
            row.createDiv({ cls: "cost-payee-amount", text: formatCompact(amount) });
        });
    }
}
