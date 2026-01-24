import { App, TFile, TFolder, CachedMetadata } from "obsidian";
import { TransactionFrontmatter } from "../types";

/**
 * 交易信息
 */
export interface TransactionInfo {
    /** 文件路径 */
    path: string;
    /** 文件名 */
    fileName: string;
    /** 唯一ID */
    uid: string;
    /** 日期 */
    date: string;
    /** 时间 (HH:MM:SS) */
    time: string;
    /** 交易类型 */
    txnType: "收入" | "支出" | "还款" | "转账";
    /** 分类 */
    category: string;
    /** 金额 */
    amount: number;
    /** 优惠金额 */
    discount?: number;
    /** 退款金额 */
    refund: number;
    /** 退款账户 */
    refundTo?: string;
    /** 货币 */
    currency: string;
    /** 来源账户 */
    from: string;
    /** 目标账户 */
    to: string;
    /** 收款方/商家 */
    payee: string;
    /** 地址 */
    address: string;
    /** 摘要 */
    memo: string;
    /** 备注 */
    note: string;
    /** 参与人 */
    persons: string[];
}

/**
 * 交易服务 - 负责扫描和管理所有交易文件
 */
export class TransactionService {
    private app: App;
    private transactionCache: TransactionInfo[] = [];
    private transactionsPath: string;

    constructor(app: App, transactionsPath: string) {
        this.app = app;
        this.transactionsPath = transactionsPath;
    }

    /**
     * 更新交易目录路径
     */
    setTransactionsPath(path: string): void {
        this.transactionsPath = path;
    }

    /**
     * 扫描交易目录下的所有交易文件并更新缓存
     */
    async scanTransactions(): Promise<TransactionInfo[]> {
        const transactions: TransactionInfo[] = [];
        const files = this.getFilesInFolder(this.transactionsPath);

        for (const file of files) {
            const txn = this.parseTransactionFile(file);
            if (txn) {
                transactions.push(txn);
            }
        }

        // 按日期和时间降序排序
        transactions.sort((a, b) => {
            const dateCompare = b.date.localeCompare(a.date);
            if (dateCompare !== 0) return dateCompare;
            return (b.time || "").localeCompare(a.time || "");
        });

        this.transactionCache = transactions;
        return transactions;
    }

    /**
     * 获取指定文件夹下的所有 Markdown 文件（递归）
     */
    private getFilesInFolder(folderPath: string): TFile[] {
        const folder = this.app.vault.getAbstractFileByPath(folderPath);
        if (!folder || !(folder instanceof TFolder)) {
            return [];
        }

        const files: TFile[] = [];
        this.collectMarkdownFiles(folder, files);
        return files;
    }

    /**
     * 递归收集 Markdown 文件
     */
    private collectMarkdownFiles(folder: TFolder, files: TFile[]): void {
        for (const child of folder.children) {
            if (child instanceof TFile && child.extension === "md") {
                files.push(child);
            } else if (child instanceof TFolder) {
                this.collectMarkdownFiles(child, files);
            }
        }
    }

    /**
     * 解析单个文件，判断是否为交易文件
     */
    private parseTransactionFile(file: TFile): TransactionInfo | null {
        const cache: CachedMetadata | null = this.app.metadataCache.getFileCache(file);
        if (!cache?.frontmatter) {
            return null;
        }

        const fm = cache.frontmatter as Partial<TransactionFrontmatter>;

        // 检查是否为交易类型
        if (fm.type !== "txn") {
            return null;
        }

        return {
            path: file.path,
            fileName: file.basename,
            uid: fm.uid || "",
            date: fm.date || "",
            time: fm.time || "",
            txnType: fm.txn_type || "支出",
            category: fm.category || "",
            amount: fm.amount || 0,
            discount: fm.discount || 0,
            refund: fm.refund || 0,
            refundTo: fm.refund_to || "",
            currency: fm.currency || "CNY",
            from: fm.from || "",
            to: fm.to || "",
            payee: fm.payee || "",
            address: (fm as any).address || "",
            memo: fm.memo || "",
            note: (fm as any).note || "",
            persons: fm.persons || [],
        };
    }

    /**
     * 获取所有交易（使用缓存）
     */
    getTransactions(): TransactionInfo[] {
        return this.transactionCache;
    }

    /**
     * 刷新单个交易文件的缓存
     */
    async refreshTransaction(file: TFile): Promise<void> {
        const txn = this.parseTransactionFile(file);
        if (txn) {
            // Remove existing if any
            this.transactionCache = this.transactionCache.filter(t => t.path !== file.path);
            this.transactionCache.push(txn);

            // Re-sort
            this.transactionCache.sort((a, b) => {
                const dateCompare = b.date.localeCompare(a.date);
                if (dateCompare !== 0) return dateCompare;
                return (b.time || "").localeCompare(a.time || "");
            });
        }
    }

    /**
     * 移除单个交易文件的缓存
     */
    removeTransaction(path: string): void {
        this.transactionCache = this.transactionCache.filter(t => t.path !== path);
    }

    /**
     * 获取指定账户的所有交易
     */
    getTransactionsByAccount(accountFileName: string): TransactionInfo[] {
        return this.transactionCache.filter(txn =>
            txn.from.includes(accountFileName) ||
            txn.to.includes(accountFileName) ||
            (txn.refundTo && txn.refundTo.includes(accountFileName))
        );
    }

    /**
     * 计算账户余额变动
     * 余额变动 = 收入 + 还款 - (支出 - 退款) + 转入 - 转出
     */
    calculateBalanceChange(accountFileName: string): number {
        let change = 0;

        for (const txn of this.transactionCache) {
            const isFrom = txn.from.includes(accountFileName);
            const isTo = txn.to.includes(accountFileName);
            const isRefundTo = txn.refundTo ? txn.refundTo.includes(accountFileName) : isFrom;

            if (txn.txnType === "收入" && isTo) {
                // 收入到此账户
                change += txn.amount;
            } else if (txn.txnType === "支出") {
                // 支出: from 减去全额
                if (isFrom) change -= txn.amount;
                // 退款: refundTo 增加退款 (默认 refundTo == from)
                if (isRefundTo) change += (txn.refund || 0);
            } else if (txn.txnType === "还款") {
                // 还款：from 账户减少 (amount - discount)，to 账户增加 amount
                if (isFrom) {
                    change -= (txn.amount - (txn.discount || 0));
                }
                if (isTo) {
                    change += txn.amount;
                }
            } else if (txn.txnType === "转账") {
                if (isFrom) {
                    // 从此账户转出
                    change -= txn.amount;
                }
                if (isTo) {
                    // 转入此账户
                    change += txn.amount;
                }
            }
        }

        return change;
    }

    /**
     * 按日期分组交易
     */
    getTransactionsGroupedByDate(): Map<string, TransactionInfo[]> {
        const grouped = new Map<string, TransactionInfo[]>();

        for (const txn of this.transactionCache) {
            const date = txn.date || "未知日期";
            if (!grouped.has(date)) {
                grouped.set(date, []);
            }
            grouped.get(date)!.push(txn);
        }

        return grouped;
    }

    /**
     * 计算账户的运行余额（每笔交易前后的余额）
     * @param accountFileName 账户文件名
     * @param openingBalance 账户期初余额
     * @returns 按日期升序排列的交易及其前后余额
     */
    calculateRunningBalances(accountFileName: string, openingBalance: number): Map<string, { before: number; after: number }> {
        // 获取该账户的所有交易，按日期升序排列
        const transactions = this.getTransactionsByAccount(accountFileName)
            .slice()
            .sort((a, b) => a.date.localeCompare(b.date));

        const balanceMap = new Map<string, { before: number; after: number }>();
        let currentBalance = openingBalance;

        for (const txn of transactions) {
            const change = this.getBalanceChangeForTransaction(txn, accountFileName);
            const before = currentBalance;
            const after = currentBalance + change;

            // 使用交易的唯一标识（路径）作为 key
            balanceMap.set(txn.path, { before, after });

            currentBalance = after;
        }

        return balanceMap;
    }

    /**
     * 计算单笔交易对指定账户的余额影响
     */
    getBalanceChangeForTransaction(txn: TransactionInfo, accountFileName: string): number {
        const isFrom = txn.from.includes(accountFileName);
        const isTo = txn.to.includes(accountFileName);
        const isRefundTo = txn.refundTo ? txn.refundTo.includes(accountFileName) : isFrom;

        if (txn.txnType === "收入") {
            if (isTo || isFrom) return txn.amount;
        } else if (txn.txnType === "支出") {
            let change = 0;
            if (isFrom) change -= txn.amount;
            if (isRefundTo) change += (txn.refund || 0);
            return change;
        } else if (txn.txnType === "还款") {
            // 还款：from 账户减少 (amount - discount)，to 账户增加 amount
            if (isFrom && isTo) {
                // 自己还自己，理论上 from 减少 (amt - disc), to 增加 amt => 净增 discount
                return (txn.discount || 0);
            }
            if (isFrom) {
                return -(txn.amount - (txn.discount || 0));
            }
            if (isTo) {
                return txn.amount;
            }
        } else if (txn.txnType === "转账") {
            if (isFrom && isTo) {
                // 自己转自己，没变化
                return 0;
            }
            if (isFrom) {
                return -txn.amount;
            }
            if (isTo) {
                return txn.amount;
            }
        }

        return 0;
    }

    /**
     * 计算所有账户的运行余额（用于交易列表显示）
     * @param accountOpeningBalances 账户名 -> 期初余额 的映射
     * @returns 交易路径 -> { accountName: { before, after } } 的映射
     */
    calculateAllAccountsRunningBalances(
        accountOpeningBalances: Map<string, number>
    ): Map<string, Map<string, { before: number; after: number }>> {
        // 按日期和时间升序排列所有交易
        const sortedTransactions = this.transactionCache
            .slice()
            .sort((a, b) => {
                const dateCompare = a.date.localeCompare(b.date);
                if (dateCompare !== 0) return dateCompare;
                return (a.time || "").localeCompare(b.time || "");
            });

        // 账户当前余额
        const currentBalances = new Map<string, number>();
        for (const [account, balance] of accountOpeningBalances) {
            currentBalances.set(account, balance);
        }

        // 结果：交易路径 -> 账户余额变化映射
        const result = new Map<string, Map<string, { before: number; after: number }>>();

        for (const txn of sortedTransactions) {
            const txnBalances = new Map<string, { before: number; after: number }>();

            // 获取涉及的账户
            const fromAccount = txn.from?.replace(/\[\[|\]\]/g, "") || "";
            const toAccount = txn.to?.replace(/\[\[|\]\]/g, "") || "";

            // 计算 from 账户的变化
            if (fromAccount && accountOpeningBalances.has(fromAccount)) {
                const change = this.getBalanceChangeForTransaction(txn, fromAccount);
                const before = currentBalances.get(fromAccount) || 0;
                const after = before + change;
                txnBalances.set(fromAccount, { before, after });
                currentBalances.set(fromAccount, after);
            }

            // 计算 to 账户的变化（如果与 from 不同）
            if (toAccount && toAccount !== fromAccount && accountOpeningBalances.has(toAccount)) {
                const change = this.getBalanceChangeForTransaction(txn, toAccount);
                const before = currentBalances.get(toAccount) || 0;
                const after = before + change;
                txnBalances.set(toAccount, { before, after });
                currentBalances.set(toAccount, after);
            }

            result.set(txn.path, txnBalances);
        }

        return result;
    }
    async updateTransaction(file: TFile, data: Partial<TransactionFrontmatter>): Promise<void> {
        await this.app.fileManager.processFrontMatter(file, (fm) => {
            // Update fields
            if (data.date !== undefined) fm.date = data.date;
            if (data.time !== undefined) fm.time = data.time;
            if (data.refund !== undefined) fm.refund = data.refund;
            if (data.refund_to !== undefined) fm.refund_to = data.refund_to;
            if (data.currency !== undefined) fm.currency = data.currency;
            if (data.amount !== undefined) fm.amount = data.amount;
            if (data.discount !== undefined) fm.discount = data.discount;
            if (data.txn_type !== undefined) fm.txn_type = data.txn_type;
            if (data.category !== undefined) fm.category = data.category;
            if (data.from !== undefined) fm.from = data.from;
            if (data.to !== undefined) fm.to = data.to;
            if (data.payee !== undefined) fm.payee = data.payee;
            if (data.memo !== undefined) fm.memo = data.memo;
            if (data.address !== undefined) (fm as any).address = data.address;
            if (data.persons !== undefined) fm.persons = data.persons;
            // Handle complex fields if necessary
        });
    }

    async createTransaction(): Promise<TFile> {
        // 1. Prepare Date Info
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, "0");
        const day = String(now.getDate()).padStart(2, "0");
        const dateStr = `${year}-${month}-${day}`;
        const timeStr = (now.toTimeString().split(" ")[0] || "00:00:00").substring(0, 5);

        // 2. Build Folder Path: root/YYYY/YYYY-MM/YYYY-MM-DD
        const yearly = `${this.transactionsPath}/${year}`;
        const monthly = `${yearly}/${year}-${month}`;
        const daily = `${monthly}/${year}-${month}-${day}`;

        // 3. Ensure Folders Exist
        await this.ensureFolder(this.transactionsPath);
        await this.ensureFolder(yearly);
        await this.ensureFolder(monthly);
        await this.ensureFolder(daily);

        const uid = Date.now().toString();
        const fileName = `txn-${uid}.md`;

        const content = `---
uid: ${uid}
date: ${dateStr}
time: ${timeStr}
txn_type: 支出
amount: 0
category: 
from: 
to: 
payee: 
address: 
persons: []
memo: 
type: txn
---`;

        return await this.app.vault.create(`${daily}/${fileName}`, content);
    }

    private async ensureFolder(path: string): Promise<void> {
        const folder = this.app.vault.getAbstractFileByPath(path);
        if (!folder) {
            await this.app.vault.createFolder(path);
        }
    }
}
