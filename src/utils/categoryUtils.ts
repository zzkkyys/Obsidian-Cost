/**
 * 分类相关工具函数
 * 包含分类分组逻辑、图标映射、颜色生成
 */
import { TransactionInfo } from "../services/transactionService";

export type TxnType = "支出" | "收入" | "转账" | "还款" | "借款";

export interface TypeOption {
    value: TxnType;
    label: string;
}

export interface CategoryGroup {
    primary: string;
    selectableSelf: boolean;
    children: string[];
}

export const TYPE_OPTIONS: TypeOption[] = [
    { value: "支出", label: "支出" },
    { value: "收入", label: "收入" },
    { value: "转账", label: "转账" },
    { value: "还款", label: "还款" },
    { value: "借款", label: "借款" },
];

/**
 * 从交易记录中收集分类分组
 */
export function collectCategoryGroups(transactions: TransactionInfo[], type: TxnType): CategoryGroup[] {
    const txCategories = transactions
        .filter(t => t.txnType === type)
        .map((t) => t.category)
        .filter((c): c is string => typeof c === "string" && Boolean(c.trim() !== ""))
        .map((c) => c.trim());

    if (txCategories.length === 0) {
        return getDefaultCategories(type);
    }

    const groupMap = new Map<string, { selectableSelf: boolean; children: Set<string> }>();

    txCategories.forEach((cat) => {
        const parts = cat.split("/").map((p) => p.trim()).filter(Boolean);
        const primary = parts[0];
        if (!primary) return;
        if (!groupMap.has(primary)) {
            groupMap.set(primary, { selectableSelf: false, children: new Set<string>() });
        }
        const group = groupMap.get(primary);
        if (!group) return;

        if (parts.length === 1) {
            group.selectableSelf = true;
        } else {
            group.children.add(parts.slice(1).join("/"));
        }
    });

    return Array.from(groupMap.entries())
        .map(([primary, value]) => ({
            primary,
            selectableSelf: value.selectableSelf,
            children: Array.from(value.children).sort((a, b) => a.localeCompare(b, "zh-Hans-CN"))
        }))
        .sort((a, b) => a.primary.localeCompare(b.primary, "zh-Hans-CN"));
}

function getDefaultCategories(type: TxnType): CategoryGroup[] {
    if (type === "收入") {
        return [
            { primary: "工资", selectableSelf: true, children: [] },
            { primary: "奖金", selectableSelf: true, children: [] },
            { primary: "理财", selectableSelf: true, children: [] },
            { primary: "收回", selectableSelf: true, children: [] },
            { primary: "其他", selectableSelf: true, children: [] }
        ];
    } else if (type === "转账") {
        return [
            { primary: "转账", selectableSelf: true, children: [] },
            { primary: "充值", selectableSelf: true, children: [] },
            { primary: "提现", selectableSelf: true, children: [] },
            { primary: "其他", selectableSelf: true, children: [] }
        ];
    } else if (type === "还款") {
        return [
            { primary: "信用卡", selectableSelf: true, children: [] },
            { primary: "房贷", selectableSelf: true, children: [] },
            { primary: "车贷", selectableSelf: true, children: [] },
            { primary: "还人情", selectableSelf: true, children: [] },
            { primary: "其他", selectableSelf: true, children: [] }
        ];
    } else if (type === "借款") {
        return [
            { primary: "个人借款", selectableSelf: true, children: [] },
            { primary: "银行贷款", selectableSelf: true, children: [] },
            { primary: "信用借款", selectableSelf: true, children: [] },
            { primary: "其他", selectableSelf: true, children: [] }
        ];
    }
    // Default: Expenses
    return [
        { primary: "餐饮", selectableSelf: true, children: [] },
        { primary: "交通", selectableSelf: true, children: [] },
        { primary: "购物", selectableSelf: true, children: [] },
        { primary: "居家", selectableSelf: true, children: [] },
        { primary: "娱乐", selectableSelf: true, children: [] },
        { primary: "医疗", selectableSelf: true, children: [] },
        { primary: "学习", selectableSelf: true, children: [] },
        { primary: "其他", selectableSelf: true, children: [] }
    ];
}

/**
 * 根据分类名推断 Lucide 图标名
 */
export function getCategoryIcon(category: string): string {
    const key = category.toLowerCase();

    if (key.includes("餐") || key.includes("food") || key.includes("饭") || key.includes("吃") || key.includes("喝")) return "utensils-crossed";
    if (key.includes("交") || key.includes("车") || key.includes("travel") || key.includes("路") || key.includes("油")) return "bus";
    if (key.includes("购") || key.includes("shop") || key.includes("买") || key.includes("物")) return "shopping-bag";
    if (key.includes("娱") || key.includes("play") || key.includes("游") || key.includes("玩")) return "gamepad-2";
    if (key.includes("医") || key.includes("health") || key.includes("药")) return "heart-pulse";
    if (key.includes("学") || key.includes("book") || key.includes("研") || key.includes("教") || key.includes("课")) return "book-open";
    if (key.includes("房") || key.includes("居") || key.includes("home") || key.includes("住")) return "house";
    if (key.includes("收") || key.includes("income") || key.includes("薪") || key.includes("资") || key.includes("奖")) return "badge-dollar-sign";
    if (key.includes("红包") || key.includes("礼")) return "gift";
    if (key.includes("办") || key.includes("公") || key.includes("work")) return "briefcase";
    if (key.includes("服") || key.includes("衣") || key.includes("饰") || key.includes("cloth")) return "shirt";
    if (key.includes("快") || key.includes("递") || key.includes("邮")) return "truck";
    if (key.includes("通") || key.includes("话") || key.includes("phone")) return "phone";
    if (key.includes("网") || key.includes("net") || key.includes("server") || key.includes("软") || key.includes("app") || key.includes("应用")) return "app-window";
    if (key.includes("日") || key.includes("用") || key.includes("杂") || key.includes("daily") || key.includes("生") || key.includes("人") || key.includes("life")) return "sun";
    if (key.includes("度") || key.includes("假") || key.includes("holiday")) return "palmtree";
    if (key.includes("订") || key.includes("阅") || key.includes("sub")) return "calendar-clock";
    if (key.includes("转") || key.includes("transfer")) return "arrow-right-left";
    if (key.includes("还") || key.includes("贷") || key.includes("credit") || key.includes("分期")) return "credit-card";
    if (key.includes("售") || key.includes("卖") || key.includes("sale") || key.includes("闲") || key.includes("tag")) return "tag";
    if (key.includes("对") || key.includes("齐") || key.includes("align")) return "git-merge";
    if (key.includes("他") || key.includes("other")) return "box-select";

    return "circle";
}

/**
 * 根据分类名生成柔和的背景色
 */
export function getCategoryColor(category: string): string {
    const palette = [
        "#ffe6e6", "#ffefe0", "#fff6d8", "#e7f7e7",
        "#e4f4ff", "#efe9ff", "#f6e9ff", "#eaf3f3"
    ];

    let hash = 0;
    for (let i = 0; i < category.length; i += 1) {
        hash = (hash * 31 + category.charCodeAt(i)) >>> 0;
    }
    return palette[hash % palette.length] ?? "#eaf3f3";
}
