import { BaseComponent } from '../BaseComponent';
import { formatCompact } from '../../utils/format';

export class PieChart extends BaseComponent {
    private data: [string, number][];
    private colors: string[];
    private total: number;

    constructor(
        containerEl: HTMLElement,
        data: [string, number][],
        colors: string[],
        total: number
    ) {
        super(containerEl);
        this.data = data;
        this.colors = colors;
        this.total = total;
    }

    protected render(): void {
        const size = 240;
        const center = size / 2;
        const radius = 90;
        const innerRadius = 58; // Donut chart
        const labelRadius = 93;
        const labelOuterRadius = 108;

        const chartWrapper = this.containerEl.createDiv({ cls: "cost-category-chart" });

        const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        svg.setAttribute("viewBox", `0 0 ${size} ${size}`);
        svg.setAttribute("class", "cost-pie-chart");

        let currentAngle = -90;

        // Ensure we handle "Other" category if data is too long
        // Assuming data passed in is already processed/sliced effectively 
        // or we process it here. The original code did slicing in renderCategoryStats.
        // Let's assume the caller passes the exact data to display for flexibility.

        const labels: { midAngle: number; percent: number; category: string; color: string; value: number }[] = [];

        for (let i = 0; i < this.data.length; i++) {
            const entry = this.data[i];
            if (!entry) continue;
            const category = entry[0];
            const value = entry[1];
            const percent = this.total > 0 ? value / this.total : 0;
            const angle = percent * 360;
            const color = this.colors[i % this.colors.length] || "#607D8B";

            if (angle > 0) {
                const path = this.createArcPath(center, center, radius, innerRadius, currentAngle, currentAngle + angle);
                const pathEl = document.createElementNS("http://www.w3.org/2000/svg", "path");
                pathEl.setAttribute("d", path);
                pathEl.setAttribute("fill", color);
                svg.appendChild(pathEl);

                const midAngle = currentAngle + angle / 2;
                labels.push({ midAngle, percent, category, color, value });

                currentAngle += angle;
            }
        }

        const toRad = (deg: number) => (deg * Math.PI) / 180;

        for (const label of labels) {
            const percentValue = label.percent * 100;
            if (percentValue < 3) continue;

            const midAngle = label.midAngle;
            const radMid = toRad(midAngle);

            const startX = center + labelRadius * Math.cos(radMid);
            const startY = center + labelRadius * Math.sin(radMid);
            const midX = center + labelOuterRadius * Math.cos(radMid);
            const midY = center + labelOuterRadius * Math.sin(radMid);

            const isRight = midAngle > -90 && midAngle < 90;
            const horizontalLength = 8;
            const endX = isRight ? midX + horizontalLength : midX - horizontalLength;
            const endY = midY;

            const line = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
            line.setAttribute("points", `${startX},${startY} ${midX},${midY} ${endX},${endY}`);
            line.setAttribute("fill", "none");
            line.setAttribute("stroke", label.color);
            line.setAttribute("stroke-width", "1.5");
            svg.appendChild(line);

            const percentRadius = (radius + innerRadius) / 2;
            const percentX = center + percentRadius * Math.cos(radMid);
            const percentY = center + percentRadius * Math.sin(radMid);

            if (percentValue >= 8) {
                const percentText = document.createElementNS("http://www.w3.org/2000/svg", "text");
                percentText.setAttribute("x", String(percentX));
                percentText.setAttribute("y", String(percentY + 3));
                percentText.setAttribute("text-anchor", "middle");
                percentText.setAttribute("class", "cost-pie-percent");
                percentText.textContent = `${percentValue.toFixed(0)}%`;
                svg.appendChild(percentText);
            }

            const labelText = document.createElementNS("http://www.w3.org/2000/svg", "text");
            labelText.setAttribute("x", String(endX + (isRight ? 4 : -4)));
            labelText.setAttribute("y", String(endY + 4));
            labelText.setAttribute("text-anchor", isRight ? "start" : "end");
            labelText.setAttribute("class", "cost-pie-category-label");
            labelText.textContent = label.category;
            svg.appendChild(labelText);
        }

        // Center Text
        const textGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");

        const labelText = document.createElementNS("http://www.w3.org/2000/svg", "text");
        labelText.setAttribute("x", String(center));
        labelText.setAttribute("y", String(center - 6));
        labelText.setAttribute("text-anchor", "middle");
        labelText.setAttribute("class", "cost-pie-label");
        labelText.textContent = "总支出";
        textGroup.appendChild(labelText);

        const valueText = document.createElementNS("http://www.w3.org/2000/svg", "text");
        valueText.setAttribute("x", String(center));
        valueText.setAttribute("y", String(center + 14));
        valueText.setAttribute("text-anchor", "middle");
        valueText.setAttribute("class", "cost-pie-value");
        valueText.textContent = `¥${formatCompact(this.total)}`;
        textGroup.appendChild(valueText);

        svg.appendChild(textGroup);
        chartWrapper.appendChild(svg);
    }

    private createArcPath(
        cx: number, cy: number,
        outerRadius: number, innerRadius: number,
        startAngle: number, endAngle: number
    ): string {
        const toRad = (deg: number) => (deg * Math.PI) / 180;

        const startOuter = {
            x: cx + outerRadius * Math.cos(toRad(startAngle)),
            y: cy + outerRadius * Math.sin(toRad(startAngle))
        };
        const endOuter = {
            x: cx + outerRadius * Math.cos(toRad(endAngle)),
            y: cy + outerRadius * Math.sin(toRad(endAngle))
        };
        const startInner = {
            x: cx + innerRadius * Math.cos(toRad(endAngle)),
            y: cy + innerRadius * Math.sin(toRad(endAngle))
        };
        const endInner = {
            x: cx + innerRadius * Math.cos(toRad(startAngle)),
            y: cy + innerRadius * Math.sin(toRad(startAngle))
        };

        const largeArc = (endAngle - startAngle) > 180 ? 1 : 0;

        return [
            `M ${startOuter.x} ${startOuter.y}`,
            `A ${outerRadius} ${outerRadius} 0 ${largeArc} 1 ${endOuter.x} ${endOuter.y}`,
            `L ${startInner.x} ${startInner.y}`,
            `A ${innerRadius} ${innerRadius} 0 ${largeArc} 0 ${endInner.x} ${endInner.y}`,
            `Z`
        ].join(' ');
    }
}
