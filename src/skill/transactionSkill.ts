import skillTemplate from "./skill-template.md";

/**
 * 生成 Claude Skill Prompt，读取 MD 模板并注入路径信息
 * 账户/分类/商家信息已保存在 data.json 中，由 agent 动态读取
 */
export function generateSkillPrompt(
    transactionsPath: string,
    vaultPath: string
): string {
    return skillTemplate
        .replace(/\{\{TRANSACTIONS_PATH\}\}/g, transactionsPath)
        .replace(/\{\{VAULT_PATH\}\}/g, vaultPath);
}
