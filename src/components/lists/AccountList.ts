import { App } from "obsidian";
import { BaseComponent } from '../BaseComponent';
import { AccountInfo } from '../../types';
import { TransactionService } from '../../services/transactionService';
import { formatThousands } from '../../utils/format';

export interface AccountListOptions {
    onAccountClick?: (account: AccountInfo) => void;
    selectedAccount?: AccountInfo | null;
}

export class AccountList extends BaseComponent {
    private app: App;
    private accounts: AccountInfo[];
    private options: AccountListOptions;
    private transactionCounts: Map<string, number>;
    private balances: Map<string, number>;

    constructor(
        containerEl: HTMLElement,
        app: App,
        accounts: AccountInfo[],
        transactionCounts: Map<string, number>,
        balances: Map<string, number>,
        options: AccountListOptions = {}
    ) {
        super(containerEl);
        this.app = app;
        this.accounts = accounts;
        this.transactionCounts = transactionCounts;
        this.balances = balances;
        this.options = options;
    }

    protected render(): void {
        const container = this.containerEl;

        // Group Accounts
        const grouped = this.groupAccountsByKind(this.accounts);
        const order = ["bank", "credit", "wallet", "cash", "prepaid", "investment", "other"];
        const names: Record<string, string> = {
            "bank": "银行卡", "credit": "信用卡", "wallet": "电子钱包",
            "cash": "现金", "investment": "投资账户", "prepaid": "预付卡", "other": "其他"
        };

        const list = container.createDiv({ cls: "cost-accounts-col-list" });

        for (const kind of order) {
            if (grouped.has(kind)) {
                this.renderGroup(list, kind, names[kind] || kind, grouped.get(kind)!);
            }
        }

        // Render others
        for (const [kind, accs] of grouped) {
            if (!order.includes(kind)) {
                this.renderGroup(list, kind, names[kind] || kind, accs);
            }
        }
    }

    private renderGroup(container: HTMLElement, kind: string, kindName: string, accounts: AccountInfo[]): void {
        const groupEl = container.createDiv({ cls: "cost-account-group" });

        // Header
        const header = groupEl.createDiv({ cls: "cost-account-group-header" });
        header.createSpan({ cls: "cost-account-group-name", text: kindName });

        let total = 0;
        accounts.forEach(a => total += (this.balances.get(a.fileName) || 0));

        // Normalize -0
        if (Math.abs(total) < 0.000001) total = 0;

        const totalEl = header.createSpan({ cls: "cost-account-group-total", text: formatThousands(total, 2) });
        if (total >= 0) totalEl.addClass("cost-balance-positive");
        else totalEl.addClass("cost-balance-negative");

        // List
        const listEl = groupEl.createDiv({ cls: "cost-account-group-list" });
        for (const acc of accounts) {
            this.renderItem(listEl, acc);
        }
    }

    private renderItem(container: HTMLElement, account: AccountInfo): void {
        const isSelected = this.options.selectedAccount?.fileName === account.fileName;
        const item = container.createDiv({ cls: `cost-account-list-item ${isSelected ? "is-selected" : ""}` });

        // Icon
        const iconEl = item.createDiv({ cls: "cost-account-list-icon" });
        this.renderAccountIcon(iconEl, account);

        const info = item.createDiv({ cls: "cost-account-list-info" });
        info.createDiv({ cls: "cost-account-list-name", text: account.displayName });

        const count = this.transactionCounts.get(account.fileName) || 0;
        info.createDiv({ cls: "cost-account-list-count", text: `${count} 笔交易` });

        let bal = this.balances.get(account.fileName) || 0;
        // Normalize -0 to 0 to avoid negative styling
        if (Math.abs(bal) < 0.000001) bal = 0;

        const balEl = item.createDiv({ cls: "cost-account-list-balance", text: formatThousands(bal, 2) });
        if (bal >= 0) balEl.addClass("cost-balance-positive");
        else balEl.addClass("cost-balance-negative");

        item.addEventListener("click", () => {
            this.options.onAccountClick?.(account);
        });
    }

    private renderAccountIcon(container: HTMLElement, account: AccountInfo): void {
        const icon = account.icon;
        if (icon) {
            const match = icon.match(/\[\[(.+?)\]\]/);
            if (match && match[1]) {
                const fileName = match[1];
                const imageFile = this.app.metadataCache.getFirstLinkpathDest(fileName, "");
                if (imageFile) {
                    const resourcePath = this.app.vault.getResourcePath(imageFile);
                    const img = container.createEl("img", { cls: "cost-account-custom-icon-img" });
                    img.src = resourcePath;
                    return;
                }
            } else if (!icon.includes("[[")) {
                container.setText(icon);
                return;
            }
        }

        const icons: Record<string, string> = {
            "bank": "🏦", "cash": "💵", "credit": "💳", "investment": "📈",
            "wallet": "👛", "prepaid": "🎫", "other": "💰", "alipay": "🔷", "wechat": "🟢"
        };
        container.setText(icons[account.accountKind || "other"] || icons["other"] || "💰");
    }

    private groupAccountsByKind(accounts: AccountInfo[]): Map<string, AccountInfo[]> {
        const map = new Map<string, AccountInfo[]>();
        for (const acc of accounts) {
            const kind = acc.accountKind || "other";
            if (!map.has(kind)) map.set(kind, []);
            map.get(kind)!.push(acc);
        }
        return map;
    }
}
