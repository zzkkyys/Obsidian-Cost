/**
 * Widget Grid System
 * 管理统计视图中的可拖拽 Widget 布局
 */

export interface WidgetConfig {
    id: string;
    x: number;  // 像素位置
    y: number;  // 像素位置
    width: number;  // 像素宽度
    height: number; // 像素高度
}

export interface GridConfig {
    cellSize: number;  // 网格单元大小（像素）
    minWidth: number;  // 最小宽度
    minHeight: number; // 最小高度
}

export class WidgetGrid {
    private container: HTMLElement;
    private config: GridConfig;
    private widgets: Map<string, WidgetConfig> = new Map();
    private draggedWidget: string | null = null;
    private resizingWidget: string | null = null;
    private resizeDirection: string | null = null;
    private startPos = { x: 0, y: 0 };
    private gridOverlay: HTMLElement | null = null;

    constructor(container: HTMLElement, config: GridConfig) {
        this.container = container;
        this.config = config;
        this.setupContainer();
        this.createGridOverlay();
    }

    private setupContainer(): void {
        this.container.style.position = 'relative';
        this.container.style.minHeight = '800px';
        this.container.style.padding = '20px';
    }

    /**
     * 创建网格覆盖层
     */
    private createGridOverlay(): void {
        this.gridOverlay = document.createElement('div');
        this.gridOverlay.className = 'cost-grid-overlay';
        this.gridOverlay.style.display = 'none';
        this.container.appendChild(this.gridOverlay);
    }

    /**
     * 显示/隐藏网格
     */
    private showGrid(show: boolean): void {
        if (this.gridOverlay) {
            this.gridOverlay.style.display = show ? 'block' : 'none';
        }
    }

    /**
     * 添加 Widget
     */
    addWidget(id: string, element: HTMLElement, config: WidgetConfig): void {
        this.widgets.set(id, config);
        element.style.position = 'absolute';
        element.style.left = `${config.x}px`;
        element.style.top = `${config.y}px`;
        element.style.width = `${config.width}px`;
        element.style.height = `${config.height}px`;
        element.classList.add('cost-widget');

        this.container.appendChild(element);

        // 在添加到容器后添加调整大小手柄
        this.addResizeHandles(element);
        this.makeWidgetInteractive(id, element);
    }

    /**
     * 添加调整大小手柄
     */
    private addResizeHandles(element: HTMLElement): void {
        const directions = ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'];
        directions.forEach(dir => {
            const handle = document.createElement('div');
            handle.className = `cost-resize-handle cost-resize-${dir}`;
            handle.dataset.direction = dir;
            element.appendChild(handle);
        });
    }

    /**
     * 使 Widget 可交互（拖拽和调整大小）
     */
    private makeWidgetInteractive(id: string, element: HTMLElement): void {
        let isDragging = false;
        let isResizing = false;

        const onMouseDown = (e: MouseEvent) => {
            const target = e.target as HTMLElement;

            // 检查是否点击调整大小手柄
            if (target.classList.contains('cost-resize-handle')) {
                isResizing = true;
                this.resizingWidget = id;
                this.resizeDirection = target.dataset.direction || null;
                this.startPos = { x: e.clientX, y: e.clientY };
                this.showGrid(true);
                e.preventDefault();
                e.stopPropagation();
                return;
            }

            // 检查是否点击拖拽区域（非内容区域）
            if (target === element || target.classList.contains('cost-widget-header')) {
                isDragging = true;
                this.draggedWidget = id;
                const config = this.widgets.get(id);
                if (config) {
                    this.startPos = {
                        x: e.clientX - config.x,
                        y: e.clientY - config.y
                    };
                }
                this.showGrid(true);
                element.style.opacity = '0.8';
                element.style.zIndex = '1000';
                e.preventDefault();
            }
        };

        const onMouseMove = (e: MouseEvent) => {
            if (isResizing && this.resizingWidget) {
                this.handleResize(e);
            } else if (isDragging && this.draggedWidget) {
                this.handleDrag(e);
            }
        };

        const onMouseUp = (e: MouseEvent) => {
            if (isResizing) {
                isResizing = false;
                this.resizingWidget = null;
                this.resizeDirection = null;
                this.showGrid(false);
            } else if (isDragging) {
                isDragging = false;
                this.draggedWidget = null;
                this.showGrid(false);
                element.style.opacity = '';
                element.style.zIndex = '';
            }
        };

        element.addEventListener('mousedown', onMouseDown);
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    }

    /**
     * 处理拖拽
     */
    private handleDrag(e: MouseEvent): void {
        if (!this.draggedWidget) return;

        const config = this.widgets.get(this.draggedWidget);
        const element = this.findWidgetElement(this.draggedWidget);
        if (!config || !element) return;

        let newX = e.clientX - this.startPos.x;
        let newY = e.clientY - this.startPos.y;

        // 吸附到网格
        newX = this.snapToGrid(newX);
        newY = this.snapToGrid(newY);

        // 边界检查
        const containerRect = this.container.getBoundingClientRect();
        newX = Math.max(0, Math.min(newX, containerRect.width - config.width));
        newY = Math.max(0, Math.min(newY, containerRect.height - config.height));

        config.x = newX;
        config.y = newY;

        element.style.left = `${newX}px`;
        element.style.top = `${newY}px`;
    }

    /**
     * 处理调整大小
     */
    private handleResize(e: MouseEvent): void {
        if (!this.resizingWidget || !this.resizeDirection) return;

        const config = this.widgets.get(this.resizingWidget);
        const element = this.findWidgetElement(this.resizingWidget);
        if (!config || !element) return;

        const deltaX = e.clientX - this.startPos.x;
        const deltaY = e.clientY - this.startPos.y;

        let newX = config.x;
        let newY = config.y;
        let newWidth = config.width;
        let newHeight = config.height;

        const dir = this.resizeDirection;

        // 根据方向调整尺寸
        if (dir.includes('e')) {
            newWidth = Math.max(this.config.minWidth, config.width + deltaX);
        }
        if (dir.includes('w')) {
            const widthChange = config.width - deltaX;
            if (widthChange >= this.config.minWidth) {
                newWidth = widthChange;
                newX = config.x + deltaX;
            }
        }
        if (dir.includes('s')) {
            newHeight = Math.max(this.config.minHeight, config.height + deltaY);
        }
        if (dir.includes('n')) {
            const heightChange = config.height - deltaY;
            if (heightChange >= this.config.minHeight) {
                newHeight = heightChange;
                newY = config.y + deltaY;
            }
        }

        // 吸附到网格
        newX = this.snapToGrid(newX);
        newY = this.snapToGrid(newY);
        newWidth = this.snapToGrid(newWidth);
        newHeight = this.snapToGrid(newHeight);

        // 更新配置和样式
        config.x = newX;
        config.y = newY;
        config.width = newWidth;
        config.height = newHeight;

        element.style.left = `${newX}px`;
        element.style.top = `${newY}px`;
        element.style.width = `${newWidth}px`;
        element.style.height = `${newHeight}px`;

        this.startPos = { x: e.clientX, y: e.clientY };
    }

    /**
     * 吸附到网格
     */
    private snapToGrid(value: number): number {
        return Math.round(value / this.config.cellSize) * this.config.cellSize;
    }

    /**
     * 查找 Widget 元素
     */
    private findWidgetElement(id: string): HTMLElement | null {
        const widgets = this.container.querySelectorAll('.cost-widget');
        for (const widget of Array.from(widgets)) {
            if ((widget as HTMLElement).dataset.widgetId === id) {
                return widget as HTMLElement;
            }
        }
        return null;
    }

    /**
     * 获取所有 Widget 配置
     */
    getWidgetConfigs(): WidgetConfig[] {
        return Array.from(this.widgets.values());
    }

    /**
     * 加载 Widget 配置
     */
    loadWidgetConfigs(configs: WidgetConfig[]): void {
        configs.forEach(config => {
            this.widgets.set(config.id, config);
        });
    }
}
