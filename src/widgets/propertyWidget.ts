import { App, TFile } from "obsidian";
import { AccountService } from "../services/accountService";
import { AccountInfo } from "../types";

/**
 * 注册自定义属性编辑器，用于 from/to 字段的账户建议
 * 这使得在 Live Preview 模式的 Properties 面板中也能使用账户建议
 *
 * @returns 清理函数，在插件 unload 时调用
 */
export function registerPropertyWidgets(app: App, accountService: AccountService): () => void {
    const metadataTypeManager = app.metadataTypeManager;
    if (!metadataTypeManager) {
        console.log("[Cost Plugin] metadataTypeManager 不可用");
        return () => {};
    }

    // 单个 focusin 处理器同时覆盖 from/to 两个字段
    const focusinHandler = (evt: FocusEvent) => {
        const target = evt.target as HTMLElement;
        if (!target) return;

        if (!target.closest(".metadata-container")) return;

        const propertyEl = target.closest(".metadata-property");
        if (!propertyEl) return;

        const key = propertyEl.querySelector(".metadata-property-key")?.textContent?.trim();
        if (key !== "from" && key !== "to") return;

        const activeFile = app.workspace.getActiveFile();
        if (!activeFile) return;

        const cache = app.metadataCache.getFileCache(activeFile);
        if (!cache?.frontmatter || cache.frontmatter.type !== "txn") return;

        if (target instanceof HTMLInputElement || target.getAttribute("contenteditable")) {
            setupAccountSuggestions(target, accountService, activeFile);
        }
    };

    document.addEventListener("focusin", focusinHandler);

    console.log("[Cost Plugin] 已注册 from/to 属性建议器");

    return () => {
        document.removeEventListener("focusin", focusinHandler);
    };
}

/**
 * 为输入元素设置账户建议
 */
function setupAccountSuggestions(
    inputEl: HTMLElement,
    accountService: AccountService,
    _file: TFile
): void {
    if (inputEl.dataset.accountSuggestSetup) return;
    inputEl.dataset.accountSuggestSetup = "true";

    let suggestionContainer: HTMLDivElement | null = null;

    const showSuggestions = () => {
        const accounts = accountService.getAccounts();
        if (accounts.length === 0) return;

        const currentValue = inputEl instanceof HTMLInputElement
            ? inputEl.value
            : inputEl.textContent || "";

        const filtered = currentValue
            ? accountService.filterAccounts(currentValue)
            : accounts;

        if (filtered.length === 0) {
            hideSuggestions();
            return;
        }

        if (!suggestionContainer) {
            suggestionContainer = document.createElement("div");
            suggestionContainer.className = "suggestion-container account-property-suggest";
            document.body.appendChild(suggestionContainer);
        }

        const rect = inputEl.getBoundingClientRect();
        suggestionContainer.style.cssText = [
            "position:fixed",
            `left:${rect.left}px`,
            `top:${rect.bottom + 2}px`,
            `width:${Math.max(rect.width, 200)}px`,
            "z-index:1000",
            "display:block",
        ].join(";");

        suggestionContainer.innerHTML = "";
        filtered.forEach((account, index) => {
            const item = suggestionContainer!.createDiv({ cls: "suggestion-item" });

            item.createDiv({ cls: "account-suggestion-name" }).setText(account.displayName);

            if (account.accountKind || account.institution) {
                const details = [account.accountKind, account.institution].filter(Boolean);
                item.createDiv({ cls: "account-suggestion-detail" }).setText(details.join(" · "));
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

            if (index === 0) item.addClass("is-selected");
        });
    };

    const hideSuggestions = () => {
        // 从 DOM 移除，不留游离节点
        suggestionContainer?.remove();
        suggestionContainer = null;
    };

    const selectAccount = (account: AccountInfo) => {
        const linkText = `[[${account.fileName}]]`;
        if (inputEl instanceof HTMLInputElement) {
            inputEl.value = linkText;
        } else {
            inputEl.textContent = linkText;
        }
        inputEl.dispatchEvent(new Event("input", { bubbles: true }));
        hideSuggestions();
    };

    inputEl.addEventListener("input", showSuggestions);
    inputEl.addEventListener("focus", showSuggestions);
    inputEl.addEventListener("blur", () => {
        // 延迟隐藏，以便点击建议项
        setTimeout(hideSuggestions, 200);
    });

    inputEl.addEventListener("keydown", (e) => {
        if (!suggestionContainer) return;

        const items = suggestionContainer.querySelectorAll(".suggestion-item");
        const selectedIndex = Array.from(items).findIndex(el => el.hasClass("is-selected"));

        if (e.key === "ArrowDown") {
            e.preventDefault();
            const next = (selectedIndex + 1) % items.length;
            items.forEach((el, i) => el.toggleClass("is-selected", i === next));
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            const prev = (selectedIndex - 1 + items.length) % items.length;
            items.forEach((el, i) => el.toggleClass("is-selected", i === prev));
        } else if (e.key === "Enter") {
            e.preventDefault();
            (suggestionContainer.querySelector(".suggestion-item.is-selected") as HTMLElement | null)?.click();
        } else if (e.key === "Escape") {
            hideSuggestions();
        }
    });

    showSuggestions();
}
