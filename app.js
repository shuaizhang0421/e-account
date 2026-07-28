(function () {
  "use strict";

  const STORAGE_KEY = "e-account:ledger:v1";
  const BASE_CURRENCY = "CNY";
  const CURRENCIES = ["CNY", "USD", "THB", "HKD", "GBP", "JPY", "KRW", "EUR", "AUD", "CAD", "SGD"];
  const ACCOUNT_TYPES = { cash: "现金", debit: "储蓄卡", credit: "信用卡", wallet: "电子钱包", other: "其他账户" };
  const PLAN_REPEATS = { none: "不重复", monthly: "每月", quarterly: "每季度", yearly: "每年" };
  const PLAN_STATUSES = { pending: "待处理", paid: "已支付", skipped: "已跳过" };
  const NAV = [["ledger", "流水", "i-book"], ["reports", "统计", "i-chart"], ["record", "记一笔", "i-plus"], ["assets", "资产", "i-wallet"], ["me", "我的", "i-user"]];
  const DEFAULT_CATEGORIES = [
    ["餐饮", "expense", "#ef5f79", "餐"], ["交通", "expense", "#f59e42", "行"], ["购物", "expense", "#8b7cf6", "购"], ["学习", "expense", "#308df5", "学"], ["医疗", "expense", "#fb7185", "医"], ["住房", "expense", "#35d3a6", "住"], ["娱乐", "expense", "#22c7d8", "乐"], ["手续费", "expense", "#64748b", "费"], ["其他", "expense", "#94a3b8", "其"],
    ["工资", "income", "#1aa979", "薪"], ["奖学金", "income", "#22c7d8", "奖"], ["兼职", "income", "#84cc16", "兼"], ["理财", "income", "#308df5", "利"], ["其他", "income", "#8b7cf6", "其"]
  ];
  const DEFAULT_QUICK_ACTIONS = [
    { id: "qa-food", name: "餐饮", type: "expense", amount: "", categoryName: "餐饮", note: "" },
    { id: "qa-traffic", name: "交通", type: "expense", amount: "", categoryName: "交通", note: "" },
    { id: "qa-shopping", name: "购物", type: "expense", amount: "", categoryName: "购物", note: "" },
    { id: "qa-salary", name: "工资", type: "income", amount: "", categoryName: "工资", note: "" },
    { id: "qa-credit", name: "还信用卡", type: "transfer", amount: "", categoryName: "其他", note: "信用卡还款" }
  ];

  let state = loadState();
  // Obsolete draft-note cache from earlier versions must never prefill a new record.
  localStorage.removeItem(`${STORAGE_KEY}:last-note`);
  syncInstallments();
  saveState();
  let view = "ledger";
  let selectedMonth = toMonth(new Date());
  let reportPeriod = "month";
  let customReportRange = monthRange(selectedMonth);
  let search = "";
  let filters = { type: "all", category: "all", account: "all", currency: "all" };
  let draft = newDraft("expense");
  let editing = null;
  let settingsPanel = "home";
  let searchRenderTimer = null;
  let accountEditingId = "";
  let accountFormDraft = null;
  let filterSheetOpen = false;
  let reminderCalendarMonth = toMonth(new Date());
  let reminderCalendarDate = toDate(new Date());
  // Visual-only selection state: never saved to the personal ledger backup.
  let pickerTypes = { account: "", "credit-target": "credit", "target-account": "" };
  let accountGroupState = { asset: { open: new Set(), closed: new Set() }, manage: { open: new Set(), closed: new Set() } };
  const app = document.getElementById("app");
  const surface = new URLSearchParams(window.location.search).get("surface") === "desktop" ? "desktop" : "web";

  render();

  const canUseServiceWorker = location.protocol === "https:" || ["localhost", "127.0.0.1"].includes(location.hostname);
  if ("serviceWorker" in navigator && canUseServiceWorker) {
    window.addEventListener("load", () => navigator.serviceWorker.register("./service-worker.js").catch(noop));
  }

  function render() {
    app.className = `app-shell surface-${surface}`;
    const content = `${topbar()}<main class="workspace">${hero()}${viewTemplate()}</main>`;
    app.innerHTML = surface === "desktop"
      ? `<div class="desktop-frame">${content}${bottomNav()}</div><div class="notice" id="notice"></div>`
      : `${webSidebar()}<div class="web-frame">${content}</div>${bottomNav()}<div class="notice" id="notice"></div>`;
    bindStaticEvents();
    drawCharts();
  }

  function topbar() {
    return `<header class="app-topbar"><button class="topbar-brand" data-view="ledger" type="button" aria-label="返回流水">${brandMark("topbar-mark")}<strong>E-Account</strong></button><div class="topbar-controls"><label class="field topbar-month"><span>月份</span><input id="month" type="month" value="${selectedMonth}"></label><label class="field topbar-search"><span>搜索</span><input id="search" type="search" placeholder="分类、账户、备注" value="${escapeAttr(search)}"></label><button class="btn primary topbar-create" data-view="record" type="button">${svg("i-plus")}记一笔</button></div></header>`;
  }

  function webSidebar() {
    return `<aside class="side web-side"><button class="side-brand" data-view="ledger" type="button">${brandMark("side-mark")}<span><strong>E-Account</strong><small>个人账本</small></span></button><nav class="nav" aria-label="主导航">${NAV.map(([id, label, icon]) => `<button class="${view === id ? "active" : ""}" data-view="${id}" type="button">${svg(icon)}<span>${label}</span></button>`).join("")}</nav>${voyageArtwork()}<div class="side-footer"><span></span>本地保存 · 仅此设备</div></aside>`;
  }

  function bottomNav() {
    return `<nav class="bottom-nav" aria-label="主导航">${NAV.map(([id, label, icon]) => `<button class="${view === id ? "active" : ""}" data-view="${id}" type="button">${id === "record" ? `<span class="nav-create-icon">${svg(icon)}</span>` : svg(icon)}<span>${label}</span></button>`).join("")}</nav>`;
  }

  function brandMark(className = "") { return `<img class="brand-mark ${className}" src="./icons/icon-512.png" alt="">`; }

  function voyageArtwork() {
    return `<div class="voyage-art" aria-hidden="true"><i class="voyage-line line-white"></i><i class="voyage-line line-cyan"></i><i class="voyage-line line-mint"></i><i class="voyage-line line-violet"></i><i class="voyage-line line-coral"></i><span class="voyage-star star-one"></span><span class="voyage-star star-two"></span><span class="voyage-star star-three"></span><span class="voyage-star star-four"></span><span class="voyage-sail"><i class="sail-mast"></i><i class="sail-left"></i><i class="sail-right"></i><i class="sail-hull"></i><i class="sail-wake"></i></span></div>`;
  }

  function hero() {
    if (view === "me") return "";
    const title = { ledger: "流水", reports: "统计", record: "记一笔", assets: "资产" }[view];
    const desc = { ledger: "查找、筛选和编辑每一笔记录。", reports: "把消费结构和变化看清楚。", record: "用图标快速完成一笔记账。", assets: "资产、负债和信用卡应还，一次看清。" }[view];
    return `<section class="page-title"><div><span class="page-kicker">E-Account · ${selectedMonth}</span><h2>${title}</h2><p>${desc}</p></div></section>`;
  }

  function viewTemplate() { return ({ ledger: ledgerView, reports: reportsView, record: recordView, assets: assetsView, me: meView }[view])(); }

  function ledgerView() {
    const list = filteredTransactions();
    const fields = filterFields();
    const tags = activeFilterTags();
    const sheet = filterSheetOpen ? `<div class="sheet-backdrop" data-action="close-filter-sheet"></div><section class="filter-sheet"><div class="sheet-handle"></div><div class="panel-header"><h3>筛选流水</h3><button class="mini" data-action="close-filter-sheet" type="button">完成</button></div>${fields}</section>` : "";
    return `<section class="view active"><div class="toolbar desktop-filter-bar">${fields}</div><div class="mobile-filter-bar"><button class="btn primary" data-action="open-filter-sheet" type="button">${svg("i-sliders")}筛选</button><div class="filter-tags">${tags || "<span>全部流水</span>"}</div>${tags ? `<button class="mini" data-action="clear-filters" type="button">清除</button>` : ""}</div>${sheet}<section class="panel solid"><div class="panel-header"><h3>流水明细</h3><span>${list.length} 条</span></div><div class="table-wrap">${transactionsTable(list)}</div><div class="mobile-cards">${list.map(transactionCard).join("") || empty("没有符合条件的流水")}</div></section></section>`;
  }
  function filterFields() { return `<div class="filter-fields">${selectField("类型", "filter-type", [["all", "全部"], ["expense", "支出"], ["income", "收入"], ["transfer", "还款"], ["exchange", "购汇"], ["fee", "手续费"]], filters.type)}${selectField("分类", "filter-category", [["all", "全部分类"], ...state.categories.map((c) => [c.id, c.name])], filters.category)}${selectField("账户", "filter-account", [["all", "全部账户"], ...orderedAccounts().map((a) => [a.id, accountDisplayName(a)])], filters.account)}${selectField("币种", "filter-currency", [["all", "全部币种"], ...CURRENCIES.map((c) => [c, c])], filters.currency)}<button class="btn" data-action="clear-filters" type="button">清除筛选</button></div>`; }
  function activeFilterTags() { const labels = [filters.type !== "all" ? typeLabel(filters.type) : "", filters.category !== "all" ? categoryById(filters.category)?.name : "", filters.account !== "all" ? accountDisplayName(accountById(filters.account)) : "", filters.currency !== "all" ? filters.currency : ""]; return labels.filter(Boolean).map((label) => `<span>${escapeHtml(label)}</span>`).join(""); }

  function reportsView() {
    const range = reportWindow();
    const items = transactionsBetween(range.start, range.end).filter((t) => t.type !== "transfer");
    const summaries = summarize(items);
    const s = summaries.CNY || { income: 0, expense: 0 };
    const prev = summarize(transactionsBetween(range.previousStart, range.previousEnd)).CNY || { income: 0, expense: 0 };
    const balance = s.income - s.expense;
    const daily = s.expense / Math.max(1, dateSpan(range.start, range.end));
    const expenseRatio = s.income > 0 ? Math.min(100, Math.round(s.expense / s.income * 100)) : 0;
    const customFields = reportPeriod === "custom" ? `<div class="custom-range"><label class="field"><span>开始日期</span><input id="report-start" type="date" value="${customReportRange.start}"></label><label class="field"><span>结束日期</span><input id="report-end" type="date" value="${customReportRange.end}"></label></div>` : "";
    return `<section class="view active grid"><section class="insight-card report-card"><div><span class="eyebrow">本机账本 · ${range.label} · CNY</span><h3>统计分析</h3><strong>${money(balance)}</strong><small>当前结余 · 支出占收入 ${expenseRatio}%</small><div class="progress"><span style="width:${expenseRatio}%"></span></div></div><div class="insight-split"><article><span>收入</span><strong class="income">+${money(s.income)}</strong></article><article><span>支出</span><strong class="expense">-${money(s.expense)}</strong></article><article><span>日均</span><strong>${money(daily)}</strong></article></div></section>${reportPeriodTabs()}${customFields}${currencySummary(summaries)}<div class="grid two">${chartPanel("分类占比", "消费结构 · CNY", "shareChart")}<section class="panel"><div class="panel-header"><h3>消费排行</h3><span>Top 8 · CNY</span></div><div class="list">${categoryRank(items)}</div></section></div><div class="grid two">${chartPanel("区间趋势", "收入与支出 · CNY", "trendChart")}${chartPanel("最近 7 天", "支出节奏 · CNY", "weekChart")}</div><section class="panel"><div class="panel-header"><h3>当前区间 vs 上一区间</h3><span>CNY</span></div><div class="grid three">${compareMetric("收入", s.income, prev.income, true)}${compareMetric("支出", s.expense, prev.expense, false)}${compareMetric("结余", s.income - s.expense, prev.income - prev.expense, true)}</div></section></section>`;
  }

  function recordView() {
    const account = accountById(draft.accountId);
    const normal = draft.type === "expense" || draft.type === "income";
    const cats = state.categories.filter((c) => c.type === (draft.type === "income" ? "income" : "expense"));
    const types = `${choice("支出", "expense", draft.type === "expense", svg("i-arrow-down"), "日常消费")}${choice("收入", "income", draft.type === "income", svg("i-arrow-up"), "工资、奖金")}${choice("还信用卡", "transfer", draft.type === "transfer", svg("i-credit-card"), "支持外币")}${choice("购汇", "exchange", draft.type === "exchange", svg("i-sparkles"), "资金兑换")}${choice("信用卡分期", "installment", draft.type === "installment", svg("i-chart"), "按月入账")}`;
    let fields = "";
    if (normal) fields = standardTransactionFields(account, cats);
    if (draft.type === "transfer") fields = repaymentFields(account);
    if (draft.type === "exchange") fields = exchangeFields(account);
    if (draft.type === "installment") fields = installmentFields(account, cats);
    return `<section class="view active record-layout"><section class="panel solid"><div class="panel-header"><h3>${editing ? "编辑流水" : "记一笔"}</h3><span>按实际币种记录</span></div><div class="form-stack"><div class="icon-grid transaction-types">${types}</div>${fields}</div></section><aside class="panel"><div class="panel-header"><h3>快捷入口</h3><button class="mini" data-action="open-quick-manager" type="button">管理</button></div><div class="list">${state.quickActions.map(quickActionButton).join("")}</div><div class="panel-header recent-heading"><h3>最近流水</h3><span>5 条</span></div><div class="list">${state.transactions.slice().sort(byDateDesc).slice(0, 5).map(simpleTransaction).join("") || empty("暂无流水")}</div></aside></section>`;
  }
  function standardTransactionFields(account, cats) { return `${amountDateFields("金额", "日期")} ${accountPicker("账户", orderedAccounts(), draft.accountId, "account")} ${currencyPicker("本次币种", account?.currencies || [], draft.currency, "currency")}<div><div class="panel-header"><h3>分类</h3><button class="mini" data-action="open-category-manager" type="button">管理</button></div><div class="icon-grid">${cats.map(categoryChoice).join("")}</div></div>${noteAndActions()}`; }
  function repaymentFields(account) { const target = accountById(draft.targetAccountId); return `${accountPicker("付款账户", orderedAccounts().filter((a) => a.type !== "credit"), draft.accountId, "account")}${currencyPicker("付款币种", account?.currencies || [], draft.currency, "currency")}${amountDateFields("付款金额", "还款日期")}${accountPicker("还到信用卡", orderedAccounts().filter((a) => a.type === "credit"), draft.targetAccountId, "credit-target")}${currencyPicker("偿还币种", target?.currencies || [], draft.targetCurrency, "target-currency")}<label class="field"><span>信用卡实际还款金额</span><input id="draft-target-amount" type="number" step="0.01" min="0.01" value="${escapeAttr(draft.targetAmount || draft.amount)}" placeholder="外币还款可与付款金额不同"></label>${repaymentAllocationFields(target)}${rateHint()}${feeFields(account)}${noteAndActions("保存还款")}`; }
  function repaymentAllocationFields(target) {
    if (!target || target.type !== "credit") return empty("选择信用卡和偿还币种后，可分配到已出账账单。");
    const statements = creditStatements(target.id, draft.targetCurrency, { excludeTransactionId: editing }).filter((item) => item.remaining > 0);
    if (!statements.length) return `<div class="repayment-allocation empty">当前币种没有待还的已出账账单。</div>`;
    const selected = new Map((draft.statementAllocations || []).map((item) => [item.statementId, item.amount]));
    return `<section class="repayment-allocation"><div class="panel-header"><div><h3>分配还款账单</h3><span>可勾选多张账单；分配合计必须等于实际还款金额。</span></div><span>${statements.length} 张</span></div><div class="allocation-list">${statements.map((item) => { const amount = selected.get(item.id); const checked = amount != null; return `<label class="allocation-row"><input data-statement-toggle="${escapeAttr(item.id)}" type="checkbox" ${checked ? "checked" : ""}><span><strong>${item.cycleStart} 至 ${item.cycleEnd}</strong><small>到期 ${item.dueDate} · 剩余 ${money(item.remaining, item.currency)}</small></span><input data-statement-allocation="${escapeAttr(item.id)}" type="number" min="0.01" max="${item.remaining}" step="0.01" value="${escapeAttr(checked ? amount : item.remaining)}" ${checked ? "" : "disabled"}></label>`; }).join("")}</div></section>`;
  }
  function exchangeFields(account) { const target = accountById(draft.targetAccountId); return `${accountPicker("扣款账户", orderedAccounts().filter((a) => a.type !== "credit"), draft.accountId, "account")}${currencyPicker("扣款币种", account?.currencies || [], draft.currency, "currency")}${amountDateFields("扣款金额", "购汇日期")}${accountPicker("入账账户", orderedAccounts().filter((a) => a.type !== "credit"), draft.targetAccountId, "target-account")}${currencyPicker("买入币种", target?.currencies || [], draft.targetCurrency, "target-currency")}<label class="field"><span>买入金额</span><input id="draft-target-amount" type="number" step="0.01" min="0.01" value="${escapeAttr(draft.targetAmount)}" placeholder="0.00"></label>${rateHint()}${feeFields(account)}${noteAndActions("保存购汇")}`; }
  function installmentFields(account, cats) { return `${accountPicker("分期信用卡", orderedAccounts().filter((a) => a.type === "credit"), draft.accountId, "account")}${currencyPicker("分期币种", account?.currencies || [], draft.currency, "currency")}<div class="form-grid"><label class="field amount-input"><span>分期本金</span><input id="draft-amount" type="number" step="0.01" min="0.01" value="${escapeAttr(draft.amount)}" placeholder="0.00"></label><label class="field"><span>首期入账日期</span><input id="draft-first-date" type="date" value="${draft.firstDate}"></label><label class="field"><span>分期期数</span><input id="draft-installment-count" type="number" min="2" max="120" value="${escapeAttr(draft.installmentCount || 3)}"></label><label class="field"><span>总手续费（可选）</span><input id="draft-fee-amount" type="number" min="0" step="0.01" value="${escapeAttr(draft.feeAmount)}"></label></div><div><div class="panel-header"><h3>消费分类</h3></div><div class="icon-grid">${cats.map(categoryChoice).join("")}</div></div>${noteAndActions("创建分期")}`; }
  function amountDateFields(amountLabel, dateLabel) { return `<div class="record-amount-grid"><label class="field amount-input"><span>${amountLabel}</span><input id="draft-amount" type="number" step="0.01" min="0.01" value="${escapeAttr(draft.amount)}" placeholder="0.00"></label><label class="field"><span>${dateLabel}</span><input id="draft-date" type="date" value="${draft.date}"></label></div>`; }
  function accountPicker(title, accounts, activeId, mode) {
    const types = [...new Set(accounts.map((account) => account.type))];
    const active = accountById(activeId);
    const selectedType = types.includes(pickerTypes[mode]) ? pickerTypes[mode] : (types.includes(active?.type) ? active.type : types[0] || "");
    const selectedAccounts = accounts.filter((account) => account.type === selectedType);
    const banks = bankGroupsFromAccounts(selectedAccounts);
    const typeButtons = types.map((type) => `<button class="account-type-choice ${type === selectedType ? "active" : ""}" data-action="set-picker-type" data-picker-mode="${escapeAttr(mode)}" data-picker-type="${escapeAttr(type)}" type="button"><i>${svg(accountIcon({ type }))}</i><span>${ACCOUNT_TYPES[type]}</span></button>`).join("");
    const cards = banks.map((group) => `<section class="picker-bank"><div class="picker-bank-title"><strong>${escapeHtml(group.bank || "未归类机构")}</strong><span>${group.accounts.length} 张</span></div><div class="picker-account-grid">${group.accounts.map((account) => accountChoice(account, activeId, mode)).join("")}</div></section>`).join("");
    const emptyState = `<div class="picker-empty">该类型暂无账户。<button class="mini" data-action="open-account-manager" type="button">新增账户</button></div>`;
    return `<section class="account-picker"><div class="panel-header"><h3>${title}</h3><span>先选类型，再选卡片</span></div><div class="account-type-picker">${typeButtons || ""}</div>${selectedAccounts.length ? cards : emptyState}</section>`;
  }
  function currencyPicker(title, list, active, mode) { const currencies = list.length ? list : [BASE_CURRENCY]; return `<div><div class="panel-header"><h3>${title}</h3><span>实际交易币种</span></div><div class="currency-choice-grid">${currencies.map((currency) => `<button class="currency-choice ${currency === active ? "active" : ""}" data-${mode}="${currency}" type="button">${currency}</button>`).join("")}</div></div>`; }
  function rateHint() { const rate = Number(draft.amount) > 0 && Number(draft.targetAmount) > 0 ? round(Number(draft.amount) / Number(draft.targetAmount)) : 0; return `<div class="exchange-hint">${rate ? `实际汇率：1 ${draft.targetCurrency} = ${rate} ${draft.currency}` : "填写两边金额后，将保存本次实际成交汇率。"}</div>`; }
  function feeFields(account) { return `<div class="form-grid"><label class="field"><span>手续费（可选）</span><input id="draft-fee-amount" type="number" min="0" step="0.01" value="${escapeAttr(draft.feeAmount)}"></label>${currencyPicker("手续费币种", account?.currencies || [], draft.feeCurrency || draft.currency, "fee-currency")}</div>`; }
  function noteAndActions(label = "保存流水") { return `<div class="voice-box"><label class="field"><span>备注 / 一句话记账</span><input id="draft-note" type="text" maxlength="80" value="${escapeAttr(draft.note)}" placeholder="例如：今天午饭 28 支付宝"></label><button class="btn" data-action="parse-note" type="button">本地解析</button></div><div class="actions"><button class="btn ghost" data-action="reset-draft" type="button">重置</button><button class="btn primary" data-action="save-transaction" type="button">${label}</button></div>`; }

  function assetsView() {
    const snapshot = assetSnapshot(); const activeInstallments = state.installments.filter((item) => !item.ended);
    return `<section class="view active grid"><section class="insight-card asset-hero"><div><span class="eyebrow">本机账户 · 全部流水累计</span><h3>净资产</h3><strong>${formatCurrencyMap(snapshot.net)}</strong><small>资产减含未来分期的总欠款，多币种分别显示，不自动折算。</small></div><div class="insight-split"><article><span>资产</span><strong>${formatCurrencyMap(snapshot.assets)}</strong></article><article><span>当前总欠款</span><strong class="debt">${formatCurrencyMap(snapshot.currentDebts)}</strong></article><article><span>含分期总欠款</span><strong class="debt">${formatCurrencyMap(snapshot.totalDebts)}</strong></article></div></section><section class="panel solid"><div class="panel-header"><div><h3>信用卡账单</h3><span>已出账待还 ${formatCurrencyMap(snapshot.billedDebts)}</span></div><span>${pendingBillDayTransactions().length} 笔待核验</span></div>${creditStatementsPanel()}</section><div class="grid two"><section class="panel solid"><div class="panel-header"><h3>账户资产</h3><span>按类型、银行收纳</span></div>${accountGroupActions("asset")}${accountGroupsHtml("asset")}</section><section class="panel solid"><div class="panel-header"><h3>信用卡提醒</h3><span>已出账与预计日期</span></div><div class="list">${creditReminderItems()}</div></section></div><section class="panel"><div class="panel-header"><h3>信用卡分期</h3><span>${activeInstallments.length} 笔未结束</span></div><div class="list">${activeInstallments.map(installmentItem).join("") || empty("暂无信用卡分期")}</div></section></section>`;
  }

  function meView() {
    if (settingsPanel !== "home") return settingsDetailView();
    return `<section class="view active grid my-view"><section class="identity-strip">${brandMark("identity-mark")}<div><span class="local-chip">本地保存</span><h3>E-Account</h3></div></section>${reminderOverview()}<div class="settings-grid compact-settings"><button class="setting-tile" data-action="open-setting" data-panel="accounts" type="button"><i>${svg("i-card")}</i><span><strong>账户与卡片</strong><small>储蓄卡、信用卡与余额</small></span></button><button class="setting-tile" data-action="open-setting" data-panel="security" type="button"><i>${svg("i-lock")}</i><span><strong>备份与隐私</strong><small>导入、导出与本地数据</small></span></button><button class="setting-tile" data-action="open-setting" data-panel="preferences" type="button"><i>${svg("i-sliders")}</i><span><strong>外观与偏好</strong><small>主题与本地维护</small></span></button></div></section>`;
  }

  function reminderOverview() {
    const days = Array.from({ length: 7 }, (_, index) => addDays(new Date(), index));
    const events = reminderEventsBetween(toDate(days[0]), toDate(days[days.length - 1]));
    const calendar = days.map((day, index) => {
      const date = toDate(day); const count = events.filter((item) => item.date === date).length;
      return `<div class="calendar-day ${index === 0 ? "today" : ""}"><span>${["日", "一", "二", "三", "四", "五", "六"][day.getDay()]}</span><strong>${day.getDate()}</strong>${count ? `<i>${count}</i>` : ""}</div>`;
    }).join("");
    const content = events.slice(0, 5).map(reminderEventItem).join("") || `<div class="reminder-empty"><span>${svg("i-bell")}</span><div><strong>近期没有待处理事项</strong><small>可添加还款、房租或订阅续费提醒。</small></div><button class="mini" data-action="open-setting" data-panel="reminders" type="button">添加提醒</button></div>`;
    return `<section class="panel reminder-overview"><div class="panel-header"><div><h3>近期提醒</h3><span>未来计划、还款与分期安排</span></div><button class="mini" data-action="open-setting" data-panel="reminders" type="button">查看全部</button></div><div class="calendar-strip">${calendar}</div><div class="reminder-list">${content}</div></section>`;
  }

  function reminderEventItem(item) {
    const diff = dateDistance(item.date);
    const timing = diff < 0 ? `已逾期 ${Math.abs(diff)} 天` : diff === 0 ? "今天" : `${diff} 天后`;
    const amount = item.amount > 0 ? money(item.amount, item.currency) : (item.label || "待处理");
    const action = item.kind === "credit"
      ? `<button class="mini primary-mini" data-action="pay-credit" data-id="${escapeAttr(item.account.id)}" data-currency="${item.currency}" data-statement-id="${escapeAttr(item.statementId || "")}" type="button">去还款</button>`
      : item.kind === "plan"
        ? `<button class="mini primary-mini" data-action="pay-plan" data-id="${escapeAttr(item.plan.id)}" type="button">记为流水</button>`
        : item.kind === "bill" || item.kind === "due-forecast"
          ? `<button class="mini" data-view="assets" type="button">查看账单</button>`
          : `<button class="mini" data-view="assets" type="button">查看分期</button>`;
    const icon = item.kind === "credit" || item.kind === "bill" || item.kind === "due-forecast" ? "i-credit-card" : item.kind === "installment" ? "i-chart" : "i-bell";
    const label = item.kind === "credit" ? "应还" : item.kind === "installment" ? "待入账" : item.kind === "bill" ? "账单日" : item.kind === "due-forecast" ? "预计" : "待处理";
    return `<article class="reminder-row ${diff < 0 && item.kind === "credit" ? "overdue" : ""}"><span class="reminder-icon">${svg(icon)}</span><div><strong>${escapeHtml(item.title)}</strong><small>${item.date} · ${escapeHtml(item.detail)} · ${timing}</small></div><div class="reminder-amount"><strong>${amount}</strong><span>${label}</span></div>${action}</article>`;
  }

  function reminderCalendarView() {
    const range = monthRange(reminderCalendarMonth); const events = reminderEventsForMonth(reminderCalendarMonth);
    const firstDay = parseLocalDate(range.start).getDay(); const totalDays = daysInMonth(reminderCalendarMonth);
    const blanks = Array.from({ length: firstDay }, () => `<span class="calendar-blank"></span>`).join("");
    const days = Array.from({ length: totalDays }, (_, index) => {
      const date = `${reminderCalendarMonth}-${pad(index + 1)}`; const count = events.filter((item) => item.date === date).length;
      const classes = ["calendar-day", "month-day", date === toDate(new Date()) ? "today" : "", date === reminderCalendarDate ? "selected" : "", count ? "has-events" : ""].filter(Boolean).join(" ");
      return `<button class="${classes}" data-action="select-reminder-date" data-date="${date}" type="button"><span>${index + 1}</span>${count ? `<i>${count}</i>` : ""}</button>`;
    }).join("");
    const selected = events.filter((item) => item.date === reminderCalendarDate);
    const selectedLabel = reminderCalendarDate === toDate(new Date()) ? "今天" : reminderCalendarDate;
    return `<section class="panel reminder-calendar"><div class="panel-header"><div><h3>提醒日历</h3><span>还款、计划与分期入账日</span></div><div class="calendar-controls"><button class="mini" data-action="calendar-prev" type="button">上月</button><strong>${reminderCalendarMonth.replace("-", " 年 ")} 月</strong><button class="mini" data-action="calendar-next" type="button">下月</button></div></div><div class="calendar-weekdays"><span>日</span><span>一</span><span>二</span><span>三</span><span>四</span><span>五</span><span>六</span></div><div class="calendar-month-grid">${blanks}${days}</div><div class="calendar-selected"><div class="panel-header"><h3>${selectedLabel}</h3><span>${selected.length} 项安排</span></div><div class="reminder-list">${selected.map(reminderEventItem).join("") || empty("这一天没有提醒事项")}</div></div></section>`;
  }

  function reminderEventsBetween(start, end) {
    const months = []; for (let cursor = start.slice(0, 7); cursor <= end.slice(0, 7); cursor = nextMonth(cursor)) months.push(cursor);
    return months.flatMap(reminderEventsForMonth).filter((item) => item.date >= start && item.date <= end).sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title, "zh-CN"));
  }
  function reminderEventsForMonth(month) { return [...planReminderEvents(month), ...creditReminderEvents(month), ...billingCalendarEvents(month), ...installmentReminderEvents(month)].sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title, "zh-CN")); }
  function planReminderEvents(month) {
    const range = monthRange(month); const steps = { monthly: 1, quarterly: 3, yearly: 12 };
    return state.plans.filter((plan) => plan.status === "pending").flatMap((plan) => {
      if (plan.repeat === "none") return plan.date >= range.start && plan.date <= range.end ? [{ kind: "plan", date: plan.date, title: plan.name, detail: accountDisplayName(accountById(plan.accountId)) || "未关联账户", amount: plan.amount, currency: plan.currency, plan }] : [];
      const step = steps[plan.repeat]; const result = [];
      for (let index = 0, date = plan.date; date <= range.end && index < 240; index += 1, date = addMonths(plan.date, index * step)) if (date >= range.start) result.push({ kind: "plan", date, title: plan.name, detail: `${PLAN_REPEATS[plan.repeat]} · ${accountDisplayName(accountById(plan.accountId)) || "未关联账户"}`, amount: plan.amount, currency: plan.currency, plan });
      return result;
    });
  }
  function creditReminderEvents(month) {
    return creditReminderData().filter((item) => item.dueDate.startsWith(month)).map((item) => ({ kind: "credit", date: item.dueDate, title: `${accountDisplayName(item.account)} · ${item.currency}`, detail: `${item.cycleStart} 至 ${item.cycleEnd} · 已还 ${money(item.paid, item.currency)} · ${item.checked ? "已核对" : "待核对"}`, amount: item.remaining, currency: item.currency, account: item.account, statementId: item.id }));
  }
  function billingCalendarEvents(month) {
    const actualDue = new Set(creditReminderData().map((item) => `${item.accountId}:${item.dueDate}`));
    return state.accounts.filter((account) => account.type === "credit" && account.billDay && account.dueDay).flatMap((account) => {
      const billDate = dateWithDay(month, account.billDay);
      const dueDate = dateWithDay(month, account.dueDay);
      const bill = { kind: "bill", date: billDate, title: accountDisplayName(account), detail: "预计账单日 · 当天交易请核验归属", amount: 0, currency: "", account, label: "待核验" };
      const due = actualDue.has(`${account.id}:${dueDate}`) ? [] : [{ kind: "due-forecast", date: dueDate, title: accountDisplayName(account), detail: "预计还款日 · 以实际出账单为准", amount: 0, currency: "", account, label: "待出账" }];
      return [bill, ...due];
    });
  }
  function installmentReminderEvents(month) {
    const range = monthRange(month);
    return state.installments.filter((item) => !item.ended).flatMap((item) => Array.from({ length: item.count }, (_, index) => {
      const period = index + 1; const date = addMonths(item.firstDate, index); const generated = state.transactions.some((transaction) => transaction.id === `${item.id}-p-${period}`);
      if (date < range.start || date > range.end || generated || item.skippedPeriods.includes(period)) return null;
      const amount = round(installmentPrincipal(item, index) + installmentFee(item, index));
      return { kind: "installment", date, title: `${accountDisplayName(accountById(item.accountId)) || "信用卡分期"} · 第 ${period}/${item.count} 期`, detail: categoryById(item.categoryId)?.name || "未分类", amount, currency: item.currency, installment: item };
    }).filter(Boolean));
  }
  function settingsDetailView() {
    const title = { security: "备份与隐私", accounts: "账户与卡片", categories: "分类规则", quick: "快捷入口", reminders: "提醒与计划", preferences: "外观与偏好" }[settingsPanel] || "我的";
    const body = {
      security: `<section class="panel solid"><div class="panel-header"><h3>数据安全</h3><span>只在本地</span></div><p class="muted-copy">E-Account 不接后端、不上传云端。公开网页源码不等于公开账单，账单存在当前浏览器 localStorage。换域名或换手机时，用 JSON 导出/导入迁移。</p><div class="top-actions"><button class="btn" data-action="export-json" type="button">导出 JSON</button><button class="btn" data-action="export-csv" type="button">导出 CSV</button><label class="btn"><input id="import-json" type="file" accept="application/json" hidden>导入 JSON</label></div></section>`,
      accounts: accountsManager(),
      categories: categoriesManager(),
      quick: quickManager(),
      reminders: `${reminderCalendarView()}${plansManager()}`,
      preferences: `<section class="panel"><div class="panel-header"><h3>偏好与维护</h3><span>谨慎操作</span></div><div class="grid two"><article class="item"><div><strong>默认货币</strong><small>${BASE_CURRENCY} · 当前版本不自动折算外币</small></div></article><article class="item"><div><strong>主题</strong><small>清爽高级 · 自由流线背景</small></div></article></div><div class="top-actions"><button class="btn danger" data-action="reset-all" type="button">恢复默认数据</button></div></section>`
    }[settingsPanel];
    return `<section class="view active grid"><button class="btn ghost" data-action="back-settings" type="button">返回我的</button><section class="page-title compact-page-title"><div><span class="page-kicker">E-Account</span><h2>${title}</h2></div></section>${body}</section>`;
  }

  function accountsManager() {
    if (!accountFormDraft) accountFormDraft = newAccountForm();
    const f = accountFormDraft;
    const statementDate = validDate(f.statementBaselineDate) ? f.statementBaselineDate : (f.billDay ? latestStatementDate(f) : "");
    const baselineFields = f.currencies.map((currency) => `<label class="field"><span>${currency} 历史已出账应还</span><input data-statement-balance="${currency}" type="number" min="0" step="0.01" value="${escapeAttr(f.statementBaselines?.[currency]?.amount || 0)}"></label>`).join("");
    const statementConfig = f.type === "credit" ? `<section class="credit-statement-config"><div class="panel-header"><div><h3>信用卡账单设置</h3><span>账单日当天流水需在资产页核验归属；还款日取账单日后第一次出现的日期。</span></div></div><div class="form-grid"><label class="field"><span>历史已出账账单日</span><input id="account-statement-date" type="date" value="${statementDate}"></label><label class="field"><span>还款规则</span><input value="账单日后第一次还款日为到期日" disabled></label></div><div class="balance-grid statement-baseline-grid">${baselineFields}</div></section>` : "";

    return `<section class="panel account-center"><div class="panel-header"><div><h3>${accountEditingId ? "编辑账户" : "添加账户"}</h3><span>账户类型 → 银行/机构 → 具体卡片</span></div>${accountEditingId ? `<button class="mini" data-action="cancel-account-edit">取消编辑</button>` : ""}</div><div class="form-grid"><label class="field"><span>账户名称</span><input id="account-name" value="${escapeAttr(f.name)}" placeholder="例如 招商 Visa 信用卡"></label>${selectField("账户类型", "account-type", Object.entries(ACCOUNT_TYPES), f.type)}<label class="field"><span>银行/机构</span><input id="account-bank" list="bank-list" value="${escapeAttr(f.bank)}" placeholder="例如 招商银行"></label><label class="field"><span>卡号尾号（可选）</span><input id="account-tail" maxlength="12" value="${escapeAttr(f.tail)}" placeholder="1234"></label><label class="field"><span>账单日</span><input id="account-bill-day" type="number" min="1" max="31" value="${escapeAttr(f.billDay)}" placeholder="信用卡填写"></label><label class="field"><span>还款日</span><input id="account-due-day" type="number" min="1" max="31" value="${escapeAttr(f.dueDay)}" placeholder="信用卡填写"></label><label class="field"><span>信用额度</span><input id="account-credit-limit" type="number" min="0" step="0.01" value="${escapeAttr(f.creditLimit)}" placeholder="信用卡可填"></label><label class="field"><span>备注</span><input id="account-note" maxlength="80" value="${escapeAttr(f.note)}" placeholder="可选"></label></div><datalist id="bank-list">${bankNames().map((name) => `<option value="${escapeAttr(name)}">`).join("")}</datalist><div class="currency-manager"><div class="panel-header"><h3>账户支持币种</h3><span>至少保留一种</span></div><div class="currency-choice-grid">${CURRENCIES.map((currency) => `<button class="currency-choice ${f.currencies.includes(currency) ? "active" : ""}" data-action="toggle-account-currency" data-currency="${currency}" type="button">${currency}</button>`).join("")}</div><div class="balance-grid">${f.currencies.map((currency) => `<label class="field"><span>${currency}${f.type === "credit" ? " 初始欠款" : " 初始余额"}</span><input data-account-balance="${currency}" type="number" step="0.01" value="${escapeAttr(f.initialBalances[currency] || 0)}"></label>`).join("")}</div></div>${statementConfig}<div class="actions account-action-bar"><button class="btn primary" data-action="save-account" type="button">${accountEditingId ? "保存账户" : "新增账户"}</button></div></section><section class="panel"><div class="panel-header"><h3>账户列表</h3><span>按类型、银行收纳</span></div>${accountGroupActions("manage")}${accountGroupsHtml("manage")}</section>`;
  }
  function categoriesManager() { return `<section class="panel"><div class="panel-header"><h3>分类管理</h3><span>决定报表结构</span></div><div class="form-grid"><label class="field"><span>名称</span><input id="category-name" placeholder="例如 宠物"></label>${selectField("类型", "category-type", [["expense", "支出"], ["income", "收入"]], "expense")}<label class="field"><span>图标字</span><input id="category-icon" maxlength="2" placeholder="宠"></label><label class="field"><span>颜色</span><input id="category-color" type="color" value="#308df5"></label><button class="btn primary full" data-action="add-category" type="button">新增分类</button></div><div class="list" style="margin-top:12px">${state.categories.map(categoryManageItem).join("")}</div></section>`; }
  function plansManager() {
    const credit = creditReminderData(); const pending = pendingBillDayTransactions();
    const verification = pending.length ? `<section class="statement-verification reminder-verification"><div class="panel-header"><div><h3>账单日交易待核验</h3><span>查看银行 App 后，选择是否计入本期账单。</span></div><span>${pending.length} 笔</span></div><div class="list">${pending.map(statementVerificationItem).join("")}</div></section>` : "";
    return `<section class="panel"><div class="panel-header"><h3>智能还款提醒</h3><span>仅显示已出账且未还清的账单</span></div><div class="list manager-list">${credit.map(creditReminderPreviewItem).join("") || empty("添加信用卡、设置账单日和还款日后，将自动显示提醒")}</div></section>${verification}<section class="panel"><div class="panel-header"><h3>计划提醒</h3><span>房租、订阅、续费等手工计划</span></div><div class="form-grid"><label class="field"><span>名称</span><input id="plan-name" placeholder="例如 房租 / 会员续费"></label><label class="field"><span>金额</span><input id="plan-amount" type="number" step="0.01" placeholder="0.00"></label><label class="field"><span>日期</span><input id="plan-date" type="date" value="${toDate(new Date())}"></label>${selectField("账户", "plan-account", orderedAccounts().map((a) => [a.id, accountDisplayName(a)]), state.accounts[0]?.id || "")}${selectField("币种", "plan-currency", CURRENCIES.map((c) => [c, c]), BASE_CURRENCY)}${selectField("分类", "plan-category", state.categories.filter((c) => c.type === "expense").map((c) => [c.id, c.name]), expenseCategory()?.id || "")}${selectField("重复", "plan-repeat", Object.entries(PLAN_REPEATS), "none")}<label class="field full"><span>备注</span><input id="plan-note" placeholder="可写账单说明"></label><button class="btn primary full" data-action="add-plan" type="button">新增提醒</button></div><div class="list manager-list">${state.plans.slice().sort((a, b) => a.date.localeCompare(b.date)).map(planItem).join("") || empty("暂无手工提醒")}</div></section>`;
  }
  function quickManager() { return `<section class="panel"><div class="panel-header"><h3>快捷入口</h3><span>替代固定金额模板</span></div><div class="form-grid"><label class="field"><span>名称</span><input id="quick-name" placeholder="例如 通勤"></label>${selectField("类型", "quick-type", [["expense", "支出"], ["income", "收入"], ["transfer", "还款"]], "expense")}<label class="field"><span>默认金额</span><input id="quick-amount" type="number" step="0.01" placeholder="可留空"></label><label class="field"><span>备注</span><input id="quick-note" placeholder="可留空"></label><button class="btn primary full" data-action="add-quick" type="button">新增快捷入口</button></div><div class="list" style="margin-top:12px">${state.quickActions.map(quickManageItem).join("")}</div></section>`; }

  function bindStaticEvents() {
    app.querySelectorAll("[data-view]").forEach((button) => button.addEventListener("click", () => { view = button.dataset.view; if (view !== "me") settingsPanel = "home"; render(); }));
    document.getElementById("month")?.addEventListener("input", (e) => { selectedMonth = e.target.value || toMonth(new Date()); reportPeriod = "month"; customReportRange = monthRange(selectedMonth); render(); });
    document.getElementById("search")?.addEventListener("input", (e) => { search = e.target.value; clearTimeout(searchRenderTimer); searchRenderTimer = setTimeout(() => { render(); const input = document.getElementById("search"); input?.focus(); input?.setSelectionRange(search.length, search.length); }, 140); });
    document.getElementById("filter-type")?.addEventListener("input", (e) => { filters.type = e.target.value; render(); });
    document.getElementById("filter-category")?.addEventListener("input", (e) => { filters.category = e.target.value; render(); });
    document.getElementById("filter-account")?.addEventListener("input", (e) => { filters.account = e.target.value; render(); });
    document.getElementById("filter-currency")?.addEventListener("input", (e) => { filters.currency = e.target.value; render(); });
    app.querySelectorAll("[data-report-period]").forEach((button) => button.addEventListener("click", () => { reportPeriod = button.dataset.reportPeriod; render(); }));
    document.getElementById("report-start")?.addEventListener("change", (e) => { customReportRange.start = e.target.value; render(); });
    document.getElementById("report-end")?.addEventListener("change", (e) => { customReportRange.end = e.target.value; render(); });
    document.getElementById("import-json")?.addEventListener("change", importJson);
    document.getElementById("account-type")?.addEventListener("change", () => { syncAccountForm(); render(); });
    app.querySelectorAll("[data-statement-toggle]").forEach((input) => input.addEventListener("change", () => { syncDraftFromInputs(); render(); }));
  }

  app.addEventListener("click", (event) => {
    const el = event.target.closest("[data-action],[data-choice],[data-account],[data-category],[data-quick],[data-credit-target],[data-target-account],[data-currency],[data-target-currency],[data-fee-currency]");
    if (!el) return;
    if (el.dataset.choice) setDraftType(el.dataset.choice);
    if (el.dataset.account) setDraftAccount(el.dataset.account, "account");
    if (el.dataset.category) { syncDraftFromInputs(); draft.categoryId = el.dataset.category; render(); }
    if (el.dataset.creditTarget) setDraftTargetAccount(el.dataset.creditTarget, "credit-target");
    if (el.dataset.targetAccount) setDraftTargetAccount(el.dataset.targetAccount, "target-account");
    if (el.dataset.currency) { syncDraftFromInputs(); draft.currency = el.dataset.currency; render(); }
    if (el.dataset.targetCurrency) { syncDraftFromInputs(); draft.targetCurrency = el.dataset.targetCurrency; draft.statementAllocations = []; render(); }
    if (el.dataset.feeCurrency) { syncDraftFromInputs(); draft.feeCurrency = el.dataset.feeCurrency; render(); }
    if (el.dataset.quick) applyQuick(el.dataset.quick);
    if (el.dataset.view && el.dataset.view !== "me") settingsPanel = "home";
    const action = el.dataset.action;
    if (!action) return;
    syncDraftFromInputs();
    const actions = { "save-transaction": saveTransaction, "reset-draft": resetDraft, "parse-note": parseDraftNote, "clear-filters": clearFilters, "open-filter-sheet": () => { filterSheetOpen = true; render(); }, "close-filter-sheet": () => { filterSheetOpen = false; render(); }, "open-setting": () => { settingsPanel = el.dataset.panel || "home"; render(); }, "open-account-manager": () => { view = "me"; settingsPanel = "accounts"; render(); }, "set-picker-type": () => setPickerType(el.dataset.pickerMode, el.dataset.pickerType), "toggle-account-group": () => toggleAccountGroup(el.dataset.groupMode, el.dataset.groupKey), "expand-account-groups": () => setAccountGroupsExpanded(el.dataset.groupMode, true), "collapse-account-groups": () => setAccountGroupsExpanded(el.dataset.groupMode, false), "toggle-statement-check": () => toggleStatementCheck(el.dataset.statementId), "open-category-manager": () => { view = "me"; settingsPanel = "categories"; render(); }, "open-quick-manager": () => { view = "me"; settingsPanel = "quick"; render(); }, "back-settings": () => { settingsPanel = "home"; render(); }, "edit-transaction": () => editTransaction(el.dataset.id), "delete-transaction": () => deleteItem("transactions", el.dataset.id), "delete-account": () => deleteItem("accounts", el.dataset.id), "delete-category": () => deleteItem("categories", el.dataset.id), "delete-plan": () => deleteItem("plans", el.dataset.id), "delete-quick": () => deleteItem("quickActions", el.dataset.id), "pay-plan": () => payPlan(el.dataset.id), "skip-plan": () => setPlanStatus(el.dataset.id, "skipped"), "reopen-plan": () => setPlanStatus(el.dataset.id, "pending"), "pay-credit": () => startCreditPayment(el.dataset.id, el.dataset.currency, el.dataset.statementId || ""), "verify-statement": () => verifyStatementTransaction(el.dataset.id, el.dataset.mode), "stop-installment": () => stopInstallment(el.dataset.id), "skip-next-installment": () => skipNextInstallment(el.dataset.id), "save-account": saveAccount, "edit-account": () => editAccount(el.dataset.id), "cancel-account-edit": cancelAccountEdit, "toggle-account-currency": () => toggleAccountCurrency(el.dataset.currency), "move-account": () => moveAccount(el.dataset.id, Number(el.dataset.direction)), "add-category": addCategory, "add-plan": addPlan, "add-quick": addQuick, "calendar-prev": () => { reminderCalendarMonth = previousMonth(reminderCalendarMonth); reminderCalendarDate = `${reminderCalendarMonth}-01`; render(); }, "calendar-next": () => { reminderCalendarMonth = nextMonth(reminderCalendarMonth); reminderCalendarDate = `${reminderCalendarMonth}-01`; render(); }, "select-reminder-date": () => { reminderCalendarDate = el.dataset.date; render(); }, "move-bank": () => moveBank(el.dataset.type, el.dataset.bank, Number(el.dataset.direction)), "export-json": exportJson, "export-csv": exportCsv, "reset-all": resetAll };
    (actions[action] || noop)();
  });

  function syncDraftFromInputs() { const map = { "draft-amount": "amount", "draft-date": "date", "draft-note": "note", "draft-target-amount": "targetAmount", "draft-fee-amount": "feeAmount", "draft-first-date": "firstDate", "draft-installment-count": "installmentCount" }; Object.entries(map).forEach(([id, key]) => { const input = document.getElementById(id); if (input) draft[key] = key === "note" ? input.value.trim() : input.value; }); syncStatementAllocations(); }
  function syncStatementAllocations() { const selected = [...app.querySelectorAll("[data-statement-toggle]:checked")]; if (!selected.length) { draft.statementAllocations = []; return; } draft.statementAllocations = selected.map((input) => ({ statementId: input.dataset.statementToggle, amount: Math.max(0, round(app.querySelector(`[data-statement-allocation="${input.dataset.statementToggle}"]`)?.value)) })).filter((item) => item.statementId && item.amount > 0); }

  function setDraftType(type) {
    syncDraftFromInputs();
    const previous = { ...draft }; const next = newDraft(type);
    const eligible = (account) => account && (type === "installment" ? account.type === "credit" : ["transfer", "exchange"].includes(type) ? account.type !== "credit" : true);
    const previousAccount = accountById(previous.accountId);
    if (eligible(previousAccount)) {
      next.accountId = previous.accountId;
      next.currency = previousAccount.currencies.includes(previous.currency) ? previous.currency : previousAccount.currencies[0] || BASE_CURRENCY;
      next.feeCurrency = previousAccount.currencies.includes(previous.feeCurrency) ? previous.feeCurrency : next.currency;
    }
    next.amount = previous.amount; next.date = previous.date; next.note = previous.note; next.firstDate = previous.firstDate || previous.date;
    if (["expense", "installment"].includes(type) && categoryById(previous.categoryId)?.type === "expense") next.categoryId = previous.categoryId;
    if (type === "income" && categoryById(previous.categoryId)?.type === "income") next.categoryId = previous.categoryId;
    if (["transfer", "exchange"].includes(type)) { next.targetAmount = previous.targetAmount; next.feeAmount = previous.feeAmount; }
    if (type === "transfer" && accountById(previous.targetAccountId)?.type === "credit") { next.targetAccountId = previous.targetAccountId; next.targetCurrency = accountById(previous.targetAccountId).currencies.includes(previous.targetCurrency) ? previous.targetCurrency : next.targetCurrency; }
    if (type === "exchange" && eligible(accountById(previous.targetAccountId))) { next.targetAccountId = previous.targetAccountId; next.targetCurrency = accountById(previous.targetAccountId).currencies.includes(previous.targetCurrency) ? previous.targetCurrency : next.targetCurrency; }
    draft = next; render();
  }
  function setDraftAccount(accountId, mode = "account") { syncDraftFromInputs(); const account = accountById(accountId); draft.accountId = accountId; if (account) pickerTypes[mode] = account.type; ensureDraftCurrencies(); render(); }
  function setDraftTargetAccount(accountId, mode) { syncDraftFromInputs(); const account = accountById(accountId); draft.targetAccountId = accountId; draft.statementAllocations = []; if (account) pickerTypes[mode] = account.type; ensureDraftCurrencies(); render(); }
  function setPickerType(mode, type) {
    syncDraftFromInputs();
    const eligible = pickerAccountsForMode(mode).filter((account) => account.type === type);
    pickerTypes[mode] = type;
    const stored = localStorage.getItem(`${STORAGE_KEY}:last-account:${type}`);
    const account = eligible.find((item) => item.id === stored) || eligible[0];
    if (!account) return render();
    if (mode === "account") draft.accountId = account.id;
    else { draft.targetAccountId = account.id; draft.statementAllocations = []; }
    ensureDraftCurrencies(); render();
  }
  function pickerAccountsForMode(mode) {
    if (mode === "credit-target") return orderedAccounts().filter((account) => account.type === "credit");
    if (mode === "target-account") return orderedAccounts().filter((account) => account.type !== "credit");
    if (draft.type === "installment") return orderedAccounts().filter((account) => account.type === "credit");
    if (["transfer", "exchange"].includes(draft.type)) return orderedAccounts().filter((account) => account.type !== "credit");
    return orderedAccounts();
  }
  function ensureDraftCurrencies() { const source = accountById(draft.accountId); const target = accountById(draft.targetAccountId); if (!source?.currencies.includes(draft.currency)) draft.currency = source?.currencies[0] || BASE_CURRENCY; if (!source?.currencies.includes(draft.feeCurrency)) draft.feeCurrency = draft.currency; if (!target?.currencies.includes(draft.targetCurrency)) draft.targetCurrency = target?.currencies[0] || BASE_CURRENCY; }
  function saveTransaction() {
    syncDraftFromInputs();
    if (draft.type === "installment") return saveInstallment();
    const amount = positive(draft.amount); const source = accountById(draft.accountId);
    if (!amount || !source || !source.currencies.includes(draft.currency)) return notify("请选择账户、币种并填写有效金额。");
    const previousItem = editing ? state.transactions.find((transaction) => transaction.id === editing) : null;
    const item = { id: editing || uid(), type: draft.type, date: validDate(draft.date) ? draft.date : toDate(new Date()), amount, currency: draft.currency, accountId: source.id, targetAccountId: "", targetAmount: 0, targetCurrency: "", exchangeRate: 0, feeAmount: 0, feeCurrency: "", categoryId: "", note: draft.note.slice(0, 80), installmentId: "", statementOverride: previousItem?.statementOverride || "", statementAllocations: [] };
    if (draft.type === "expense" || draft.type === "income") { const category = categoryById(draft.categoryId); if (!category || category.type !== draft.type) return notify("请选择有效分类。"); if (isOther(category) && !item.note) return notify("选择“其他”分类时必须填写备注。"); item.categoryId = category.id; }
    if (draft.type === "transfer" || draft.type === "exchange") { const target = accountById(draft.targetAccountId); const targetAmount = positive(draft.targetAmount || draft.amount); if (!target || !targetAmount || !target.currencies.includes(draft.targetCurrency)) return notify("请选择目标账户、目标币种并填写实际金额。"); if (draft.type === "transfer" && (target.type !== "credit" || source.type === "credit")) return notify("请使用非信用卡账户归还信用卡。"); if (draft.type === "exchange" && target.type === "credit") return notify("购汇入账账户不能是信用卡。"); item.targetAccountId = target.id; item.targetAmount = targetAmount; item.targetCurrency = draft.targetCurrency; item.exchangeRate = round(amount / targetAmount); item.feeAmount = Math.max(0, round(draft.feeAmount)); item.feeCurrency = item.feeAmount ? (source.currencies.includes(draft.feeCurrency) ? draft.feeCurrency : item.currency) : ""; if (draft.type === "transfer") { const available = creditStatements(target.id, item.targetCurrency, { excludeTransactionId: editing }); const byId = new Map(available.map((statement) => [statement.id, statement])); const allocations = (draft.statementAllocations || []).map((allocation) => ({ statementId: allocation.statementId, amount: Math.max(0, round(allocation.amount)) })).filter((allocation) => allocation.amount > 0); const allocated = round(allocations.reduce((sum, allocation) => sum + allocation.amount, 0)); if (!allocations.length || Math.abs(allocated - targetAmount) > 0.009) return notify("请勾选账单，并使分配合计等于信用卡实际还款金额。"); if (allocations.some((allocation) => !byId.has(allocation.statementId) || allocation.amount > byId.get(allocation.statementId).remaining + 0.009)) return notify("还款分配超过了所选账单的剩余应还金额。"); item.statementAllocations = allocations; } }

    state.transactions = state.transactions.filter((transaction) => transaction.id !== `${item.id}-fee`);
    upsert("transactions", item);
    if (item.feeAmount) upsertFee(item);
    localStorage.setItem(`${STORAGE_KEY}:last-account`, item.accountId); localStorage.setItem(`${STORAGE_KEY}:last-account:${source.type}`, item.accountId); if (item.categoryId) localStorage.setItem(`${STORAGE_KEY}:last-category:${item.type}`, item.categoryId);
    saveState(); editing = null; draft = newDraft("expense"); view = "ledger"; render(); notify(item.type === "exchange" ? "购汇已保存。" : "流水已保存。");
  }
  function upsertFee(parent) { const item = { id: `${parent.id}-fee`, type: "fee", date: parent.date, amount: parent.feeAmount, currency: parent.feeCurrency, accountId: parent.accountId, targetAccountId: "", targetAmount: 0, targetCurrency: "", exchangeRate: 0, feeAmount: 0, feeCurrency: "", categoryId: feeCategory()?.id || "", note: `${parent.type === "exchange" ? "购汇" : "跨币种还款"}手续费`, installmentId: "", statementOverride: "", statementAllocations: [] }; upsert("transactions", item); }
  function editTransaction(id) { const item = state.transactions.find((t) => t.id === id); if (!item || item.type === "fee" || item.installmentId) return notify("自动生成流水请在分期或原交易中管理。"); editing = id; draft = { ...newDraft(item.type), ...item, feeAmount: item.feeAmount || "", firstDate: toDate(new Date()), installmentCount: 3 }; view = "record"; render(); }
  function syncAccountForm() {
    if (!accountFormDraft) accountFormDraft = newAccountForm();
    const f = accountFormDraft;
    f.name = safeText(value("account-name").trim(), 50); f.type = ACCOUNT_TYPES[value("account-type")] ? value("account-type") : "debit"; f.bank = safeText(value("account-bank").trim(), 40); f.tail = safeText(value("account-tail").trim(), 12); f.note = safeText(value("account-note").trim(), 80); f.billDay = clampDay(value("account-bill-day")); f.dueDay = clampDay(value("account-due-day")); f.creditLimit = Math.max(0, round(value("account-credit-limit")));
    const configuredDate = value("account-statement-date"); f.statementBaselineDate = validDate(configuredDate) ? configuredDate : (f.billDay ? latestStatementDate(f) : "");
    app.querySelectorAll("[data-account-balance]").forEach((input) => { f.initialBalances[input.dataset.accountBalance] = round(input.value); });
    app.querySelectorAll("[data-statement-balance]").forEach((input) => { const currency = input.dataset.statementBalance; f.statementBaselines[currency] ||= { amount: 0, statementDate: "" }; f.statementBaselines[currency].amount = Math.max(0, round(input.value)); f.statementBaselines[currency].statementDate = f.statementBaselineDate; });
  }
  function saveAccount() {
    syncAccountForm(); const f = accountFormDraft; if (!f.name || !f.currencies.length) return notify("请填写账户名称并至少选择一种币种。");
    if (f.type === "credit" && (!f.billDay || !f.dueDay)) return notify("信用卡请同时填写账单日和还款日。");
    const previous = accountEditingId ? accountById(accountEditingId) : null; const bank = f.bank || "未归类机构";
    const sameBank = previous && previous.type === f.type && previous.bank === bank;
    const statementDate = f.type === "credit" ? (f.statementBaselineDate || latestStatementDate(f)) : "";
    const statementBaselines = {}; f.currencies.forEach((currency) => { const current = f.statementBaselines?.[currency] || {}; statementBaselines[currency] = { amount: Math.max(0, round(current.amount)), statementDate }; });
    const item = { id: accountEditingId || uid(), name: f.name, type: f.type, bank, tail: f.tail, note: f.note, currencies: f.currencies, initialBalances: f.initialBalances, billDay: f.billDay, dueDay: f.dueDay, statementTrackingStart: statementDate ? addDays(parseLocalDate(statementDate), 1) : "", statementBaselines, creditLimit: f.creditLimit, bankOrder: sameBank ? previous.bankOrder : nextBankOrder(f.type, bank), order: sameBank ? previous.order : nextAccountOrder(f.type, bank) };
    upsert("accounts", item); normalizeBankOrders(state.accounts); saveState(); accountEditingId = ""; accountFormDraft = newAccountForm(); render(); notify("账户已保存。");
  }
  function editAccount(id) { const account = accountById(id); if (!account) return; accountEditingId = id; accountFormDraft = { ...account, currencies: [...account.currencies], initialBalances: { ...account.initialBalances }, statementBaselines: Object.fromEntries(account.currencies.map((currency) => [currency, { ...(account.statementBaselines?.[currency] || { amount: 0, statementDate: "" }) }])), statementBaselineDate: account.currencies.map((currency) => account.statementBaselines?.[currency]?.statementDate).find(validDate) || (account.billDay ? latestStatementDate(account) : "") }; render(); }
  function cancelAccountEdit() { accountEditingId = ""; accountFormDraft = newAccountForm(); render(); }
  function toggleAccountCurrency(currency) { syncAccountForm(); const list = accountFormDraft.currencies; if (list.includes(currency)) { if (list.length === 1) return notify("账户至少保留一种币种。"); const id = accountEditingId; const inUse = id && (state.transactions.some((item) => (item.accountId === id && item.currency === currency) || (item.targetAccountId === id && item.targetCurrency === currency)) || state.plans.some((item) => item.accountId === id && item.currency === currency) || state.installments.some((item) => item.accountId === id && item.currency === currency)); if (inUse) return notify("该币种已有流水、提醒或分期，不能移除。"); accountFormDraft.currencies = list.filter((item) => item !== currency); delete accountFormDraft.initialBalances[currency]; delete accountFormDraft.statementBaselines[currency]; } else { accountFormDraft.currencies.push(currency); accountFormDraft.initialBalances[currency] = 0; accountFormDraft.statementBaselines[currency] = { amount: 0, statementDate: accountFormDraft.statementBaselineDate || "" }; } render(); }
  function moveAccount(id, direction) {
    const current = accountById(id); if (!current) return; const peers = orderedAccounts().filter((item) => item.type === current.type && item.bank === current.bank);
    const index = peers.findIndex((item) => item.id === id); const target = peers[index + direction]; if (!target) return;
    [current.order, target.order] = [target.order, current.order]; saveState(); render();
  }
  function moveBank(type, bank, direction) {
    const groups = bankGroupsForType(type); const index = groups.findIndex((group) => group.bank === bank); const target = groups[index + direction]; const current = groups[index];
    if (!current || !target) return; const currentOrder = current.accounts[0].bankOrder; const targetOrder = target.accounts[0].bankOrder;
    current.accounts.forEach((account) => account.bankOrder = targetOrder); target.accounts.forEach((account) => account.bankOrder = currentOrder); saveState(); render();
  }
  function addCategory() { const name = safeText(value("category-name").trim(), 30); if (!name) return notify("分类名称不能为空。"); const color = /^#[0-9a-fA-F]{6}$/.test(value("category-color")) ? value("category-color") : "#308df5"; state.categories.push({ id: uid(), name, type: value("category-type") === "income" ? "income" : "expense", color, icon: safeText(value("category-icon").trim(), 2) || name.slice(0, 1) }); saveState(); render(); notify("分类已新增。"); }
  function addPlan() { const name = safeText(value("plan-name").trim(), 40); const amount = round(Number(value("plan-amount")) || 0); const account = accountById(value("plan-account")); const category = categoryById(value("plan-category")); const currency = CURRENCIES.includes(value("plan-currency")) ? value("plan-currency") : BASE_CURRENCY; if (!name || amount <= 0) return notify("请填写提醒名称和金额。"); if (!account || !account.currencies.includes(currency) || !category || category.type !== "expense") return notify("请选择支持该币种的账户和支出分类。"); const repeat = PLAN_REPEATS[value("plan-repeat")] ? value("plan-repeat") : "none"; const date = validDate(value("plan-date")) ? value("plan-date") : toDate(new Date()); state.plans.push({ id: uid(), name, amount, currency, accountId: account.id, categoryId: category.id, date, repeat, status: "pending", note: safeText(value("plan-note").trim(), 80) }); saveState(); render(); notify("提醒已新增。"); }
  function addQuick() { const name = safeText(value("quick-name").trim(), 16); if (!name) return notify("快捷入口名称不能为空。"); const type = ["expense", "income", "transfer"].includes(value("quick-type")) ? value("quick-type") : "expense"; const rawAmount = value("quick-amount"); const amount = rawAmount === "" ? "" : Math.max(0, round(rawAmount)); state.quickActions.push({ id: uid(), name, type, amount, categoryName: "其他", note: safeText(value("quick-note").trim(), 80) }); saveState(); render(); notify("快捷入口已新增。"); }
  function saveInstallment() { const account = accountById(draft.accountId); const amount = positive(draft.amount); const count = Math.round(Number(draft.installmentCount)); const category = categoryById(draft.categoryId); if (!account || account.type !== "credit" || !account.currencies.includes(draft.currency)) return notify("请选择支持该币种的信用卡。"); if (!amount || count < 2 || count > 120 || !validDate(draft.firstDate) || !category || category.type !== "expense") return notify("请填写本金、首期日期、期数和消费分类。"); state.installments.push({ id: uid(), accountId: account.id, currency: draft.currency, totalAmount: amount, count, firstDate: draft.firstDate, categoryId: category.id, note: safeText(draft.note, 80), feeTotal: Math.max(0, round(draft.feeAmount)), skippedPeriods: [], ended: false }); syncInstallments(); saveState(); draft = newDraft("expense"); view = "assets"; render(); notify("分期已创建，将按月自动入账。"); }
  function syncInstallments() { if (!state?.installments) return; const today = toDate(new Date()); state.installments.forEach((item) => { if (item.ended) return; for (let index = 0; index < item.count; index++) { const date = addMonths(item.firstDate, index); if (date > today || item.skippedPeriods.includes(index + 1)) continue; const id = `${item.id}-p-${index + 1}`; if (state.transactions.some((t) => t.id === id)) continue; state.transactions.push({ id, type: "expense", date, amount: installmentPrincipal(item, index), currency: item.currency, accountId: item.accountId, targetAccountId: "", targetAmount: 0, targetCurrency: "", exchangeRate: 0, feeAmount: 0, feeCurrency: "", categoryId: item.categoryId, note: `${item.note || "信用卡分期"} · 第 ${index + 1}/${item.count} 期`, installmentId: item.id }); const fee = installmentFee(item, index); if (fee) state.transactions.push({ id: `${id}-fee`, type: "fee", date, amount: fee, currency: item.currency, accountId: item.accountId, targetAccountId: "", targetAmount: 0, targetCurrency: "", exchangeRate: 0, feeAmount: 0, feeCurrency: "", categoryId: feeCategory()?.id || "", note: `分期手续费 · 第 ${index + 1}/${item.count} 期`, installmentId: item.id }); } }); }
  function installmentPrincipal(item, index) { const base = round(item.totalAmount / item.count); return index === item.count - 1 ? round(item.totalAmount - base * (item.count - 1)) : base; }
  function installmentFee(item, index) { const base = round(item.feeTotal / item.count); return index === item.count - 1 ? round(item.feeTotal - base * (item.count - 1)) : base; }
  function stopInstallment(id) { const item = state.installments.find((entry) => entry.id === id); if (!item || !window.confirm("停止未来未入账期数？已入账流水会保留。")) return; item.ended = true; saveState(); render(); notify("已停止未来分期入账。"); }
  function skipNextInstallment(id) { const item = state.installments.find((entry) => entry.id === id); if (!item || item.ended) return; const next = Array.from({ length: item.count }, (_, index) => index + 1).find((period) => !item.skippedPeriods.includes(period) && !state.transactions.some((transaction) => transaction.id === `${item.id}-p-${period}`)); if (!next) return notify("没有可跳过的未来期数。"); item.skippedPeriods.push(next); saveState(); render(); notify(`已跳过第 ${next} 期。`); }
  function payPlan(id) { const plan = state.plans.find((p) => p.id === id); if (!plan) return; const account = accountById(plan.accountId); const category = categoryById(plan.categoryId); if (!account || !account.currencies.includes(plan.currency) || !category || category.type !== "expense" || plan.amount <= 0) return notify("该提醒的账户、币种或分类已失效，请编辑后再记账。"); state.transactions.push({ id: uid(), type: "expense", date: toDate(new Date()), amount: plan.amount, currency: plan.currency, accountId: account.id, categoryId: category.id, targetAccountId: "", targetAmount: 0, targetCurrency: "", exchangeRate: 0, feeAmount: 0, feeCurrency: "", note: plan.note || plan.name, installmentId: "" }); plan.status = "paid"; saveState(); render(); notify("提醒已记为流水。"); }
  function setPlanStatus(id, status) { const plan = state.plans.find((item) => item.id === id); if (!plan || !PLAN_STATUSES[status]) return; plan.status = status; saveState(); render(); notify(status === "pending" ? "提醒已恢复。" : "提醒已跳过。"); }
  function applyQuick(id) { const quick = state.quickActions.find((q) => q.id === id); if (!quick) return; draft = newDraft(quick.type); draft.amount = quick.amount || ""; draft.note = quick.note || ""; const cat = state.categories.find((c) => c.type === quick.type && c.name === quick.categoryName); if (cat) draft.categoryId = cat.id; view = "record"; render(); }
  function parseDraftNote() { syncDraftFromInputs(); const text = draft.note; if (!text) return notify("先输入一句话，例如“今天午饭 28 支付宝”。"); const amount = text.match(/(\d+(?:\.\d{1,2})?)/); if (amount) draft.amount = amount[1]; if (/购汇|换汇/.test(text)) draft.type = "exchange"; else if (/还.*信用卡|信用卡.*还款|还款/.test(text)) draft.type = "transfer"; else if (/工资|收入|奖金|奖学金|兼职/.test(text)) draft.type = "income"; state.accounts.forEach((account) => { if (text.includes(account.name) || (account.tail && text.includes(account.tail))) draft.accountId = account.id; }); state.categories.forEach((category) => { if (text.includes(category.name)) { draft.type = category.type; draft.categoryId = category.id; } }); ensureDraftCurrencies(); render(); notify("已按文字生成草稿，请确认后保存。"); }
  function clearFilters() { filters = { type: "all", category: "all", account: "all", currency: "all" }; search = ""; filterSheetOpen = false; render(); }
  function resetDraft() { editing = null; draft = newDraft("expense"); render(); }
  function deleteItem(collection, id) { if (collection === "accounts" && state.transactions.some((t) => t.accountId === id || t.targetAccountId === id)) return notify("该账户已有流水，不能删除。"); if (collection === "accounts" && state.plans.some((p) => p.accountId === id)) return notify("该账户仍被提醒使用，不能删除。"); if (collection === "accounts" && state.installments.some((p) => p.accountId === id && !p.ended)) return notify("该账户仍有关联的信用卡分期，不能删除。"); if (collection === "categories" && state.transactions.some((t) => t.categoryId === id)) return notify("该分类已有流水，不能删除。"); if (collection === "categories" && state.plans.some((p) => p.categoryId === id)) return notify("该分类仍被提醒使用，不能删除。"); if (collection === "accounts" && state.accounts.length <= 1) return notify("至少保留一个账户。"); if (collection === "categories") { const item = categoryById(id); if (item && state.categories.filter((c) => c.type === item.type).length <= 1) return notify(`至少保留一个${typeLabel(item.type)}分类。`); } if (!window.confirm("确认删除？")) return; if (collection === "transactions") state.transactions = state.transactions.filter((item) => item.id !== id && item.id !== `${id}-fee`); else state[collection] = state[collection].filter((item) => item.id !== id); saveState(); render(); notify("已删除。"); }

  function filteredTransactions() { const keyword = search.trim().toLowerCase(); return state.transactions.filter((t) => { if (!t.date.startsWith(selectedMonth)) return false; if (filters.type !== "all" && t.type !== filters.type) return false; if (filters.category !== "all" && t.categoryId !== filters.category) return false; if (filters.account !== "all" && t.accountId !== filters.account && t.targetAccountId !== filters.account) return false; if (filters.currency !== "all" && t.currency !== filters.currency && t.targetCurrency !== filters.currency) return false; if (!keyword) return true; const a = accountById(t.accountId); const target = accountById(t.targetAccountId); const c = categoryById(t.categoryId); return [t.note, a?.name, a?.bank, target?.name, c?.name, t.currency, t.targetCurrency].some((x) => String(x || "").toLowerCase().includes(keyword)); }).sort(byDateDesc); }
  function transactionsBetween(start, end) { return state.transactions.filter((t) => t.date >= start && t.date <= end); }
  function reportPeriodTabs() { const labels = { month: "本月", previous: "上月", rolling30: "近30天", year: "本年", custom: "自定义" }; return `<div class="period-tabs">${Object.entries(labels).map(([id, label]) => `<button class="${reportPeriod === id ? "active" : ""}" data-report-period="${id}" type="button">${label}</button>`).join("")}</div>`; }
  function reportWindow() {
    const today = toDate(new Date());
    let { start, end } = monthRange(selectedMonth);
    let label = selectedMonth;
    if (reportPeriod === "previous") { const month = previousMonth(selectedMonth); ({ start, end } = monthRange(month)); label = month; }
    if (reportPeriod === "rolling30") { end = today; start = toDate(addDays(parseLocalDate(end), -29)); label = `${start} 至 ${end}`; }
    if (reportPeriod === "year") { const year = selectedMonth.slice(0, 4); start = `${year}-01-01`; end = `${year}-12-31`; label = `${year} 年`; }
    if (reportPeriod === "custom") { start = validDate(customReportRange.start) ? customReportRange.start : start; end = validDate(customReportRange.end) ? customReportRange.end : end; if (start > end) [start, end] = [end, start]; label = `${start} 至 ${end}`; }
    const previousEnd = toDate(addDays(parseLocalDate(start), -1));
    const previousStart = toDate(addDays(parseLocalDate(previousEnd), -(dateSpan(start, end) - 1)));
    return { start, end, previousStart, previousEnd, label };
  }
  function reportTrendData() {
    const range = reportWindow();
    const byMonth = dateSpan(range.start, range.end) > 45;
    const buckets = [];
    if (byMonth) {
      let month = range.start.slice(0, 7);
      const lastMonth = range.end.slice(0, 7);
      while (month <= lastMonth && buckets.length < 120) { buckets.push({ key: month, income: 0, expense: 0 }); month = nextMonth(month); }
    } else {
      for (let date = range.start; date <= range.end && buckets.length < 366; date = toDate(addDays(parseLocalDate(date), 1))) buckets.push({ key: date, income: 0, expense: 0 });
    }
    const lookup = new Map(buckets.map((bucket) => [bucket.key, bucket]));
    transactionsBetween(range.start, range.end).forEach((t) => { if (["transfer", "exchange"].includes(t.type) || t.currency !== BASE_CURRENCY) return; const bucket = lookup.get(byMonth ? t.date.slice(0, 7) : t.date); if (bucket) bucket[t.type === "income" ? "income" : "expense"] += t.amount; });
    return buckets;
  }
  function summarize(transactions) { return transactions.reduce((acc, t) => { if (["transfer", "exchange"].includes(t.type)) return acc; const currency = t.currency || BASE_CURRENCY; acc[currency] ||= { income: 0, expense: 0 }; if (t.type === "income") acc[currency].income += t.amount; else acc[currency].expense += t.amount; return acc; }, {}); }
  function currencySummary(summaries) { const entries = Object.entries(summaries); if (entries.length <= 1 && (!entries.length || entries[0][0] === BASE_CURRENCY)) return ""; return `<section class="panel currency-summary"><div class="panel-header"><h3>多币种收支</h3><span>分别统计，不自动折算</span></div><div class="grid three">${entries.map(([currency, values]) => metric(currency, money(values.income - values.expense, currency), `收入 ${money(values.income, currency)} · 支出 ${money(values.expense, currency)}`)).join("")}</div></section>`; }
  function balances() {
    const result = {};
    state.accounts.forEach((a) => { result[a.id] = {}; a.currencies.forEach((currency) => result[a.id][currency] = round(a.initialBalances[currency] || 0)); });
    const add = (id, currency, amount) => { if (!result[id]) result[id] = {}; result[id][currency] = round((result[id][currency] || 0) + amount); };
    state.transactions.forEach((t) => {
      const account = accountById(t.accountId); const target = accountById(t.targetAccountId); if (!account) return;
      if (t.type === "exchange") { add(account.id, t.currency, -t.amount); if (target) add(target.id, t.targetCurrency, t.targetAmount); return; }
      if (t.type === "transfer") { add(account.id, t.currency, -t.amount); if (target) add(target.id, t.targetCurrency, -t.targetAmount); return; }
      if (t.type === "income") { add(account.id, t.currency, account.type === "credit" ? -t.amount : t.amount); return; }
      add(account.id, t.currency, account.type === "credit" ? t.amount : -t.amount);
    });
    return result;
  }
  function assetSnapshot() {
    const balancesByAccount = balances(); const assets = {}, currentDebts = {}, billedDebts = {}, futureInstallments = {}, totalDebts = {}, net = {};
    state.accounts.forEach((account) => account.currencies.forEach((currency) => {
      assets[currency] ||= 0; currentDebts[currency] ||= 0;
      const value = balancesByAccount[account.id]?.[currency] || 0;
      if (account.type === "credit") currentDebts[currency] += Math.max(0, value); else assets[currency] += value;
    }));
    creditStatements().filter((item) => item.remaining > 0).forEach((item) => billedDebts[item.currency] = round((billedDebts[item.currency] || 0) + item.remaining));
    state.installments.filter((item) => !item.ended).forEach((item) => Array.from({ length: item.count }, (_, index) => {
      const period = index + 1; const generated = state.transactions.some((transaction) => transaction.id === `${item.id}-p-${period}`);
      if (generated || item.skippedPeriods.includes(period)) return;
      futureInstallments[item.currency] = round((futureInstallments[item.currency] || 0) + installmentPrincipal(item, index) + installmentFee(item, index));
    }));
    Object.keys({ ...assets, ...currentDebts, ...futureInstallments }).forEach((currency) => {
      totalDebts[currency] = round((currentDebts[currency] || 0) + (futureInstallments[currency] || 0));
      net[currency] = round((assets[currency] || 0) - totalDebts[currency]);
    });
    return { assets, currentDebts, billedDebts, futureInstallments, totalDebts, net, balances: balancesByAccount };
  }

  function creditStatements(accountId = "", currency = "", options = {}) {
    const today = options.today || toDate(new Date());
    const excludedTransactionId = options.excludeTransactionId || "";
    const result = [];
    state.accounts.filter((account) => account.type === "credit" && account.billDay && account.dueDay && (!accountId || account.id === accountId)).forEach((account) => {
      account.currencies.filter((item) => !currency || item === currency).forEach((itemCurrency) => {
        const baseline = account.statementBaselines?.[itemCurrency];
        const trackingStart = validDate(account.statementTrackingStart) ? account.statementTrackingStart : "";
        if (baseline?.amount > 0 && validDate(baseline.statementDate)) result.push(makeCreditStatement(account, itemCurrency, baseline.statementDate, baseline.amount, "legacy"));
        const firstDate = creditStatementFirstDate(account, itemCurrency, trackingStart, baseline?.statementDate || "");
        if (!firstDate) return;
        for (let statementDate = firstDate; statementDate <= today; statementDate = addMonths(statementDate, 1)) {
          const cycle = statementCycle(account, statementDate);
          const amount = round(creditStatementTransactions(account, itemCurrency, cycle, statementDate).reduce((sum, transaction) => sum + creditStatementImpact(transaction), 0));
          if (amount > 0) result.push(makeCreditStatement(account, itemCurrency, statementDate, amount, "generated", cycle));
        }
      });
    });
    const paid = {};
    state.transactions.filter((transaction) => transaction.type === "transfer" && transaction.id !== excludedTransactionId).forEach((transaction) => {
      transaction.statementAllocations.forEach((allocation) => paid[allocation.statementId] = round((paid[allocation.statementId] || 0) + allocation.amount));
    });
    return result.map((statement) => ({ ...statement, paid: Math.min(statement.amount, paid[statement.id] || 0), remaining: Math.max(0, round(statement.amount - (paid[statement.id] || 0))) })).sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.statementDate.localeCompare(b.statementDate));
  }

  function makeCreditStatement(account, currency, statementDate, amount, source, cycle = statementCycle(account, statementDate)) {
    return { id: (source === "legacy" ? "legacy" : "statement") + ":" + account.id + ":" + currency + ":" + statementDate, account, accountId: account.id, currency, statementDate, cycleStart: cycle.start, cycleEnd: cycle.end, dueDate: dueDateForStatement(account, statementDate), amount: Math.max(0, round(amount)), source, paid: 0, remaining: Math.max(0, round(amount)) };
  }

  function creditStatementFirstDate(account, currency, trackingStart, baselineDate) {
    const transactions = state.transactions.filter((transaction) => transaction.accountId === account.id && transaction.currency === currency && creditStatementImpact(transaction) !== 0 && (!trackingStart || transaction.date >= trackingStart));
    const start = trackingStart || transactions.map((transaction) => transaction.date).sort()[0] || "";
    if (!start) return "";
    const candidate = nextStatementDate(account, start, true);
    const afterBaseline = baselineDate ? nextStatementDate(account, toDate(addDays(parseLocalDate(baselineDate), 1)), true) : candidate;
    return candidate < afterBaseline ? afterBaseline : candidate;
  }

  function creditStatementTransactions(account, currency, cycle, statementDate) {
    return state.transactions.filter((transaction) => {
      if (transaction.accountId !== account.id || transaction.currency !== currency || !creditStatementImpact(transaction)) return false;
      if (validDate(account.statementTrackingStart) && transaction.date < account.statementTrackingStart) return false;
      if (isAccountBillDay(account, transaction.date)) {
        const nextBillDate = nextStatementDate(account, transaction.date, false);
        return (transaction.statementOverride === "current" && transaction.date === statementDate)
          || (transaction.statementOverride === "next" && nextBillDate === statementDate);
      }
      return transaction.date >= cycle.start && transaction.date <= cycle.end;
    });
  }
  function creditStatementImpact(transaction) { return transaction.type === "income" ? -transaction.amount : ["expense", "fee"].includes(transaction.type) ? transaction.amount : 0; }
  function statementCycle(account, statementDate) { return { start: toDate(addDays(parseLocalDate(addMonths(statementDate, -1)), 1)), end: toDate(addDays(parseLocalDate(statementDate), -1)) }; }
  function nextStatementDate(account, date, inclusive = false) { const month = String(date).slice(0, 7); const candidate = dateWithDay(month, account.billDay); return candidate > date || (inclusive && candidate === date) ? candidate : dateWithDay(nextMonth(month), account.billDay); }
  function dueDateForStatement(account, statementDate) { const month = statementDate.slice(0, 7); const candidate = dateWithDay(month, account.dueDay); return candidate > statementDate ? candidate : dateWithDay(nextMonth(month), account.dueDay); }
  function latestStatementDate(account, today = toDate(new Date())) { const month = today.slice(0, 7); const candidate = dateWithDay(month, account.billDay || 1); return candidate <= today ? candidate : dateWithDay(previousMonth(month), account.billDay || 1); }
  function isAccountBillDay(account, date) { return Boolean(account?.billDay) && date === dateWithDay(String(date).slice(0, 7), account.billDay); }
  function pendingBillDayTransactions(accountId = "") { return state.transactions.filter((transaction) => { const account = accountById(transaction.accountId); return account?.type === "credit" && (!accountId || account.id === accountId) && isAccountBillDay(account, transaction.date) && !transaction.statementOverride && creditStatementImpact(transaction) !== 0; }); }

  function loadState() { try { const raw = localStorage.getItem(STORAGE_KEY); return normalizeState(raw ? JSON.parse(raw) : {}); } catch (_error) { return normalizeState({}); } }
  function normalizeState(data) {
    const defaultAccounts = [{ id: uid(), name: "现金", type: "cash", currency: BASE_CURRENCY, initialBalance: 0 }, { id: uid(), name: "储蓄卡", type: "debit", currency: BASE_CURRENCY, initialBalance: 0 }, { id: uid(), name: "信用卡", type: "credit", currency: BASE_CURRENCY, initialBalance: 0, billDay: 1, dueDay: 20 }];
    const accounts = Array.isArray(data.accounts) && data.accounts.length ? data.accounts.slice(0, 500) : defaultAccounts;
    const categories = Array.isArray(data.categories) && data.categories.length ? data.categories.slice(0, 500) : DEFAULT_CATEGORIES.map(makeCategory);
    const normalized = {
      version: 7,
      accounts: accounts.map((a, index) => normalizeAccount(a, index)),
      categories: categories.map((c) => ({ id: safeText(c.id || uid(), 120), name: safeText(c.name || "未命名分类", 30), type: c.type === "income" ? "income" : "expense", color: /^#[0-9a-fA-F]{6}$/.test(c.color) ? c.color : "#308df5", icon: safeText(c.icon || c.name || "账", 2) })),
      budgets: Array.isArray(data.budgets) ? data.budgets.slice(0, 1000) : [],
      plans: Array.isArray(data.plans) ? data.plans.slice(0, 10000).map(normalizePlan) : [],
      quickActions: normalizeQuickActions(Array.isArray(data.quickActions) ? data.quickActions : data.templates),
      transactions: Array.isArray(data.transactions) ? data.transactions.slice(0, 100000).map((t) => normalizeTransaction(t, accounts)) : [],
      installments: Array.isArray(data.installments) ? data.installments.slice(0, 10000).map(normalizeInstallment) : [],
      statementChecks: normalizeStatementChecks(data.statementChecks)
    };
    if (!normalized.categories.some((c) => c.type === "expense" && c.name === "手续费")) normalized.categories.push({ id: "category-fee", name: "手续费", type: "expense", color: "#64748b", icon: "费" });
    normalizeBankOrders(normalized.accounts);
    migrateBudgets(normalized, data);
    return normalized;
  }
  function migrateBudgets(data, original) { if (Array.isArray(original.plans) && original.plans.length) return; if (!Array.isArray(original.budgets)) return; original.budgets.slice(0, 1000).forEach((budget) => { const category = data.categories.find((c) => c.id === safeText(budget.categoryId, 120)); data.plans.push({ id: `plan-${safeText(budget.id || uid(), 120)}`, name: category?.name ? `${category.name}计划` : "计划支出", amount: Math.max(0, round(budget.amount)), currency: BASE_CURRENCY, accountId: data.accounts[0]?.id || "", categoryId: safeText(budget.categoryId, 120), date: /^\d{4}-\d{2}$/.test(String(budget.month)) ? `${budget.month}-01` : toDate(new Date()), repeat: "none", status: "pending", note: "由旧预算数据迁移" }); }); }
  function normalizeAccount(a, index) { const legacy = CURRENCIES.includes(a.currency) ? a.currency : BASE_CURRENCY; const currencies = [...new Set((Array.isArray(a.currencies) && a.currencies.length ? a.currencies : [legacy]).filter((c) => CURRENCIES.includes(c)))]; const list = currencies.length ? currencies : [BASE_CURRENCY]; const initialBalances = {}; const statementBaselines = {}; list.forEach((currency) => { initialBalances[currency] = round(a.initialBalances?.[currency] ?? (currency === legacy ? a.initialBalance : 0)); const baseline = a.statementBaselines?.[currency]; statementBaselines[currency] = { amount: Math.max(0, round(baseline?.amount)), statementDate: validDate(baseline?.statementDate) ? baseline.statementDate : "" }; }); return { id: safeText(a.id || uid(), 120), name: safeText(a.name || "未命名账户", 50), type: ACCOUNT_TYPES[a.type] ? a.type : inferAccountType(a.name), bank: safeText(a.bank || inferBank(a.name) || "未归类机构", 40), tail: safeText(a.tail || "", 12), note: safeText(a.note || "", 80), currencies: list, initialBalances, billDay: clampDay(a.billDay), dueDay: clampDay(a.dueDay), statementTrackingStart: validDate(a.statementTrackingStart) ? a.statementTrackingStart : "", statementBaselines, creditLimit: Math.max(0, round(a.creditLimit)), bankOrder: Number.isFinite(Number(a.bankOrder)) ? Number(a.bankOrder) : index, order: Number.isFinite(Number(a.order)) ? Number(a.order) : index }; }
  function normalizeTransaction(t, sourceAccounts) { const source = sourceAccounts.find((a) => a.id === t.accountId); const target = sourceAccounts.find((a) => a.id === t.targetAccountId); const currency = CURRENCIES.includes(t.currency) ? t.currency : CURRENCIES.includes(source?.currency) ? source.currency : BASE_CURRENCY; const targetCurrency = CURRENCIES.includes(t.targetCurrency) ? t.targetCurrency : CURRENCIES.includes(target?.currency) ? target.currency : currency; const type = ["income", "transfer", "exchange", "fee"].includes(t.type) ? t.type : "expense"; const statementAllocations = Array.isArray(t.statementAllocations) ? t.statementAllocations.slice(0, 50).map((item) => ({ statementId: safeText(item?.statementId, 180), amount: Math.max(0, round(item?.amount)) })).filter((item) => item.statementId && item.amount > 0) : []; return { id: safeText(t.id || uid(), 120), type, date: validDate(t.date) ? t.date : toDate(new Date()), amount: Math.max(0, round(t.amount)), currency, accountId: safeText(t.accountId, 120), targetAccountId: safeText(t.targetAccountId, 120), targetAmount: Math.max(0, round(t.targetAmount ?? (type === "transfer" ? t.amount : 0))), targetCurrency, exchangeRate: Math.max(0, round(t.exchangeRate)), feeAmount: Math.max(0, round(t.feeAmount)), feeCurrency: CURRENCIES.includes(t.feeCurrency) ? t.feeCurrency : "", categoryId: safeText(t.categoryId, 120), note: safeText(t.note, 80), installmentId: safeText(t.installmentId, 120), statementOverride: ["current", "next"].includes(t.statementOverride) ? t.statementOverride : "", statementAllocations }; }
  function normalizeInstallment(item) { return { id: safeText(item.id || uid(), 120), accountId: safeText(item.accountId, 120), currency: CURRENCIES.includes(item.currency) ? item.currency : BASE_CURRENCY, totalAmount: Math.max(0, round(item.totalAmount)), count: Math.min(120, Math.max(2, Math.round(item.count || 2))), firstDate: validDate(item.firstDate) ? item.firstDate : toDate(new Date()), categoryId: safeText(item.categoryId, 120), note: safeText(item.note, 80), feeTotal: Math.max(0, round(item.feeTotal)), skippedPeriods: [...new Set((Array.isArray(item.skippedPeriods) ? item.skippedPeriods : []).map(Number).filter((period) => Number.isInteger(period) && period >= 1 && period <= Math.max(2, Math.round(item.count || 2))))], ended: Boolean(item.ended) }; }
  function normalizeStatementChecks(input) {
    const seen = new Set();
    return (Array.isArray(input) ? input : []).slice(0, 10000).map((item) => ({ statementId: safeText(item?.statementId, 180), checkedAt: safeText(item?.checkedAt, 40) })).filter((item) => item.statementId && item.checkedAt && !seen.has(item.statementId) && seen.add(item.statementId));
  }
  function normalizePlan(p) { return { id: safeText(p.id || uid(), 120), name: safeText(p.name || "提醒", 40), amount: Math.max(0, round(p.amount)), currency: CURRENCIES.includes(p.currency) ? p.currency : BASE_CURRENCY, accountId: safeText(p.accountId, 120), categoryId: safeText(p.categoryId, 120), date: validDate(p.date) ? p.date : toDate(new Date()), repeat: PLAN_REPEATS[p.repeat] ? p.repeat : "none", status: PLAN_STATUSES[p.status] ? p.status : "pending", note: safeText(p.note, 80) }; }
  function normalizeQuickActions(input) { const source = Array.isArray(input) ? input.slice(0, 200) : DEFAULT_QUICK_ACTIONS; return source.filter((q) => q && typeof q === "object" && !["早餐", "咖啡"].includes(q.name)).map((q) => ({ id: safeText(q.id || uid(), 120), name: safeText(q.name || "快捷", 16), type: q.type === "income" || q.type === "transfer" ? q.type : "expense", amount: q.amount === "" || q.amount == null ? "" : Math.max(0, round(q.amount)), categoryName: safeText(q.categoryName || "其他", 20), note: safeText(q.note, 80) })); }
  function saveState() { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
  function exportJson() { download(`e-account-backup-${stamp()}.json`, JSON.stringify(state, null, 2), "application/json;charset=utf-8"); }
  function exportCsv() { const header = ["日期", "类型", "分类", "账户", "目标账户", "付款币种", "付款金额", "目标币种", "目标金额", "实际汇率", "手续费", "手续费币种", "分期ID", "账单分配", "备注"]; const lines = filteredTransactions().map((t) => [t.date, typeLabel(t.type), categoryById(t.categoryId)?.name || transferLabel(t), accountDisplayName(accountById(t.accountId)), accountDisplayName(accountById(t.targetAccountId)), t.currency, t.amount, t.targetCurrency, t.targetAmount, t.exchangeRate, t.feeAmount, t.feeCurrency, t.installmentId, (t.statementAllocations || []).map((item) => `${item.statementId}:${item.amount}`).join(" | "), t.note || ""].map(csv).join(",")); download(`e-account-transactions-${stamp()}.csv`, `\ufeff${header.join(",")}\n${lines.join("\n")}`, "text/csv;charset=utf-8"); }
  function importJson(event) { const input = event.target; const file = input.files[0]; if (!file) return; if (file.size > 5 * 1024 * 1024) { input.value = ""; return notify("备份文件不能超过 5 MB。"); } const reader = new FileReader(); reader.onload = () => { try { const parsed = JSON.parse(String(reader.result)); const known = ["accounts", "categories", "transactions", "plans", "budgets", "quickActions", "templates"]; if (!parsed || Array.isArray(parsed) || typeof parsed !== "object" || !known.some((key) => Array.isArray(parsed[key]))) throw new Error("不是有效的 E-Account 备份。"); state = normalizeState(parsed); saveState(); render(); notify("备份已导入。"); } catch (error) { notify(`导入失败：${safeText(error.message, 120)}`); } finally { input.value = ""; } }; reader.onerror = () => { input.value = ""; notify("导入失败：无法读取备份文件。"); }; reader.readAsText(file); }
  function resetAll() { if (!window.confirm("确认恢复默认数据？当前浏览器里的账本会被清空。")) return; state = normalizeState({}); saveState(); render(); notify("已恢复默认数据。"); }

  function drawCharts() { if (view !== "reports") return; drawShare(); drawTrend(); drawWeek(); }
  function drawShare() { const canvas = document.getElementById("shareChart"); if (!canvas) return; const ctx = setupCanvas(canvas, 300); const range = reportWindow(); const items = categoryTotals(transactionsBetween(range.start, range.end)).slice(0, 6); const total = items.reduce((sum, item) => sum + item.amount, 0); if (!total) return drawEmpty(ctx, "当前区间暂无支出"); const colors = ["#308df5", "#22c7d8", "#8b7cf6", "#ef5f79", "#f59e42", "#35d3a6"]; let start = -Math.PI / 2; items.forEach((item, i) => { const angle = item.amount / total * Math.PI * 2; ctx.beginPath(); ctx.moveTo(120, 128); ctx.arc(120, 128, 84, start, start + angle); ctx.closePath(); ctx.fillStyle = colors[i % colors.length]; ctx.fill(); start += angle; }); ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(120, 128, 44, 0, Math.PI * 2); ctx.fill(); ctx.font = "13px sans-serif"; items.forEach((item, i) => { ctx.fillStyle = colors[i % colors.length]; ctx.fillRect(240, 60 + i * 28, 12, 12); ctx.fillStyle = "#102033"; ctx.fillText(`${item.name} ${Math.round(item.amount / total * 100)}%`, 260, 70 + i * 28); }); }
  function drawTrend() { const canvas = document.getElementById("trendChart"); if (!canvas) return; const ctx = setupCanvas(canvas, 300); drawLines(ctx, reportTrendData(), canvas.clientWidth || 600, 300); }
  function drawWeek() { const canvas = document.getElementById("weekChart"); if (!canvas) return; const ctx = setupCanvas(canvas, 260); const days = Array.from({ length: 7 }, (_, i) => ({ date: toDate(addDays(new Date(), i - 6)), amount: 0 })); state.transactions.forEach((t) => { if (!["expense", "fee"].includes(t.type) || t.currency !== BASE_CURRENCY) return; const day = days.find((d) => d.date === t.date); if (day) day.amount += t.amount; }); const width = canvas.clientWidth || 420; const max = Math.max(100, ...days.map((d) => d.amount)); days.forEach((d, i) => { const x = 28 + i * ((width - 64) / 7); const h = d.amount / max * 150; ctx.fillStyle = "#76c7ff"; ctx.beginPath(); ctx.roundRect(x, 190 - h, 24, Math.max(3, h), 8); ctx.fill(); ctx.fillStyle = "#65758b"; ctx.font = "12px sans-serif"; ctx.fillText(d.date.slice(5).replace("-", "/"), x - 4, 222); }); }
  function setupCanvas(canvas, height) { const ratio = window.devicePixelRatio || 1; const width = canvas.clientWidth || Number(canvas.width) || 420; canvas.width = Math.floor(width * ratio); canvas.height = Math.floor(height * ratio); const ctx = canvas.getContext("2d"); ctx.scale(ratio, ratio); ctx.clearRect(0, 0, width, height); return ctx; }
  function drawLines(ctx, daily, width, height) { const pad = { l: 42, r: 18, t: 22, b: 34 }; const max = Math.max(100, ...daily.flatMap((d) => [d.income, d.expense])); ctx.strokeStyle = "#d8e8f4"; ctx.lineWidth = 1; for (let i = 0; i < 4; i++) { const y = pad.t + i * ((height - pad.t - pad.b) / 3); ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(width - pad.r, y); ctx.stroke(); } drawLine("income", "#1aa979"); drawLine("expense", "#ef5f79"); function drawLine(key, color) { ctx.strokeStyle = color; ctx.lineWidth = 3; ctx.beginPath(); daily.forEach((d, i) => { const x = pad.l + (i / Math.max(1, daily.length - 1)) * (width - pad.l - pad.r); const y = height - pad.b - (d[key] / max) * (height - pad.t - pad.b); if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); }); ctx.stroke(); } }
  function drawEmpty(ctx, text) { ctx.fillStyle = "#65758b"; ctx.font = "14px sans-serif"; ctx.fillText(text, 18, 38); }

  function transactionsTable(items) { return `<table><thead><tr><th>日期</th><th>类型</th><th>分类/备注</th><th>账户</th><th>币种</th><th class="num">金额</th><th></th></tr></thead><tbody>${items.map((t) => `<tr><td>${t.date}</td><td>${typePill(t.type)}</td><td>${escapeHtml(categoryById(t.categoryId)?.name || transferLabel(t))}<br><small>${escapeHtml(t.note || "")}</small></td><td>${escapeHtml(accountLine(t))}</td><td>${escapeHtml(t.targetCurrency && t.targetCurrency !== t.currency ? `${t.currency} → ${t.targetCurrency}` : t.currency)}</td><td class="num ${amountClass(t)}">${signedAmount(t)}</td><td><div class="actions">${t.installmentId || t.type === "fee" ? "" : `<button class="mini" data-action="edit-transaction" data-id="${escapeAttr(t.id)}">编辑</button>`}<button class="mini" data-action="delete-transaction" data-id="${escapeAttr(t.id)}">删除</button></div></td></tr>`).join("") || `<tr><td colspan="7">${empty("没有流水")}</td></tr>`}</tbody></table>`; }
  function transactionCard(t) { return `<article class="item"><div><strong>${escapeHtml(categoryById(t.categoryId)?.name || transferLabel(t))}</strong><small>${t.date} · ${escapeHtml(accountLine(t))} · ${escapeHtml(t.targetCurrency && t.targetCurrency !== t.currency ? `${t.currency} → ${t.targetCurrency}` : t.currency)} ${t.note ? "· " + escapeHtml(t.note) : ""}</small></div><div class="${amountClass(t)}">${signedAmount(t)}</div></article>`; }
  function simpleTransaction(t) { return `<div class="item"><div><strong>${escapeHtml(categoryById(t.categoryId)?.name || transferLabel(t))}</strong><small>${t.date} · ${escapeHtml(accountDisplayName(accountById(t.accountId)) || "未知账户")}</small></div><span class="${amountClass(t)}">${signedAmount(t)}</span></div>`; }
  function accountChoice(a, activeId = draft.accountId, mode = "account") { return `<button class="choice ${activeId === a.id ? "active" : ""}" data-${mode}="${escapeAttr(a.id)}" type="button"><i>${svg(accountIcon(a))}</i><span>${escapeHtml(accountLabel(a))}</span><small>${escapeHtml(a.bank || "未归类")} · ${a.currencies.join("/")}</small></button>`; }
  function categoryChoice(c) { return `<button class="choice ${draft.categoryId === c.id ? "active" : ""}" data-category="${escapeAttr(c.id)}" type="button"><i style="background:${hexBg(c.color)};color:${c.color}">${svg(categoryIcon(c))}</i><span>${escapeHtml(c.name)}</span><small>${c.type === "income" ? "收入" : "支出"}分类</small></button>`; }
  function accountIcon(account) { return ({ cash: "i-banknote", debit: "i-card", credit: "i-credit-card", wallet: "i-wallet", other: "i-grid" })[account.type] || "i-wallet"; }
  function categoryIcon(category) { const names = { 餐饮: "i-utensils", 交通: "i-train", 购物: "i-bag", 学习: "i-book-open", 医疗: "i-heart-pulse", 住房: "i-house", 娱乐: "i-sparkles", 工资: "i-arrow-up", 奖学金: "i-arrow-up", 兼职: "i-arrow-up", 理财: "i-arrow-up", 其他: "i-grid" }; return names[category.name] || (category.type === "income" ? "i-arrow-up" : "i-grid"); }
  function quickActionButton(q) { return `<button class="item" data-quick="${escapeAttr(q.id)}" type="button"><div><strong>${escapeHtml(q.name)}</strong><small>${typeLabel(q.type)}${q.amount ? ` · ${money(q.amount)}` : ""}</small></div><span>填入</span></button>`; }
  function accountAssetItem(a) {
    const b = balances()[a.id] || {}; const credit = a.type === "credit"; const future = futureInstallmentDebtByAccount(a.id);
    const current = a.currencies.map((currency) => money(credit ? Math.max(0, b[currency] || 0) : b[currency] || 0, currency)).join("<br>");
    const billed = credit ? a.currencies.map((currency) => money(creditStatements(a.id, currency).reduce((sum, item) => sum + item.remaining, 0), currency)).join("<br>") : "";
    const total = credit ? a.currencies.map((currency) => money(Math.max(0, (b[currency] || 0) + (future[currency] || 0)), currency)).join("<br>") : "";
    return `<div class="item"><div><strong>${escapeHtml(accountLabel(a))}</strong><small>${credit && a.dueDay ? `账单日 ${a.billDay || "-"} 日 · 还款日 ${a.dueDay} 日 · ` : ""}${a.currencies.join("/")}</small></div><span class="${credit ? "debt" : ""}">${credit ? `当前 ${current}<br><small>已出账 ${billed}</small>${Object.values(future).some(Boolean) ? `<br><small>含分期 ${total}</small>` : ""}` : current}</span></div>`;
  }
  function statementCheckFor(statementId) { return state.statementChecks.find((item) => item.statementId === statementId); }
  function isStatementChecked(statement) { return Boolean(statementCheckFor(statement.id)); }
  function toggleStatementCheck(statementId) {
    const statement = creditStatements().find((item) => item.id === statementId);
    if (!statement) return notify("该账单当前不可核对。");
    const index = state.statementChecks.findIndex((item) => item.statementId === statementId);
    const message = index >= 0 ? "已取消账单核对标记。" : "已标记为已核对。";
    if (index >= 0) state.statementChecks.splice(index, 1);
    else state.statementChecks.push({ statementId, checkedAt: new Date().toISOString() });
    saveState(); render(); notify(message);
  }
  function creditReminderData() {
    return creditStatements().filter((item) => item.remaining > 0).map((item) => ({ ...item, checked: isStatementChecked(item), label: `账期 ${item.cycleStart} 至 ${item.cycleEnd} · 到期 ${item.dueDate}` }));
  }
  function creditReminderItems() { return creditReminderData().map(creditStatementItem).join("") || empty("暂无已出账待还信用卡账单"); }
  function creditReminderPreviewItem(item) { return reminderEventItem({ kind: "credit", date: item.dueDate, title: `${accountDisplayName(item.account)} · ${item.currency}`, detail: item.label, amount: item.remaining, currency: item.currency, account: item.account, statementId: item.id }); }
  function creditStatementsPanel() {
    const statements = creditStatements(); const pending = pendingBillDayTransactions(); const unchecked = statements.filter((item) => !isStatementChecked(item)).length;
    const verification = pending.length ? `<section class="statement-verification"><div class="panel-header"><div><h3>账单日交易待核验</h3><span>查看银行 App 后，选择该笔是否已进入本期账单。</span></div><span>${pending.length} 笔</span></div><div class="list">${pending.map(statementVerificationItem).join("")}</div></section>` : "";
    const list = statements.length ? `<div class="list statement-list">${statements.map(creditStatementItem).join("")}</div>` : empty("设置账单日、还款日并录入信用卡流水后，这里会生成已出账账单。");
    return `${verification}<section class="statement-list-section"><div class="panel-header"><h3>已出账账单</h3><span>${unchecked} 张待核对 · 按卡片和币种分别计算</span></div>${list}</section>`;
  }
  function creditStatementItem(item) {
    const paid = item.paid ? ` · 已还 ${money(item.paid, item.currency)}` : "";
    const source = item.source === "legacy" ? "历史已出账 · " : "";
    const checked = isStatementChecked(item);
    return `<article class="item statement-item ${dateDistance(item.dueDate) < 0 ? "overdue" : ""}"><div><strong>${escapeHtml(accountDisplayName(item.account))} · ${item.currency} <span class="statement-check ${checked ? "checked" : ""}">${checked ? "已核对" : "待核对"}</span></strong><small>${source}账期 ${item.cycleStart} 至 ${item.cycleEnd} · 账单日 ${item.statementDate} · 到期 ${item.dueDate}${paid}</small></div><div class="actions"><span class="debt">${money(item.remaining, item.currency)}</span><button class="mini" data-action="toggle-statement-check" data-statement-id="${escapeAttr(item.id)}" type="button">${checked ? "取消核对" : "标记已核对"}</button><button class="mini primary-mini" data-action="pay-credit" data-id="${escapeAttr(item.accountId)}" data-currency="${item.currency}" data-statement-id="${escapeAttr(item.id)}" type="button">去还款</button></div></article>`;
  }
  function statementVerificationItem(transaction) {
    const account = accountById(transaction.accountId);
    return `<article class="item statement-verify-item"><div><strong>${escapeHtml(accountDisplayName(account))} · ${transaction.currency}</strong><small>${transaction.date} · ${escapeHtml(transaction.note || categoryById(transaction.categoryId)?.name || "信用卡交易")} · ${money(Math.abs(creditStatementImpact(transaction)), transaction.currency)}</small></div><div class="actions"><button class="mini" data-action="verify-statement" data-id="${escapeAttr(transaction.id)}" data-mode="current" type="button">计入本期</button><button class="mini primary-mini" data-action="verify-statement" data-id="${escapeAttr(transaction.id)}" data-mode="next" type="button">计入下期</button></div></article>`;
  }
  function accountManageItem(a) { const peers = orderedAccounts().filter((item) => item.type === a.type && item.bank === a.bank); const index = peers.findIndex((item) => item.id === a.id); return `<div class="item account-manage-item"><div><strong>${escapeHtml(accountLabel(a))}</strong><small>${a.currencies.join(" / ")}${a.type === "credit" ? ` · 还款日 ${a.dueDay || "-"} 日` : ""}</small></div><div class="actions"><button class="mini" data-action="move-account" data-id="${escapeAttr(a.id)}" data-direction="-1" ${index <= 0 ? "disabled" : ""}>上移</button><button class="mini" data-action="move-account" data-id="${escapeAttr(a.id)}" data-direction="1" ${index >= peers.length - 1 ? "disabled" : ""}>下移</button><button class="mini" data-action="edit-account" data-id="${escapeAttr(a.id)}">编辑</button><button class="mini" data-action="delete-account" data-id="${escapeAttr(a.id)}">删除</button></div></div>`; }
  function categoryManageItem(c) { return `<div class="item"><div><strong>${escapeHtml(c.icon || "")} ${escapeHtml(c.name)}</strong><small>${typeLabel(c.type)} · 用于报表占比</small></div><button class="mini" data-action="delete-category" data-id="${escapeAttr(c.id)}">删除</button></div>`; }
  function planItem(p) { const id = escapeAttr(p.id); return `<div class="item"><div><strong>${escapeHtml(p.name)}</strong><small>${p.date} · ${PLAN_REPEATS[p.repeat] || "不重复"} · ${PLAN_STATUSES[p.status] || "待处理"}</small></div><div class="actions"><span>${money(p.amount, p.currency)}</span>${p.status === "pending" ? `<button class="mini primary-mini" data-action="pay-plan" data-id="${id}">记为流水</button><button class="mini" data-action="skip-plan" data-id="${id}">跳过</button>` : `<button class="mini" data-action="reopen-plan" data-id="${id}">恢复</button>`}<button class="mini" data-action="delete-plan" data-id="${id}">删除</button></div></div>`; }
  function quickManageItem(q) { return `<div class="item"><div><strong>${escapeHtml(q.name)}</strong><small>${typeLabel(q.type)}${q.amount ? ` · ${money(q.amount)}` : ""}</small></div><button class="mini" data-action="delete-quick" data-id="${escapeAttr(q.id)}">删除</button></div>`; }
  function categoryRank(transactions) { const items = categoryTotals(transactions); const max = Math.max(1, ...items.map((i) => i.amount)); return items.map((i) => `<div class="item"><div><strong>${escapeHtml(i.name)}</strong><small>${Math.round(i.amount / max * 100)}% 相对最高项</small></div><span>${money(i.amount, i.currency)}</span></div>`).join("") || empty("当前区间暂无支出"); }
  function categoryTotals(transactions) { const totals = {}; transactions.forEach((t) => { if (!["expense", "fee"].includes(t.type) || t.currency !== BASE_CURRENCY) return; const c = categoryById(t.categoryId); const key = c?.id || "unknown"; totals[key] ||= { name: c?.name || "未分类", amount: 0, currency: BASE_CURRENCY }; totals[key].amount += t.amount; }); return Object.values(totals).sort((a, b) => b.amount - a.amount); }
  function metric(label, value, hint) { return `<article class="metric"><span>${label}</span><strong>${escapeHtml(value)}</strong><small>${escapeHtml(hint)}</small></article>`; }
  function compareMetric(label, current, prev, positiveGood) { const diff = round(current - prev); const good = diff === 0 || ((diff > 0) === positiveGood); return metric(label, money(current), `${diff >= 0 ? "+" : ""}${money(diff)} · ${good ? "趋势正常" : "需要关注"}`); }
  function chartPanel(title, subtitle, id) { return `<section class="panel"><div class="panel-header"><h3>${title}</h3><span>${subtitle}</span></div><div class="canvas-wrap"><canvas id="${id}" width="620" height="300"></canvas></div></section>`; }
  function selectField(label, id, options, selected) { return `<label class="field"><span>${label}</span><select id="${id}">${options.map(([v, text]) => `<option value="${escapeAttr(v)}" ${String(v) === String(selected) ? "selected" : ""}>${escapeHtml(text)}</option>`).join("")}</select></label>`; }
  function choice(label, type, active, icon, hint) { return `<button class="choice ${active ? "active" : ""}" data-choice="${type}" type="button"><i>${String(icon).startsWith("i-") ? svg(icon) : icon}</i><span>${label}</span><small>${hint}</small></button>`; }
  function typePill(type) { return `<span class="pill ${type}">${typeLabel(type)}</span>`; }
  function typeLabel(type) { return { all: "", income: "收入", expense: "支出", transfer: "还款", exchange: "购汇", fee: "手续费", installment: "分期" }[type] || "支出"; }
  function accountLine(t) { const a = accountDisplayName(accountById(t.accountId)) || "未知账户"; const b = accountDisplayName(accountById(t.targetAccountId)); return b ? `${a} → ${b}` : a; }
  function transferLabel(t) { return t.type === "transfer" ? "信用卡还款" : t.type === "exchange" ? "购汇" : t.type === "fee" ? "手续费" : "未分类"; }
  function amountClass(t) { if (t.type === "income") return "income"; if (t.type === "transfer" || t.type === "exchange") return "debt"; return "expense"; }
  function signedAmount(t) { const sign = t.type === "income" ? "+" : t.type === "expense" || t.type === "fee" ? "-" : ""; return `${sign}${money(t.amount, t.currency || BASE_CURRENCY)}`; }
  function newDraft(type) { const accountId = preferredAccount(type); const account = accountById(accountId); const target = type === "transfer" ? orderedAccounts().find((a) => a.type === "credit") : type === "exchange" ? account : null; return { type, amount: "", date: toDate(new Date()), accountId, targetAccountId: target?.id || "", currency: account?.currencies[0] || BASE_CURRENCY, targetCurrency: target?.currencies[0] || BASE_CURRENCY, targetAmount: "", feeAmount: "", feeCurrency: account?.currencies[0] || BASE_CURRENCY, categoryId: state?.categories?.find((c) => c.type === (type === "income" ? "income" : "expense"))?.id || "", note: "", firstDate: toDate(new Date()), installmentCount: 3, statementAllocations: [] }; }
  function preferredAccount(type) { const stored = localStorage.getItem(`${STORAGE_KEY}:last-account`); const eligible = (a) => type === "installment" ? a.type === "credit" : type === "transfer" ? a.type !== "credit" : true; if (state?.accounts?.some((a) => a.id === stored && eligible(a))) return stored; return orderedAccounts().find(eligible)?.id || state?.accounts?.[0]?.id || ""; }
  function upsert(collection, item) { const index = state[collection].findIndex((x) => x.id === item.id); if (index >= 0) state[collection][index] = item; else state[collection].push(item); }
  function accountById(id) { return state.accounts.find((a) => a.id === id); }
  function orderedAccounts() { return state.accounts.slice().sort((a, b) => accountTypeRank(a.type) - accountTypeRank(b.type) || a.bankOrder - b.bankOrder || a.order - b.order || a.bank.localeCompare(b.bank, "zh-CN") || a.name.localeCompare(b.name, "zh-CN")); }
  function bankGroupsFromAccounts(accounts) {
    const groups = new Map();
    accounts.forEach((account) => { if (!groups.has(account.bank)) groups.set(account.bank, []); groups.get(account.bank).push(account); });
    return [...groups.entries()].map(([bank, groupAccounts]) => ({ bank, accounts: groupAccounts }));
  }
  function bankGroupsForType(type) { return bankGroupsFromAccounts(orderedAccounts().filter((account) => account.type === type)); }
  function accountRisk(accounts) {
    const pending = pendingBillDayTransactions(); let count = 0; let overdue = 0;
    accounts.filter((account) => account.type === "credit").forEach((account) => {
      pending.filter((item) => item.accountId === account.id).forEach(() => count += 1);
      creditStatements(account.id).filter((item) => item.remaining > 0).forEach((item) => { count += 1; if (dateDistance(item.dueDate) < 0) overdue += 1; });
    });
    return { count, overdue };
  }
  function accountGroupValue(accounts) {
    const current = balances(); const totals = {};
    accounts.forEach((account) => account.currencies.forEach((currency) => {
      const amount = current[account.id]?.[currency] || 0;
      totals[currency] = round((totals[currency] || 0) + (account.type === "credit" ? -Math.max(0, amount) : amount));
    }));
    return formatCurrencyMap(totals);
  }
  function groupOpen(mode, key, automatic = false) {
    const stateForMode = accountGroupState[mode];
    if (stateForMode.closed.has(key)) return false;
    if (stateForMode.open.has(key)) return true;
    return automatic;
  }
  function toggleAccountGroup(mode, key) {
    const stateForMode = accountGroupState[mode] || (accountGroupState[mode] = { open: new Set(), closed: new Set() });
    const [scope, type, bank] = key.split(":");
    const accounts = scope === "type" ? orderedAccounts().filter((account) => account.type === type) : orderedAccounts().filter((account) => account.type === type && account.bank === bank);
    const automatic = mode === "asset" && accountRisk(accounts).count > 0;
    const open = groupOpen(mode, key, automatic);
    if (open) { stateForMode.open.delete(key); stateForMode.closed.add(key); }
    else { stateForMode.closed.delete(key); stateForMode.open.add(key); }
    render();
  }
  function setAccountGroupsExpanded(mode, expanded) {
    const stateForMode = accountGroupState[mode] || (accountGroupState[mode] = { open: new Set(), closed: new Set() });
    const keys = orderedAccounts().flatMap((account) => [`type:${account.type}`, `bank:${account.type}:${account.bank}`]);
    if (expanded) { keys.forEach((key) => stateForMode.open.add(key)); stateForMode.closed.clear(); }
    else { keys.forEach((key) => stateForMode.closed.add(key)); stateForMode.open.clear(); }
    render();
  }
  function accountGroupActions(mode) { return `<div class="account-groups-actions"><button class="mini" data-action="expand-account-groups" data-group-mode="${mode}" type="button">全部展开</button><button class="mini" data-action="collapse-account-groups" data-group-mode="${mode}" type="button">全部收起</button></div>`; }
  function accountGroupsHtml(mode) {
    const types = [...new Set(orderedAccounts().map((account) => account.type))];
    return types.map((type) => {
      const banks = bankGroupsForType(type); const accounts = banks.flatMap((group) => group.accounts); const risk = accountRisk(accounts); const typeKey = `type:${type}`; const typeOpen = groupOpen(mode, typeKey, mode === "asset" && risk.count > 0);
      return `<section class="account-type-group ${typeOpen ? "expanded" : ""}"><button class="account-type-summary" data-action="toggle-account-group" data-group-mode="${mode}" data-group-key="${escapeAttr(typeKey)}" type="button"><span class="group-arrow">${typeOpen ? "⌄" : "›"}</span><i>${svg(accountIcon({ type }))}</i><span class="group-copy"><strong>${ACCOUNT_TYPES[type]}</strong><small>${accounts.length} 个账户 · ${banks.length} 家机构${risk.count ? ` · ${risk.overdue ? `${risk.overdue} 项逾期` : `${risk.count} 项待处理`}` : ""}</small></span><span class="group-total ${type === "credit" ? "debt" : ""}">${accountGroupValue(accounts)}</span></button>${typeOpen ? `<div class="account-type-content">${banks.map((group, index) => {
        const bankKey = `bank:${type}:${group.bank}`; const bankRisk = accountRisk(group.accounts); const bankOpen = groupOpen(mode, bankKey, mode === "asset" && bankRisk.count > 0);
        return `<section class="account-bank-group ${bankOpen ? "expanded" : ""}"><button class="account-bank-summary" data-action="toggle-account-group" data-group-mode="${mode}" data-group-key="${escapeAttr(bankKey)}" type="button"><span class="group-arrow">${bankOpen ? "⌄" : "›"}</span><span class="group-copy"><strong>${escapeHtml(group.bank || "未归类机构")}</strong><small>${group.accounts.length} 个账户${bankRisk.count ? ` · ${bankRisk.overdue ? `${bankRisk.overdue} 项逾期` : `${bankRisk.count} 项待处理`}` : ""}</small></span><span class="group-total">${accountGroupValue(group.accounts)}</span></button>${bankOpen ? `<div class="account-bank-content">${mode === "manage" ? `<div class="actions bank-actions"><button class="mini" data-action="move-bank" data-type="${escapeAttr(type)}" data-bank="${escapeAttr(group.bank)}" data-direction="-1" ${index <= 0 ? "disabled" : ""}>上移银行</button><button class="mini" data-action="move-bank" data-type="${escapeAttr(type)}" data-bank="${escapeAttr(group.bank)}" data-direction="1" ${index >= banks.length - 1 ? "disabled" : ""}>下移银行</button></div>` : ""}<div class="list">${group.accounts.map((account) => mode === "manage" ? accountManageItem(account) : accountAssetItem(account)).join("")}</div></div>` : ""}</section>`;
      }).join("")}</div>` : ""}</section>`;
    }).join("") || empty("暂无账户");
  }
  function accountLabel(account) { return account ? `${account.name}${account.tail ? ` · ${account.tail}` : ""}` : ""; }
  function accountDisplayName(account) { return accountLabel(account); }
  function bankNames() { return [...new Set(state.accounts.map((account) => account.bank).filter(Boolean))].sort((a, b) => a.localeCompare(b, "zh-CN")); }
  function normalizeBankOrders(accounts) { const groups = new Map(); accounts.forEach((account) => { const key = `${account.type}|${account.bank}`; if (!groups.has(key)) groups.set(key, []); groups.get(key).push(account); }); groups.forEach((items) => { const bankOrder = Math.min(...items.map((item) => Number(item.bankOrder) || 0)); items.forEach((item) => item.bankOrder = bankOrder); }); }
  function nextBankOrder(type, bank) { const existing = state.accounts.find((account) => account.type === type && account.bank === bank); return existing ? existing.bankOrder : Math.max(-1, ...state.accounts.filter((account) => account.type === type).map((account) => Number(account.bankOrder) || 0)) + 1; }
  function nextAccountOrder(type, bank) { return Math.max(-1, ...state.accounts.filter((account) => account.type === type && account.bank === bank).map((account) => Number(account.order) || 0)) + 1; }
  function futureInstallmentDebtByAccount(accountId) { const result = {}; state.installments.filter((item) => !item.ended && item.accountId === accountId).forEach((item) => Array.from({ length: item.count }, (_, index) => { const period = index + 1; const generated = state.transactions.some((transaction) => transaction.id === `${item.id}-p-${period}`); if (!generated && !item.skippedPeriods.includes(period)) result[item.currency] = round((result[item.currency] || 0) + installmentPrincipal(item, index) + installmentFee(item, index)); })); return result; }
  function newAccountForm() { return { name: "", type: "debit", bank: "", tail: "", note: "", currencies: [BASE_CURRENCY], initialBalances: { CNY: 0 }, billDay: "", dueDay: "", statementTrackingStart: "", statementBaselines: { CNY: { amount: 0, statementDate: "" } }, creditLimit: 0 }; }
  function feeCategory() { return state.categories.find((category) => category.type === "expense" && category.name === "手续费") || expenseCategory(); }
  function accountTypeRank(type) { const index = ["cash", "debit", "credit", "wallet", "other"].indexOf(type); return index < 0 ? 99 : index; }
  function inferBank(name) { return ["招商银行", "中国银行", "工商银行", "建设银行", "农业银行", "交通银行", "中信银行", "浦发银行", "平安银行", "民生银行", "兴业银行", "广发银行"].find((bank) => String(name || "").includes(bank)) || ""; }
  function positive(value) { const number = round(value); return number > 0 ? number : 0; }
  function startCreditPayment(accountId, currency, statementId = "") { const source = orderedAccounts().find((account) => account.type !== "credit"); const target = accountById(accountId); if (!source || !target) return notify("请先添加付款账户和信用卡。"); const statements = creditStatements(target.id, currency).filter((item) => item.remaining > 0); const chosen = statementId ? statements.filter((item) => item.id === statementId) : statements; if (!chosen.length) return notify("当前没有可分配的已出账账单。"); draft = newDraft("transfer"); draft.accountId = source.id; draft.targetAccountId = target.id; pickerTypes.account = source.type; pickerTypes["credit-target"] = "credit"; draft.targetCurrency = currency; draft.currency = source.currencies.includes(currency) ? currency : source.currencies[0] || BASE_CURRENCY; draft.statementAllocations = chosen.map((item) => ({ statementId: item.id, amount: item.remaining })); draft.targetAmount = round(draft.statementAllocations.reduce((sum, item) => sum + item.amount, 0)); draft.amount = draft.currency === currency ? draft.targetAmount : ""; view = "record"; render(); }
  function verifyStatementTransaction(id, mode) { const transaction = state.transactions.find((item) => item.id === id); const account = transaction && accountById(transaction.accountId); if (!transaction || !account || !["current", "next"].includes(mode) || !isAccountBillDay(account, transaction.date)) return notify("该交易无法设置账单归属。"); transaction.statementOverride = mode; saveState(); render(); notify(mode === "current" ? "已计入本期账单。" : "已计入下期账单。"); }
  function installmentItem(item) { const generated = state.transactions.filter((transaction) => transaction.installmentId === item.id && transaction.type === "expense").length; const paid = Array.from({ length: generated }, (_, index) => installmentPrincipal(item, index)).reduce((sum, amount) => sum + amount, 0); const nextPeriod = Array.from({ length: item.count }, (_, index) => index + 1).find((period) => !item.skippedPeriods.includes(period) && !state.transactions.some((transaction) => transaction.id === `${item.id}-p-${period}`)); const next = nextPeriod ? addMonths(item.firstDate, nextPeriod - 1) : "已完成"; return `<div class="item"><div><strong>${escapeHtml(accountById(item.accountId)?.name || "已删除信用卡")} · ${item.currency}</strong><small>${escapeHtml(categoryById(item.categoryId)?.name || "未分类")} · 已入账 ${generated}/${item.count} 期 · 下期 ${next}</small></div><div class="actions"><span>${money(Math.max(0, item.totalAmount - paid), item.currency)}</span>${nextPeriod ? `<button class="mini" data-action="skip-next-installment" data-id="${escapeAttr(item.id)}">跳过下期</button>` : ""}<button class="mini" data-action="stop-installment" data-id="${escapeAttr(item.id)}">停止未来期数</button></div></div>`; }
  function categoryById(id) { return state.categories.find((c) => c.id === id); }
  function expenseCategory() { return state.categories.find((c) => c.type === "expense"); }
  function makeCategory([name, type, color, icon]) { return { id: uid(), name, type, color, icon }; }
  function isOther(category) { return category && category.name === "其他"; }
  function inferAccountType(name) { return /信用/.test(String(name)) ? "credit" : /现金/.test(String(name)) ? "cash" : /钱包|支付宝|微信/.test(String(name)) ? "wallet" : "debit"; }
  function byDateDesc(a, b) { return b.date.localeCompare(a.date); }
  function noop() {}
  function value(id) { return document.getElementById(id)?.value || ""; }
  function clampDay(value) { const n = Number(value); return n >= 1 && n <= 31 ? Math.round(n) : ""; }
  function round(n) { const value = Number(n); return Number.isFinite(value) ? Math.round(value * 100) / 100 : 0; }
  function money(n, currency = BASE_CURRENCY) { return `${currency} ${round(n).toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`; }
  function formatCurrencyMap(map) { return Object.entries(map).filter(([, v]) => Math.abs(v) > 0.0001).map(([c, v]) => money(v, c)).join(" / ") || money(0); }
  function toDate(date) { const d = new Date(date); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
  function toMonth(date) { const d = new Date(date); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; }
  function previousMonth(month) { const [y, m] = month.split("-").map(Number); return toMonth(new Date(y, m - 2, 1)); }
  function nextMonth(month) { const [y, m] = month.split("-").map(Number); return toMonth(new Date(y, m, 1)); }
  function daysInMonth(month) { const [y, m] = month.split("-").map(Number); return new Date(y, m, 0).getDate(); }
  function monthRange(month) { return { start: `${month}-01`, end: `${month}-${pad(daysInMonth(month))}` }; }
  function addDays(date, days) { const d = new Date(date); d.setDate(d.getDate() + days); return d; }
  function addMonths(date, months) { const source = parseLocalDate(date); const day = source.getDate(); const target = new Date(source.getFullYear(), source.getMonth() + months, 1); target.setDate(Math.min(day, new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate())); return toDate(target); }
  function dateWithDay(month, day) { return month + "-" + pad(Math.min(Number(day) || 1, daysInMonth(month))); }
  function parseLocalDate(value) { return new Date(`${value}T00:00:00`); }
  function dateSerial(value) { const [year, month, day] = String(value).split("-").map(Number); return Date.UTC(year, month - 1, day); }
  function dateSpan(start, end) { return Math.max(1, Math.round((dateSerial(end) - dateSerial(start)) / 86400000) + 1); }
  function dateDistance(value) { const today = new Date(); today.setHours(0, 0, 0, 0); const target = new Date(`${value}T00:00:00`); return Math.round((target - today) / 86400000); }
  function validDate(value) { const text = String(value); if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false; const date = parseLocalDate(text); return Number.isFinite(date.getTime()) && toDate(date) === text; }
  function pad(n) { return String(n).padStart(2, "0"); }
  function uid() { return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`; }
  function stamp() { return new Date().toISOString().slice(0, 10); }
  function svg(id) { return `<svg aria-hidden="true"><use href="#${id}"></use></svg>`; }
  function empty(text) { return `<div class="empty">${escapeHtml(text)}</div>`; }
  function hexBg(color) { return `${color}1f`; }
  function safeText(value, maxLength) { return String(value ?? "").slice(0, maxLength); }
  function escapeHtml(value) { return String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[c])); }
  function escapeAttr(value) { return escapeHtml(value); }
  function csv(value) { const raw = String(value ?? ""); const text = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw; return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text; }
  function download(name, content, type) { const blob = new Blob([content], { type }); const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 0); }
  function notify(message) { const el = document.getElementById("notice"); if (!el) return; el.textContent = message; el.classList.add("show"); clearTimeout(notify.timer); notify.timer = setTimeout(() => el.classList.remove("show"), 2200); }
})();
