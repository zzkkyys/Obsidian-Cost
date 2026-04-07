import { setIcon } from "obsidian";
import { BaseComponent } from "../BaseComponent";
import { TransactionInfo } from "../../services/transactionService";
import { formatThousands } from "../../utils/format";

export interface LenderSummary {
    lender: string;
    borrowed: number;
    repaid: number;
    outstanding: number;
    borrowTxns: TransactionInfo[];
    repayTxns: TransactionInfo[];
}

/**
 * 借贷明细组件
 * 按出借人汇总借款与还款，显示待还余额和逐笔明细。
 */
export class LoanLedger extends BaseComponent {
    private transactions: TransactionInfo[];
    private onTxnClick?: (txn: TransactionInfo) => void;

    /** 已展开的出借人 */
    private expanded: Set<string> = new Set();

    constructor(
        containerEl: HTMLElement,
        transactions: TransactionInfo[],
        onTxnClick?: (txn: TransactionInfo) => void
    ) {
        super(containerEl);
        this.transactions = transactions;
        this.onTxnClick = onTxnClick;
    }

    protected render(): void {
        const summaries = this.buildSummaries();

        if (summaries.length === 0) {
            this.containerEl.createDiv({
                cls: "cost-empty-message",
                text: "暂无借贷记录。新建交易时选择「借款」类型即可开始记录。"
            });
            return;
        }

        // 汇总行：总借入、总待还
        const totalBorrowed = summaries.reduce((s, l) => s + l.borrowed, 0);
        const totalOutstanding = summaries.reduce((s, l) => s + l.outstanding, 0);

        const overview = this.containerEl.createDiv({ cls: "cost-loan-overview" });
        this.renderStat(overview, "总借入", totalBorrowed, "cost-loan-stat-borrowed");
        this.renderStat(overview, "待还合计", totalOutstanding,
            totalOutstanding > 0 ? "cost-loan-stat-outstanding" : "cost-loan-stat-clear");

        // 各出借人卡片
        const listEl = this.containerEl.createDiv({ cls: "cost-loan-list" });

        // 待还 > 0 排前面，已结清排后
        const sorted = [...summaries].sort((a, b) => {
            if (a.outstanding > 0 && b.outstanding <= 0) return -1;
            if (a.outstanding <= 0 && b.outstanding > 0) return 1;
            return b.outstanding - a.outstanding;
        });

        for (const summary of sorted) {
            this.renderLenderCard(listEl, summary);
        }
    }

    private renderStat(container: HTMLElement, label: string, amount: number, cls: string): void {
        const stat = container.createDiv({ cls: `cost-loan-stat ${cls}` });
        stat.createDiv({ cls: "cost-loan-stat-label", text: label });
        stat.createDiv({ cls: "cost-loan-stat-value", text: `¥${formatThousands(amount, 2)}` });
    }

    private renderLenderCard(container: HTMLElement, s: LenderSummary): void {
        const isSettled = s.outstanding <= 0;
        const card = container.createDiv({
            cls: `cost-loan-card ${isSettled ? "cost-loan-card-settled" : ""}`
        });

        // Header — 点击展开/收起
        const header = card.createDiv({ cls: "cost-loan-card-header" });

        const left = header.createDiv({ cls: "cost-loan-card-left" });
        const nameRow = left.createDiv({ cls: "cost-loan-card-name-row" });
        nameRow.createSpan({ cls: "cost-loan-card-name", text: s.lender || "（未知出借人）" });
        if (isSettled) {
            nameRow.createSpan({ cls: "cost-loan-badge-settled", text: "已结清" });
        }

        const statsRow = left.createDiv({ cls: "cost-loan-card-stats-row" });
        statsRow.createSpan({ cls: "cost-loan-mini-stat", text: `借入 ¥${formatThousands(s.borrowed, 2)}` });
        statsRow.createSpan({ cls: "cost-loan-mini-sep", text: "·" });
        statsRow.createSpan({ cls: "cost-loan-mini-stat", text: `已还 ¥${formatThousands(s.repaid, 2)}` });

        const right = header.createDiv({ cls: "cost-loan-card-right" });
        const outstandingEl = right.createDiv({
            cls: `cost-loan-outstanding ${isSettled ? "cost-loan-outstanding-zero" : ""}`,
            text: isSettled ? "¥0.00" : `¥${formatThousands(s.outstanding, 2)}`
        });
        if (!isSettled) {
            right.createDiv({ cls: "cost-loan-outstanding-label", text: "待还" });
        }

        const chevron = header.createDiv({ cls: "cost-loan-chevron" });
        setIcon(chevron, this.expanded.has(s.lender) ? "chevron-up" : "chevron-down");

        // 明细区
        const detail = card.createDiv({ cls: "cost-loan-detail" });
        if (!this.expanded.has(s.lender)) {
            detail.style.display = "none";
        } else {
            this.renderDetail(detail, s);
        }

        header.addEventListener("click", () => {
            if (this.expanded.has(s.lender)) {
                this.expanded.delete(s.lender);
                detail.style.display = "none";
                setIcon(chevron, "chevron-down");
            } else {
                this.expanded.add(s.lender);
                detail.style.display = "block";
                detail.empty();
                this.renderDetail(detail, s);
                setIcon(chevron, "chevron-up");
            }
        });
    }

    private renderDetail(container: HTMLElement, s: LenderSummary): void {
        const allTxns = [
            ...s.borrowTxns.map(t => ({ txn: t, kind: "借款" as const })),
            ...s.repayTxns.map(t => ({ txn: t, kind: "还款" as const })),
        ].sort((a, b) => {
            const d = a.txn.date.localeCompare(b.txn.date);
            return d !== 0 ? d : (a.txn.time || "").localeCompare(b.txn.time || "");
        });

        for (const { txn, kind } of allTxns) {
            const row = container.createDiv({ cls: "cost-loan-detail-row" });

            const isBorrow = kind === "借款";
            row.createDiv({ cls: "cost-loan-detail-date", text: txn.date });
            row.createDiv({
                cls: `cost-loan-detail-kind ${isBorrow ? "cost-loan-kind-borrow" : "cost-loan-kind-repay"}`,
                text: kind
            });

            const accountName = isBorrow ? (txn.to || "—") : (txn.from || "—");
            row.createDiv({ cls: "cost-loan-detail-account", text: accountName });

            if (txn.memo || txn.note) {
                row.createDiv({ cls: "cost-loan-detail-memo", text: txn.memo || txn.note });
            }

            const amountEl = row.createDiv({
                cls: `cost-loan-detail-amount ${isBorrow ? "cost-loan-amount-borrow" : "cost-loan-amount-repay"}`,
                text: `${isBorrow ? "+" : "-"}¥${formatThousands(txn.amount, 2)}`
            });

            row.addEventListener("click", () => this.onTxnClick?.(txn));
            row.addClass("cost-loan-detail-row-clickable");
        }
    }

    // ─── 数据汇总 ───

    private buildSummaries(): LenderSummary[] {
        const lenderMap = new Map<string, LenderSummary>();

        const getOrCreate = (lender: string): LenderSummary => {
            if (!lenderMap.has(lender)) {
                lenderMap.set(lender, {
                    lender,
                    borrowed: 0,
                    repaid: 0,
                    outstanding: 0,
                    borrowTxns: [],
                    repayTxns: [],
                });
            }
            return lenderMap.get(lender)!;
        };

        for (const txn of this.transactions) {
            const lender = txn.payee?.trim() || "";

            if (txn.txnType === "借款") {
                const s = getOrCreate(lender);
                s.borrowed += txn.amount;
                s.borrowTxns.push(txn);
            } else if (txn.txnType === "还款" && lender && lenderMap.has(lender)) {
                // 只关联已有借款人的还款
                const s = lenderMap.get(lender)!;
                s.repaid += txn.amount;
                s.repayTxns.push(txn);
            }
        }

        for (const s of lenderMap.values()) {
            s.outstanding = Math.max(0, s.borrowed - s.repaid);
        }

        return Array.from(lenderMap.values());
    }
}

