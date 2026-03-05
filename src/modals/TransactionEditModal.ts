import { App, Modal, TFile, setIcon, Menu, Notice } from "obsidian";
import { TransactionInfo, TransactionService } from "../services/transactionService";
import { AccountService } from "../services/accountService";
import { TransactionFrontmatter, AccountInfo } from "../types";
import CostPlugin from "../main";
import { TxnType, TYPE_OPTIONS, collectCategoryGroups, getCategoryIcon, getCategoryColor } from "../utils/categoryUtils";
import { reverseGeocode, fallbackToIP, fetchNearbyPOIs, buildAddressOptions, getDeviceCoordinates } from "../services/locationService";

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

        // --- Custom Header Layout ---
        titleEl.empty();
        titleEl.addClass("cost-modal-header");

        const titleText = titleEl.createDiv({
            text: this.isNewTransaction ? "新建交易" : "编辑交易",
            cls: "cost-modal-title-text"
        });

        const typeTabsChanged = titleEl.createDiv({ cls: "cost-add-txn-type-tabs" });

        const typeButtons = new Map<TxnType, HTMLButtonElement>();

        const headerActions = titleEl.createDiv({ cls: "cost-modal-header-actions-inline" });

        const openFileBtn = headerActions.createEl("button", {
            cls: "clickable-icon",
            attr: { "aria-label": "打开源文件" }
        });
        setIcon(openFileBtn, "file-text");
        openFileBtn.onclick = () => {
            this.app.workspace.getLeaf(true).openFile(this.file);
            this.close();
        };

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

        TYPE_OPTIONS.forEach((opt) => {
            const btn = typeTabsChanged.createEl("button", {
                cls: "cost-add-txn-type-btn",
                text: opt.label,
                attr: { type: "button" }
            });

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

                if (active) {
                    btn.style.opacity = "1";
                } else {
                    btn.style.opacity = category ? "0.6" : "1";
                }
            });
            categoryTitleEl.setText(`选择分类：${category}`);
        };

        const renderCategoryGrid = () => {
            categoryGrid.empty();
            categoryButtons.clear();
            const categoryGroups = collectCategoryGroups(this.service.getTransactions(), type);

            if (categoryGroups.length === 0) {
                categoryGrid.createDiv({ text: "无可用分类", cls: "cost-add-txn-empty-cat" });
            }

            categoryGroups.forEach((group) => {
                const cat = group.primary;
                const btn = categoryGrid.createEl("button", {
                    cls: "cost-add-txn-category-item",
                    attr: { type: "button", title: cat }
                });

                const iconCircle = btn.createDiv({ cls: "cost-add-txn-category-icon" });
                iconCircle.style.background = getCategoryColor(cat);

                const iconPath = this.plugin.iconResolver.resolveCategoryIcon(cat);
                if (iconPath) {
                    const img = iconCircle.createEl("img", { cls: "cost-add-txn-category-icon-img" });
                    img.src = iconPath;
                    img.alt = cat;
                } else {
                    const iconName = getCategoryIcon(cat);
                    setIcon(iconCircle, iconName);
                }

                btn.createDiv({ cls: "cost-add-txn-category-label", text: cat });

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

                    group.children.forEach((child: string) => {
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

            const addBtn = categoryGrid.createEl("button", {
                cls: "cost-add-txn-category-item",
                attr: { type: "button", title: "添加新分类" }
            });
            const addIconCircle = addBtn.createDiv({ cls: "cost-add-txn-category-icon cost-add-txn-category-add-icon" });
            setIcon(addIconCircle, "plus");

            addBtn.createDiv({ cls: "cost-add-txn-category-label", text: "添加" });

            addBtn.onclick = async () => {
                const promptModal = new Modal(this.app);
                promptModal.titleEl.setText(`添加${type}分类`);
                const inputEl = promptModal.contentEl.createEl("input", {
                    type: "text",
                    cls: "cost-prompt-input",
                    placeholder: "输入分类名称"
                });
                inputEl.focus();

                const btnContainer = promptModal.contentEl.createDiv({ cls: "cost-prompt-buttons" });
                const cancelBtn = btnContainer.createEl("button", { text: "取消" });
                cancelBtn.onclick = () => promptModal.close();
                const confirmBtn = btnContainer.createEl("button", { text: "确定", cls: "mod-cta" });

                const save = async () => {
                    const newCat = inputEl.value.trim();
                    if (!newCat) return;

                    if (type === "支出") {
                        if (!this.plugin.settings.expenseCategories.includes(newCat)) {
                            this.plugin.settings.expenseCategories.push(newCat);
                        }
                    } else if (type === "收入") {
                        if (!this.plugin.settings.incomeCategories.includes(newCat)) {
                            this.plugin.settings.incomeCategories.push(newCat);
                        }
                    } else {
                        if (!this.plugin.settings.expenseCategories.includes(newCat)) {
                            this.plugin.settings.expenseCategories.push(newCat);
                        }
                    }
                    await this.plugin.saveSettings();

                    category = newCat;
                    promptModal.close();
                    renderCategoryGrid();
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
            return { chip, textSpan };
        };

        const showAccountMenu = (anchor: HTMLElement, onSelect: (acc: AccountInfo) => void) => {
            const accounts = this.accountService.getAccounts();
            if (accounts.length === 0) {
                new Notice("没有可选账户");
                return;
            }

            const menuEl = document.body.createDiv({ cls: "menu cost-account-dropdown-menu" });
            const rect = anchor.getBoundingClientRect();
            menuEl.style.left = `${rect.left}px`;
            menuEl.style.top = `${rect.bottom + 4}px`;

            const closeMenu = () => {
                menuEl.remove();
                document.removeEventListener("click", outsideClickListener);
            };
            const outsideClickListener = (e: MouseEvent) => {
                if (!menuEl.contains(e.target as Node) && e.target !== anchor && !anchor.contains(e.target as Node)) {
                    closeMenu();
                }
            };
            setTimeout(() => document.addEventListener("click", outsideClickListener), 0);

            accounts.forEach(acc => {
                const itemEl = menuEl.createDiv({ cls: "menu-item" });
                const iconContainer = itemEl.createDiv({ cls: "menu-item-icon" });
                const iconSrc = this.plugin.iconResolver.resolveAccountIcon(acc);

                if (iconSrc) {
                    const img = iconContainer.createEl("img");
                    img.src = iconSrc;
                } else {
                    setIcon(iconContainer, "wallet");
                }

                itemEl.createDiv({ cls: "menu-item-title", text: acc.displayName || acc.fileName });

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

        // 3. Payee Chip
        const payeeChip = createHelperChip("store", "商家", () => {
            const promptModal = new Modal(this.app);
            promptModal.titleEl.setText("商家/收款人");
            const inputEl = promptModal.contentEl.createEl("input", {
                type: "text",
                cls: "cost-prompt-input",
                attr: { placeholder: "输入商家或收款人名称" }
            });
            inputEl.value = payee;
            inputEl.focus();

            const btnContainer = promptModal.contentEl.createDiv({ cls: "cost-prompt-buttons" });
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

        // 4. Discount Chip
        const discountChip = createHelperChip("ticket", "优惠", () => {
            if (type !== "还款" && type !== "支出") return;

            const isRefund = type === "支出";
            const currentVal = isRefund ? refund : discount;
            const title = isRefund ? "输入退款金额" : "输入优惠金额";

            const promptModal = new Modal(this.app);
            promptModal.titleEl.setText(title);
            promptModal.contentEl.createEl("p", { text: "请输入金额：" });

            const inputEl = promptModal.contentEl.createEl("input", {
                type: "number",
                cls: "cost-prompt-input"
            });
            inputEl.value = currentVal > 0 ? String(currentVal) : "";
            inputEl.focus();

            const btnContainer = promptModal.contentEl.createDiv({ cls: "cost-prompt-buttons" });
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
            const showSource = type === "支出" || type === "转账" || type === "还款";
            sourceAccountChip.chip.style.display = showSource ? "flex" : "none";

            let sourceLabel = "账户";
            if (type === "支出") sourceLabel = "支付账户";
            if (type === "转账") sourceLabel = "转出账户";
            if (type === "还款") sourceLabel = "付款账户";

            sourceAccountChip.textSpan.setText(from || sourceLabel);
            sourceAccountChip.chip.toggleClass("has-value", Boolean(from));

            const showTarget = type === "收入" || type === "转账" || type === "还款";
            targetAccountChip.chip.style.display = showTarget ? "flex" : "none";

            let targetLabel = "账户";
            if (type === "收入") targetLabel = "入账账户";
            if (type === "转账") targetLabel = "转入账户";
            if (type === "还款") targetLabel = "还款目标";

            targetAccountChip.textSpan.setText(to || targetLabel);
            targetAccountChip.chip.toggleClass("has-value", Boolean(to));

            payeeChip.textSpan.setText(payee || "商家");
            payeeChip.chip.toggleClass("has-value", Boolean(payee));
            payeeChip.chip.style.display = (type === "转账") ? "none" : "flex";

            tagsChip.chip.toggleClass("has-value", Boolean(personsStr && personsStr.length > 0));

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

        const fetchLocation = async () => {
            addressBtn.addClass("is-loading");
            addressText.setText("定位中...");

            const coords = await getDeviceCoordinates();

            if (coords) {
                latitude = coords.lat;
                longitude = coords.lng;

                const [geocoded, nearbyPois] = await Promise.all([
                    reverseGeocode(coords.lat, coords.lng),
                    fetchNearbyPOIs(coords.lat, coords.lng)
                ]);

                addressBtn.removeClass("is-loading");

                const options = buildAddressOptions(geocoded, nearbyPois);

                if (options.length <= 1) {
                    address = geocoded || `${coords.lat.toFixed(6)}, ${coords.lng.toFixed(6)}`;
                    addressText.setText(geocoded ? address : "已获取坐标");
                    if (geocoded) new Notice("已定位: " + address);
                    return;
                }

                // 多个选项：弹出选择菜单
                const menu = new Menu();
                menu.addItem(item => item.setTitle("📍 选择您的位置").setDisabled(true));
                menu.addSeparator();

                options.forEach((opt, idx) => {
                    menu.addItem(item => {
                        const title = idx === 0 ? `📌 ${opt}` : `📎 ${opt}`;
                        item.setTitle(title).onClick(() => {
                            address = opt;
                            addressText.setText(address);
                            new Notice("已选择: " + address);
                        });
                    });
                });

                menu.addSeparator();
                menu.addItem(item => item
                    .setTitle("✏️ 手动输入地址")
                    .onClick(() => {
                        const promptModal = new Modal(this.app);
                        promptModal.titleEl.setText("输入地址");
                        const inputEl = promptModal.contentEl.createEl("input", {
                            type: "text",
                            cls: "cost-prompt-input",
                            attr: { placeholder: "输入具体地址" }
                        });
                        inputEl.value = address;
                        inputEl.focus();

                        const btnContainer = promptModal.contentEl.createDiv({ cls: "cost-prompt-buttons" });
                        btnContainer.createEl("button", { text: "取消" }).onclick = () => promptModal.close();
                        const confirmBtn = btnContainer.createEl("button", { text: "确定", cls: "mod-cta" });
                        confirmBtn.onclick = () => {
                            address = inputEl.value.trim();
                            addressText.setText(address || "定位");
                            promptModal.close();
                        };
                        inputEl.onkeydown = (e) => { if (e.key === "Enter") confirmBtn.click(); };
                        promptModal.open();
                    })
                );

                const rect = addressBtn.getBoundingClientRect();
                menu.showAtPosition({ x: rect.left, y: rect.bottom + 4 });

                address = options[0] || "";
                addressText.setText(address);
            } else {
                // 坐标获取失败，回退到 IP 定位
                const ipResult = await fallbackToIP();
                if (ipResult.address) {
                    address = ipResult.address;
                    if (ipResult.coords) {
                        latitude = ipResult.coords.lat;
                        longitude = ipResult.coords.lng;
                    }
                    new Notice("已通过网络定位: " + address);
                    addressText.setText(address);
                } else {
                    new Notice("定位完全失败");
                    addressText.setText("定位失败");
                }
                addressBtn.removeClass("is-loading");
            }
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
        const timeText = timePill.createSpan({ text: this.normalizeTime(time || "00:00:00") });

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
            attr: { type: "time", step: "1" }
        });
        timeInput.value = this.normalizeTime(time || "00:00:00");
        timeInput.onchange = () => {
            time = this.normalizeTime(timeInput.value);
            timeText.setText(time);
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
            const baseTimeStr = this.normalizeTime(timeInput.value || time);
            const [bH, bM, bS] = baseTimeStr.split(":").map(Number);
            const baseDateObj = new Date(dateInput.value || date);
            const [y, m, d] = (dateInput.value || date).split("-").map(Number);
            if (y && m !== undefined && d !== undefined) {
                baseDateObj.setFullYear(y, m - 1, d);
            }

            baseDateObj.setHours(bH || 0, bM || 0, bS || 0, 0);

            for (let i = 0; i < rawAmounts.length; i++) {
                const rawAmt = rawAmounts[i];
                if (!rawAmt) continue;
                const amtVal = this.parseAmount(rawAmt);
                if (amtVal <= 0) continue;

                const currentDescDate = new Date(baseDateObj.getTime() + i * 1000);
                const cHours = String(currentDescDate.getHours()).padStart(2, '0');
                const cMinutes = String(currentDescDate.getMinutes()).padStart(2, '0');
                const cSeconds = String(currentDescDate.getSeconds()).padStart(2, '0');
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
                    const newDateStr = dateInput.value || date;
                    this.file = await this.service.moveTransactionToDateFolder(this.file, newDateStr);
                } else {
                    const newFile = await this.service.createTransaction();
                    await this.service.updateTransaction(newFile, txnData);
                    const newDateStr = dateInput.value || date;
                    await this.service.moveTransactionToDateFolder(newFile, newDateStr);
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

        window.setTimeout(() => amountInput.focus(), 0);
    }

    onClose() {
        this.modalEl.removeClass("cost-add-txn-modal");
        this.contentEl.empty();
        this.modalEl.findAll(".cost-modal-header-actions").forEach(el => el.remove());

        if (this.isNewTransaction && !this.isSaved && this.file) {
            this.app.vault.delete(this.file).catch(err => {
                console.error("[Obsidian Cost] Failed to cleanup unsaved transaction file:", err);
            });
        }
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
        return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}:${String(now.getSeconds()).padStart(2, "0")}`;
    }

    private normalizeTime(value: string): string {
        const v = value.trim();
        if (!v) return "00:00:00";
        if (v.length === 5 && v[2] === ":") return `${v}:00`;
        return v;
    }
}
