import { AccountService } from "../services/accountService";
import { TransactionService } from "../services/transactionService";
import skillTemplate from "./skill-template.md";

/**
 * 生成 Claude Skill Prompt，读取 MD 模板并注入动态数据
 */
export function generateSkillPrompt(
    accountService: AccountService,
    transactionService: TransactionService,
    transactionsPath: string,
    vaultPath: string
): string {
    // 1. 收集账户信息（不包含余额）
    const accounts = accountService.getAccounts();
    const accountLines = accounts.map(acc => {
        const parts = [`- **${acc.displayName}**`];
        if (acc.fileName !== acc.displayName) parts.push(`（文件名: ${acc.fileName}）`);
        if (acc.accountKind) parts.push(`| 类型: ${acc.accountKind}`);
        if (acc.institution) parts.push(`| 机构: ${acc.institution}`);
        if (acc.currency && acc.currency !== "CNY") parts.push(`| 币种: ${acc.currency}`);
        return parts.join(" ");
    });
    const accountsText = accountLines.length > 0
        ? accountLines.join("\n")
        : "- 暂无账户数据";

    // 2. 收集分类信息，按交易类型分组
    const transactions = transactionService.getTransactions();
    const categoryMap: Record<string, Set<string>> = {
        "支出": new Set(),
        "收入": new Set(),
        "转账": new Set(),
        "还款": new Set(),
    };

    for (const txn of transactions) {
        if (txn.category && txn.txnType && categoryMap[txn.txnType]) {
            categoryMap[txn.txnType]!.add(String(txn.category));
        }
    }

    const categorySection = Object.entries(categoryMap)
        .filter(([_, cats]) => cats.size > 0)
        .map(([type, cats]) => {
            const sorted = Array.from(cats).sort((a, b) => a.localeCompare(b, "zh-Hans-CN"));
            return `### ${type}\n${sorted.map(c => `- ${c}`).join("\n")}`;
        })
        .join("\n\n");
    const categoriesText = categorySection || "暂无分类数据";

    // 3. 收集常用商家
    const payeeSet = new Set<string>();
    for (const txn of transactions) {
        if (txn.payee && String(txn.payee).trim()) {
            payeeSet.add(String(txn.payee).trim());
        }
    }
    const payeeList = Array.from(payeeSet).sort((a, b) => String(a).localeCompare(String(b), "zh-Hans-CN"));
    const payeesSection = payeeList.length > 0
        ? `## 常用商家\n\n${payeeList.map(p => `- ${p}`).join("\n")}`
        : "";

    // 4. 收集常用标签
    const personSet = new Set<string>();
    for (const txn of transactions) {
        if (txn.persons) {
            txn.persons.forEach(p => {
                if (p && String(p).trim()) personSet.add(String(p).trim());
            });
        }
    }
    const personList = Array.from(personSet).sort((a, b) => String(a).localeCompare(String(b), "zh-Hans-CN"));
    const personsSection = personList.length > 0
        ? `## 常用标签\n\n${personList.map(p => `- ${p}`).join("\n")}`
        : "";

    // 5. 替换模板中的占位符
    return skillTemplate
        .replace(/\{\{ACCOUNTS\}\}/g, accountsText)
        .replace(/\{\{CATEGORIES\}\}/g, categoriesText)
        .replace(/\{\{PAYEES_SECTION\}\}/g, payeesSection)
        .replace(/\{\{PERSONS_SECTION\}\}/g, personsSection)
        .replace(/\{\{TRANSACTIONS_PATH\}\}/g, transactionsPath)
        .replace(/\{\{VAULT_PATH\}\}/g, vaultPath);
}
