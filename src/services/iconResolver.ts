import { App, TFile, normalizePath } from "obsidian";
import { AccountInfo } from "../types";

/**
 * 统一图标解析服务
 * 负责查找账户和分类的自定义图标，取代各组件中分散的图标搜索逻辑
 */
export class IconResolver {
    private app: App;
    private customIconPath: string;
    private cache: Map<string, string | null> = new Map();

    private static readonly IMAGE_EXTENSIONS = ["png", "jpg", "jpeg", "svg", "webp", "gif"];

    constructor(app: App, customIconPath: string) {
        this.app = app;
        this.customIconPath = customIconPath;
    }

    /**
     * 更新自定义图标路径（设置变更时调用）
     */
    setCustomIconPath(path: string): void {
        this.customIconPath = path;
        this.clearCache();
    }

    /**
     * 清除图标缓存
     */
    clearCache(): void {
        this.cache.clear();
    }

    /**
     * 解析账户图标的资源路径
     * 搜索策略：
     * 1. 从 frontmatter icon 字段（[[link]] 格式）解析
     * 2. 按约定搜索 customIconPath/accounts/name.ext
     * 3. 按约定搜索 customIconPath/name.ext
     *
     * @returns vault resource path (app://...) 或 null
     */
    resolveAccountIcon(account: AccountInfo): string | null {
        const cacheKey = `account:${account.path}:${account.icon || ""}`;
        const cached = this.cache.get(cacheKey);
        if (cached !== undefined) {
            return cached;
        }

        let result: string | null = null;

        // 1. 从 frontmatter icon 字段解析
        if (account.icon) {
            result = this.resolveIconLink(account.icon, account.path);
        }

        // 2. 按约定搜索
        if (!result) {
            result = this.searchIconByConvention(
                [account.fileName, account.displayName],
                ["accounts", ""]
            );
        }

        this.cache.set(cacheKey, result);
        return result;
    }

    /**
     * 解析分类图标的资源路径
     * 搜索策略：
     * 1. 原始分类名 (e.g. "餐饮/早餐")
     * 2. 横杠分隔名 (e.g. "餐饮-早餐")
     * 3. 叶子分类名 (e.g. "早餐")
     * 4. 父分类名 (e.g. "餐饮")
     * 在 customIconPath 及其子目录 (transactions, icons 等) 中搜索
     *
     * @returns vault resource path 或 null
     */
    resolveCategoryIcon(category: string): string | null {
        if (!category?.trim() || !this.customIconPath?.trim()) return null;

        const cacheKey = `category:${category}`;
        const cached = this.cache.get(cacheKey);
        if (cached !== undefined) {
            return cached;
        }

        // 构建候选名称
        const names: string[] = [];
        names.push(category);

        const cleanName = category.replace(/\//g, "-");
        if (cleanName !== category) names.push(cleanName);

        const parts = category.split("/");
        // 优先叶子名（如 "早餐"），再父名（如 "餐饮"）
        const leaf = parts.length > 0 ? parts[parts.length - 1] : null;
        const parent = parts.length > 1 ? parts[0] : null;
        if (leaf && leaf !== cleanName && leaf !== parent) names.push(leaf);
        if (parent && parent !== cleanName) names.push(parent);

        const result = this.searchIconByConvention(
            names,
            ["", "transactions", "Transactions", "icons", "Icons"]
        );

        this.cache.set(cacheKey, result);
        return result;
    }

    /**
     * 解析 [[wiki link]] 或纯文本格式的图标引用
     */
    private resolveIconLink(iconRef: string, contextPath: string): string | null {
        const raw = iconRef.replace(/\[\[|\]\]/g, "");
        if (!raw) return null;

        // 1. 使用 metadataCache 解析链接（最可靠的方式）
        const linkedFile = this.app.metadataCache.getFirstLinkpathDest(raw, contextPath);
        if (linkedFile instanceof TFile) {
            return this.app.vault.getResourcePath(linkedFile);
        }

        // 2. 直接路径查找
        let file = this.app.vault.getAbstractFileByPath(normalizePath(raw));
        if (file instanceof TFile) {
            return this.app.vault.getResourcePath(file);
        }

        // 3. 无扩展名时尝试 .png
        if (!raw.includes(".")) {
            file = this.app.vault.getAbstractFileByPath(normalizePath(raw + ".png"));
            if (file instanceof TFile) {
                return this.app.vault.getResourcePath(file);
            }
        }

        // 4. 在 customIconPath 下搜索
        if (this.customIconPath) {
            for (const sub of ["accounts", ""]) {
                const base = sub ? `${this.customIconPath}/${sub}` : this.customIconPath;
                const p = normalizePath(`${base}/${raw}`);
                const f = this.app.vault.getAbstractFileByPath(p);
                if (f instanceof TFile) {
                    return this.app.vault.getResourcePath(f);
                }
            }
        }

        return null;
    }

    /**
     * 按约定在多个路径中搜索图标文件
     */
    private searchIconByConvention(names: string[], subdirs: string[]): string | null {
        const basePaths = this.getBasePaths();

        for (const basePath of basePaths) {
            if (!basePath) continue;
            for (const sub of subdirs) {
                const searchDir = sub ? `${basePath}/${sub}` : basePath;
                for (const name of names) {
                    if (!name) continue;
                    for (const ext of IconResolver.IMAGE_EXTENSIONS) {
                        const p = normalizePath(`${searchDir}/${name}.${ext}`);
                        const f = this.app.vault.getAbstractFileByPath(p);
                        if (f instanceof TFile) {
                            return this.app.vault.getResourcePath(f);
                        }
                    }
                }
            }
        }

        return null;
    }

    /**
     * 获取所有候选基础路径（含大小写变体）
     */
    private getBasePaths(): Set<string> {
        const paths = new Set<string>();
        if (this.customIconPath) {
            paths.add(this.customIconPath);
            // 处理 Icons/icons 大小写变体
            if (this.customIconPath.includes("Icons")) {
                paths.add(this.customIconPath.replace("Icons", "icons"));
            } else if (this.customIconPath.includes("icons")) {
                paths.add(this.customIconPath.replace("icons", "Icons"));
            }
        }
        // Fallback 路径
        paths.add("Finance/Icons");
        paths.add("Finance/icons");
        return paths;
    }
}
