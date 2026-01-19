import {
    Editor,
    EditorPosition,
    EditorSuggest,
    EditorSuggestContext,
    EditorSuggestTriggerInfo,
    MarkdownView,
    TFile,
} from "obsidian";
import { AccountService } from "../services/accountService";
import { AccountInfo } from "../types";
import CostPlugin from "../main";

/**
 * 账户自动补全建议器
 * 在 transaction 文件的 from/to 字段中提供账户建议
 */
export class AccountSuggester extends EditorSuggest<AccountInfo> {
    private plugin: CostPlugin;
    private accountService: AccountService;
    private cursorCheckInterval: number | null = null;
    private lastCursorLine: number = -1;
    private lastCursorCh: number = -1;

    constructor(plugin: CostPlugin, accountService: AccountService) {
        super(plugin.app);
        this.plugin = plugin;
        this.accountService = accountService;
        
        // 启动光标位置检查
        this.startCursorCheck();
    }

    /**
     * 启动定期检查光标位置
     */
    private startCursorCheck(): void {
        // 每 100ms 检查一次光标位置
        this.cursorCheckInterval = window.setInterval(() => {
            this.checkCursorPosition();
        }, 100);
        
        // 注册清理
        this.plugin.register(() => {
            if (this.cursorCheckInterval) {
                window.clearInterval(this.cursorCheckInterval);
            }
        });
    }

    /**
     * 检查光标位置，如果在 from/to 行则尝试触发建议
     */
    private checkCursorPosition(): void {
        const view = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (!view) {
            this.closeSuggestion();
            return;
        }

        const editor = view.editor;
        const file = view.file;
        if (!file) {
            this.closeSuggestion();
            return;
        }

        // 检查是否为 transaction 文件
        if (!this.isTransactionFile(file)) {
            this.closeSuggestion();
            return;
        }

        const cursor = editor.getCursor();
        
        // 如果光标位置没变，跳过
        if (cursor.line === this.lastCursorLine && cursor.ch === this.lastCursorCh) {
            return;
        }
        
        this.lastCursorLine = cursor.line;
        this.lastCursorCh = cursor.ch;

        const line = editor.getLine(cursor.line);
        
        // 检查是否在 from: 或 to: 行的值区域
        const fromMatch = line.match(/^(from:)(\s?)(.*)$/);
        const toMatch = line.match(/^(to:)(\s?)(.*)$/);

        const isInFromTo = (fromMatch && fromMatch[1] && cursor.ch >= fromMatch[1].length) || 
                          (toMatch && toMatch[1] && cursor.ch >= toMatch[1].length);

        if (isInFromTo) {
            // 直接尝试打开建议
            this.triggerSuggestion(editor, cursor, line, fromMatch, toMatch);
        } else {
            // 光标不在 from/to 字段，关闭建议窗口
            this.closeSuggestion();
        }
    }

    /**
     * 关闭建议窗口
     */
    private closeSuggestion(): void {
        // @ts-ignore - 使用内部 API
        this.close();
    }

    /**
     * 手动触发建议显示
     */
    private triggerSuggestion(
        editor: Editor, 
        cursor: EditorPosition, 
        line: string,
        fromMatch: RegExpMatchArray | null,
        toMatch: RegExpMatchArray | null
    ): void {
        // 检查建议弹窗是否已经可见（通过检查 suggestions 容器）
        // @ts-ignore - 访问内部属性
        const suggestEl = this.suggestEl;
        if (suggestEl && suggestEl.style.display !== "none" && suggestEl.parentElement) {
            return;
        }

        const match = fromMatch || toMatch;
        if (!match || !match[1]) return;

        const colonPos = match[1].length;
        if (cursor.ch < colonPos) return;

        const hasSpace = match[2] === " ";
        const startCh = hasSpace ? colonPos + 1 : colonPos;
        const query = match[3] || "";

        // 创建虚拟的 trigger info 并手动设置 context
        const triggerInfo: EditorSuggestTriggerInfo = {
            start: { line: cursor.line, ch: startCh },
            end: { line: cursor.line, ch: line.length },
            query: query,
        };

        // 使用内部方法触发建议
        // @ts-ignore - 使用内部 API
        this.trigger(editor, this.app.workspace.getActiveFile(), triggerInfo, true);
    }

    /**
     * 检测是否应该触发建议
     */
    onTrigger(
        cursor: EditorPosition,
        editor: Editor,
        file: TFile | null
    ): EditorSuggestTriggerInfo | null {
        if (!file) {
            return null;
        }

        // 检查当前文件是否为 transaction 文件
        if (!this.isTransactionFile(file)) {
            return null;
        }

        // 获取当前行内容
        const line = editor.getLine(cursor.line);
        if (!line) {
            return null;
        }

        // 检查光标是否在 from: 或 to: 字段的值区域
        // 匹配格式: "from:" 或 "from: " 或 "from: 值"
        const fromMatch = line.match(/^(from:)(\s?)(.*)$/);
        const toMatch = line.match(/^(to:)(\s?)(.*)$/);

        if (fromMatch && fromMatch[1] && fromMatch[2] !== undefined) {
            // fromMatch[1] = "from:"
            // fromMatch[2] = 空格（可能为空字符串）
            // fromMatch[3] = 值
            const colonPos = fromMatch[1].length; // "from:".length = 5
            
            // 只有光标在冒号后面才触发
            if (cursor.ch < colonPos) {
                return null;
            }

            // start 位置：冒号后面（如果有空格就跳过空格）
            const hasSpace = fromMatch[2] === " ";
            const startCh = hasSpace ? colonPos + 1 : colonPos;
            const query = fromMatch[3] || "";
            
            return {
                start: { line: cursor.line, ch: startCh },
                end: { line: cursor.line, ch: line.length },
                query: query,
            };
        }

        if (toMatch && toMatch[1] && toMatch[2] !== undefined) {
            const colonPos = toMatch[1].length; // "to:".length = 3
            
            if (cursor.ch < colonPos) {
                return null;
            }

            const hasSpace = toMatch[2] === " ";
            const startCh = hasSpace ? colonPos + 1 : colonPos;
            const query = toMatch[3] || "";
            
            return {
                start: { line: cursor.line, ch: startCh },
                end: { line: cursor.line, ch: line.length },
                query: query,
            };
        }

        return null;
    }

    /**
     * 检查文件是否为 transaction 类型
     */
    private isTransactionFile(file: TFile): boolean {
        const cache = this.app.metadataCache.getFileCache(file);
        if (!cache?.frontmatter) {
            return false;
        }
        return cache.frontmatter.type === "txn";
    }

    /**
     * 获取建议列表
     */
    async getSuggestions(context: EditorSuggestContext): Promise<AccountInfo[]> {
        const query = context.query.trim();
        
        // 如果查询为空，返回所有账户
        if (!query) {
            return this.accountService.getAccounts();
        }

        // 根据查询过滤账户
        return this.accountService.filterAccounts(query);
    }

    /**
     * 渲染建议项
     */
    renderSuggestion(account: AccountInfo, el: HTMLElement): void {
        const container = el.createDiv({ cls: "account-suggestion" });
        
        // 显示账户名称
        const nameEl = container.createDiv({ cls: "account-suggestion-name" });
        nameEl.setText(account.displayName);

        // 显示账户类型和机构（如果有）
        const detailEl = container.createDiv({ cls: "account-suggestion-detail" });
        const details: string[] = [];
        
        if (account.accountKind) {
            details.push(account.accountKind);
        }
        if (account.institution) {
            details.push(account.institution);
        }
        
        if (details.length > 0) {
            detailEl.setText(details.join(" · "));
        }
    }

    /**
     * 选择建议项时的处理
     */
    selectSuggestion(account: AccountInfo, evt: MouseEvent | KeyboardEvent): void {
        if (!this.context) return;

        const { editor, start, end } = this.context;
        
        // 获取当前行内容，检查冒号后是否有空格
        const line = editor.getLine(start.line);
        const colonIndex = line.indexOf(":");
        
        // 使用文件名（不带双链格式）
        const accountText = account.fileName;
        
        // 检查冒号后是否需要添加空格
        let insertText = accountText;
        let insertStart = start;
        
        if (colonIndex >= 0 && colonIndex < start.ch) {
            // 检查冒号后面是否已有空格
            const afterColon = line.charAt(colonIndex + 1);
            if (afterColon !== " ") {
                // 冒号后没有空格，需要添加
                insertText = " " + accountText;
                insertStart = { line: start.line, ch: colonIndex + 1 };
            }
        }

        // 替换当前选中的文本
        editor.replaceRange(insertText, insertStart, end);

        // 移动光标到插入内容末尾
        const newCursor: EditorPosition = {
            line: start.line,
            ch: insertStart.ch + insertText.length,
        };
        editor.setCursor(newCursor);
    }
}
