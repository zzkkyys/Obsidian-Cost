import { App, TFile } from "obsidian";
import { AccountService } from "../services/accountService";
import { AccountInfo } from "../types";

/**
 * 注册自定义属性编辑器，用于 from/to 字段的账户建议
 * 这使得在 Live Preview 模式的 Properties 面板中也能使用账户建议
 */
export function registerPropertyWidgets(app: App, accountService: AccountService): void {
    // 为 from 和 to 属性注册自定义类型处理
    // 使用 Obsidian 的 metadataTypeManager API
    
    const metadataTypeManager = (app as any).metadataTypeManager;
    if (!metadataTypeManager) {
        console.log("[Cost Plugin] metadataTypeManager 不可用");
        return;
    }

    // 注册 from 属性的建议
    registerAccountPropertySuggest(app, accountService, "from");
    
    // 注册 to 属性的建议
    registerAccountPropertySuggest(app, accountService, "to");
    
    console.log("[Cost Plugin] 已注册 from/to 属性建议器");
}

/**
 * 为指定属性注册账户建议
 */
function registerAccountPropertySuggest(
    app: App, 
    accountService: AccountService, 
    propertyName: string
): void {
    // 获取 metadataCache 来监听属性编辑
    const metadataCache = app.metadataCache;
    
    // 使用 Obsidian 的内部 API 来注册属性建议
    // 这需要监听 DOM 并在适当时机显示建议
    
    // 监听文档点击事件来检测属性编辑
    document.addEventListener("focusin", (evt) => {
        const target = evt.target as HTMLElement;
        if (!target) return;

        // 检查是否在 metadata 属性输入框中
        const metadataContainer = target.closest(".metadata-container");
        if (!metadataContainer) return;

        // 检查是否是 from 或 to 属性的输入框
        const propertyEl = target.closest(".metadata-property");
        if (!propertyEl) return;

        const keyEl = propertyEl.querySelector(".metadata-property-key");
        if (!keyEl) return;

        const key = keyEl.textContent?.trim();
        if (key !== "from" && key !== "to") return;

        // 检查当前文件是否为 transaction 类型
        const activeFile = app.workspace.getActiveFile();
        if (!activeFile) return;
        
        const cache = metadataCache.getFileCache(activeFile);
        if (!cache?.frontmatter || cache.frontmatter.type !== "txn") return;

        // 为输入框添加建议功能
        if (target instanceof HTMLInputElement || target.getAttribute("contenteditable")) {
            setupAccountSuggestions(target, accountService, activeFile);
        }
    });
}

/**
 * 为输入元素设置账户建议
 */
function setupAccountSuggestions(
    inputEl: HTMLElement, 
    accountService: AccountService,
    file: TFile
): void {
    // 检查是否已经设置过
    if (inputEl.dataset.accountSuggestSetup) return;
    inputEl.dataset.accountSuggestSetup = "true";

    // 创建建议容器
    let suggestionContainer: HTMLDivElement | null = null;

    const showSuggestions = () => {
        const accounts = accountService.getAccounts();
        if (accounts.length === 0) return;

        // 获取当前输入值
        const currentValue = inputEl instanceof HTMLInputElement 
            ? inputEl.value 
            : inputEl.textContent || "";

        // 过滤账户
        const filtered = currentValue 
            ? accountService.filterAccounts(currentValue)
            : accounts;

        if (filtered.length === 0) {
            hideSuggestions();
            return;
        }

        // 创建或更新建议容器
        if (!suggestionContainer) {
            suggestionContainer = document.createElement("div");
            suggestionContainer.className = "suggestion-container account-property-suggest";
            document.body.appendChild(suggestionContainer);
        }

        // 定位建议容器
        const rect = inputEl.getBoundingClientRect();
        suggestionContainer.style.position = "fixed";
        suggestionContainer.style.left = `${rect.left}px`;
        suggestionContainer.style.top = `${rect.bottom + 2}px`;
        suggestionContainer.style.width = `${Math.max(rect.width, 200)}px`;
        suggestionContainer.style.zIndex = "1000";

        // 渲染建议
        suggestionContainer.innerHTML = "";
        filtered.forEach((account, index) => {
            const item = suggestionContainer!.createDiv({ cls: "suggestion-item" });
            
            const nameEl = item.createDiv({ cls: "account-suggestion-name" });
            nameEl.setText(account.displayName);

            if (account.accountKind || account.institution) {
                const detailEl = item.createDiv({ cls: "account-suggestion-detail" });
                const details = [account.accountKind, account.institution].filter(Boolean);
                detailEl.setText(details.join(" · "));
            }

            item.addEventListener("click", (e) => {
                e.preventDefault();
                e.stopPropagation();
                selectAccount(account);
            });

            item.addEventListener("mouseenter", () => {
                suggestionContainer?.querySelectorAll(".suggestion-item").forEach(el => 
                    el.removeClass("is-selected")
                );
                item.addClass("is-selected");
            });

            if (index === 0) {
                item.addClass("is-selected");
            }
        });

        suggestionContainer.style.display = "block";
    };

    const hideSuggestions = () => {
        if (suggestionContainer) {
            suggestionContainer.style.display = "none";
        }
    };

    const selectAccount = (account: AccountInfo) => {
        const linkText = `[[${account.fileName}]]`;
        
        if (inputEl instanceof HTMLInputElement) {
            inputEl.value = linkText;
            inputEl.dispatchEvent(new Event("input", { bubbles: true }));
        } else {
            inputEl.textContent = linkText;
            inputEl.dispatchEvent(new Event("input", { bubbles: true }));
        }
        
        hideSuggestions();
    };

    // 事件监听
    inputEl.addEventListener("input", showSuggestions);
    inputEl.addEventListener("focus", showSuggestions);
    inputEl.addEventListener("blur", () => {
        // 延迟隐藏，以便点击建议项
        setTimeout(hideSuggestions, 200);
    });

    // 键盘导航
    inputEl.addEventListener("keydown", (e) => {
        if (!suggestionContainer || suggestionContainer.style.display === "none") return;

        const items = suggestionContainer.querySelectorAll(".suggestion-item");
        const selectedIndex = Array.from(items).findIndex(el => el.hasClass("is-selected"));

        if (e.key === "ArrowDown") {
            e.preventDefault();
            const nextIndex = (selectedIndex + 1) % items.length;
            items.forEach((el, i) => el.toggleClass("is-selected", i === nextIndex));
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            const prevIndex = (selectedIndex - 1 + items.length) % items.length;
            items.forEach((el, i) => el.toggleClass("is-selected", i === prevIndex));
        } else if (e.key === "Enter") {
            e.preventDefault();
            const selected = suggestionContainer.querySelector(".suggestion-item.is-selected");
            if (selected) {
                (selected as HTMLElement).click();
            }
        } else if (e.key === "Escape") {
            hideSuggestions();
        }
    });

    // 初始显示建议
    showSuggestions();
}
