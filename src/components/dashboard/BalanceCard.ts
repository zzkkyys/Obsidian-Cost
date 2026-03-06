import { BaseComponent } from '../BaseComponent';
import { AccountInfo } from '../../types';
import { TransactionService } from '../../services/transactionService';
import { formatThousands } from '../../utils/format';

/**
 * 余额总览卡片
 * 与侧边栏使用同一个 transactionService.calculateBalanceChange() 计算余额，
 * 保证两处金额一致。
 */
export class BalanceCard extends BaseComponent {
    private accounts: AccountInfo[];
    private transactionService: TransactionService;

    constructor(
        containerEl: HTMLElement,
        accounts: AccountInfo[],
        transactionService: TransactionService
    ) {
        super(containerEl);
        this.accounts = accounts;
        this.transactionService = transactionService;
    }

    /**
     * 计算单个账户的当前余额（与侧边栏逻辑完全一致）
     */
    private calculateBalance(account: AccountInfo): number {
        const change = this.transactionService.calculateBalanceChange(account.fileName);
        return account.openingBalance + change;
    }

    protected render(): void {
        const card = this.containerEl.createDiv({ cls: "cost-balance-summary-card" });

        // 计算各类余额（与侧边栏 renderBalanceSummary 逻辑一致）
        let assetsTotal = 0;      // 资产（非信用卡账户）
        let liabilitiesTotal = 0; // 负债（信用卡欠款）

        for (const account of this.accounts) {
            const balance = this.calculateBalance(account);
            if (account.accountKind === "credit") {
                // 信用卡：只有负余额部分算作负债
                liabilitiesTotal += Math.abs(Math.min(0, balance));
            } else {
                // 其他账户：余额计入资产
                assetsTotal += balance;
            }
        }

        const netWorth = assetsTotal - liabilitiesTotal;

        // Render UI — 净资产
        const mainSection = card.createDiv({ cls: "cost-summary-main" });
        mainSection.createDiv({ cls: "cost-summary-main-label", text: "净资产" });

        const valueEl = mainSection.createDiv({
            cls: `cost-summary-main-value ${netWorth < 0 ? "cost-summary-negative" : ""}`
        });
        valueEl.createSpan({ cls: "cost-summary-currency", text: "¥" });
        valueEl.createSpan({
            cls: `cost-summary-amount ${netWorth >= 0 ? "cost-balance-positive" : "cost-balance-negative"}`,
            text: formatThousands(Math.abs(netWorth), 2)
        });

        // 进度条 — 资产与负债比例
        const totalVolume = assetsTotal + liabilitiesTotal;
        let assetPercent = 100;
        if (totalVolume > 0) {
            assetPercent = (assetsTotal / totalVolume) * 100;
        }

        const progressEl = card.createDiv({ cls: "cost-summary-progress" });
        const bar = progressEl.createDiv({ cls: "cost-summary-progress-bar" });
        bar.createDiv({
            cls: "cost-summary-progress-asset",
            attr: { style: `width: ${assetPercent}%` }
        });

        // 详情 — 资产 & 负债
        const details = card.createDiv({ cls: "cost-summary-detail" });

        // 资产
        const assetItem = details.createDiv({ cls: "cost-summary-detail-item" });
        assetItem.createDiv({ cls: "cost-summary-detail-dot cost-dot-asset" });
        assetItem.createDiv({ cls: "cost-summary-detail-label", text: "资产" });
        assetItem.createDiv({
            cls: "cost-summary-detail-value",
            text: `¥${formatThousands(assetsTotal, 2)}`
        });

        // 负债
        const liabilityItem = details.createDiv({ cls: "cost-summary-detail-item" });
        liabilityItem.createDiv({ cls: "cost-summary-detail-dot cost-dot-liability" });
        liabilityItem.createDiv({ cls: "cost-summary-detail-label", text: "负债" });
        liabilityItem.createDiv({
            cls: "cost-summary-detail-value",
            text: `¥${formatThousands(liabilitiesTotal, 2)}`
        });
    }
}
