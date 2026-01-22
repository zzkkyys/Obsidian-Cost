/**
 * 账户文件的 frontmatter 类型
 */
export interface AccountFrontmatter {
    type: "account";
    name: string;
    account_kind: string;
    institution: string;
    currency: string;
    opening_date: string;
    opening_balance: number;
    card_last4?: string;
    credit_limit?: number;
    billing_day?: string;
    due_day?: string;
    note?: string;
    tags?: string[];
}

/**
 * 交易文件的 frontmatter 类型
 */
export interface TransactionFrontmatter {
    type: "txn";
    uid: string;
    date: string;
    /** 时间 (HH:MM:SS) */
    time?: string;
    txn_type: "收入" | "支出" | "还款" | "转账";
    category: string;
    amount: number;
    /** 优惠金额 (仅还款有效) */
    discount?: number;
    /** 退款金额 */
    refund?: number;
    currency: string;
    from: string;
    to: string;
    payee: string;
    /** 地址 */
    address?: string;
    memo: string;
    /** 备注 */
    note?: string;
    tags?: string[];
    /** 参与人 */
    persons?: string[];
}

/**
 * 账户信息（用于建议列表）
 */
export interface AccountInfo {
    /** 文件路径 */
    path: string;
    /** 文件名（不含扩展名） */
    fileName: string;
    /** 账户显示名称 */
    displayName: string;
    /** 账户类型 */
    accountKind: string;
    /** 机构名称 */
    institution: string;
    /** 开户余额 */
    openingBalance: number;
    /** 货币 */
    currency: string;
    /** 自定义图标（如 "[[平安银行.png]]" */
    icon?: string;
}
