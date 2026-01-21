import { App, Modal, Setting, Notice, TFile } from "obsidian";
import { TransactionService } from "../services/transactionService";

export class BatchEditModal extends Modal {
    // app matches Modal.app
    private service: TransactionService;
    private filePaths: string[];
    private onComplete: () => void;

    private updates: {
        date?: string;
        txnType?: string;
        category?: string;
        account?: string; // Currently complicate as it involves from/to. Let's stick to "fromAccount" usually or just "account" if typical expense.
        payee?: string;
        note?: string;
    } = {};

    private enabledFields: {
        date: boolean;
        txnType: boolean;
        category: boolean;
        payee: boolean;
        note: boolean;
    } = {
            date: false,
            txnType: false,
            category: false,
            payee: false,
            note: false
        };

    constructor(app: App, service: TransactionService, filePaths: string[], onComplete: () => void) {
        super(app);
        this.app = app;
        this.service = service;
        this.filePaths = filePaths;
        this.onComplete = onComplete;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.createEl("h2", { text: `批量修改 (${this.filePaths.length} 笔交易)` });

        const container = contentEl.createDiv({ cls: "cost-batch-edit-form" });

        // Date
        let dateInput: any;
        new Setting(container)
            .setName("日期")
            .setDesc("启用以修改日期")
            .addToggle(t => t.setValue(false).onChange(v => {
                this.enabledFields.date = v;
                if (dateInput) dateInput.setDisabled(!v);
            }))
            .addText(t => {
                dateInput = t; // Store ref
                t.inputEl.type = "date"; // Fix setType error by accessing inputEl directly
                t.setDisabled(true);
                t.onChange(v => this.updates.date = v);
            });

        // Type
        let typeDropdown: any;
        new Setting(container)
            .setName("类型")
            .setDesc("启用以修改交易类型")
            .addToggle(t => t.setValue(false).onChange(v => {
                this.enabledFields.txnType = v;
                if (typeDropdown) typeDropdown.setDisabled(!v);
            }))
            .addDropdown(d => {
                typeDropdown = d;
                d.addOption("支出", "支出");
                d.addOption("收入", "收入");
                d.addOption("转账", "转账");
                d.addOption("还款", "还款");
                d.setDisabled(true);
                d.onChange(v => this.updates.txnType = v);
            });

        // Category
        let catInput: any;
        new Setting(container)
            .setName("分类")
            .setDesc("启用以修改分类")
            .addToggle(t => t.setValue(false).onChange(v => {
                this.enabledFields.category = v;
                if (catInput) catInput.setDisabled(!v);
            }))
            .addText(t => {
                catInput = t;
                t.setPlaceholder("输入分类 (如: 餐饮/早餐)");
                t.setDisabled(true);
                t.onChange(v => this.updates.category = v);
            });

        // Payee
        let payeeInput: any;
        new Setting(container)
            .setName("交易对象/商户")
            .addToggle(t => t.setValue(false).onChange(v => {
                this.enabledFields.payee = v;
                if (payeeInput) payeeInput.setDisabled(!v);
            }))
            .addText(t => {
                payeeInput = t;
                t.setPlaceholder("输入交易对象");
                t.setDisabled(true);
                t.onChange(v => this.updates.payee = v);
            });

        // Note
        let noteInput: any;
        new Setting(container)
            .setName("备注")
            .addToggle(t => t.setValue(false).onChange(v => {
                this.enabledFields.note = v;
                if (noteInput) noteInput.setDisabled(!v);
            }))
            .addText(t => {
                noteInput = t;
                t.setPlaceholder("输入备注");
                t.setDisabled(true);
                t.onChange(v => this.updates.note = v);
            });

        // Buttons
        const buttonContainer = contentEl.createDiv({ cls: "cost-modal-buttons" });
        const saveBtn = buttonContainer.createEl("button", { text: "应用修改", cls: "mod-cta" });
        saveBtn.onclick = async () => {
            await this.applyChanges();
            this.close();
            this.onComplete();
        };

        const cancelBtn = buttonContainer.createEl("button", { text: "取消" });
        cancelBtn.onclick = () => this.close();
    }

    private async applyChanges() {
        if (!this.enabledFields.date && !this.enabledFields.txnType && !this.enabledFields.category && !this.enabledFields.payee && !this.enabledFields.note) {
            new Notice("未选择任何要修改的字段");
            return;
        }

        let successCount = 0;
        new Notice(`正在更新 ${this.filePaths.length} 个文件...`);

        for (const path of this.filePaths) {
            const file = this.app.vault.getAbstractFileByPath(path);
            if (file && file instanceof TFile) {
                try {
                    await this.app.fileManager.processFrontMatter(file, (fm) => {
                        if (this.enabledFields.date && this.updates.date) fm.date = this.updates.date;
                        if (this.enabledFields.txnType && this.updates.txnType) fm.txnType = this.updates.txnType;
                        if (this.enabledFields.category && this.updates.category !== undefined) fm.category = this.updates.category;
                        if (this.enabledFields.payee && this.updates.payee !== undefined) fm.payee = this.updates.payee;
                        if (this.enabledFields.note && this.updates.note !== undefined) fm.note = this.updates.note;
                    });
                    successCount++;
                } catch (e) {
                    console.error(`Failed to update ${path}:`, e);
                }
            }
        }

        new Notice(`成功批量修改 ${successCount} 笔交易`);
    }

    onClose() {
        this.contentEl.empty();
    }
}
