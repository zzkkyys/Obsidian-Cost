import { BaseComponent } from '../BaseComponent';
import { AccountInfo } from '../../types';
import { TransactionInfo } from '../../services/transactionService';
import { formatThousands } from '../../utils/format';

export class BalanceCard extends BaseComponent {
    private accounts: AccountInfo[];
    private transactions: TransactionInfo[];

    constructor(
        containerEl: HTMLElement,
        accounts: AccountInfo[],
        transactions: TransactionInfo[]
    ) {
        super(containerEl);
        this.accounts = accounts;
        this.transactions = transactions;
    }

    protected render(): void {
        const card = this.containerEl.createDiv({ cls: "cost-balance-summary-card" });

        // Calculate balances
        // 1. Initial balances from accounts
        const accountBalances = new Map<string, number>();
        let totalOpeningBalance = 0;

        for (const acc of this.accounts) {
            accountBalances.set(acc.fileName, acc.openingBalance);
            totalOpeningBalance += acc.openingBalance;
        }

        // 2. Apply transactions
        for (const txn of this.transactions) {
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

        // 3. Summarize
        let totalAsset = 0;
        let totalLiability = 0;
        let netWorth = 0;

        for (const balance of accountBalances.values()) {
            netWorth += balance;
            if (balance >= 0) totalAsset += balance;
            else totalLiability += balance;
        }

        // Render UI
        const mainSection = card.createDiv({ cls: "cost-summary-main" });
        mainSection.createDiv({ cls: "cost-summary-main-label", text: "净资产" });

        const valueEl = mainSection.createDiv({
            cls: `cost-summary-main-value ${netWorth < 0 ? "cost-summary-negative" : ""}`
        });
        valueEl.createSpan({ cls: "cost-summary-currency", text: "CNY" });
        valueEl.createSpan({
            cls: `cost-summary-amount ${netWorth >= 0 ? "cost-balance-positive" : "cost-balance-negative"}`,
            text: formatThousands(Math.abs(netWorth), 2)
        });

        // Progress Bar
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

        // Details
        const details = card.createDiv({ cls: "cost-summary-detail" });

        // Total Assets
        const assetItem = details.createDiv({ cls: "cost-summary-detail-item" });
        assetItem.createDiv({ cls: "cost-summary-detail-dot cost-dot-asset" });
        assetItem.createDiv({ cls: "cost-summary-detail-label", text: "总资产" });
        assetItem.createDiv({ cls: "cost-summary-detail-value", text: formatThousands(totalAsset) });

        // Total Liabilities
        const liabilityItem = details.createDiv({ cls: "cost-summary-detail-item" });
        liabilityItem.createDiv({ cls: "cost-summary-detail-dot cost-dot-liability" });
        liabilityItem.createDiv({ cls: "cost-summary-detail-label", text: "总负债" });
        liabilityItem.createDiv({
            cls: "cost-summary-detail-value",
            text: formatThousands(Math.abs(totalLiability))
        });
    }
}
