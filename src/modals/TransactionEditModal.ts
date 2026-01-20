import { App, Modal, Setting, TFile, setIcon, Menu, TextComponent, Notice } from "obsidian";
import { TransactionInfo, TransactionService } from "../services/transactionService";
import { AccountService } from "../services/accountService";
import { TransactionFrontmatter } from "../types";

export class TransactionEditModal extends Modal {
    private txn: TransactionInfo;
    private service: TransactionService;
    private accountService: AccountService;
    private file: TFile;
    private onSave?: () => void;

    constructor(app: App, txn: TransactionInfo, service: TransactionService, accountService: AccountService, onSave?: () => void) {
        super(app);
        this.txn = txn;
        this.service = service;
        this.accountService = accountService;
        this.onSave = onSave;
        const f = this.app.vault.getAbstractFileByPath(txn.path);
        if (f instanceof TFile) this.file = f;
        else throw new Error("Transaction file not found: " + txn.path);
    }


    onOpen() {
        const { contentEl, titleEl } = this;
        titleEl.setText("编辑交易");
        titleEl.addClass("cost-modal-header");

        const headerBtnContainer = titleEl.createDiv({ cls: "cost-modal-header-actions" });
        const fileBtn = headerBtnContainer.createEl("button", { cls: "clickable-icon" });
        setIcon(fileBtn, "file-text");
        fileBtn.title = "打开源文件";
        fileBtn.onclick = (e) => {
            e.stopPropagation();
            this.app.workspace.getLeaf().openFile(this.file);
            this.close();
        };

        // Prepare Data
        const categories = Array.from(new Set(this.service.getTransactions().map(t => t.category).filter(c => c && typeof c === 'string' && c.trim() !== ''))).sort();
        const accounts = this.accountService.getAccounts().map(a => a.fileName);

        let date = this.txn.date;
        let amount = this.txn.amount;
        let type = this.txn.txnType;
        let category = this.txn.category;
        let from = this.txn.from;
        let to = this.txn.to;
        let payee = this.txn.payee;
        let memo = this.txn.memo || this.txn.note;

        new Setting(contentEl)
            .setName("日期")
            .addText(text => text.setValue(date).onChange(v => date = v));

        new Setting(contentEl)
            .setName("金额")
            .addText(text => text.setValue(String(amount)).onChange(v => amount = parseFloat(v)));

        new Setting(contentEl)
            .setName("类型")
            .addDropdown(dd => dd
                .addOption("支出", "支出")
                .addOption("收入", "收入")
                .addOption("转账", "转账")
                .addOption("还款", "还款")
                .setValue(type)
                .onChange(v => type = v as any)
            );

        // Helper to add input with dropdown menu triggering on click
        const addComboInput = (container: HTMLElement, name: string, initialValue: string, options: string[], onChange: (v: string) => void, hierarchical: boolean = false) => {
            const setting = new Setting(container).setName(name);

            const textComp = new TextComponent(setting.controlEl);
            textComp.setValue(initialValue);
            textComp.onChange(onChange);

            // Show menu on click
            textComp.inputEl.onclick = (e) => {
                if (options.length === 0) {
                    new Notice(`没有可选的${name}`);
                    return;
                }

                const menu = new Menu();

                if (hierarchical) {
                    // Build Tree
                    interface CategoryNode {
                        name: string;
                        fullName: string;
                        children: Map<string, CategoryNode>;
                        isSelectable: boolean;
                    }

                    const root = new Map<string, CategoryNode>();
                    options.forEach(opt => {
                        const parts = opt.split("/");
                        let currentLevel = root;
                        let currentPath = "";
                        parts.forEach((part, index) => {
                            const isLast = index === parts.length - 1;
                            currentPath = currentPath ? `${currentPath}/${part}` : part;
                            if (!currentLevel.has(part)) {
                                currentLevel.set(part, { name: part, fullName: currentPath, children: new Map(), isSelectable: isLast });
                            } else if (isLast) {
                                currentLevel.get(part)!.isSelectable = true;
                            }
                            currentLevel = currentLevel.get(part)!.children;
                        });
                    });

                    // Recursive Render
                    const renderNode = (m: Menu | any, nodes: CategoryNode[]) => {
                        nodes.sort((a, b) => a.name.localeCompare(b.name));
                        nodes.forEach(node => {
                            m.addItem((item: any) => {
                                item.setTitle(node.name);
                                // Always allow selection
                                item.onClick(() => {
                                    textComp.setValue(node.fullName);
                                    onChange(node.fullName);
                                });

                                if (node.children.size > 0) {
                                    const sub = item.setSubmenu();
                                    renderNode(sub, Array.from(node.children.values()));
                                }
                            });
                        });
                    };

                    renderNode(menu, Array.from(root.values()));
                } else {
                    options.forEach(opt => {
                        menu.addItem(item => item
                            .setTitle(opt)
                            .onClick(() => {
                                textComp.setValue(opt);
                                onChange(opt);
                            })
                        );
                    });
                }

                const rect = textComp.inputEl.getBoundingClientRect();
                menu.showAtPosition({ x: rect.left, y: rect.bottom });
            };
        };

        // Helper for multi-value suggests (append)
        const addMultiComboInput = (container: HTMLElement, name: string, initialValue: string, options: string[], onChange: (v: string) => void) => {
            const setting = new Setting(container).setName(name);
            const textComp = new TextComponent(setting.controlEl);
            textComp.setValue(initialValue);
            textComp.onChange(onChange);

            textComp.inputEl.onclick = (e) => {
                if (options.length === 0) {
                    new Notice(`没有可选的${name}`);
                    return;
                }
                const menu = new Menu();
                options.forEach(opt => {
                    menu.addItem(item => item
                        .setTitle(opt)
                        .onClick(() => {
                            // Logic: if value ends with comma, append. Else replace? 
                            // User wants simple selection. For "Persons", usually distinct.
                            // Let's simplified: If empty, set. If not empty, append ", opt"
                            const current = textComp.getValue().trim();
                            let newValue = opt;
                            if (current) {
                                // Check if already exists to avoid dup
                                const parts = current.split(/[,，]\s*/);
                                if (!parts.includes(opt)) {
                                    newValue = current + ", " + opt;
                                } else {
                                    newValue = current;
                                }
                            }
                            textComp.setValue(newValue);
                            onChange(newValue);
                        })
                    );
                });
                const rect = textComp.inputEl.getBoundingClientRect();
                menu.showAtPosition({ x: rect.left, y: rect.bottom });
            };
        };

        addComboInput(contentEl, "分类", category, categories, (v) => category = v, true);
        addComboInput(contentEl, "来源账户", from, accounts, (v) => from = v);
        addComboInput(contentEl, "目标账户", to, accounts, (v) => to = v);

        new Setting(contentEl)
            .setName("商家/收款人")
            .addText(text => text.setValue(payee).onChange(v => payee = v));

        // Address
        const addresses = Array.from(new Set(this.service.getTransactions().map(t => (t as any).address).filter((c: string) => c && c.trim() !== ''))).sort() as string[];
        addComboInput(contentEl, "地址", this.txn.address || "", addresses, (v) => (this.txn as any).address = v);

        // Persons
        const personsList = Array.from(new Set(this.service.getTransactions().flatMap(t => t.persons || []).filter(c => c && c.trim() !== ''))).sort();
        const initialPersons = (this.txn.persons || []).join(", ");
        // We need a local var for persons string to pass to save
        let personsStr = initialPersons;
        addMultiComboInput(contentEl, "参与人", initialPersons, personsList, (v) => personsStr = v);

        new Setting(contentEl)
            .setName("备注")
            .addTextArea(text => text.setValue(memo).onChange(v => memo = v));

        const btnDiv = contentEl.createDiv({ cls: "cost-modal-buttons" });
        const saveBtn = btnDiv.createEl("button", { text: "保存", cls: "mod-cta" });
        saveBtn.onclick = async () => {
            // Parse persons string to array
            const personsArray = personsStr.split(/[,，]/).map(s => s.trim()).filter(s => s.length > 0);

            await this.service.updateTransaction(this.file, {
                date,
                amount,
                txn_type: type,
                category,
                from,
                to,
                payee,
                memo,
                persons: personsArray,
                address: (this.txn as any).address // we updated this.txn.address directly above via callback, reusing it
            } as any); // cast any for custom fields logic inside updateTransaction
            this.onSave?.();
            this.close();
        };
    }

    onClose() {
        this.contentEl.empty();
    }
}
