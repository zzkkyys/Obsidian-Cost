import { BaseComponent } from '../BaseComponent';
import { TransactionInfo } from '../../services/transactionService';

export class AnnualHeatmapWidget extends BaseComponent {
    private transactions: TransactionInfo[];

    constructor(containerEl: HTMLElement, transactions: TransactionInfo[]) {
        super(containerEl);
        this.transactions = transactions;
    }

    protected render(): void {
        const container = this.containerEl;
        container.addClass("cost-heatmap-widget");
        container.createEl("h3", { text: "年度消费热力图", cls: "cost-card-title" });

        const now = new Date();
        const year = now.getFullYear();

        // Data Map
        const dataMap = new Map<string, number>();
        let maxVal = 0;
        for (const txn of this.transactions) {
            if (txn.txnType === '支出' && txn.date.startsWith(String(year))) {
                const amount = txn.amount - (txn.refund || 0);
                if (amount > 0) {
                    const current = dataMap.get(txn.date) || 0;
                    dataMap.set(txn.date, current + amount);
                    if (current + amount > maxVal) maxVal = current + amount;
                }
            }
        }

        // Render SVG
        const cellSize = 10;
        const gap = 2;
        const weekCount = 53;
        const width = weekCount * (cellSize + gap) + 30; // 30 for labels
        const height = 7 * (cellSize + gap) + 20;

        const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
        svg.setAttribute("class", "cost-heatmap-svg");

        // Days
        const startDate = new Date(year, 0, 1);
        const dayOffset = startDate.getDay(); // 0 = Sunday

        for (let d = 0; d < 366; d++) {
            const date = new Date(year, 0, 1 + d);
            if (date.getFullYear() !== year) break;

            const dateStr = date.toISOString().split("T")[0] || "";
            const val = dataMap.get(dateStr) || 0;

            // Calculate Position
            // Week index
            const dayOfYear = d + dayOffset;
            const col = Math.floor(dayOfYear / 7);
            const row = date.getDay();

            const x = col * (cellSize + gap);
            const y = row * (cellSize + gap);

            const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
            rect.setAttribute("x", String(x));
            rect.setAttribute("y", String(y));
            rect.setAttribute("width", String(cellSize));
            rect.setAttribute("height", String(cellSize));
            rect.setAttribute("rx", "2");

            // Color Logic
            let fill = "var(--background-secondary)"; // Empty color
            if (val > 0) {
                // Levels: 1-4
                const ratio = val / (maxVal || 1);
                // We use opacity of a base color (green)
                // But SVG fill opacity is separate.
                // Or use distinct colors.
                // Let's use opacity approach with rgba if possible or distinct var colors if defined.
                // Obsidian doesn't have granular green vars.
                // Let's use inline rgba for now which works in light/dark usually if based on theme green.
                // Actually var(--color-green) is roughly #43d787.

                // Let's simulate opacity by using fill-opacity
                rect.setAttribute("fill", "var(--color-green)");

                let opacity = "0.2";
                if (ratio > 0.8) opacity = "1.0";
                else if (ratio > 0.6) opacity = "0.8";
                else if (ratio > 0.4) opacity = "0.6";
                else if (ratio > 0.2) opacity = "0.4";

                rect.setAttribute("fill-opacity", opacity);
            } else {
                rect.setAttribute("fill", "var(--background-modifier-border)");
                rect.setAttribute("fill-opacity", "0.3");
            }

            // Tooltip
            const title = document.createElementNS("http://www.w3.org/2000/svg", "title");
            title.textContent = `${dateStr}: ${val.toFixed(2)}`;
            rect.appendChild(title);

            svg.appendChild(rect);
        }

        container.appendChild(svg);
    }
}
