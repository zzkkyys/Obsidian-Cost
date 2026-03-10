import { App, setIcon, TFile } from "obsidian";
import { IconResolver } from '../../services/iconResolver';
import { BaseComponent } from '../BaseComponent';
import { TransactionInfo } from '../../services/transactionService';
import { AccountInfo } from '../../types';
import { netAmount, formatThousands } from '../../utils/format';

export interface TransactionListOptions {
    onTransactionClick?: (txn: TransactionInfo) => void;
    onAccountClick?: (accountName: string, field: 'from' | 'to', txn: TransactionInfo) => void;
    onDateClick?: (txn: TransactionInfo) => void;
    onTimeClick?: (txn: TransactionInfo) => void;
    customIconPath?: string;
    iconResolver?: IconResolver;
    activeAccount?: string | null;
    highlightPath?: string | null;
    enableHighlightAfterSave?: boolean;
    highlightDurationSeconds?: number;
    highlightColor?: string;
}

/**
 * 虚拟滚动交易列表
 *
 * 采用 IntersectionObserver 驱动的渐进渲染策略：
 * - 初始渲染第一批日期分组（BATCH_SIZE 条交易）
 * - 在列表尾部放置哨兵元素
 * - 哨兵进入视口时自动加载下一批
 * - 无需固定行高，天然支持可变高度的日期分组
 */
export class TransactionList extends BaseComponent {
    private app: App;
    private transactions: TransactionInfo[];
    private accounts: AccountInfo[];
    private options: TransactionListOptions;
    private runningBalances: Map<string, Map<string, { before: number, after: number }>> | null = null;

    private accountMap: Map<string, AccountInfo> = new Map();

    /** 每批渲染的交易条数 */
    private static readonly BATCH_SIZE = 40;

    /** 已渲染的交易数量 */
    private renderedCount = 0;

    /** 按日期分组后的有序数据 */
    private dateGroups: Array<{ date: string; transactions: TransactionInfo[] }> = [];

    /** 已渲染的日期分组索引 */
    private renderedGroupIndex = 0;

    /** IntersectionObserver 实例 */
    private observer: IntersectionObserver | null = null;

    /** 列表容器（用于追加内容） */
    private listContainer: HTMLElement | null = null;

    /** 哨兵元素 */
    private sentinel: HTMLElement | null = null;

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

    // ───────── 分组逻辑 ─────────

    private buildDateGroups(): void {
        const grouped = new Map<string, TransactionInfo[]>();
        for (const txn of this.transactions) {
            const date = txn.date || "未知日期";
            if (!grouped.has(date)) {
                grouped.set(date, []);
            }
            grouped.get(date)!.push(txn);
        }
        this.dateGroups = Array.from(grouped.entries()).map(([date, transactions]) => ({ date, transactions }));
    }

    // ───────── 渲染入口 ─────────

    protected render(): void {
        // 重置状态
        this.renderedCount = 0;
        this.renderedGroupIndex = 0;
        this.destroyObserver();

        this.listContainer = this.containerEl.createDiv({ cls: "cost-transactions-list-container" });

        if (this.transactions.length === 0) {
            this.listContainer.createDiv({ cls: "cost-empty-message", text: "暂无交易记录" });
            return;
        }

        // 构建日期分组
        this.buildDateGroups();

        // 渲染所需批次
        let targetIndex = -1;
        if (this.options.highlightPath) {
            targetIndex = this.transactions.findIndex(t => t.path === this.options.highlightPath);
        }

        // 渲染第一批 (或直到包含高亮项目)
        this.renderNextBatch();
        if (targetIndex >= 0) {
            while (this.renderedCount <= targetIndex && this.renderedGroupIndex < this.dateGroups.length) {
                this.renderNextBatch();
            }
        }

        // 如果还有更多数据，设置 IntersectionObserver
        if (this.renderedCount < this.transactions.length) {
            this.setupObserver();
        }

        // 自动滚动到高亮项
        if (this.options.highlightPath && targetIndex >= 0) {
            setTimeout(() => {
                if (this.listContainer) {
                    try {
                        // 使用 CSS escape 避免路径中的特殊字符导致 querySelector 报错
                        const escapedPath = CSS.escape(this.options.highlightPath!);
                        const el = this.listContainer.querySelector(`[data-path="${escapedPath}"]`);
                        if (el) {
                            el.scrollIntoView({ behavior: "smooth", block: "center" });
                        }
                    } catch (e) {
                        console.error("[Cost] Failed to scroll to highlight path", e);
                    }
                }
            }, 50);
        }
    }

    // ───────── 批次渲染 ─────────

    private renderNextBatch(): void {
        if (!this.listContainer) return;
        if (this.renderedGroupIndex >= this.dateGroups.length) return;

        const batchLimit = this.renderedCount + TransactionList.BATCH_SIZE;

        try {
            while (this.renderedGroupIndex < this.dateGroups.length && this.renderedCount < batchLimit) {
                const group = this.dateGroups[this.renderedGroupIndex]!;
                this.renderDateGroup(this.listContainer, group.date, group.transactions);
                this.renderedCount += group.transactions.length;
                this.renderedGroupIndex++;
            }
        } catch (e) {
            console.error("[Cost] Render error:", e);
            this.listContainer.createDiv({ cls: "cost-error-message", text: `渲染错误: ${String(e)}` });
        }

        // 更新哨兵
        this.updateSentinel();
    }

    // ───────── IntersectionObserver ─────────

    private setupObserver(): void {
        // 找到最近的可滚动祖先作为 root
        const scrollRoot = this.findScrollParent(this.containerEl);

        this.observer = new IntersectionObserver(
            (entries) => {
                for (const entry of entries) {
                    if (entry.isIntersecting && this.renderedCount < this.transactions.length) {
                        this.renderNextBatch();
                    }
                }
            },
            {
                root: scrollRoot,
                rootMargin: "0px 0px 300px 0px" // 提前 300px 触发加载
            }
        );

        this.createSentinel();
    }

    private findScrollParent(el: HTMLElement): HTMLElement | null {
        let parent = el.parentElement;
        while (parent) {
            const overflow = getComputedStyle(parent).overflowY;
            if (overflow === "auto" || overflow === "scroll") {
                return parent;
            }
            parent = parent.parentElement;
        }
        return null;
    }

    private createSentinel(): void {
        if (!this.listContainer) return;

        this.sentinel = this.listContainer.createDiv({ cls: "cost-virtual-sentinel" });
        this.sentinel.style.height = "1px";
        this.sentinel.style.width = "100%";

        if (this.observer) {
            this.observer.observe(this.sentinel);
        }
    }

    private updateSentinel(): void {
        // 如果所有数据都已渲染，移除哨兵并显示底部提示
        if (this.renderedCount >= this.transactions.length) {
            this.destroyObserver();
            if (this.sentinel) {
                this.sentinel.remove();
                this.sentinel = null;
            }
            // 底部提示
            if (this.listContainer && this.transactions.length > TransactionList.BATCH_SIZE) {
                this.listContainer.createDiv({
                    cls: "cost-list-end-hint",
                    text: `共 ${this.transactions.length} 条交易`
                });
            }
        } else {
            // 确保哨兵在最后
            if (this.sentinel && this.listContainer) {
                this.listContainer.appendChild(this.sentinel);
            }

            // 显示加载进度
            if (this.sentinel) {
                const remaining = this.transactions.length - this.renderedCount;
                this.sentinel.setAttribute("aria-label", `还有 ${remaining} 条`);
            }
        }
    }

    private destroyObserver(): void {
        if (this.observer) {
            this.observer.disconnect();
            this.observer = null;
        }
    }

    // ───────── 生命周期 ─────────

    protected onUnmount(): void {
        this.destroyObserver();
    }

    // ───────── 日期分组渲染 ─────────

    private renderDateGroup(container: HTMLElement, date: string, transactions: TransactionInfo[]): void {
        const group = container.createDiv({ cls: "cost-date-group" });

        // Header
        const header = group.createDiv({ cls: "cost-date-header" });
        header.createSpan({ cls: "cost-date-text", text: date });

        // Daily Summary (Income/Expense)
        let dailyIncome = 0;
        let dailyExpense = 0;
        for (const txn of transactions) {
            const isRefundContext = this.options.activeAccount && txn.refundTo === this.options.activeAccount && txn.refund > 0;
            if (isRefundContext) {
                dailyIncome += txn.refund || 0;
            } else {
                if (txn.txnType === '收入') dailyIncome += txn.amount;
                else if (txn.txnType === '支出') dailyExpense += netAmount(txn.amount, txn.refund || 0);
            }
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

    // ───────── 单条交易渲染 ─────────

    private renderTransactionItem(container: HTMLElement, txn: TransactionInfo): void {
        const isRefundContext = this.options.activeAccount && txn.refundTo === this.options.activeAccount && txn.refund > 0;

        const item = container.createDiv({ cls: `cost-transaction-item cost-txn-${isRefundContext ? "收入" : txn.txnType}` });
        item.setAttribute("data-path", txn.path);

        if (this.options.highlightPath === txn.path && this.options.enableHighlightAfterSave !== false) {
            item.addClass("cost-txn-highlight");
            const duration = this.options.highlightDurationSeconds || 10;
            const color = this.options.highlightColor || "var(--background-modifier-success)";
            item.style.setProperty("--highlight-duration", `${duration}s`);
            item.style.setProperty("--highlight-color", color);
            setTimeout(() => {
                if (item.isConnected) item.removeClass("cost-txn-highlight");
            }, duration * 1000); // 指定时间后移除高亮
        }

        // Category Icon
        const iconEl = item.createDiv({ cls: "cost-txn-icon" });
        const iconName = this.getCategoryIcon(txn.category, txn.txnType);

        let hasCustomImage = false;
        if (txn.category) {
            const resolver = this.options.iconResolver;
            if (resolver) {
                const iconSrc = resolver.resolveCategoryIcon(txn.category);
                if (iconSrc) {
                    const img = iconEl.createEl("img");
                    img.src = iconSrc;
                    img.addClass("cost-txn-icon-img");
                    hasCustomImage = true;
                }
            }
        }

        if (!hasCustomImage) {
            try {
                setIcon(iconEl, iconName);
            } catch (_e) {
                iconEl.setText("💰");
            }
        }

        // Info Column
        const infoEl = item.createDiv({ cls: "cost-txn-info" });

        // Top Row: Category | Payee | Address
        const topRow = infoEl.createDiv({ cls: "cost-txn-top-row" });
        topRow.createSpan({ cls: "cost-txn-category", text: (txn.category || "未分类") + (isRefundContext ? " (退款)" : "") });
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

        if (txn.txnType === "还款" && txn.discount && txn.discount > 0) {
            bottomRow.createSpan({ cls: "cost-txn-discount", text: `优惠 ${txn.discount.toFixed(2)}` });
        }

        if (!isRefundContext && txn.refund > 0) {
            const target = txn.refundTo || txn.from || "";
            bottomRow.createSpan({ cls: "cost-txn-refund", text: `退款 ${txn.refund.toFixed(2)} -> ${target}` });
        } else if (isRefundContext) {
            bottomRow.createSpan({ cls: "cost-txn-refund", text: `来自: ${txn.from}` });
        }

        // Amount Column
        const amountCol = item.createDiv({ cls: "cost-txn-amount-col" });
        const amountEl = amountCol.createDiv({ cls: "cost-txn-amount" });

        if (isRefundContext) {
            amountEl.setText(`+${txn.refund?.toFixed(2)}`);
            amountEl.addClass("cost-amount-收入");
        } else {
            const prefix = txn.txnType === "收入" ? "+" : (txn.txnType === "支出" ? "-" : "");
            if (txn.txnType === "支出" && txn.refund > 0) {
                const net = netAmount(txn.amount, txn.refund);
                amountEl.setText(`${prefix}${net.toFixed(2)}`);
                amountCol.createDiv({ cls: "cost-txn-original-amount", text: `原 ${txn.amount.toFixed(2)}` });
            } else {
                amountEl.setText(`${prefix}${txn.amount.toFixed(2)}`);
            }
            amountEl.addClass(`cost-amount-${txn.txnType}`);
        }

        // Balance Changes Rendering
        if (this.runningBalances) {
            const changes = this.runningBalances.get(txn.path);
            if (changes && changes.size > 0) {
                const balanceContainer = amountCol.createDiv({ cls: "cost-txn-balance-col-wrapper" });
                for (const [_accountName, bal] of changes) {
                    const span = balanceContainer.createDiv({ cls: "cost-txn-balance-change-right" });
                    const diff = bal.after - bal.before;
                    const diffStr = diff > 0 ? `+${formatThousands(diff, 2)}` : formatThousands(diff, 2);

                    span.setText(`${formatThousands(bal.before, 2)} → ${formatThousands(bal.after, 2)} (${diffStr})`);

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
                const file = this.app.vault.getAbstractFileByPath(txn.path);
                if (file instanceof TFile) {
                    void this.app.workspace.getLeaf().openFile(file);
                }
            }
        });
    }

    // ───────── 账户图标 & 气泡 ─────────

    private renderAccountIcon(container: HTMLElement, account: AccountInfo): void {
        const iconSpan = container.createSpan({ cls: "cost-txn-account-icon-small" });

        const resolver = this.options.iconResolver;
        if (resolver) {
            const iconSrc = resolver.resolveAccountIcon(account);
            if (iconSrc) {
                const img = iconSpan.createEl("img", { cls: "cost-account-custom-icon-img" });
                img.src = iconSrc;
                return;
            }
        } else if (account.icon) {
            const match = account.icon.match(/\[\[(.+?)\]\]/);
            if (match && match[1]) {
                const fileName = match[1];
                const imageFile = this.app.metadataCache.getFirstLinkpathDest(fileName, "");
                if (imageFile) {
                    const img = iconSpan.createEl("img", { cls: "cost-account-custom-icon-img" });
                    img.src = this.app.vault.getResourcePath(imageFile);
                    return;
                }
            } else if (!account.icon.includes("[[")) {
                iconSpan.setText(account.icon);
                return;
            }
        }

        const icons: Record<string, string> = {
            "bank": "🏦", "cash": "💵", "credit": "💳",
            "investment": "📈", "wallet": "👛", "prepaid": "🎫",
            "other": "💰", "alipay": "🔷", "wechat": "🟢"
        };
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

            let outAmt = txn.amount;
            let inAmt = txn.amount;

            if (txn.txnType === "还款" && txn.discount) {
                outAmt = netAmount(txn.amount, txn.discount);
            }

            bubble.createSpan({ text: ` (-${formatThousands(outAmt, 2)}) → ` });
            renderItem(txn.to, 'to');
            bubble.createSpan({ text: ` (+${formatThousands(inAmt, 2)})` });
        } else {
            const name = txn.from || txn.to;
            const field = txn.from ? 'from' : 'to';
            renderItem(name, field);
        }
    }

    // ───────── 分类图标映射 ─────────

    private getCategoryIcon(category: string, txnType: string): string {
        const cat = String(category || "").split("/")[0] || "";
        return TransactionList.CATEGORY_ICONS[cat] ||
            (txnType === "转账" ? "arrow-right-left" :
                (txnType === "还款" ? "credit-card" :
                    (txnType === "收入" ? "banknote" : "circle-dollar-sign")));
    }

    private static CATEGORY_ICONS: Record<string, string> = {
        "餐饮": "utensils",
        "美食": "utensils",
        "吃饭": "utensils",
        "交通": "bus",
        "出行": "bus",
        "打车": "car",
        "加油": "fuel",
        "购物": "shopping-bag",
        "日用": "shopping-cart",
        "娱乐": "gamepad-2",
        "游戏": "gamepad-2",
        "电影": "film",
        "居住": "home",
        "房租": "home",
        "物业": "building",
        "医疗": "stethoscope",
        "药品": "pill",
        "工资": "banknote",
        "奖金": "gift",
        "理财": "trending-up",
        "股票": "bar-chart-2",
        "学习": "book-open",
        "教育": "graduation-cap",
        "通讯": "smartphone",
        "网费": "wifi",
        "人情": "heart-handshake",
        "红包": "red-envelope",
        "礼物": "gift",
        "运动": "dumbbell",
        "健身": "dumbbell",
        "宠物": "cat",
        "旅行": "plane",
        "数码": "monitor",
        "服饰": "shirt",
        "美容": "scissors",
        "Food": "utensils",
        "Transport": "bus",
        "Shopping": "shopping-bag",
        "Entertainment": "gamepad-2",
        "Housing": "home",
        "Medical": "stethoscope",
        "Salary": "banknote",
        "Invest": "trending-up"
    };
}
