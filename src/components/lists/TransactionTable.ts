import { App, setIcon, TFile } from "obsidian";
import { BaseComponent } from "../BaseComponent";
import { TransactionInfo } from "../../services/transactionService";
import { formatCompact, formatThousands } from "../../utils/format";

export interface TransactionTableOptions {
    onSelectionChange?: (selected: Set<string>) => void;
    onTransactionClick?: (txn: TransactionInfo) => void;
    activeAccount?: string | null;  // For context-aware rendering
}

export class TransactionTable extends BaseComponent {
    private transactions: TransactionInfo[];
    private options: TransactionTableOptions;
    private selectedPaths: Set<string>;
    private selectAllState: boolean = false;

    constructor(
        containerEl: HTMLElement,
        transactions: TransactionInfo[],
        options: TransactionTableOptions = {}
    ) {
        super(containerEl);
        this.transactions = transactions;
        this.options = options;
        this.selectedPaths = new Set();
    }

    private keyword: string = "";
    private sortOrder: "asc" | "desc" | null = null;

    public setTransactions(transactions: TransactionInfo[], keyword: string = "") {
        this.transactions = transactions;
        this.keyword = keyword;
        this.selectedPaths.clear();
        this.selectAllState = false;

        // Re-apply sort if active
        if (this.sortOrder) {
            this.sortTransactions();
        }

        // Re-render
        this.containerEl.empty();
        this.render();
    }

    private sortTransactions() {
        if (!this.sortOrder) return;

        this.transactions.sort((a, b) => {
            const amountA = a.amount - (a.refund || 0);
            const amountB = b.amount - (b.refund || 0);

            if (this.sortOrder === "asc") {
                return amountA - amountB;
            } else {
                return amountB - amountA;
            }
        });
    }

    private toggleSort() {
        if (this.sortOrder === null) this.sortOrder = "desc"; // Default to desc (highest first)
        else if (this.sortOrder === "desc") this.sortOrder = "asc";
        else this.sortOrder = null; // Reset

        if (this.sortOrder) {
            this.sortTransactions();
        } else {
            // If reset, we might want to re-sort by date default? 
            // Ideally we should keep original order or request re-fetch.
            // For now, let's just reverse the current sort effectively or no-op if we don't have original index.
            // Simpler: Just cycle desc -> asc -> desc. No 'null' after start?
            // Common pattern: click -> desc -> click -> asc -> click -> desc
        }

        // Let's stick to 3-state or 2-state? User asked for Up/Down.
        // Let's do: desc -> asc -> default (date desc usually).
        // If default implies re-fetching or resort by date:
        if (this.sortOrder === null) {
            // Quick fix: sort by date desc as default fallback
            this.transactions.sort((a, b) => b.date.localeCompare(a.date));
        }

        this.containerEl.empty();
        this.render();
    }

    private renderHighlighted(container: HTMLElement, text: string) {
        try {
            if (!text) {
                container.setText("-");
                return;
            }

            if (!this.keyword) {
                container.setText(text);
                return;
            }

            // Simple case-insensitive match
            const lowerText = text.toLowerCase();
            const lowerKeyword = this.keyword.toLowerCase().trim();

            if (!lowerKeyword || !lowerText.includes(lowerKeyword)) {
                container.setText(text);
                return;
            }

            const parts: { text: string; highlight: boolean }[] = [];
            let startIndex = 0;
            let matchIndex = lowerText.indexOf(lowerKeyword, startIndex);

            while (matchIndex !== -1) {
                if (matchIndex > startIndex) {
                    parts.push({ text: text.substring(startIndex, matchIndex), highlight: false });
                }
                parts.push({ text: text.substring(matchIndex, matchIndex + lowerKeyword.length), highlight: true });

                startIndex = matchIndex + lowerKeyword.length;
                matchIndex = lowerText.indexOf(lowerKeyword, startIndex);
            }

            if (startIndex < text.length) {
                parts.push({ text: text.substring(startIndex), highlight: false });
            }

            parts.forEach(part => {
                const span = container.createSpan({ text: part.text });
                if (part.highlight) span.addClass("cost-highlight");
            });
        } catch (e) {
            console.error("Highlight error:", e);
            container.setText(text || "-");
        }
    }

    protected render(): void {
        const container = this.containerEl.createDiv({ cls: "cost-transaction-table-container" });

        // Table Element
        const table = container.createEl("table", { cls: "cost-txn-table" });

        // Header
        const thead = table.createEl("thead");
        const headerRow = thead.createEl("tr");

        // Checkbox Header
        const cbHeader = headerRow.createEl("th", { cls: "cost-table-checkbox" });
        const masterCb = cbHeader.createEl("input", { type: "checkbox" });
        masterCb.checked = this.selectAllState;
        masterCb.onclick = (e) => {
            this.toggleSelectAll(masterCb.checked);
        };

        headerRow.createEl("th", { text: "日期" });
        headerRow.createEl("th", { text: "类型" });
        headerRow.createEl("th", { text: "分类" });

        // Amount Header with Sort
        const amountTh = headerRow.createEl("th", { cls: "cost-sortable-th", attr: { style: "text-align: right; cursor: pointer; user-select: none;" } });
        const amountDiv = amountTh.createDiv({ cls: "cost-th-content" });
        amountDiv.createSpan({ text: "金额" });
        if (this.sortOrder) {
            const iconSpan = amountDiv.createSpan({ cls: "cost-sort-icon" });
            setIcon(iconSpan, this.sortOrder === "asc" ? "chevron-up" : "chevron-down");
        }
        amountTh.onclick = () => this.toggleSort();

        headerRow.createEl("th", { text: "账户" });
        headerRow.createEl("th", { text: "对象" }); // Payee
        headerRow.createEl("th", { text: "备注" });

        // Body
        const tbody = table.createEl("tbody");

        // Check if empty
        if (this.transactions.length === 0) {
            const emptyRow = tbody.createEl("tr");
            const cell = emptyRow.createEl("td", { attr: { colspan: 8 } });
            cell.createDiv({ cls: "cost-empty-message", text: "暂无符合条件的交易" });
            return;
        }

        this.transactions.forEach(txn => {
            const row = tbody.createEl("tr");

            // Checkbox
            const cbCell = row.createEl("td", { cls: "cost-table-checkbox" });
            const cb = cbCell.createEl("input", { type: "checkbox" });
            cb.checked = this.selectedPaths.has(txn.path);
            cb.onclick = (e) => {
                e.stopPropagation();
                this.toggleSelection(txn.path, cb.checked);
            };

            // Determine context
            const isRefundContext = this.options.activeAccount && txn.refundTo === this.options.activeAccount && txn.refund > 0;

            // Date
            row.createEl("td", { text: txn.date || "-" });

            // Type
            const typeCell = row.createEl("td");
            if (isRefundContext) {
                typeCell.createSpan({ cls: "cost-tag is-income", text: "退款" });
            } else {
                typeCell.createSpan({
                    cls: `cost-tag ${txn.txnType === "支出" ? "is-expense" : (txn.txnType === "收入" ? "is-income" : "is-transfer")}`,
                    text: txn.txnType
                });
            }

            // Category
            this.renderHighlighted(row.createEl("td"), txn.category || "");

            // Amount
            const amtCell = row.createEl("td", { cls: "cost-table-amount" });
            let displayAmount = 0;
            if (isRefundContext) {
                displayAmount = txn.refund || 0;
            } else {
                displayAmount = txn.amount - (txn.refund || 0);
            }
            const amtText = formatCompact(displayAmount);

            // Highlight Amount if matches
            if (this.keyword && amtText.includes(this.keyword)) {
                this.renderHighlighted(amtCell, amtText);
            } else {
                const textSpan = amtCell.createSpan({ text: amtText });
                if (txn.txnType === "还款" && txn.discount && txn.discount > 0) {
                    amtCell.createSpan({ cls: "cost-table-discount-tag", text: ` (惠 ${txn.discount})` });
                }
            }

            if (isRefundContext) {
                amtCell.addClass("cost-text-green");
            } else {
                if (txn.txnType === "支出") amtCell.addClass("cost-text-red");
                else if (txn.txnType === "收入") amtCell.addClass("cost-text-green");
            }

            // Account
            let accText = txn.from || "";

            if (txn.to) {
                if (txn.txnType === "转账" || txn.txnType === "还款") {
                    let outAmt = txn.amount;
                    let inAmt = txn.amount;

                    if (txn.txnType === "还款" && txn.discount) {
                        outAmt = txn.amount - txn.discount;
                    }

                    // Show flow: From (-Out) -> To (+In)
                    accText = `${txn.from} (-${formatThousands(outAmt, 2)}) → ${txn.to} (+${formatThousands(inAmt, 2)})`;
                } else {
                    accText += ` -> ${txn.to}`;
                }
            }

            if (!isRefundContext && txn.txnType === "支出" && txn.refund && txn.refund > 0) {
                const targetAccount = txn.refundTo || txn.from;
                accText += ` (退回: ${targetAccount})`;
            }
            // If isRefundContext, we are in the refund account, so we know it came here. 
            // Maybe show source? "From: Alipay"? 
            if (isRefundContext) {
                accText = `来自: ${txn.from}`;
            }

            this.renderHighlighted(row.createEl("td"), accText);

            // Payee
            this.renderHighlighted(row.createEl("td"), txn.payee || "");

            // Note
            const noteCell = row.createEl("td", { cls: "cost-table-note" });
            this.renderHighlighted(noteCell, txn.note || "");

            // Row Click
            row.onclick = (e) => {
                // Prevent trigging if clicked on checkbox 
                if (e.target !== cb) {
                    this.options.onTransactionClick?.(txn);
                }
            };
        });
    }

    private toggleSelectAll(checked: boolean) {
        this.selectAllState = checked;
        if (checked) {
            this.transactions.forEach(t => this.selectedPaths.add(t.path));
        } else {
            this.selectedPaths.clear();
        }
        this.updateSelection();
    }

    private toggleSelection(path: string, checked: boolean) {
        if (checked) this.selectedPaths.add(path);
        else this.selectedPaths.delete(path);

        // Update Master Checkbox state logic if needed (optional)
        this.updateSelection();
    }

    private updateSelection() {
        this.options.onSelectionChange?.(this.selectedPaths);
        // Re-render isn't strictly necessary if we just rely on the inputs, 
        // but if we want to update the master checkbox state visually based on partial selection:
        // this.render(); // Avoid full re-render for performance
        // Just keeping internal state consistent for external usage.
    }

    public getSelectedPaths(): Set<string> {
        return this.selectedPaths;
    }
}
