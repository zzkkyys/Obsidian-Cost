import { App, TFile, TFolder, CachedMetadata } from "obsidian";
import { AccountInfo, AccountFrontmatter } from "../types";

/**
 * 账户服务 - 负责扫描和管理所有账户文件
 */
export class AccountService {
    private app: App;
    private accountCache: AccountInfo[] = [];
    private accountsPath: string;

    constructor(app: App, accountsPath: string) {
        this.app = app;
        this.accountsPath = accountsPath;
    }

    /**
     * 更新账户目录路径
     */
    setAccountsPath(path: string): void {
        this.accountsPath = path;
    }

    /**
     * 扫描账户目录下的所有账户文件并更新缓存
     */
    async scanAccounts(): Promise<AccountInfo[]> {
        const accounts: AccountInfo[] = [];
        const files = this.getFilesInFolder(this.accountsPath);

        for (const file of files) {
            const account = await this.parseAccountFile(file);
            if (account) {
                accounts.push(account);
            }
        }

        this.accountCache = accounts;
        return accounts;
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
     * 解析单个文件，判断是否为账户文件
     */
    private async parseAccountFile(file: TFile): Promise<AccountInfo | null> {
        const cache: CachedMetadata | null = this.app.metadataCache.getFileCache(file);
        if (!cache?.frontmatter) {
            return null;
        }

        const frontmatter = cache.frontmatter as Partial<AccountFrontmatter>;

        // 检查是否为账户类型
        if (frontmatter.type !== "account") {
            return null;
        }

        // 构建显示名称
        const displayName = frontmatter.name && frontmatter.name !== "未命名"
            ? frontmatter.name
            : file.basename;

        return {
            path: file.path,
            fileName: file.basename,
            displayName: displayName,
            accountKind: frontmatter.account_kind || "",
            institution: frontmatter.institution || "",
            openingBalance: frontmatter.opening_balance || 0,
            currency: frontmatter.currency || "CNY",
            icon: (cache.frontmatter as any).icon || undefined,
        };
    }

    /**
     * 获取所有账户（使用缓存）
     */
    getAccounts(): AccountInfo[] {
        return this.accountCache;
    }

    /**
     * 刷新单个账户文件的缓存
     */
    async refreshAccount(file: TFile): Promise<void> {
        const account = await this.parseAccountFile(file);
        if (account) {
            // Remove existing if any
            this.accountCache = this.accountCache.filter(a => a.path !== file.path);
            this.accountCache.push(account);

            // Re-sort by name if needed, or leave arbitrary order?
            // Let's sort alphabetically by display name for consistency
            this.accountCache.sort((a, b) => a.displayName.localeCompare(b.displayName));
        }
    }

    /**
     * 移除单个账户文件的缓存
     */
    removeAccount(path: string): void {
        this.accountCache = this.accountCache.filter(a => a.path !== path);
    }

    /**
     * 根据查询字符串过滤账户
     */
    filterAccounts(query: string): AccountInfo[] {
        const lowerQuery = query.toLowerCase();
        return this.accountCache.filter(account =>
            account.displayName.toLowerCase().includes(lowerQuery) ||
            account.fileName.toLowerCase().includes(lowerQuery) ||
            account.accountKind.toLowerCase().includes(lowerQuery) ||
            account.institution.toLowerCase().includes(lowerQuery)
        );
    }

    /**
     * 生成账户文本格式（不使用双链）
     */
    formatAsLink(account: AccountInfo): string {
        return account.fileName;
    }
}
