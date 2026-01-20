import { BaseComponent } from '../BaseComponent';
import { formatCompact } from '../../utils/format';

export interface TrendDataPoint {
    month: string;
    value: number;
}

export class TrendChart extends BaseComponent {
    private data: TrendDataPoint[];
    private color: string;
    private title: string;

    constructor(containerEl: HTMLElement, data: TrendDataPoint[], color: string, title?: string) {
        super(containerEl);
        this.data = data;
        this.color = color;
        this.title = title || '';
    }

    protected render(): void {
        const width = 300;
        const height = 180;
        const padding = { top: 20, right: 20, bottom: 30, left: 40 };
        const chartWidth = width - padding.left - padding.right;
        const chartHeight = height - padding.top - padding.bottom;

        const widget = document.createElement('div');
        // If container already has class, we might strictly append, 
        // but here we follow the previous pattern of creating a wrapper or appending SVG direct.
        // Let's stick to appending chart container.

        // Actually BaseComponent.containerEl is where we render INTO. 
        // So we append our content to it.

        const chartContainer = this.containerEl.createDiv({ cls: "cost-trend-chart-container" });

        const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
        svg.setAttribute("class", "cost-line-chart");

        // Calculate max value for scaling
        const maxValue = Math.max(...this.data.map(d => d.value)) * 1.1; // Add 10% headroom

        // Draw grid lines and Y-axis labels
        const gridLines = 5;
        for (let i = 0; i < gridLines; i++) {
            const y = padding.top + (chartHeight / (gridLines - 1)) * i;
            const value = maxValue - (maxValue / (gridLines - 1)) * i;

            // Grid line
            const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
            line.setAttribute("x1", String(padding.left));
            line.setAttribute("y1", String(y));
            line.setAttribute("x2", String(width - padding.right));
            line.setAttribute("y2", String(y));
            line.setAttribute("stroke", "var(--background-modifier-border)");
            line.setAttribute("stroke-width", "1");
            line.setAttribute("opacity", "0.3");
            svg.appendChild(line);

            // Y-axis label
            const labelEl = document.createElementNS("http://www.w3.org/2000/svg", "text");
            labelEl.setAttribute("x", String(padding.left - 5));
            labelEl.setAttribute("y", String(y + 4));
            labelEl.setAttribute("text-anchor", "end");
            labelEl.setAttribute("font-size", "10");
            labelEl.setAttribute("fill", "var(--text-muted)");
            labelEl.textContent = formatCompact(value);
            svg.appendChild(labelEl);
        }

        // Draw line path
        const points = this.data.map((d, i) => {
            const x = padding.left + (chartWidth / (this.data.length - 1)) * i;
            const y = padding.top + chartHeight - (d.value / (maxValue || 1)) * chartHeight; // avoid div by zero
            return { x, y };
        });

        const pathData = points.map((p, i) =>
            `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`
        ).join(' ');

        const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
        path.setAttribute("d", pathData);
        path.setAttribute("fill", "none");
        path.setAttribute("stroke", this.color);
        path.setAttribute("stroke-width", "2");
        svg.appendChild(path);

        // Draw data points
        points.forEach(p => {
            const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
            circle.setAttribute("cx", String(p.x));
            circle.setAttribute("cy", String(p.y));
            circle.setAttribute("r", "3");
            circle.setAttribute("fill", this.color);
            svg.appendChild(circle);
        });

        // X-axis labels
        this.data.forEach((d, i) => {
            const x = padding.left + (chartWidth / (this.data.length - 1)) * i;
            const labelEl = document.createElementNS("http://www.w3.org/2000/svg", "text");
            labelEl.setAttribute("x", String(x));
            labelEl.setAttribute("y", String(height - padding.bottom + 15));
            labelEl.setAttribute("text-anchor", "middle");
            labelEl.setAttribute("font-size", "10");
            labelEl.setAttribute("fill", "var(--text-muted)");
            labelEl.textContent = d.month;
            svg.appendChild(labelEl);
        });

        chartContainer.appendChild(svg);
    }
}
