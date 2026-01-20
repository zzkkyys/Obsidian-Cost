import { App, setIcon, TFile } from "obsidian";
import { BaseComponent } from '../BaseComponent';
import { TransactionInfo } from '../../services/transactionService';
import { AccountInfo } from '../../types';
import { formatThousands, normalizeBalance } from '../../utils/format';

export interface TransactionListOptions {
    onTransactionClick?: (txn: TransactionInfo) => void;
    onAccountClick?: (accountName: string, field: 'from' | 'to', txn: TransactionInfo) => void;
    onDateClick?: (txn: TransactionInfo) => void;
    onTimeClick?: (txn: TransactionInfo) => void;
}

export class TransactionList extends BaseComponent {
    private app: App;
    private transactions: TransactionInfo[];
    private accounts: AccountInfo[];
    private options: TransactionListOptions;
    private runningBalances: Map<string, Map<string, { before: number, after: number }>> | null = null;

    // Cache for account icons/details
    private accountMap: Map<string, AccountInfo> = new Map();

    constructor(
        containerEl: HTMLElement,
        app: App,
        transactions: TransactionInfo[],
        accounts: AccountInfo[],
        runningBalances: Map<string, Map<string, { before: number, after: number }>> | null = null,
        options: TransactionListOptions = {}
    ) {
        super(containerEl);
        this.app = app;
        this.transactions = transactions;
        this.accounts = accounts;
        this.runningBalances = runningBalances;
        this.options = options;
        this.rebuildAccountMap();
    }

    public updateData(
        transactions: TransactionInfo[],
        accounts: AccountInfo[],
        runningBalances: Map<string, Map<string, { before: number, after: number }>> | null = null
    ): void {
        this.transactions = transactions;
        this.accounts = accounts;
        this.runningBalances = runningBalances;
        this.rebuildAccountMap();
        this.update();
    }

    private rebuildAccountMap(): void {
        this.accountMap.clear();
        for (const account of this.accounts) {
            this.accountMap.set(account.fileName, account);
            if (account.displayName !== account.fileName) {
                this.accountMap.set(account.displayName, account);
            }
        }
    }

    private findAccountByName(name: string): AccountInfo | undefined {
        return this.accountMap.get(name);
    }

    protected render(): void {
        const listContainer = this.containerEl.createDiv({ cls: "cost-transactions-list-container" });

        if (this.transactions.length === 0) {
            listContainer.createDiv({ cls: "cost-empty-message", text: "暂无交易记录" });
            return;
        }

        // Group by Date
        const grouped = new Map<string, TransactionInfo[]>();
        for (const txn of this.transactions) {
            const date = txn.date || "未知日期";
            if (!grouped.has(date)) {
                grouped.set(date, []);
            }
            grouped.get(date)!.push(txn);
        }

        // Render Groups
        let groupsRendered = 0;
        try {
            for (const [date, txns] of grouped) {
                this.renderDateGroup(listContainer, date, txns);
                groupsRendered++;
            }
        } catch (e) {
            console.error("[Cost] Render error:", e);
            listContainer.createDiv({ cls: "cost-error-message", text: `渲染错误: ${e}` });
        }
    }

    private renderDateGroup(container: HTMLElement, date: string, transactions: TransactionInfo[]): void {
        const group = container.createDiv({ cls: "cost-date-group" });

        // Header
        const header = group.createDiv({ cls: "cost-date-header" });
        header.createSpan({ cls: "cost-date-text", text: date });

        // Daily Summary (Income/Expense)
        let dailyIncome = 0;
        let dailyExpense = 0;
        for (const txn of transactions) {
            if (txn.txnType === '收入') dailyIncome += txn.amount;
            else if (txn.txnType === '支出') dailyExpense += (txn.amount - txn.refund);
        }

        if (dailyIncome > 0 || dailyExpense > 0) {
            const summaryEl = header.createDiv({ cls: "cost-date-summary" });
            if (dailyIncome > 0) {
                summaryEl.createSpan({ cls: "cost-income", text: `+${dailyIncome.toFixed(2)}` });
            }
            if (dailyExpense > 0) {
                summaryEl.createSpan({ cls: "cost-expense", text: `-${dailyExpense.toFixed(2)}` });
            }
        }

        // List
        const list = group.createDiv({ cls: "cost-transactions-list" });
        for (const txn of transactions) {
            this.renderTransactionItem(list, txn);
        }
    }

    private renderTransactionItem(container: HTMLElement, txn: TransactionInfo): void {
        const item = container.createDiv({ cls: `cost-transaction-item cost-txn-${txn.txnType}` });

        // Category Icon
        const iconEl = item.createDiv({ cls: "cost-txn-icon" });
        iconEl.setText(this.getCategoryIcon(txn.category));

        // Info Column
        const infoEl = item.createDiv({ cls: "cost-txn-info" });

        // Top Row: Category | Payee | Address
        const topRow = infoEl.createDiv({ cls: "cost-txn-top-row" });
        topRow.createSpan({ cls: "cost-txn-category", text: txn.category || "未分类" });
        if (txn.payee) topRow.createSpan({ cls: "cost-txn-payee", text: txn.payee });
        if (txn.address) topRow.createSpan({ cls: "cost-txn-address", text: "📍 " + txn.address });

        // Bottom Row: Date | Time | Account | Note | Persons
        const bottomRow = infoEl.createDiv({ cls: "cost-txn-bottom-row" });

        const timeEl = bottomRow.createSpan({ cls: "cost-txn-time-clickable" });
        timeEl.setText(txn.time || "--:--:--");
        timeEl.onclick = (e) => {
            e.stopPropagation();
            this.options.onTimeClick?.(txn);
        }

        // Account Bubble
        if (txn.from || txn.to) {
            this.renderAccountBubble(bottomRow, txn);
        }

        if (txn.note) bottomRow.createSpan({ cls: "cost-txn-note", text: txn.note });
        if (txn.memo && txn.memo !== txn.note) bottomRow.createSpan({ cls: "cost-txn-memo", text: `(${txn.memo})` });

        if (txn.persons && txn.persons.length > 0) {
            const personsEl = bottomRow.createSpan({ cls: "cost-txn-persons" });
            txn.persons.forEach(p => personsEl.createSpan({ cls: "cost-txn-person-bubble", text: "@" + p }));
        }

        if (txn.refund > 0) {
            bottomRow.createSpan({ cls: "cost-txn-refund", text: `退款 ${txn.refund.toFixed(2)}` });
        }

        // Amount Column
        const amountCol = item.createDiv({ cls: "cost-txn-amount-col" });
        const amountEl = amountCol.createDiv({ cls: "cost-txn-amount" });
        const prefix = txn.txnType === "收入" ? "+" : (txn.txnType === "支出" ? "-" : "");

        if (txn.txnType === "支出" && txn.refund > 0) {
            const net = txn.amount - txn.refund;
            amountEl.setText(`${prefix}${net.toFixed(2)}`);
            amountCol.createDiv({ cls: "cost-txn-original-amount", text: `原 ${txn.amount.toFixed(2)}` });
        } else {
            amountEl.setText(`${prefix}${txn.amount.toFixed(2)}`);
        }
        amountEl.addClass(`cost-amount-${txn.txnType}`);

        // Balance Changes Rendering (Moved here)
        if (this.runningBalances) {
            const changes = this.runningBalances.get(txn.path);
            if (changes && changes.size > 0) {
                const balanceContainer = amountCol.createDiv({ cls: "cost-txn-balance-col-wrapper" });
                for (const [accountName, bal] of changes) {
                    const span = balanceContainer.createDiv({ cls: "cost-txn-balance-change-right" });
                    span.setText(`${formatThousands(bal.before)} → ${formatThousands(bal.after)}`);
                    if (bal.after < bal.before) span.addClass("cost-balance-down");
                    else if (bal.after > bal.before) span.addClass("cost-balance-up");
                }
            }
        }

        // Click Handler (Open File)
        item.addEventListener("click", () => {
            if (this.options.onTransactionClick) {
                this.options.onTransactionClick(txn);
            } else {
                // Default: Open file
                const file = this.app.vault.getAbstractFileByPath(txn.path);
                if (file instanceof TFile) {
                    this.app.workspace.getLeaf().openFile(file);
                }
            }
        });
    }

    private renderAccountIcon(container: HTMLElement, account: AccountInfo): void {
        const iconSpan = container.createSpan({ cls: "cost-txn-account-icon-small" });

        if (account.icon) {
            // Check for [[link]]
            const match = account.icon.match(/\[\[(.+?)\]\]/);
            if (match && match[1]) {
                const fileName = match[1];
                const imageFile = this.app.metadataCache.getFirstLinkpathDest(fileName, "");
                if (imageFile) {
                    const resourcePath = this.app.vault.getResourcePath(imageFile);
                    const img = iconSpan.createEl("img", { cls: "cost-account-custom-icon-img" });
                    img.src = resourcePath;
                    return;
                }
            } else if (!account.icon.includes("[[")) {
                // Might be emoji or plain text
                iconSpan.setText(account.icon);
                return;
            }
        }

        // Fallback by kind
        const icons: Record<string, string> = {
            "bank": "🏦",
            "cash": "💵",
            "credit": "💳",
            "investment": "📈",
            "wallet": "👛",
            "prepaid": "🎫",
            "other": "💰",
            "alipay": "🔷",
            "wechat": "🟢"
        };
        // Normalize kind?
        const kind = account.accountKind || "other";
        iconSpan.setText(icons[kind] || icons["other"] || "💰");
    }

    private renderAccountBubble(container: HTMLElement, txn: TransactionInfo): void {
        const bubble = container.createSpan({ cls: "cost-txn-account-bubble" });

        const renderItem = (name: string, field: 'from' | 'to') => {
            const accEl = bubble.createSpan({ cls: "cost-txn-account-editable" });

            const account = this.findAccountByName(name);
            if (account) {
                this.renderAccountIcon(accEl, account);
            }

            accEl.createSpan({ text: name });
            accEl.onclick = (e) => { e.stopPropagation(); this.options.onAccountClick?.(name, field, txn); };
        };

        if (txn.txnType === "转账" || txn.txnType === "还款") {
            renderItem(txn.from, 'from');
            bubble.createSpan({ text: " → " });
            renderItem(txn.to, 'to');
        } else {
            const name = txn.from || txn.to;
            const field = txn.from ? 'from' : 'to';
            renderItem(name, field);
        }
    }

    private getCategoryIcon(category: string): string {
        const catStr = String(category || "");
        if (!catStr) return "📝";
        return catStr.substring(0, 1);
    }
}
