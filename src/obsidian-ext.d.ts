/**
 * Obsidian 内部 API 类型扩展
 * 这些 API 未在官方类型定义中公开，通过此文件安全地声明访问类型。
 */

import "obsidian";

declare module "obsidian" {
    interface App {
        commands: {
            executeCommandById(id: string): boolean;
        };
        metadataTypeManager: MetadataTypeManager | undefined;
    }

    interface MetadataTypeManager {
        // 目前仅用于存在性检测，具体方法按需补充
        [key: string]: unknown;
    }
}
