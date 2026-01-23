# Obsidian Cost

一个功能强大的 Obsidian 记账插件，帮助你在 Obsidian 中管理个人财务。

## ✨ 功能特性

### 📊 交易管理
- 支持多种交易类型：收入、支出、转账、还款
- 按日期分组显示交易记录
- 显示每笔交易的账户余额变动（支持清晰的资金流向显示，如 `A (-100) -> B (+100)`）
- 支持退款记录
- 点击日期/时间可快速编辑

### 🏦 账户管理
- 支持多种账户类型：银行卡、信用卡、电子钱包、现金、投资账户、预付卡等
- 自动计算账户当前余额
- 支持自定义账户图标
- 账户分组显示，自动计算分组小计

### 💰 资产概览
- 净资产汇总卡片
- 资产与负债比例可视化
- 实时余额变动追踪

### 📅 日历视图
- 迷你日历显示每日收支统计
- 月度收支汇总
- 点击日期快速跳转到对应交易

### 🎨 现代化 UI
- 两栏布局设计
- 灰色背景 + 白色卡片的现代风格
- 响应式设计，适配不同屏幕尺寸

## 📁 数据结构

### 账户文件 (Accounts)
```yaml
---
type: account
name: 账户名称
account_kind: bank | credit | wallet | cash | investment | prepaid | other
institution: 银行/机构名称
currency: CNY
opening_date: 2024-01-01
opening_balance: 0
icon: "📱"  # 可选，自定义图标
---
```

### 交易文件 (Transactions)
```yaml
---
type: txn
uid: XXXXXXXXXX
date: 2024-01-19
time: "14:30:00"
txn_type: 支出 | 收入 | 转账 | 还款
category: 餐饮/外卖
amount: 50.00
refund: 0
currency: CNY
from: 账户名称
to: 
payee: "商家名称"
address: 地址
tags: []
note: 备注
---
```

## ⚙️ 设置

在插件设置中可以配置：
- **Finance 文件夹路径**：存放财务数据的根目录
- **Accounts 文件夹路径**：账户文件存放位置
- **Transactions 文件夹路径**：交易文件存放位置

默认目录结构：
```
Finance/
├── Accounts/          # 账户文件
├── Transactions/      # 交易文件
│   └── 2024/
│       └── 2024-01/
│           └── 2024-01-19/
│               └── XXXXXXXXXX.md
├── Dashboards/        # 仪表板（可选）
└── Templates/         # 模板文件（可选）
```

## 🚀 快速开始

1. 安装插件
2. 在设置中配置文件夹路径
3. 创建你的第一个账户文件
4. 点击工具栏的 "+" 按钮添加交易
5. 在侧边栏或主视图中查看账户和交易

## 📱 视图说明

### 主视图
- **交易标签页**：左侧显示资产汇总和日历，右侧显示交易列表
- **账户标签页**：左侧显示账户列表，右侧显示选中账户的交易

### 侧边栏
- 显示所有账户的快速概览
- 点击账户可跳转到主视图查看详情

## 📝 Markdown 代码块

你可以在任何笔记（特别是日记）中插入 `ob-cost` 代码块来显示交易列表。

### 基本用法

在日记文件（例如 `2024-05-20.md`）中，只需插入空的代码块，插件会自动提取文件名中的日期：

```ob-cost
```

### 高级配置

支持通过 YAML 格式手动指定日期或日期范围：

**指定单日：**
```ob-cost
date: 2024-05-20
```

**指定日期范围：**
```ob-cost
startDate: 2024-05-01
endDate: 2024-05-31
```

## 🔧 开发

```bash
# 安装依赖
npm install

# 开发模式（监听文件变化）
npm run dev

# 生产构建
npm run build
```

## 📄 许可证

MIT License

## 🙏 致谢

- [Obsidian](https://obsidian.md/) - 强大的知识管理工具
- [Obsidian Sample Plugin](https://github.com/obsidianmd/obsidian-sample-plugin) - 插件开发模板