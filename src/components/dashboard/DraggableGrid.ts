/**
 * DraggableGrid — 统计页面可拖拽 Widget 网格管理器
 *
 * 用法:
 *   const grid = new DraggableGrid(containerEl, onOrderChange);
 *   grid.addWidget("balance", widgetEl);
 *   grid.addWidget("kpi", widgetEl);
 *   grid.enableDrag();
 *
 * 拖拽通过 pointer events 实现，不依赖外部库。
 */

export type WidgetSizeType = "full" | "half";

export interface WidgetDef {
    id: string;
    label: string;
    sizeType: WidgetSizeType;
}

export class DraggableGrid {
    private containerEl: HTMLElement;
    private onOrderChange: (newOrder: string[]) => void;
    private widgetEls: Map<string, HTMLElement> = new Map();
    private widgetDefs: Map<string, WidgetDef> = new Map();
    private order: string[] = [];

    // Drag state
    private dragId: string | null = null;
    private ghostEl: HTMLElement | null = null;
    private placeholderEl: HTMLElement | null = null;
    private dragStartY = 0;
    private dragOffsetX = 0;
    private dragOffsetY = 0;

    // Bound listeners (for cleanup)
    private boundPointerMove: (e: PointerEvent) => void;
    private boundPointerUp: (e: PointerEvent) => void;

    constructor(
        containerEl: HTMLElement,
        onOrderChange: (newOrder: string[]) => void
    ) {
        this.containerEl = containerEl;
        this.onOrderChange = onOrderChange;
        this.boundPointerMove = this.onPointerMove.bind(this);
        this.boundPointerUp = this.onPointerUp.bind(this);
    }

    /**
     * 注册一个 widget（定义 + DOM 元素）
     */
    addWidget(def: WidgetDef, el: HTMLElement): void {
        this.widgetDefs.set(def.id, def);

        // Wrap in a draggable container
        const wrapper = createDiv({ cls: "cost-drag-widget" });
        wrapper.dataset.widgetId = def.id;

        // Drag-handle bar
        const handle = wrapper.createDiv({ cls: "cost-drag-handle" });
        handle.createSpan({ cls: "cost-drag-handle-icon", text: "⠿" });
        handle.createSpan({ cls: "cost-drag-handle-label", text: def.label });

        // Move the rendered content into the wrapper
        wrapper.appendChild(el);

        this.widgetEls.set(def.id, wrapper);
        this.order.push(def.id);

        // Pointer events on the handle
        handle.addEventListener("pointerdown", (e: PointerEvent) => {
            e.preventDefault();
            this.onPointerDown(e, def.id);
        });
    }

    /**
     * 按指定顺序渲染所有 widget 到容器
     */
    renderOrder(order: string[]): void {
        // Validate order — keep only known IDs, append any missing ones
        const known = new Set(this.widgetDefs.keys());
        const validated: string[] = [];
        const seen = new Set<string>();

        for (const id of order) {
            if (known.has(id) && !seen.has(id)) {
                validated.push(id);
                seen.add(id);
            }
        }
        // Append any widgets not in the saved order (newly added widgets)
        for (const id of this.widgetDefs.keys()) {
            if (!seen.has(id)) {
                validated.push(id);
            }
        }

        this.order = validated;

        // Clear and re-append in order
        // Keep other children (like the header) intact
        for (const el of this.widgetEls.values()) {
            el.detach();
        }

        for (const id of this.order) {
            const el = this.widgetEls.get(id);
            if (el) {
                this.containerEl.appendChild(el);
            }
        }
    }

    /**
     * 获取当前顺序
     */
    getOrder(): string[] {
        return [...this.order];
    }

    // ─────────────────── Pointer event handlers ───────────────────

    private onPointerDown(e: PointerEvent, id: string): void {
        const wrapper = this.widgetEls.get(id);
        if (!wrapper) return;

        this.dragId = id;
        const rect = wrapper.getBoundingClientRect();
        this.dragOffsetX = e.clientX - rect.left;
        this.dragOffsetY = e.clientY - rect.top;
        this.dragStartY = e.clientY;

        // Create ghost (visual clone)
        this.ghostEl = wrapper.cloneNode(true) as HTMLElement;
        this.ghostEl.addClass("cost-drag-ghost");
        this.ghostEl.style.width = `${rect.width}px`;
        this.ghostEl.style.left = `${rect.left}px`;
        this.ghostEl.style.top = `${rect.top}px`;
        document.body.appendChild(this.ghostEl);

        // Create placeholder
        this.placeholderEl = createDiv({ cls: "cost-drag-placeholder" });
        this.placeholderEl.style.height = `${rect.height}px`;
        wrapper.parentElement?.insertBefore(this.placeholderEl, wrapper);

        // Hide original
        wrapper.addClass("cost-drag-source");

        // Global listeners
        document.addEventListener("pointermove", this.boundPointerMove);
        document.addEventListener("pointerup", this.boundPointerUp);

        // Prevent text selection during drag
        document.body.style.userSelect = "none";
    }

    private onPointerMove(e: PointerEvent): void {
        if (!this.ghostEl || !this.dragId) return;

        // Move ghost
        this.ghostEl.style.left = `${e.clientX - this.dragOffsetX}px`;
        this.ghostEl.style.top = `${e.clientY - this.dragOffsetY}px`;

        // Find insertion point by comparing Y position with widget midpoints
        const containerRect = this.containerEl.getBoundingClientRect();
        const scrollTop = this.containerEl.scrollTop;
        const relativeY = e.clientY - containerRect.top + scrollTop;

        let insertBeforeId: string | null = null;

        for (const id of this.order) {
            if (id === this.dragId) continue;
            const el = this.widgetEls.get(id);
            if (!el) continue;

            const elRect = el.getBoundingClientRect();
            const elMidY = elRect.top + elRect.height / 2 - containerRect.top + scrollTop;

            if (relativeY < elMidY) {
                insertBeforeId = id;
                break;
            }
        }

        // Move placeholder
        if (this.placeholderEl) {
            this.placeholderEl.detach();

            if (insertBeforeId) {
                const beforeEl = this.widgetEls.get(insertBeforeId);
                if (beforeEl) {
                    beforeEl.parentElement?.insertBefore(this.placeholderEl, beforeEl);
                }
            } else {
                // Append at end
                this.containerEl.appendChild(this.placeholderEl);
            }
        }
    }

    private onPointerUp(_e: PointerEvent): void {
        document.removeEventListener("pointermove", this.boundPointerMove);
        document.removeEventListener("pointerup", this.boundPointerUp);
        document.body.style.userSelect = "";

        if (!this.dragId) return;

        // Determine new order from placeholder position
        const newOrder: string[] = [];
        const children = Array.from(this.containerEl.children) as HTMLElement[];
        let dragIdInserted = false;

        for (const child of children) {
            if (child === this.placeholderEl) {
                newOrder.push(this.dragId);
                dragIdInserted = true;
            } else if (child.dataset.widgetId && child.dataset.widgetId !== this.dragId) {
                newOrder.push(child.dataset.widgetId);
            }
        }

        // Safety: if placeholder somehow didn't appear, add at end
        if (!dragIdInserted) {
            newOrder.push(this.dragId);
        }

        // Cleanup ghost & placeholder
        this.ghostEl?.remove();
        this.ghostEl = null;
        this.placeholderEl?.remove();
        this.placeholderEl = null;

        // Restore source element
        const sourceEl = this.widgetEls.get(this.dragId);
        if (sourceEl) {
            sourceEl.removeClass("cost-drag-source");
        }

        const oldOrder = [...this.order];
        this.dragId = null;

        // Apply new order if changed
        if (JSON.stringify(oldOrder) !== JSON.stringify(newOrder)) {
            this.order = newOrder;
            this.renderOrder(newOrder);
            this.onOrderChange(newOrder);
        }
    }

    /**
     * Cleanup — 可在拖拽进行中安全调用
     */
    destroy(): void {
        // 移除全局拖拽监听（若正在拖拽中销毁也能正确清理）
        document.removeEventListener("pointermove", this.boundPointerMove);
        document.removeEventListener("pointerup", this.boundPointerUp);

        // 恢复可能被拖拽锁定的文本选择
        document.body.style.userSelect = "";

        // 清理拖拽产生的游离 DOM 节点
        this.ghostEl?.remove();
        this.ghostEl = null;
        this.placeholderEl?.remove();
        this.placeholderEl = null;

        // 重置拖拽状态
        this.dragId = null;

        // 释放 widget 引用，允许 GC 回收
        this.widgetEls.clear();
        this.widgetDefs.clear();
        this.order = [];
    }
}

/**
 * Helper: create a <div> (mirrors Obsidian's createDiv but works outside views)
 */
function createDiv(opt?: { cls?: string; text?: string }): HTMLDivElement {
    const div = document.createElement("div");
    if (opt?.cls) div.className = opt.cls;
    if (opt?.text) div.textContent = opt.text;
    return div;
}
