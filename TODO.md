# Obsidian Cost Plugin — 代码审阅 TODO

> 审阅日期：2026-04-07

---

## 严重（影响数据正确性）

- [x] **#1 账户匹配逻辑缺陷** — `transactionService.ts:175,191,276`
  - `includes()` 做子字符串匹配，若账户名 `"招商"` 会错误匹配 `"[[招商银行]]"`
  - 应剥离 `[[...]]` 后做 `===` 精确比较
  - 影响：`getTransactionsByAccount`、`calculateBalanceChange`、`getBalanceChangeForTransaction`

- [x] **#2 DraggableGrid destroy() 不完整** — `DraggableGrid.ts:255`
  - 中途调用 `destroy()` 时未恢复 `document.body.style.userSelect`
  - `widgetEls`、`widgetDefs`、`order` 未清空，阻碍 GC

- [x] **#3 过度使用 `any` 类型** — `BatchEditModal.ts:49,65,84,100,115`、`costMainView.ts:185`、`propertyWidget.ts:13`
  - `let dateInput: any` → 应为 `TextComponent`
  - `(this.app as any).commands` → 应通过类型声明文件访问
  - `(app as any).metadataTypeManager` → 同上

---

## 高（影响稳定性/可维护性）

- [ ] **#4 余额计算逻辑重复** — `accountsSidebarView.ts:54`、`BalanceCard.ts:28`、`costMainView.ts:242`
  - 相同的 `change + openingBalance` 逻辑在 3 处独立实现
  - 建议在 `AccountService` 中统一提供 `getAccountBalance(account)` 方法

- [ ] **#5 日期处理时区问题** — `main.ts:269`
  - `new Date().toISOString().split("T")[0]` 返回 UTC 日期，可能与本地日期相差一天
  - 应使用 `getFullYear() / getMonth() / getDate()` 构造本地日期字符串

- [ ] **#6 文件移动缺少错误处理** — `transactionService.ts:440`
  - `renameFile` 失败时无 `try/catch`，缓存与文件系统状态会不一致
  - 应捕获异常并回滚缓存变更

- [x] **#7 `onunload` 清理不完整** — `main.ts`
  - `detachLeavesOfType` 已存在于代码中，视图清理正常
  - `registerPropertyWidgets` 的全局 `focusin` 监听器泄漏已并入 #9 修复

---

## 中（影响性能/健壮性）

- [x] **#8 日期解析防御性不足** — `CategoryStatsCard.ts:181`
  - `parseInt` 加 radix 10，增加 `isNaN` 校验，去掉非空断言 `!`

- [x] **#9 propertyWidget DOM 泄漏** — `propertyWidget.ts`
  - 合并两次重复的 `focusin` 监听器为一个；`registerPropertyWidgets` 返回 cleanup 函数
  - `blur` 时 `remove()` 容器节点而非 `display:none`，杜绝游离 DOM
  - `main.ts` `onunload` 中调用 cleanup

- [x] **#10 数值边界缺失** — `KPICardsWidget.ts:46-61`
  - `lastMonthExpense=0` 时区分"持平"与"上月无支出"两种情况，不再显示错误的 `0%`

- [x] **#11 日期正则重复定义 3 次** — `main.ts`
  - 提取为模块级常量 `DATE_REGEX`

- [x] **#12 代码块参数解析逻辑过长** — `main.ts`
  - 提取为独立的 `parseCodeBlockConfig(source, sourcePath)` 函数，代码块处理器缩减至约 20 行

---

## 低（代码质量）

- [ ] **#13 代码风格不一致**
  - 部分地方遗漏可选链 `?.`、`private` 修饰符
  - 建议开启 ESLint 规则统一风格

- [ ] **#14 错误日志记录不足**
  - 部分异步操作失败时无日志，难以调试
  - 统一使用 `console.error` 并带上上下文信息

- [ ] **#15 硬编码字符串无国际化**
  - 所有 UI 文字直接硬编码中文
  - 若未来需要支持多语言，需提取为常量或 i18n 文件
