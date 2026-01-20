import { BaseComponent } from '../BaseComponent';
import { TransactionInfo } from '../../services/transactionService';

export class CategoryDonutWidget extends BaseComponent {
    private transactions: TransactionInfo[];

    constructor(containerEl: HTMLElement, transactions: TransactionInfo[]) {
        super(containerEl);
        this.transactions = transactions;
    }

    protected render(): void {
        const container = this.containerEl;
        container.addClass("cost-donut-widget");
        container.createEl("h3", { text: "支出构成", cls: "cost-card-title" });

        const dataMap = new Map<string, number>();
        let total = 0;
        const now = new Date();
        const monthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

        for (const txn of this.transactions) {
            if (txn.txnType === '支出' && txn.category && txn.date.startsWith(monthStr)) {
                const amount = txn.amount - (txn.refund || 0);
                if (amount > 0) {
                    const rootCat = (txn.category || "").split("/")[0] || "其他";
                    dataMap.set(rootCat, (dataMap.get(rootCat) || 0) + amount);
                    total += amount;
                }
            }
        }

        if (total === 0) {
            container.createDiv({ text: "本月暂无支出", cls: "cost-empty-message" });
            return;
        }

        const sorted = Array.from(dataMap.entries()).sort((a, b) => b[1] - a[1]);
        const top5 = sorted.slice(0, 5);
        const others = sorted.slice(5).reduce((acc, cur) => acc + cur[1], 0);
        if (others > 0) top5.push(["其他", others]);

        // Draw SVG Donut
        const size = 150;
        const r = size / 2;
        const cx = r;
        const cy = r;
        const strokeWidth = 20;
        const radius = r - strokeWidth;

        const wrapper = container.createDiv({ cls: "cost-donut-wrapper" });
        const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        svg.setAttribute("viewBox", `0 0 ${size} ${size}`);
        svg.setAttribute("class", "cost-donut-svg");
        wrapper.appendChild(svg);

        let startAngle = -90; // Start at top
        const themeColors = [
            "var(--color-red)", "var(--color-orange)", "var(--color-yellow)",
            "var(--color-green)", "var(--color-blue)", "var(--color-purple)", "var(--text-muted)"
        ];

        top5.forEach(([cat, val], i) => {
            const percent = val / total;
            const angle = percent * 360;

            const circumference = 2 * Math.PI * radius;
            const dashVal = circumference * percent;
            // Gap? No gap for basic pie.

            const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
            circle.setAttribute("cx", String(cx));
            circle.setAttribute("cy", String(cy));
            circle.setAttribute("r", String(radius));
            circle.setAttribute("fill", "transparent");
            circle.setAttribute("stroke", themeColors[i % themeColors.length] || "gray");
            circle.setAttribute("stroke-width", String(strokeWidth));
            // Dasharray: draw segment, then gap for the rest
            circle.setAttribute("stroke-dasharray", `${dashVal} ${circumference}`);

            // Adjust rotation so segment starts at correct angle
            // circle starts at 3 o'clock (0 deg) by default.
            // We want it to start at startAngle.
            circle.setAttribute("transform", `rotate(${startAngle} ${cx} ${cy})`);

            svg.appendChild(circle);

            startAngle += angle;
        });

        // Legend
        const legend = container.createDiv({ cls: "cost-donut-legend" });
        top5.forEach(([cat, val], i) => {
            const row = legend.createDiv({ cls: "cost-legend-item" });
            const dot = row.createDiv({ cls: "cost-legend-dot" });
            dot.style.backgroundColor = themeColors[i % themeColors.length] || "gray";
            row.createSpan({ text: cat, cls: "cost-legend-label" });
            row.createSpan({ text: `${(val / total * 100).toFixed(0)}%`, cls: "cost-legend-value" });
        });
    }
}
