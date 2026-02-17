import { App, Modal, TFile, setIcon, Menu, Notice, requestUrl, normalizePath, FuzzySuggestModal, AbstractInputSuggest } from "obsidian";
import { TransactionInfo, TransactionService } from "../services/transactionService";
import { AccountService } from "../services/accountService";
import { TransactionFrontmatter, AccountInfo } from "../types";
import CostPlugin from "../main";

type TxnType = "支出" | "收入" | "转账" | "还款";

interface TypeOption {
    value: TxnType;
    label: string;
}

interface CategoryGroup {
    primary: string;
    selectableSelf: boolean;
    children: string[];
}

const TYPE_OPTIONS: TypeOption[] = [
    { value: "支出", label: "支出" },
    { value: "收入", label: "收入" },
    { value: "转账", label: "转账" },
    { value: "还款", label: "还款" }
];

export class TransactionEditModal extends Modal {
    private txn: TransactionInfo;
    private service: TransactionService;
    private accountService: AccountService;
    private file: TFile;
    private onSave?: () => void;
    private customIconPath: string;
    private isNewTransaction: boolean;
    private isSaved: boolean = false;
    private plugin: CostPlugin;

    constructor(
        app: App,
        txn: TransactionInfo,
        service: TransactionService,
        accountService: AccountService,
        customIconPath: string,
        plugin: CostPlugin,
        onSave?: () => void,
        isNew: boolean = false
    ) {
        super(app);
        this.txn = txn;
        this.service = service;
        this.accountService = accountService;
        this.customIconPath = customIconPath;
        this.plugin = plugin;
        this.onSave = onSave;
        this.isNewTransaction = isNew;
        const f = this.app.vault.getAbstractFileByPath(txn.path);
        if (f instanceof TFile) this.file = f;
        else throw new Error("Transaction file not found: " + txn.path);
    }

    onOpen() {
        const { contentEl, titleEl } = this;
        contentEl.empty();
        this.modalEl.addClass("cost-add-txn-modal");

        // Inject dynamic styles
        const style = document.createElement("style");
        style.textContent = `
            @keyframes costShimmer {
                0% { background-position: 100% 50%; }
                100% { background-position: 0% 50%; }
            }
            .cost-cat-btn-active-glow {
                background: linear-gradient(120deg, 
                    color-mix(in srgb, var(--interactive-accent) 10%, transparent) 0%, 
                    color-mix(in srgb, var(--interactive-accent) 40%, transparent) 50%, 
                    color-mix(in srgb, var(--interactive-accent) 10%, transparent) 100%
                ) !important;
                background-size: 200% 200% !important;
                animation: costShimmer 3s ease infinite !important;
                border-radius: 12px !important;
                box-shadow: 0 0 0 1px var(--interactive-accent), 0 0 12px color-mix(in srgb, var(--interactive-accent) 40%, transparent) !important;
                transition: all 0.3s ease !important;
            }
            .theme-dark .cost-cat-btn-active-glow {
                 background: linear-gradient(120deg, 
                    color-mix(in srgb, var(--interactive-accent) 15%, transparent) 0%, 
                    color-mix(in srgb, var(--interactive-accent) 50%, transparent) 50%, 
                    color-mix(in srgb, var(--interactive-accent) 15%, transparent) 100%
                ) !important;
            }
        `;
        contentEl.appendChild(style);

        // --- Custom Header Layout ---
        titleEl.empty();
        titleEl.addClass("cost-modal-header");
        // Force flex layout on titleEl to fuse everything in one row
        titleEl.style.display = "flex";
        titleEl.style.alignItems = "center";
        titleEl.style.justifyContent = "space-between"; // Distribute space
        titleEl.style.gap = "12px";
        titleEl.style.paddingRight = "40px"; // Reserve space for close button if absolute

        // 1. Title Text (Left)
        const titleText = titleEl.createDiv({
            text: this.isNewTransaction ? "新建交易" : "编辑交易",
            cls: "cost-modal-title-text"
        });
        titleText.style.fontWeight = "bold";
        titleText.style.fontSize = "18px";
        titleText.style.whiteSpace = "nowrap";

        // 2. Type Tabs (Center - fused)
        // Create container for tabs in header
        const typeTabsChanged = titleEl.createDiv({ cls: "cost-add-txn-type-tabs" });
        // Override styles to fit in header
        typeTabsChanged.style.margin = "0";
        typeTabsChanged.style.width = "auto";
        typeTabsChanged.style.background = "transparent"; // Remove background to blend
        typeTabsChanged.style.padding = "0";
        typeTabsChanged.style.gap = "4px";

        const typeButtons = new Map<TxnType, HTMLButtonElement>();

        // 3. Actions (Right) - Open File Button
        const headerActions = titleEl.createDiv({ cls: "cost-modal-header-actions-inline" });
        headerActions.style.display = "flex";
        headerActions.style.alignItems = "center";

        const openFileBtn = headerActions.createEl("button", {
            cls: "clickable-icon",
            attr: { "aria-label": "打开源文件" }
        });
        setIcon(openFileBtn, "file-text");
        openFileBtn.onclick = () => {
            this.app.workspace.getLeaf(true).openFile(this.file);
            this.close();
        };


        // const accounts = this.accountService.getAccounts().map((a) => a.fileName); // Removed as we use getAccounts() in modal
        const personsOptions = Array.from(new Set(this.service.getTransactions().flatMap((t) => t.persons || []).filter((n) => n && n.trim() !== ""))).sort();

        let date = this.txn.date || this.getTodayDate();
        let time = this.txn.time || this.getCurrentTime();
        let amount = Number.isFinite(this.txn.amount) ? this.txn.amount : 0;
        let type: TxnType = this.txn.txnType;
        let category = this.txn.category || "未分类";
        let from = this.txn.from || "";
        let to = this.txn.to || "";
        let payee = this.txn.payee || "";
        let address = this.txn.address || "";
        let latitude = this.txn.latitude;
        let longitude = this.txn.longitude;
        let memo = this.txn.memo || this.txn.note || "";
        let personsStr = (this.txn.persons || []).join(", ");
        let discount = this.txn.discount || 0;
        let refund = this.txn.refund || 0;
        let refundTo = this.txn.refundTo || "";

        const page = contentEl.createDiv({ cls: "cost-add-txn-page" });
        // Removed typeTabs creation from here

        TYPE_OPTIONS.forEach((opt) => {
            const btn = typeTabsChanged.createEl("button", {
                cls: "cost-add-txn-type-btn",
                text: opt.label,
                attr: { type: "button" }
            });
            // Adjust button style for header
            btn.style.padding = "4px 8px";
            btn.style.fontSize = "13px";

            btn.onclick = () => {
                type = opt.value;
                syncTypeState();
            };
            typeButtons.set(opt.value, btn);
        });

        const categorySection = page.createDiv({ cls: "cost-add-txn-category-section" });
        const categoryTitleEl = categorySection.createDiv({ cls: "cost-add-txn-section-title", text: "选择分类" });

        const categoryGrid = categorySection.createDiv({ cls: "cost-add-txn-category-grid" });
        const categoryButtons = new Map<string, HTMLButtonElement>();
        const syncCategoryState = () => {
            categoryButtons.forEach((btn, key) => {
                const active = category === key || category.startsWith(`${key}/`);
                btn.toggleClass("is-active", active);
                btn.toggleClass("cost-cat-btn-active-glow", active);

                const icon = btn.querySelector(".cost-add-txn-category-icon") as HTMLElement;
                if (icon) {
                    if (active) {
                        // Keep subtle scale on icon
                        icon.style.transform = "scale(1.1)";
                        icon.style.transition = "all 0.2s ease";
                        btn.style.opacity = "1";
                    } else {
                        icon.style.transform = "none";
                        btn.style.opacity = category ? "0.6" : "1";
                    }
                }
            });
            categoryTitleEl.setText(`选择分类：${category}`);
        };

        const renderCategoryGrid = () => {
            categoryGrid.empty();
            categoryButtons.clear();
            const categoryGroups = this.collectCategoryGroups(type);

            if (categoryGroups.length === 0) {
                const emptyMsg = categoryGrid.createDiv({ text: "无可用分类", cls: "cost-add-txn-empty-cat" });
                emptyMsg.style.color = "var(--text-muted)";
                emptyMsg.style.padding = "10px";
                emptyMsg.style.textAlign = "center";
                emptyMsg.style.width = "100%";
            }

            categoryGroups.forEach((group) => {
                const cat = group.primary;
                const btn = categoryGrid.createEl("button", {
                    cls: "cost-add-txn-category-item",
                    attr: { type: "button", title: cat }
                });
                // Force layout styles to ensure icon visibility
                btn.style.display = "flex";
                btn.style.flexDirection = "column";
                btn.style.alignItems = "center";
                btn.style.justifyContent = "center";
                btn.style.gap = "4px"; // Reduced gap
                btn.style.height = "auto";
                btn.style.minHeight = "auto"; // Remove forced height
                btn.style.padding = "4px 2px";

                const iconCircle = btn.createDiv({ cls: "cost-add-txn-category-icon" });
                // Force icon container styles
                iconCircle.style.width = "26px";
                iconCircle.style.height = "26px";
                iconCircle.style.minHeight = "26px"; // Prevent collapse
                iconCircle.style.borderRadius = "50%";
                iconCircle.style.display = "flex";
                iconCircle.style.alignItems = "center";
                iconCircle.style.justifyContent = "center";
                iconCircle.style.background = this.getCategoryColor(cat);
                // Ensure icon color is dark enough to see against pastel background
                iconCircle.style.color = "rgba(0,0,0,0.6)";

                const iconPath = this.getCategoryImagePath(cat);
                if (iconPath) {
                    const img = iconCircle.createEl("img", { cls: "cost-add-txn-category-icon-img" });
                    img.src = iconPath;
                    img.alt = cat;
                    img.style.width = "16px";
                    img.style.height = "16px";
                } else {
                    const iconName = this.getCategoryIcon(cat);
                    setIcon(iconCircle, iconName);
                    // Fix for setIcon: sometimes it needs specific sizing on the svg
                    const svg = iconCircle.querySelector("svg");
                    if (svg) {
                        svg.style.width = "16px";
                        svg.style.height = "16px";
                    }
                }

                const label = btn.createDiv({ cls: "cost-add-txn-category-label", text: cat });
                label.style.fontSize = "11px";
                label.style.lineHeight = "1.1";
                label.style.textAlign = "center";
                label.style.minHeight = "0"; // Override CSS default of 30px
                label.style.height = "auto";
                label.style.marginBottom = "0";

                btn.onclick = () => {
                    if (group.children.length === 0) {
                        category = cat;
                        syncCategoryState();
                        return;
                    }

                    const menu = new Menu();
                    if (group.selectableSelf) {
                        menu.addItem((item) =>
                            item.setTitle(cat).setIcon("check").onClick(() => {
                                category = cat;
                                syncCategoryState();
                            })
                        );
                    }

                    group.children.forEach((child) => {
                        const full = `${cat}/${child}`;
                        menu.addItem((item) =>
                            item.setTitle(child).onClick(() => {
                                category = full;
                                syncCategoryState();
                            })
                        );
                    });

                    const rect = btn.getBoundingClientRect();
                    menu.showAtPosition({ x: rect.left, y: rect.bottom + 4 });
                };
                btn.ondblclick = () => {
                    category = cat;
                    syncCategoryState();
                };
                categoryButtons.set(cat, btn);
            });

            // Add "Add Category" Button
            const addBtn = categoryGrid.createEl("button", {
                cls: "cost-add-txn-category-item",
                attr: {
                    type: "button",
                    title: "添加新分类",
                    style: "display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; height: auto; min-height: auto; padding: 4px 2px;"
                }
            });
            const addIconCircle = addBtn.createDiv({ cls: "cost-add-txn-category-icon" });
            addIconCircle.style.width = "26px";
            addIconCircle.style.height = "26px";
            addIconCircle.style.minHeight = "26px";
            addIconCircle.style.borderRadius = "50%";
            addIconCircle.style.display = "flex";
            addIconCircle.style.alignItems = "center";
            addIconCircle.style.justifyContent = "center";
            addIconCircle.style.background = "#f0f0f0"; // Neutral background
            addIconCircle.style.color = "rgba(0,0,0,0.6)";
            setIcon(addIconCircle, "plus");
            const svg = addIconCircle.querySelector("svg");
            if (svg) { svg.style.width = "16px"; svg.style.height = "16px"; }

            const addLabel = addBtn.createDiv({ cls: "cost-add-txn-category-label", text: "添加" });
            addLabel.style.fontSize = "11px";
            addLabel.style.lineHeight = "1.1";
            addLabel.style.textAlign = "center";
            addLabel.style.minHeight = "0";
            addLabel.style.height = "auto";
            addLabel.style.marginBottom = "0";

            addBtn.onclick = async () => {
                // Prompt for new category name
                const promptModal = new Modal(this.app);
                promptModal.titleEl.setText(`添加${type}分类`);
                const inputEl = promptModal.contentEl.createEl("input", {
                    type: "text",
                    placeholder: "输入分类名称",
                    attr: { style: "width: 100%; margin-bottom: 12px;" }
                });
                inputEl.focus();

                const btnContainer = promptModal.contentEl.createDiv({ attr: { style: "display: flex; justify-content: flex-end; gap: 8px;" } });
                const cancelBtn = btnContainer.createEl("button", { text: "取消" });
                cancelBtn.onclick = () => promptModal.close();
                const confirmBtn = btnContainer.createEl("button", { text: "确定", cls: "mod-cta" });

                const save = async () => {
                    const newCat = inputEl.value.trim();
                    if (!newCat) return;

                    // Add to settings
                    if (type === "支出") {
                        if (!this.plugin.settings.expenseCategories.includes(newCat)) {
                            this.plugin.settings.expenseCategories.push(newCat);
                        }
                    } else if (type === "收入") {
                        if (!this.plugin.settings.incomeCategories.includes(newCat)) {
                            this.plugin.settings.incomeCategories.push(newCat);
                        }
                    } else {
                        // For Transfer/Repayment, usually fixed categories? Or allow adding to Expense?
                        // Let's assume we add to Expense if type is confusing, or just alert?
                        // Actually Repayment/Transfer might share Expense categories or have their own.
                        // For now support Expense/Income.
                        if (!this.plugin.settings.expenseCategories.includes(newCat)) {
                            this.plugin.settings.expenseCategories.push(newCat);
                        }
                    }
                    await this.plugin.saveSettings();

                    category = newCat;
                    promptModal.close();
                    renderCategoryGrid(); // Re-render to show new category
                };

                confirmBtn.onclick = save;
                inputEl.onkeydown = (e) => { if (e.key === "Enter") save(); };
                promptModal.open();
            };
            syncCategoryState();
        };

        renderCategoryGrid();

        // --- Top Helper Bar (Chips) ---
        const topHelperBar = page.createDiv({ cls: "cost-top-helper-bar" });

        const createHelperChip = (icon: string, label: string, onClick: () => void, onClear?: () => void) => {
            const chip = topHelperBar.createDiv({ cls: "cost-helper-chip" });
            setIcon(chip, icon);
            const textSpan = chip.createSpan({ text: label });
            chip.onclick = onClick;

            if (onClear) {
                const closeBtn = chip.createDiv({ cls: "cost-chip-close" });
                setIcon(closeBtn, "x");
                closeBtn.onclick = (e) => {
                    e.stopPropagation();
                    onClear();
                };
            }
            return { chip, textSpan }; // Return elements to update later
        };

        // 1. Account Chip
        // 1. Account Chip
        // Reverted to Menu based on user feedback, but with icons.

        const showAccountMenu = (anchor: HTMLElement, onSelect: (acc: AccountInfo) => void) => {
            const accounts = this.accountService.getAccounts();
            if (accounts.length === 0) {
                new Notice("没有可选账户");
                return;
            }

            // Create a custom menu-like dropdown
            const menuEl = document.body.createDiv({ cls: "menu cost-account-dropdown-menu" });
            const rect = anchor.getBoundingClientRect();

            // Basic positioning (can be improved)
            menuEl.style.position = "absolute";
            menuEl.style.left = `${rect.left}px`;
            menuEl.style.top = `${rect.bottom + 4}px`;
            menuEl.style.zIndex = "var(--layer-menu)"; // Use Obsidian var
            menuEl.style.minWidth = "180px";
            menuEl.style.maxHeight = "300px"; // Limit height
            menuEl.style.overflowY = "auto"; // Add scroll
            menuEl.style.backgroundColor = "var(--background-primary)";
            menuEl.style.border = "1px solid var(--background-modifier-border)";
            menuEl.style.borderRadius = "6px";
            menuEl.style.boxShadow = "var(--shadow-s)";
            menuEl.style.padding = "4px";

            // Click outside to close
            const closeMenu = () => {
                menuEl.remove();
                document.removeEventListener("click", outsideClickListener);
            };
            const outsideClickListener = (e: MouseEvent) => {
                if (!menuEl.contains(e.target as Node) && e.target !== anchor && !anchor.contains(e.target as Node)) {
                    closeMenu();
                }
            };
            // Delay adding listener to avoid immediate close
            setTimeout(() => document.addEventListener("click", outsideClickListener), 0);

            accounts.forEach(acc => {
                const itemEl = menuEl.createDiv({ cls: "menu-item" });
                itemEl.style.display = "flex";
                itemEl.style.alignItems = "center";
                itemEl.style.padding = "6px 10px";
                itemEl.style.cursor = "pointer";
                itemEl.style.borderRadius = "4px";
                itemEl.style.gap = "8px"; // Spacing between icon and text

                // Hover effect logic
                itemEl.onmouseenter = () => {
                    itemEl.style.backgroundColor = "var(--background-modifier-hover)";
                };
                itemEl.onmouseleave = () => {
                    itemEl.style.backgroundColor = "transparent";
                };

                // Icon container
                const iconContainer = itemEl.createDiv({ cls: "menu-item-icon" });
                iconContainer.style.display = "flex";
                iconContainer.style.alignItems = "center";
                iconContainer.style.justifyContent = "center";
                iconContainer.style.width = "20px";
                iconContainer.style.height = "20px";

                // Icon Logic
                let iconSrc: string | null = null;
                // 1. Check frontmatter [[Icon]]
                // 1. Check frontmatter [[Icon]]
                // Usually format: "[[Icon.png]]" or "Icon.png"
                if (acc.icon) {
                    // Remove wikilinks syntax if present
                    const raw = acc.icon.replace(/\[\[|\]\]/g, "");
                    // e.g. "交通银行.png"

                    // Use metadataCache to resolve link against account file path
                    // This handles relative paths, or just global search
                    const f = this.app.metadataCache.getFirstLinkpathDest(raw, acc.path);

                    if (f instanceof TFile) {
                        iconSrc = this.app.vault.getResourcePath(f);
                    } else {
                        // Fallback: try manual search if getFirstLinkpathDest fails for some reason
                        const display = raw;
                        // Try exact match first
                        let fManual = this.app.vault.getAbstractFileByPath(normalizePath(display));
                        if (fManual instanceof TFile) {
                            iconSrc = this.app.vault.getResourcePath(fManual);
                        } else if (!display.includes(".")) {
                            // Try adding .png
                            fManual = this.app.vault.getAbstractFileByPath(normalizePath(display + ".png"));
                            if (fManual instanceof TFile) iconSrc = this.app.vault.getResourcePath(fManual);
                        }

                        // Double Fallback: try finding in customIconPath/accounts/ or customIconPath/
                        if (!iconSrc && this.customIconPath) {
                            const p = normalizePath(`${this.customIconPath}/accounts/${display}`);
                            const f2 = this.app.vault.getAbstractFileByPath(p);
                            if (f2 instanceof TFile) iconSrc = this.app.vault.getResourcePath(f2);

                            if (!iconSrc) {
                                const p2 = normalizePath(`${this.customIconPath}/${display}`);
                                const f3 = this.app.vault.getAbstractFileByPath(p2);
                                if (f3 instanceof TFile) iconSrc = this.app.vault.getResourcePath(f3);
                            }
                        }
                    }
                }
                // 2. Custom Icon Path
                // 2. Custom Icon Path
                if (!iconSrc) {
                    // Prepare candidate paths
                    const candidateBasePaths = new Set<string>();
                    if (this.customIconPath) {
                        candidateBasePaths.add(this.customIconPath);
                        candidateBasePaths.add(this.customIconPath.replace("Icons", "icons"));
                        candidateBasePaths.add(this.customIconPath.replace("icons", "Icons"));
                    }
                    // Fallbacks
                    candidateBasePaths.add("Finance/Icons");
                    candidateBasePaths.add("Finance/icons");

                    const extensions = ["png", "jpg", "jpeg", "svg", "webp"];
                    const names = [acc.fileName, acc.displayName];

                    outerLoop:
                    for (const basePath of candidateBasePaths) {
                        if (!basePath) continue;
                        for (const name of names) {
                            if (!name) continue;
                            for (const ext of extensions) {
                                // Strategy A: basePath/accounts/name.ext
                                let p = normalizePath(`${basePath}/accounts/${name}.${ext}`);
                                let f = this.app.vault.getAbstractFileByPath(p);
                                if (f instanceof TFile) {
                                    iconSrc = this.app.vault.getResourcePath(f);
                                    break outerLoop;
                                }

                                // Strategy B: basePath/name.ext (flat)
                                p = normalizePath(`${basePath}/${name}.${ext}`);
                                f = this.app.vault.getAbstractFileByPath(p);
                                if (f instanceof TFile) {
                                    iconSrc = this.app.vault.getResourcePath(f);
                                    break outerLoop;
                                }
                            }
                        }
                    }
                }

                if (iconSrc) {
                    const img = iconContainer.createEl("img");
                    img.src = iconSrc;
                    img.style.width = "100%";
                    img.style.height = "100%";
                    img.style.objectFit = "contain";
                } else {
                    setIcon(iconContainer, "wallet"); // Standard fallback
                    const svg = iconContainer.querySelector("svg");
                    if (svg) {
                        svg.style.width = "16px";
                        svg.style.height = "16px";
                        svg.style.color = "var(--text-muted)";
                    }
                }

                // Title
                const titleEl = itemEl.createDiv({ cls: "menu-item-title", text: acc.displayName || acc.fileName });
                titleEl.style.flex = "1";
                titleEl.style.whiteSpace = "nowrap";
                titleEl.style.overflow = "hidden";
                titleEl.style.textOverflow = "ellipsis";
                titleEl.style.color = "var(--text-normal)";

                itemEl.onclick = () => {
                    onSelect(acc);
                    closeMenu();
                };
            });
        };

        // 1. Source Account Chip (Out)
        const sourceAccountChip = createHelperChip("arrow-up-circle", "转出", () => {
            showAccountMenu(sourceAccountChip.chip, (acc) => {
                from = acc.fileName;
                updateTopHelperChips();
                refreshSummary();
            });
        }, () => {
            from = "";
            updateTopHelperChips();
            refreshSummary();
        });

        // 2. Target Account Chip (In)
        const targetAccountChip = createHelperChip("arrow-down-circle", "转入", () => {
            showAccountMenu(targetAccountChip.chip, (acc) => {
                to = acc.fileName;
                updateTopHelperChips();
                refreshSummary();
            });
        }, () => {
            to = "";
            updateTopHelperChips();
            refreshSummary();
        });

        // 2. Payee Chip (New)
        const payeeChip = createHelperChip("store", "商家", () => {
            // Simple Prompt for Payee
            const promptModal = new Modal(this.app);
            promptModal.titleEl.setText("商家/收款人");
            const inputEl = promptModal.contentEl.createEl("input", {
                type: "text",
                attr: { style: "width: 100%; margin-bottom: 12px;", placeholder: "输入商家或收款人名称" }
            });
            inputEl.value = payee;
            inputEl.focus();

            const btnContainer = promptModal.contentEl.createDiv({ attr: { style: "display: flex; justify-content: flex-end; gap: 8px;" } });
            const cancelBtn = btnContainer.createEl("button", { text: "取消" });
            cancelBtn.onclick = () => promptModal.close();

            const confirmBtn = btnContainer.createEl("button", { text: "确定", cls: "mod-cta" });
            confirmBtn.onclick = () => {
                payee = inputEl.value.trim();
                updateTopHelperChips();
                refreshSummary();
                promptModal.close();
            };

            inputEl.onkeydown = (e) => {
                if (e.key === "Enter") confirmBtn.click();
            };

            promptModal.open();
        }, () => {
            payee = "";
            updateTopHelperChips();
            refreshSummary();
        });

        // Discount Chip (Popup Input)
        const discountChip = createHelperChip("ticket", "优惠", () => {
            if (type !== "还款" && type !== "支出") return;

            const isRefund = type === "支出";
            const currentVal = isRefund ? refund : discount;
            const title = isRefund ? "输入退款金额" : "输入优惠金额";

            // Simple Prompt Modal
            const promptModal = new Modal(this.app);
            promptModal.titleEl.setText(title);
            promptModal.contentEl.createEl("p", { text: "请输入金额：" });

            const inputEl = promptModal.contentEl.createEl("input", {
                type: "number",
                attr: { style: "width: 100%; margin-bottom: 12px;" }
            });
            inputEl.value = currentVal > 0 ? String(currentVal) : "";
            inputEl.focus();

            const btnContainer = promptModal.contentEl.createDiv({ attr: { style: "display: flex; justify-content: flex-end; gap: 8px;" } });
            const cancelBtn = btnContainer.createEl("button", { text: "取消" });
            cancelBtn.onclick = () => promptModal.close();

            const confirmBtn = btnContainer.createEl("button", { text: "确定", cls: "mod-cta" });
            confirmBtn.onclick = () => {
                const val = parseFloat(inputEl.value);
                if (!isNaN(val) && val >= 0) {
                    if (isRefund) {
                        refund = val;
                    } else {
                        discount = val;
                    }
                    updateTopHelperChips();
                }
                promptModal.close();
            };

            inputEl.onkeydown = (e) => {
                if (e.key === "Enter") confirmBtn.click();
            };

            promptModal.open();
        });



        // 5. Tags
        const tagsChip = createHelperChip("tag", "标签", () => {
            const menu = new Menu();
            if (personsOptions.length === 0) {
                new Notice("暂无可选标签");
                return;
            }
            personsOptions.forEach((name) => {
                menu.addItem((item) => item.setTitle(name).onClick(() => {
                    // Update to simple array logic
                    const values = personsStr ? personsStr.split(/[,，]\s*/).filter(Boolean) : [];
                    if (!values.includes(name)) values.push(name);
                    personsStr = values.join(", ");
                    updateTopHelperChips();
                    refreshSummary();
                }));
            });
            const rect = tagsChip.chip.getBoundingClientRect();
            menu.showAtPosition({ x: rect.left, y: rect.bottom + 4 });
        });



        // Helper to update chip states
        const updateTopHelperChips = () => {
            // Source Account Logic
            const showSource = type === "支出" || type === "转账" || type === "还款";
            sourceAccountChip.chip.style.display = showSource ? "flex" : "none";

            let sourceLabel = "账户";
            if (type === "支出") sourceLabel = "支付账户";
            if (type === "转账") sourceLabel = "转出账户";
            if (type === "还款") sourceLabel = "付款账户";

            sourceAccountChip.textSpan.setText(from || sourceLabel);
            sourceAccountChip.chip.toggleClass("has-value", Boolean(from));

            // Target Account Logic
            const showTarget = type === "收入" || type === "转账" || type === "还款";
            targetAccountChip.chip.style.display = showTarget ? "flex" : "none";

            let targetLabel = "账户";
            if (type === "收入") targetLabel = "入账账户";
            if (type === "转账") targetLabel = "转入账户";
            if (type === "还款") targetLabel = "还款目标";

            targetAccountChip.textSpan.setText(to || targetLabel);
            targetAccountChip.chip.toggleClass("has-value", Boolean(to));

            // Payee
            payeeChip.textSpan.setText(payee || "商家");
            payeeChip.chip.toggleClass("has-value", Boolean(payee));
            payeeChip.chip.style.display = (type === "转账") ? "none" : "flex";

            // Tags
            tagsChip.chip.toggleClass("has-value", Boolean(personsStr && personsStr.length > 0));

            // Discount / Refund Toggle
            const showDiscount = type === "支出" || type === "还款";
            discountChip.chip.style.display = showDiscount ? "flex" : "none";
            discountChip.chip.toggleClass("has-value", (type === "还款" && discount > 0) || (type === "支出" && refund > 0));
        };



        // --- Fused Card Section ---
        const fusedCard = page.createDiv({ cls: "cost-fused-card" });

        // Address Button (Top Right)
        const addressBtn = fusedCard.createDiv({ cls: "cost-fused-address-btn" });
        const addressIcon = addressBtn.createSpan({ cls: "cost-fused-address-icon" });
        setIcon(addressIcon, "map-pin");
        const addressText = addressBtn.createSpan({ cls: "cost-fused-address-text" });
        addressText.setText(address && address.trim() !== "" ? address : "定位");

        const fetchLocation = () => {
            if (!navigator.geolocation) {
                new Notice("当前环境不支持获取地理位置");
                return;
            }

            addressBtn.addClass("is-loading");
            addressText.setText("定位中...");

            navigator.geolocation.getCurrentPosition(async (position) => {
                const { latitude: lat, longitude: lng } = position.coords;
                latitude = lat;
                longitude = lng;

                try {
                    const response = await requestUrl({
                        url: `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`,
                        headers: { "Accept-Language": "zh-CN" }
                    });

                    if (response.status === 200) {
                        const data = response.json;
                        const addr = data.address;
                        let fullAddress = "";
                        if (addr.state) fullAddress += addr.state;
                        if (addr.city && addr.city !== addr.state) fullAddress += addr.city;
                        if (addr.city_district) fullAddress += addr.city_district;
                        if (addr.county && addr.county !== addr.city_district) fullAddress += addr.county;
                        if (addr.town) fullAddress += addr.town;
                        if (addr.village) fullAddress += addr.village;

                        if (addr.building || addr.amenity) {
                            const building = addr.building || addr.amenity;
                            if (!fullAddress.includes(building)) fullAddress += building;
                        }

                        address = fullAddress || data.display_name;
                        new Notice("已定位: " + address);
                        addressText.setText(address);
                    }
                } catch (e) {
                    console.error("Reverse geocoding failed", e);
                    address = `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
                    addressText.setText("已获取坐标");
                }
                addressBtn.removeClass("is-loading");
            }, (err) => {
                console.warn(err);
                // Fallback IP
                requestUrl({ url: "https://ipapi.co/json/" }).then(res => {
                    if (res.status === 200) return res.json;
                    throw new Error("IP API failed");
                }).then(data => {
                    let ipAddr = data.city || data.country_name || "未知位置";
                    if (data.region && data.region !== data.city) ipAddr += `, ${data.region}`;
                    address = ipAddr;
                    if (data.latitude && data.longitude) {
                        latitude = data.latitude;
                        longitude = data.longitude;
                    }
                    new Notice("已通过网络定位: " + address);
                    addressText.setText(address);
                }).catch(() => {
                    new Notice("定位完全失败");
                    addressText.setText("定位失败");
                }).finally(() => {
                    addressBtn.removeClass("is-loading");
                });
            }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
        };

        addressBtn.onclick = () => fetchLocation();

        // Auto-fetch logic
        if (this.isNewTransaction && (!address || address.trim() === "")) {
            window.setTimeout(() => fetchLocation(), 500);
        }

        // Row 1: Amount
        const amountRow = fusedCard.createDiv({ cls: "cost-fused-amount-row" });
        amountRow.createSpan({ cls: "cost-currency-symbol", text: "¥" });
        const amountInput = amountRow.createEl("input", {
            cls: "cost-fused-amount-input",
            attr: {
                type: "text",
                inputmode: "decimal",
                placeholder: "0.00"
            }
        });
        amountInput.value = amount > 0 ? String(amount) : "";
        amountInput.oninput = () => {
            amount = this.parseAmount(amountInput.value);
        };

        // Row 2: Meta (Time pill | Memo | Expand)
        const metaRow = fusedCard.createDiv({ cls: "cost-fused-meta-row" });

        // Time Pill
        const timePill = metaRow.createDiv({ cls: "cost-time-pill" });
        setIcon(timePill, "clock");
        const timeText = timePill.createSpan({ text: (time || "00:00").slice(0, 5) });

        // Memo Input
        const memoInput = metaRow.createEl("input", {
            cls: "cost-fused-memo-input",
            attr: {
                type: "text",
                placeholder: "点击填写备注"
            }
        });
        memoInput.value = memo;
        memoInput.oninput = () => {
            memo = memoInput.value;
        };



        // Hidden DateTime Picker Row
        const dateTimeRow = fusedCard.createDiv({ cls: "cost-datetime-picker-row" });
        const dateInput = dateTimeRow.createEl("input", {
            cls: "cost-add-txn-date-input",
            attr: { type: "date" }
        });
        dateInput.value = date;
        dateInput.onchange = () => {
            date = dateInput.value;
        };

        const timeInput = dateTimeRow.createEl("input", {
            cls: "cost-add-txn-time-input",
            attr: { type: "time" }
        });
        timeInput.value = (time || "00:00").slice(0, 5);
        timeInput.onchange = () => {
            time = this.normalizeTime(timeInput.value);
            timeText.setText(time.slice(0, 5));
        };

        // Date/Time Toggle Logic
        timePill.onclick = () => {
            dateTimeRow.toggleClass("is-visible", !dateTimeRow.hasClass("is-visible"));
        };



        const summary = page.createDiv({ cls: "cost-add-txn-summary" });

        const footer = page.createDiv({ cls: "cost-add-txn-footer" });

        if (!this.isNewTransaction) {
            const deleteBtn = footer.createEl("button", {
                text: "删除",
                cls: "mod-warning cost-add-txn-delete-btn",
                attr: { type: "button" }
            });
            deleteBtn.onclick = async () => {
                if (window.confirm("确定要删除这条交易记录吗？")) {
                    try {
                        this.service.removeTransaction(this.file.path);
                        await this.app.vault.delete(this.file);
                        new Notice("交易已删除");
                        this.isSaved = true;
                        this.onSave?.();
                        this.close();
                    } catch (e) {
                        new Notice("删除失败: " + e);
                        console.error(e);
                    }
                }
            };
        }

        const saveBtn = footer.createEl("button", { text: "保存交易", cls: "mod-cta cost-add-txn-save-btn", attr: { type: "button" } });
        saveBtn.onclick = async () => {
            if (type === "转账" && (!from || !to)) {
                new Notice("转账记录需要同时指定来源账户和目标账户");
                return;
            }

            const rawAmounts = amountInput.value.split(/[\s,，]+/).filter((s) => s.trim().length > 0);
            if (rawAmounts.length === 0) {
                new Notice("请输入有效金额");
                return;
            }

            const personsArray = personsStr
                .split(/[,，]/)
                .map((s) => s.trim())
                .filter((s) => s.length > 0);

            let savedCount = 0;
            // Base Date/Time for increments
            const baseTimeStr = this.normalizeTime(timeInput.value || time);
            const [bH, bM] = baseTimeStr.split(":").map(Number);
            const baseDateObj = new Date(dateInput.value || date);
            // If date string is YYYY-MM-DD, parsing might follow UTC or local depending on browser, usually UTC unless time provided?
            // Safer to use manual parsing
            const [y, m, d] = (dateInput.value || date).split("-").map(Number);
            if (y && m !== undefined && d !== undefined) {
                baseDateObj.setFullYear(y, m - 1, d);
            }
            // If valid seconds are present in user input (unlikely for <input type="time"> on some browsers, but possible in logic)
            // or if we want to default to current seconds for "now".
            // However, the issue described is "starts from 00". This is because we set seconds to 0 below.
            // Let's try to preserve parsed seconds if available, or use current seconds if the time matches "now" roughly,
            // or just random/sequential seconds?
            // The user wants "real seconds". 
            // If the user picked a time manually, it usually doesn't have seconds (HH:MM). 
            // If the user didn't pick, it uses `time` (which might be HH:MM).

            // If we want "real seconds", we should check if the input time matches the current time's HH:MM. 
            // If so, use current seconds. 
            // OTHERWISE, we default to 00.

            const now = new Date();
            const currentSeconds = now.getSeconds();
            const isCurrentMinute = (bH === now.getHours() && bM === now.getMinutes());

            // If input matches current time (HH:MM), use current seconds. Otherwise 0.
            const startSeconds = isCurrentMinute ? currentSeconds : 0;

            baseDateObj.setHours(bH || 0, bM || 0, startSeconds, 0);

            for (let i = 0; i < rawAmounts.length; i++) {
                const rawAmt = rawAmounts[i];
                if (!rawAmt) continue;
                const amtVal = this.parseAmount(rawAmt);
                if (amtVal <= 0) continue;

                // Adjust time by i seconds
                const currentDescDate = new Date(baseDateObj.getTime() + i * 1000);
                const cHours = String(currentDescDate.getHours()).padStart(2, '0');
                const cMinutes = String(currentDescDate.getMinutes()).padStart(2, '0');
                const cSeconds = String(currentDescDate.getSeconds()).padStart(2, '0');
                // Standard time format is HH:MM or HH:MM:SS
                const timeWithSeconds = `${cHours}:${cMinutes}:${cSeconds}`;

                const txnData: Partial<TransactionFrontmatter> = {
                    date: dateInput.value || date,
                    time: timeWithSeconds,
                    amount: amtVal,
                    discount: type === "还款" ? discount : 0,
                    refund: type === "支出" ? refund : 0,
                    refund_to: type === "支出" ? refundTo : "",
                    txn_type: type,
                    category,
                    from,
                    to,
                    payee,
                    memo,
                    persons: personsArray,
                    address,
                    latitude,
                    longitude
                };

                if (i === 0 && this.file) {
                    await this.service.updateTransaction(this.file, txnData);
                } else {
                    const newFile = await this.service.createTransaction();
                    await this.service.updateTransaction(newFile, txnData);
                }
                savedCount++;
            }

            this.isSaved = true;
            this.onSave?.();
            this.close();
            if (savedCount > 1) {
                new Notice(`成功保存 ${savedCount} 条交易`);
            }
        };



        const syncTypeState = () => {
            typeButtons.forEach((btn, key) => {
                btn.toggleClass("is-active", key === type);
            });
            renderCategoryGrid();
            updateTopHelperChips();
            refreshSummary();
        };

        const refreshSummary = () => {
            const summaryParts: string[] = [];

            // 摘要显示逻辑优化
            if (type === "支出" && from) summaryParts.push(`从 ${from} 支付`);
            if (type === "收入" && to) summaryParts.push(`存入 ${to}`);
            if ((type === "转账" || type === "还款") && from && to) summaryParts.push(`${from} -> ${to}`);

            if (payee && type !== "转账") summaryParts.push(payee);
            if (personsStr.trim()) summaryParts.push(`标签：${personsStr}`);

            summary.setText(summaryParts.length > 0 ? summaryParts.join(" · ") : "完善信息后在此处预览");
            updateTopHelperChips();
        };

        syncTypeState();
        syncCategoryState();
        refreshSummary();

        // Header actions (Open File) moved to top


        window.setTimeout(() => amountInput.focus(), 0);
    }

    onClose() {
        this.modalEl.removeClass("cost-add-txn-modal");
        this.contentEl.empty();
        // Remove header actions if any
        this.modalEl.findAll(".cost-modal-header-actions").forEach(el => el.remove());

        // 核心改动：如果是新建交易且没有保存，则删除该临时文件
        if (this.isNewTransaction && !this.isSaved && this.file) {
            this.app.vault.delete(this.file).catch(err => {
                console.error("[Obsidian Cost] Failed to cleanup unsaved transaction file:", err);
            });
        }
    }

    private collectCategoryGroups(type: TxnType): CategoryGroup[] {
        const txCategories = this.service
            .getTransactions()
            .filter(t => t.txnType === type)
            .map((t) => t.category)
            .filter((c): c is string => Boolean(c && c.trim() !== ""))
            .map((c) => c.trim());

        if (txCategories.length === 0) {
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
                    { primary: "借款", selectableSelf: true, children: [] },
                    { primary: "其他", selectableSelf: true, children: [] }
                ];
            }
            // Default Expenses or fallback
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

    private getCategoryImagePath(category: string): string | null {
        if (!this.customIconPath?.trim()) return null;

        const distinctNames = new Set<string>();
        // 1. Raw name (e.g. "Food/Lunch")
        distinctNames.add(category);

        // 2. Dash-separated name (e.g. "Food-Lunch")
        const cleanName = category.replace(/\//g, "-");
        distinctNames.add(cleanName);

        // 3. Leaf name (e.g. "Lunch")
        const parts = category.split("/");
        if (parts.length > 0) distinctNames.add(parts[parts.length - 1]!);

        // 4. Parent name (e.g. "Food")
        if (parts.length > 1) distinctNames.add(parts[0]!);

        // Prepare candidate base paths
        const basePaths = new Set<string>();
        // Add root custom path
        basePaths.add(this.customIconPath);

        // Add variations with "icons" or "Icons" if custom path ends with neither or one
        // Better: explicitly check subfolders "icons", "Icons", "transactions", "Transactions" inside customIconPath
        // And check variations of customIconPath itself (case sensitivity issue on some file systems or manual entry)

        // If user set "Finance/icons", also try "Finance/Icons"
        if (this.customIconPath.includes("icons")) {
            basePaths.add(this.customIconPath.replace("icons", "Icons"));
        } else if (this.customIconPath.includes("Icons")) {
            basePaths.add(this.customIconPath.replace("Icons", "icons"));
        }

        // Add specific subdirectories for organization
        // The user showed structure: icons/transactions/...
        // So we should look into: customIconPath/transactions/

        // We will build a list of "search roots"
        const searchRoots = Array.from(basePaths);
        // Add subfolders to search roots
        const subfolders = ["transactions", "Transactions", "icons", "Icons"];

        const allSearchPaths = new Set<string>(searchRoots);

        for (const root of searchRoots) {
            for (const sub of subfolders) {
                allSearchPaths.add(`${root}/${sub}`);
            }
        }

        const extensions = ["png", "jpg", "jpeg", "svg", "webp", "gif"];

        for (const basePath of allSearchPaths) {
            for (const name of distinctNames) {
                if (!name) continue;
                for (const ext of extensions) {
                    // Normalize path handles separators
                    const path = normalizePath(`${basePath}/${name}.${ext}`);
                    const file = this.app.vault.getAbstractFileByPath(path);
                    if (file instanceof TFile) {
                        return this.app.vault.getResourcePath(file);
                    }
                }
            }
        }
        return null;
    }

    private createFieldInput(container: HTMLElement, label: string, value: string, onInput: (value: string) => void): HTMLInputElement {
        const field = container.createDiv({ cls: "cost-add-txn-field" });
        field.createEl("label", { text: label, cls: "cost-add-txn-field-label" });
        const input = field.createEl("input", {
            cls: "cost-add-txn-field-input",
            attr: { type: "text" }
        });
        input.value = value;
        input.oninput = () => onInput(input.value);
        return input;
    }

    private parseAmount(raw: string): number {
        const normalized = raw.replace(/,/g, "").trim();
        if (!normalized) return 0;
        const parsed = Number(normalized);
        return Number.isFinite(parsed) ? parsed : 0;
    }

    private getTodayDate(): string {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, "0");
        const day = String(now.getDate()).padStart(2, "0");
        return `${year}-${month}-${day}`;
    }

    private getCurrentTime(): string {
        const now = new Date();
        return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
    }

    private normalizeTime(value: string): string {
        const v = value.trim();
        if (!v) return "00:00";
        return v.length === 5 ? `${v}:00` : v;
    }

    private getCategoryIcon(category: string): string {
        const key = category.toLowerCase();

        // 餐饮/食品
        if (key.includes("餐") || key.includes("food") || key.includes("饭") || key.includes("吃") || key.includes("喝")) return "utensils-crossed";

        // 交通/车辆
        if (key.includes("交") || key.includes("车") || key.includes("travel") || key.includes("路") || key.includes("油")) return "bus";

        // 购物/消费/代买
        if (key.includes("购") || key.includes("shop") || key.includes("买") || key.includes("物")) return "shopping-bag";

        // 娱乐/游戏
        if (key.includes("娱") || key.includes("play") || key.includes("游") || key.includes("玩")) return "gamepad-2";

        // 医疗/健康/药
        if (key.includes("医") || key.includes("health") || key.includes("药")) return "heart-pulse";

        // 学习/书籍/科研/教育
        if (key.includes("学") || key.includes("book") || key.includes("研") || key.includes("教") || key.includes("课")) return "book-open";

        // 居住/房屋/住房
        if (key.includes("房") || key.includes("居") || key.includes("home") || key.includes("住")) return "house";

        // 收入/工资/奖金/红包/收回
        if (key.includes("收") || key.includes("income") || key.includes("薪") || key.includes("资") || key.includes("奖")) return "badge-dollar-sign";
        if (key.includes("红包") || key.includes("礼")) return "gift";

        // 办公/工作
        if (key.includes("办") || key.includes("公") || key.includes("work")) return "briefcase";

        // 服饰/衣服
        if (key.includes("服") || key.includes("衣") || key.includes("饰") || key.includes("cloth")) return "shirt";

        // 快递/物流
        if (key.includes("快") || key.includes("递") || key.includes("邮")) return "truck";

        // 通讯/电话
        if (key.includes("通") || key.includes("话") || key.includes("phone")) return "phone";

        // 网络/服务器/软件/应用
        if (key.includes("网") || key.includes("net") || key.includes("server") || key.includes("软") || key.includes("app") || key.includes("应用")) return "app-window";

        // 日用/生活/人生
        if (key.includes("日") || key.includes("用") || key.includes("杂") || key.includes("daily") || key.includes("生") || key.includes("人") || key.includes("life")) return "sun";

        // 度假/旅游
        if (key.includes("度") || key.includes("假") || key.includes("holiday")) return "palmtree";

        // 订阅
        if (key.includes("订") || key.includes("阅") || key.includes("sub")) return "calendar-clock";

        // 转账
        if (key.includes("转") || key.includes("transfer")) return "arrow-right-left";

        // 还款/信贷/分期
        if (key.includes("还") || key.includes("贷") || key.includes("credit") || key.includes("分期")) return "credit-card";

        // 出售/闲置/标签
        if (key.includes("售") || key.includes("卖") || key.includes("sale") || key.includes("闲") || key.includes("tag")) return "tag";

        // 对齐/调整
        if (key.includes("对") || key.includes("齐") || key.includes("align")) return "git-merge";

        // 其他
        if (key.includes("他") || key.includes("other")) return "box-select";

        return "circle";
    }

    private getCategoryColor(category: string): string {
        const palette = [
            "#ffe6e6",
            "#ffefe0",
            "#fff6d8",
            "#e7f7e7",
            "#e4f4ff",
            "#efe9ff",
            "#f6e9ff",
            "#eaf3f3"
        ];

        let hash = 0;
        for (let i = 0; i < category.length; i += 1) {
            hash = (hash * 31 + category.charCodeAt(i)) >>> 0;
        }
        const color = palette[hash % palette.length];
        return color ?? "#eaf3f3";
    }
}

class AccountPickerModal extends FuzzySuggestModal<AccountInfo> {
    private iconPath: string;
    private accounts: AccountInfo[];
    private onChoose: (item: AccountInfo) => void;

    constructor(app: App, items: AccountInfo[], iconPath: string, onChoose: (item: AccountInfo) => void) {
        super(app);
        this.accounts = items;
        this.iconPath = iconPath;
        this.onChoose = onChoose;
    }

    onChooseItem(item: AccountInfo, evt: MouseEvent | KeyboardEvent): void {
        this.onChoose(item);
    }

    getItems(): AccountInfo[] {
        return this.accounts;
    }

    getItemText(item: AccountInfo): string {
        return item.displayName || item.fileName;
    }

    renderSuggestion(item: any, el: HTMLElement) {
        super.renderSuggestion(item, el);
        // Prepend icon
        const acc = item.item as AccountInfo;

        // Try to resolve icon path
        let iconSrc: string | null = null;

        // 1. Check if icon is defined in frontmatter
        if (acc.icon) {
            // If it's a full path or link
            const display = acc.icon.replace(/\[\[|\]\]/g, "");
            // normalize
            const path = normalizePath(display);
            // check if file exists
            // but `iconPath` might be relative to vault root so let's try to find it
            // If user uses [[Icon.png]], obsidian resolves it relative to note usually.

            // Simplest: Check if file exists at `iconPath +/accounts/ + name`
        }

        // 2. Check conventions: customIconPath/accounts/Name.png
        if (!iconSrc && this.iconPath) {
            const extensions = ["png", "jpg", "jpeg", "svg", "webp"];
            const name = acc.fileName;

            for (const ext of extensions) {
                const p = normalizePath(`${this.iconPath}/accounts/${name}.${ext}`);
                const f = this.app.vault.getAbstractFileByPath(p);
                if (f instanceof TFile) {
                    iconSrc = this.app.vault.getResourcePath(f);
                    break;
                }
            }
        }

        const iconEl = createDiv({ cls: "cost-account-picker-icon" });
        iconEl.style.width = "20px";
        iconEl.style.height = "20px";
        iconEl.style.marginRight = "8px";
        iconEl.style.display = "inline-flex";
        iconEl.style.alignItems = "center";
        iconEl.style.justifyContent = "center";

        if (iconSrc) {
            const img = iconEl.createEl("img");
            img.src = iconSrc;
            img.style.width = "100%";
            img.style.height = "100%";
            img.style.objectFit = "contain";
        } else {
            setIcon(iconEl, "wallet");
            const svg = iconEl.querySelector("svg");
            if (svg) { svg.style.width = "16px"; svg.style.height = "16px"; }
        }

        el.prepend(iconEl);
        el.style.display = "flex";
        el.style.alignItems = "center";
    }
}
