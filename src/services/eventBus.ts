/**
 * 简单的类型安全事件总线
 * 用于解耦插件内各组件间的通信，避免手动遍历视图实例
 */

export type CostEventMap = {
    /** 交易数据发生变化（增删改） */
    "transactions-changed": void;
    /** 账户数据发生变化 */
    "accounts-changed": void;
    /** 设置发生变化 */
    "settings-changed": void;
    /** 通用数据刷新（账户+交易均可能变化） */
    "data-changed": void;
};

export type CostEventType = keyof CostEventMap;

type Handler<T> = T extends void ? () => void : (data: T) => void;

export class EventBus {
    private listeners = new Map<string, Set<Function>>();

    /**
     * 订阅事件
     * @returns 取消订阅的函数
     */
    on<K extends CostEventType>(event: K, handler: Handler<CostEventMap[K]>): () => void {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, new Set());
        }
        this.listeners.get(event)!.add(handler);

        return () => {
            this.listeners.get(event)?.delete(handler);
        };
    }

    /**
     * 发送事件
     */
    emit<K extends CostEventType>(event: K, ...args: CostEventMap[K] extends void ? [] : [CostEventMap[K]]): void {
        const handlers = this.listeners.get(event);
        if (!handlers) return;
        for (const handler of handlers) {
            try {
                handler(...args);
            } catch (e) {
                console.error(`[Cost] EventBus error in handler for "${event}":`, e);
            }
        }
    }

    /**
     * 移除某个事件的所有监听器
     */
    off(event: CostEventType): void {
        this.listeners.delete(event);
    }

    /**
     * 清除所有监听器（插件卸载时调用）
     */
    destroy(): void {
        this.listeners.clear();
    }
}
