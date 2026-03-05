import { App, TFile, TFolder } from "obsidian";

/**
 * 获取指定文件夹下的所有 Markdown 文件（递归）
 */
export function getMarkdownFilesInFolder(app: App, folderPath: string): TFile[] {
    const folder = app.vault.getAbstractFileByPath(folderPath);
    if (!folder || !(folder instanceof TFolder)) {
        return [];
    }

    const files: TFile[] = [];
    collectMarkdownFiles(folder, files);
    return files;
}

/**
 * 递归收集 Markdown 文件
 */
function collectMarkdownFiles(folder: TFolder, files: TFile[]): void {
    for (const child of folder.children) {
        if (child instanceof TFile && child.extension === "md") {
            files.push(child);
        } else if (child instanceof TFolder) {
            collectMarkdownFiles(child, files);
        }
    }
}
