(function () {
  "use strict";

  const STORAGE_KEY = "local-ledger-v1";
  const BASE_CURRENCY = "CNY";
  const CURRENCIES = ["CNY", "USD", "EUR", "JPY", "HKD", "GBP", "AUD", "CAD", "SGD"];
  const ACCOUNT_TYPES = { cash: "现金", debit: "储蓄卡", credit: "信用卡", wallet: "电子钱包", other: "其他账户" };
  const PLAN_REPEATS = { none: "不重复", monthly: "每月", quarterly: "每季度", yearly: "每年" };
  const PLAN_STATUSES = { pending: "待处理", paid: "已支付", skipped: "已跳过" };
  const NAV = [["ledger", "流水", "i-book"], ["reports", "统计", "i-chart"], ["record", "记一笔", "i-plus"], ["assets", "资产", "i-wallet"], ["me", "我的", "i-user"]];
  const DEFAULT_CATEGORIES = [
    ["餐饮", "expense", "#ef5f79", "餐"], ["交通", "expense", "#f59e42", "行"], ["购物", "expense", "#8b7cf6", "购"], ["学习", "expense", "#308df5", "学"], ["医疗", "expense", "#fb7185", "医"], ["住房", "expense", "#35d3a6", "住"], ["娱乐", "expense", "#22c7d8", "乐"], ["其他", "expense", "#94a3b8", "其"],
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
  let view = "ledger";
  let selectedMonth = toMonth(new Date());
  let reportPeriod = "month";
  let customReportRange = monthRange(selectedMonth);
  let search = "";
  let filters = { type: "all", category: "all", account: "all" };
  let draft = newDraft("expense");
  let editing = null;
  let settingsPanel = "home";
  let searchRenderTimer = null;
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
    return `<section class="view active"><div class="toolbar">${selectField("类型", "filter-type", [["all", "全部"], ["expense", "支出"], ["income", "收入"], ["transfer", "还款/转账"]], filters.type)}${selectField("分类", "filter-category", [["all", "全部分类"], ...state.categories.map((c) => [c.id, c.name])], filters.category)}${selectField("账户", "filter-account", [["all", "全部账户"], ...state.accounts.map((a) => [a.id, a.name])], filters.account)}<button class="btn" data-action="clear-filters" type="button">清除筛选</button></div><section class="panel solid"><div class="panel-header"><h3>流水明细</h3><span>${list.length} 条</span></div><div class="table-wrap">${transactionsTable(list)}</div><div class="mobile-cards">${list.map(transactionCard).join("") || empty("没有符合条件的流水")}</div></section></section>`;
  }

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
    const cats = state.categories.filter((c) => c.type === (draft.type === "income" ? "income" : "expense"));
    const account = accountById(draft.accountId);
    return `<section class="view active record-layout"><section class="panel solid"><div class="panel-header"><h3>${editing ? "编辑流水" : "记一笔"}</h3><span>图标选择，快速完成</span></div><div class="form-stack"><div class="icon-grid transaction-types">${choice("支出", "expense", draft.type === "expense", svg("i-arrow-down"), "日常消费")}${choice("收入", "income", draft.type === "income", svg("i-arrow-up"), "工资、奖金")}${choice("还信用卡", "transfer", draft.type === "transfer", svg("i-credit-card"), "不计入消费")}</div><label class="field amount-input"><span>金额</span><input id="draft-amount" type="number" step="0.01" min="0.01" value="${escapeAttr(draft.amount)}" placeholder="0.00"></label><label class="field"><span>日期</span><input id="draft-date" type="date" value="${draft.date}"></label><div><div class="panel-header"><h3>${draft.type === "transfer" ? "从哪个账户还款" : "账户"}</h3><span>${account ? `${ACCOUNT_TYPES[account.type]} · ${account.currency}` : "选择账户"}</span></div><div class="icon-grid">${state.accounts.filter((a) => draft.type !== "transfer" || a.type !== "credit").map(accountChoice).join("")}</div></div>${draft.type === "transfer" ? creditTargetBlock() : `<div><div class="panel-header"><h3>分类</h3><button class="mini" data-action="open-category-manager" type="button">管理</button></div><div class="icon-grid">${cats.map(categoryChoice).join("")}</div></div>`}<div class="voice-box"><label class="field"><span>备注 / 一句话记账</span><input id="draft-note" type="text" maxlength="80" value="${escapeAttr(draft.note)}" placeholder="例如：今天午饭 28 支付宝"></label><button class="btn" data-action="parse-note" type="button">本地解析</button></div><div class="actions"><button class="btn ghost" data-action="reset-draft" type="button">重置</button><button class="btn primary" data-action="save-transaction" type="button">${editing ? "保存修改" : "保存流水"}</button></div></div></section><aside class="panel"><div class="panel-header"><h3>快捷入口</h3><button class="mini" data-action="open-quick-manager" type="button">管理</button></div><div class="list">${state.quickActions.map(quickActionButton).join("")}</div><div class="panel-header recent-heading"><h3>最近流水</h3><span>5 条</span></div><div class="list">${state.transactions.slice().sort(byDateDesc).slice(0, 5).map(simpleTransaction).join("") || empty("暂无流水")}</div></aside></section>`;
  }

  function assetsView() {
    const snapshot = assetSnapshot();
    return `<section class="view active grid"><section class="insight-card asset-hero"><div><span class="eyebrow">本机账户 · 全部流水累计</span><h3>净资产</h3><strong>${formatCurrencyMap(snapshot.net)}</strong><small>资产减负债，多币种分别显示，不自动折算。</small></div><div class="insight-split"><article><span>资产</span><strong>${formatCurrencyMap(snapshot.assets)}</strong></article><article><span>负债</span><strong class="debt">${formatCurrencyMap(snapshot.debts)}</strong></article></div></section><div class="grid two"><section class="panel solid"><div class="panel-header"><h3>账户资产</h3><span>添加账户后自动更新</span></div><div class="list">${state.accounts.map(accountAssetItem).join("")}</div></section><section class="panel solid"><div class="panel-header"><h3>信用卡提醒</h3><span>应还与还款日</span></div><div class="list">${creditReminderItems()}</div></section></div></section>`;
  }

  function meView() {
    if (settingsPanel !== "home") return settingsDetailView();
    return `<section class="view active grid my-view"><section class="identity-strip">${brandMark("identity-mark")}<div><span class="local-chip">本地保存</span><h3>E-Account</h3></div></section>${reminderOverview()}<div class="settings-grid compact-settings"><button class="setting-tile" data-action="open-setting" data-panel="accounts" type="button"><i>${svg("i-card")}</i><span><strong>账户与卡片</strong><small>储蓄卡、信用卡与余额</small></span></button><button class="setting-tile" data-action="open-setting" data-panel="security" type="button"><i>${svg("i-lock")}</i><span><strong>备份与隐私</strong><small>导入、导出与本地数据</small></span></button><button class="setting-tile" data-action="open-setting" data-panel="preferences" type="button"><i>${svg("i-sliders")}</i><span><strong>外观与偏好</strong><small>主题与本地维护</small></span></button></div></section>`;
  }

  function reminderOverview() {
    const pending = state.plans.filter((plan) => plan.status === "pending").sort((a, b) => a.date.localeCompare(b.date));
    const days = Array.from({ length: 7 }, (_, index) => addDays(new Date(), index));
    const calendar = days.map((day, index) => {
      const date = toDate(day);
      const hasPlan = pending.some((plan) => plan.date === date);
      return `<div class="calendar-day ${index === 0 ? "today" : ""}"><span>${["日", "一", "二", "三", "四", "五", "六"][day.getDay()]}</span><strong>${day.getDate()}</strong>${hasPlan ? "<i></i>" : ""}</div>`;
    }).join("");
    const content = pending.slice(0, 3).map(reminderPreviewItem).join("") || `<div class="reminder-empty"><span>${svg("i-bell")}</span><div><strong>近期没有待处理事项</strong><small>可添加还款、房租或订阅续费提醒。</small></div><button class="mini" data-action="open-setting" data-panel="reminders" type="button">添加提醒</button></div>`;
    return `<section class="panel reminder-overview"><div class="panel-header"><div><h3>近期提醒</h3><span>未来计划与还款安排</span></div><button class="mini" data-action="open-setting" data-panel="reminders" type="button">查看全部</button></div><div class="calendar-strip">${calendar}</div><div class="reminder-list">${content}</div></section>`;
  }

  function reminderPreviewItem(plan) {
    const diff = dateDistance(plan.date);
    const timing = diff < 0 ? `已逾期 ${Math.abs(diff)} 天` : diff === 0 ? "今天到期" : `${diff} 天后`;
    const account = accountById(plan.accountId);
    return `<article class="reminder-row ${diff < 0 ? "overdue" : ""}"><span class="reminder-icon">${svg(plan.name.includes("信用卡") ? "i-credit-card" : "i-bell")}</span><div><strong>${escapeHtml(plan.name)}</strong><small>${plan.date} · ${timing}${account ? ` · ${escapeHtml(account.name)}` : ""}</small></div><div class="reminder-amount"><strong>${money(plan.amount, plan.currency)}</strong><span>${diff < 0 ? "逾期" : "待处理"}</span></div><button class="mini primary-mini" data-action="pay-plan" data-id="${escapeAttr(plan.id)}" type="button">记为流水</button></article>`;
  }

  function settingsDetailView() {
    const title = { security: "备份与隐私", accounts: "账户与卡片", categories: "分类规则", quick: "快捷入口", reminders: "提醒与计划", preferences: "外观与偏好" }[settingsPanel] || "我的";
    const body = {
      security: `<section class="panel solid"><div class="panel-header"><h3>数据安全</h3><span>只在本地</span></div><p class="muted-copy">E-Account 不接后端、不上传云端。公开网页源码不等于公开账单，账单存在当前浏览器 localStorage。换域名或换手机时，用 JSON 导出/导入迁移。</p><div class="top-actions"><button class="btn" data-action="export-json" type="button">导出 JSON</button><button class="btn" data-action="export-csv" type="button">导出 CSV</button><label class="btn"><input id="import-json" type="file" accept="application/json" hidden>导入 JSON</label></div></section>`,
      accounts: accountsManager(),
      categories: categoriesManager(),
      quick: quickManager(),
      reminders: plansManager(),
      preferences: `<section class="panel"><div class="panel-header"><h3>偏好与维护</h3><span>谨慎操作</span></div><div class="grid two"><article class="item"><div><strong>默认货币</strong><small>${BASE_CURRENCY} · 当前版本不自动折算外币</small></div></article><article class="item"><div><strong>主题</strong><small>清爽高级 · 自由流线背景</small></div></article></div><div class="top-actions"><button class="btn danger" data-action="reset-all" type="button">恢复默认数据</button></div></section>`
    }[settingsPanel];
    return `<section class="view active grid"><button class="btn ghost" data-action="back-settings" type="button">返回我的</button><section class="page-title compact-page-title"><div><span class="page-kicker">E-Account</span><h2>${title}</h2></div></section>${body}</section>`;
  }

  function accountsManager() { return `<section class="panel"><div class="panel-header"><h3>账户管理</h3><span>支持信用卡</span></div><div class="form-grid"><label class="field"><span>名称</span><input id="account-name" placeholder="例如 招商信用卡"></label>${selectField("类型", "account-type", Object.entries(ACCOUNT_TYPES), "debit")}${selectField("币种", "account-currency", CURRENCIES.map((c) => [c, c]), BASE_CURRENCY)}<label class="field"><span>初始余额/欠款</span><input id="account-initial" type="number" step="0.01" value="0"></label><label class="field"><span>账单日</span><input id="account-bill-day" type="number" min="1" max="31" placeholder="信用卡可填"></label><label class="field"><span>还款日</span><input id="account-due-day" type="number" min="1" max="31" placeholder="信用卡可填"></label><button class="btn primary full" data-action="add-account" type="button">新增账户</button></div><div class="list" style="margin-top:12px">${state.accounts.map(accountManageItem).join("")}</div></section>`; }
  function categoriesManager() { return `<section class="panel"><div class="panel-header"><h3>分类管理</h3><span>决定报表结构</span></div><div class="form-grid"><label class="field"><span>名称</span><input id="category-name" placeholder="例如 宠物"></label>${selectField("类型", "category-type", [["expense", "支出"], ["income", "收入"]], "expense")}<label class="field"><span>图标字</span><input id="category-icon" maxlength="2" placeholder="宠"></label><label class="field"><span>颜色</span><input id="category-color" type="color" value="#308df5"></label><button class="btn primary full" data-action="add-category" type="button">新增分类</button></div><div class="list" style="margin-top:12px">${state.categories.map(categoryManageItem).join("")}</div></section>`; }
  function plansManager() { return `<section class="panel"><div class="panel-header"><h3>提醒</h3><span>计划支出与还信用卡</span></div><div class="form-grid"><label class="field"><span>名称</span><input id="plan-name" placeholder="例如 房租 / 信用卡还款"></label><label class="field"><span>金额</span><input id="plan-amount" type="number" step="0.01" placeholder="0.00"></label><label class="field"><span>日期</span><input id="plan-date" type="date" value="${toDate(new Date())}"></label>${selectField("账户", "plan-account", state.accounts.map((a) => [a.id, a.name]), state.accounts[0]?.id || "")}${selectField("分类", "plan-category", state.categories.filter((c) => c.type === "expense").map((c) => [c.id, c.name]), expenseCategory()?.id || "")}${selectField("重复", "plan-repeat", Object.entries(PLAN_REPEATS), "none")}<label class="field full"><span>备注</span><input id="plan-note" placeholder="可写账单说明"></label><button class="btn primary full" data-action="add-plan" type="button">新增提醒</button></div><div class="list manager-list">${state.plans.slice().sort((a, b) => a.date.localeCompare(b.date)).map(planItem).join("") || empty("暂无提醒")}</div></section>`; }
  function quickManager() { return `<section class="panel"><div class="panel-header"><h3>快捷入口</h3><span>替代固定金额模板</span></div><div class="form-grid"><label class="field"><span>名称</span><input id="quick-name" placeholder="例如 通勤"></label>${selectField("类型", "quick-type", [["expense", "支出"], ["income", "收入"], ["transfer", "还款"]], "expense")}<label class="field"><span>默认金额</span><input id="quick-amount" type="number" step="0.01" placeholder="可留空"></label><label class="field"><span>备注</span><input id="quick-note" placeholder="可留空"></label><button class="btn primary full" data-action="add-quick" type="button">新增快捷入口</button></div><div class="list" style="margin-top:12px">${state.quickActions.map(quickManageItem).join("")}</div></section>`; }

  function bindStaticEvents() {
    app.querySelectorAll("[data-view]").forEach((button) => button.addEventListener("click", () => { view = button.dataset.view; if (view !== "me") settingsPanel = "home"; render(); }));
    document.getElementById("month")?.addEventListener("input", (e) => { selectedMonth = e.target.value || toMonth(new Date()); reportPeriod = "month"; customReportRange = monthRange(selectedMonth); render(); });
    document.getElementById("search")?.addEventListener("input", (e) => { search = e.target.value; clearTimeout(searchRenderTimer); searchRenderTimer = setTimeout(() => { render(); const input = document.getElementById("search"); input?.focus(); input?.setSelectionRange(search.length, search.length); }, 140); });
    document.getElementById("filter-type")?.addEventListener("input", (e) => { filters.type = e.target.value; render(); });
    document.getElementById("filter-category")?.addEventListener("input", (e) => { filters.category = e.target.value; render(); });
    document.getElementById("filter-account")?.addEventListener("input", (e) => { filters.account = e.target.value; render(); });
    app.querySelectorAll("[data-report-period]").forEach((button) => button.addEventListener("click", () => { reportPeriod = button.dataset.reportPeriod; render(); }));
    document.getElementById("report-start")?.addEventListener("change", (e) => { customReportRange.start = e.target.value; render(); });
    document.getElementById("report-end")?.addEventListener("change", (e) => { customReportRange.end = e.target.value; render(); });
    document.getElementById("import-json")?.addEventListener("change", importJson);
  }

  app.addEventListener("click", (event) => {
    const el = event.target.closest("[data-action],[data-choice],[data-account],[data-category],[data-quick],[data-credit-target]");
    if (!el) return;
    if (el.dataset.choice) setDraftType(el.dataset.choice);
    if (el.dataset.account) setDraftAccount(el.dataset.account);
    if (el.dataset.category) { draft.categoryId = el.dataset.category; render(); }
    if (el.dataset.creditTarget) { draft.targetAccountId = el.dataset.creditTarget; render(); }
    if (el.dataset.quick) applyQuick(el.dataset.quick);
    if (el.dataset.view && el.dataset.view !== "me") settingsPanel = "home";
    const action = el.dataset.action;
    if (!action) return;
    syncDraftFromInputs();
    const actions = { "save-transaction": saveTransaction, "reset-draft": resetDraft, "parse-note": parseDraftNote, "clear-filters": clearFilters, "open-setting": () => { settingsPanel = el.dataset.panel || "home"; render(); }, "open-category-manager": () => { view = "me"; settingsPanel = "categories"; render(); }, "open-quick-manager": () => { view = "me"; settingsPanel = "quick"; render(); }, "back-settings": () => { settingsPanel = "home"; render(); }, "edit-transaction": () => editTransaction(el.dataset.id), "delete-transaction": () => deleteItem("transactions", el.dataset.id), "delete-account": () => deleteItem("accounts", el.dataset.id), "delete-category": () => deleteItem("categories", el.dataset.id), "delete-plan": () => deleteItem("plans", el.dataset.id), "delete-quick": () => deleteItem("quickActions", el.dataset.id), "pay-plan": () => payPlan(el.dataset.id), "skip-plan": () => setPlanStatus(el.dataset.id, "skipped"), "reopen-plan": () => setPlanStatus(el.dataset.id, "pending"), "add-account": addAccount, "add-category": addCategory, "add-plan": addPlan, "add-quick": addQuick, "export-json": exportJson, "export-csv": exportCsv, "reset-all": resetAll };
    (actions[action] || noop)();
  });

  function syncDraftFromInputs() { const amount = document.getElementById("draft-amount"); const date = document.getElementById("draft-date"); const note = document.getElementById("draft-note"); if (amount) draft.amount = amount.value; if (date) draft.date = date.value; if (note) draft.note = note.value.trim(); }
  function setDraftType(type) { draft.type = type; if (type === "transfer") { draft.accountId = state.accounts.find((a) => a.type !== "credit")?.id || ""; draft.targetAccountId = matchingCreditAccount(draft.accountId)?.id || ""; draft.categoryId = ""; } else { draft.accountId = preferredAccount(type); draft.categoryId = state.categories.find((c) => c.type === type)?.id || ""; draft.targetAccountId = ""; } render(); }
  function setDraftAccount(accountId) { draft.accountId = accountId; if (draft.type === "transfer") { const target = accountById(draft.targetAccountId); const source = accountById(accountId); if (!target || target.currency !== source?.currency) draft.targetAccountId = matchingCreditAccount(accountId)?.id || ""; } render(); }
  function saveTransaction() { syncDraftFromInputs(); const amount = round(Number(draft.amount)); if (!amount || amount <= 0) return notify("金额必须大于 0。"); const source = accountById(draft.accountId); if (!source) return notify("请选择有效账户。"); if (draft.type === "transfer") { const target = accountById(draft.targetAccountId); if (!target || target.type !== "credit") return notify("请选择要还款的信用卡。"); if (source.type === "credit" || source.id === target.id) return notify("请选择非信用卡账户作为还款来源。"); if (source.currency !== target.currency) return notify("还款账户与信用卡必须使用相同币种。"); } const category = categoryById(draft.categoryId); if (draft.type !== "transfer" && !category) return notify("请选择分类。"); if (draft.type !== "transfer" && isOther(category) && !draft.note) return notify("选择“其他”分类时必须填写备注。"); const item = { id: editing || uid(), type: draft.type, date: validDate(draft.date) ? draft.date : toDate(new Date()), amount, accountId: source.id, targetAccountId: draft.type === "transfer" ? draft.targetAccountId : "", categoryId: draft.type === "transfer" ? "" : draft.categoryId, note: draft.note.slice(0, 80) }; upsert("transactions", item); localStorage.setItem(`${STORAGE_KEY}:last-account`, item.accountId); if (item.categoryId) localStorage.setItem(`${STORAGE_KEY}:last-category:${item.type}`, item.categoryId); if (item.note) localStorage.setItem(`${STORAGE_KEY}:last-note`, item.note); saveState(); editing = null; draft = newDraft("expense"); view = "ledger"; render(); notify("流水已保存。"); }
  function editTransaction(id) { const item = state.transactions.find((t) => t.id === id); if (!item) return; editing = id; draft = { type: item.type, amount: item.amount, date: item.date, accountId: item.accountId, targetAccountId: item.targetAccountId || "", categoryId: item.categoryId || "", note: item.note || "" }; view = "record"; render(); }
  function addAccount() { const name = safeText(value("account-name").trim(), 50); if (!name) return notify("账户名称不能为空。"); const type = ACCOUNT_TYPES[value("account-type")] ? value("account-type") : "debit"; const currency = CURRENCIES.includes(value("account-currency")) ? value("account-currency") : BASE_CURRENCY; state.accounts.push({ id: uid(), name, type, currency, initialBalance: round(Number(value("account-initial")) || 0), billDay: clampDay(value("account-bill-day")), dueDay: clampDay(value("account-due-day")), creditLimit: 0 }); saveState(); render(); notify("账户已新增。"); }
  function addCategory() { const name = safeText(value("category-name").trim(), 30); if (!name) return notify("分类名称不能为空。"); const color = /^#[0-9a-fA-F]{6}$/.test(value("category-color")) ? value("category-color") : "#308df5"; state.categories.push({ id: uid(), name, type: value("category-type") === "income" ? "income" : "expense", color, icon: safeText(value("category-icon").trim(), 2) || name.slice(0, 1) }); saveState(); render(); notify("分类已新增。"); }
  function addPlan() { const name = safeText(value("plan-name").trim(), 40); const amount = round(Number(value("plan-amount")) || 0); const account = accountById(value("plan-account")); const category = categoryById(value("plan-category")); if (!name || amount <= 0) return notify("请填写提醒名称和金额。"); if (!account || !category || category.type !== "expense") return notify("请选择有效的账户和支出分类。"); const repeat = PLAN_REPEATS[value("plan-repeat")] ? value("plan-repeat") : "none"; const date = validDate(value("plan-date")) ? value("plan-date") : toDate(new Date()); state.plans.push({ id: uid(), name, amount, currency: account.currency, accountId: account.id, categoryId: category.id, date, repeat, status: "pending", note: safeText(value("plan-note").trim(), 80) }); saveState(); render(); notify("提醒已新增。"); }
  function addQuick() { const name = safeText(value("quick-name").trim(), 16); if (!name) return notify("快捷入口名称不能为空。"); const type = ["expense", "income", "transfer"].includes(value("quick-type")) ? value("quick-type") : "expense"; const rawAmount = value("quick-amount"); const amount = rawAmount === "" ? "" : Math.max(0, round(rawAmount)); state.quickActions.push({ id: uid(), name, type, amount, categoryName: "其他", note: safeText(value("quick-note").trim(), 80) }); saveState(); render(); notify("快捷入口已新增。"); }
  function payPlan(id) { const plan = state.plans.find((p) => p.id === id); if (!plan) return; const account = accountById(plan.accountId); const category = categoryById(plan.categoryId); if (!account || !category || category.type !== "expense" || plan.amount <= 0) return notify("该提醒的账户或分类已失效，请编辑后再记账。"); state.transactions.push({ id: uid(), type: "expense", date: toDate(new Date()), amount: plan.amount, accountId: account.id, categoryId: category.id, targetAccountId: "", note: plan.note || plan.name }); plan.status = "paid"; saveState(); render(); notify("提醒已记为流水。"); }
  function setPlanStatus(id, status) { const plan = state.plans.find((item) => item.id === id); if (!plan || !PLAN_STATUSES[status]) return; plan.status = status; saveState(); render(); notify(status === "pending" ? "提醒已恢复。" : "提醒已跳过。"); }
  function applyQuick(id) { const quick = state.quickActions.find((q) => q.id === id); if (!quick) return; draft = newDraft(quick.type); draft.amount = quick.amount || ""; draft.note = quick.note || ""; const cat = state.categories.find((c) => c.type === quick.type && c.name === quick.categoryName); if (cat) draft.categoryId = cat.id; view = "record"; render(); }
  function parseDraftNote() { syncDraftFromInputs(); const text = draft.note; if (!text) return notify("先输入一句话，例如“今天午饭 28 支付宝”。"); const amount = text.match(/(\d+(?:\.\d{1,2})?)/); if (amount) draft.amount = amount[1]; const isIncome = /工资|收入|奖金|奖学金|兼职/.test(text); const isPay = /还.*信用卡|信用卡.*还款|还款/.test(text); if (isPay) draft.type = "transfer"; else if (isIncome) draft.type = "income"; state.accounts.forEach((account) => { if (text.includes(account.name)) draft.accountId = account.id; }); state.categories.forEach((category) => { if (text.includes(category.name)) { draft.type = category.type; draft.categoryId = category.id; } }); if (draft.type === "transfer") { const source = accountById(draft.accountId); if (!source || source.type === "credit") draft.accountId = state.accounts.find((a) => a.type !== "credit")?.id || ""; draft.categoryId = ""; draft.targetAccountId = matchingCreditAccount(draft.accountId)?.id || ""; } render(); notify("已按文本生成草稿，请确认后保存。"); }
  function clearFilters() { filters = { type: "all", category: "all", account: "all" }; search = ""; render(); }
  function resetDraft() { editing = null; draft = newDraft("expense"); render(); }
  function deleteItem(collection, id) { if (collection === "accounts" && state.transactions.some((t) => t.accountId === id || t.targetAccountId === id)) return notify("该账户已有流水，不能删除。"); if (collection === "accounts" && state.plans.some((p) => p.accountId === id)) return notify("该账户仍被提醒使用，不能删除。"); if (collection === "categories" && state.transactions.some((t) => t.categoryId === id)) return notify("该分类已有流水，不能删除。"); if (collection === "categories" && state.plans.some((p) => p.categoryId === id)) return notify("该分类仍被提醒使用，不能删除。"); if (collection === "accounts" && state.accounts.length <= 1) return notify("至少保留一个账户。"); if (collection === "categories") { const item = categoryById(id); if (item && state.categories.filter((c) => c.type === item.type).length <= 1) return notify(`至少保留一个${typeLabel(item.type)}分类。`); } if (!window.confirm("确认删除？")) return; state[collection] = state[collection].filter((item) => item.id !== id); saveState(); render(); notify("已删除。"); }

  function filteredTransactions() { const keyword = search.trim().toLowerCase(); return state.transactions.filter((t) => { if (!t.date.startsWith(selectedMonth)) return false; if (filters.type !== "all" && t.type !== filters.type) return false; if (filters.category !== "all" && t.categoryId !== filters.category) return false; if (filters.account !== "all" && t.accountId !== filters.account && t.targetAccountId !== filters.account) return false; if (!keyword) return true; const a = accountById(t.accountId); const target = accountById(t.targetAccountId); const c = categoryById(t.categoryId); return [t.note, a?.name, target?.name, c?.name].some((x) => String(x || "").toLowerCase().includes(keyword)); }).sort(byDateDesc); }
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
    transactionsBetween(range.start, range.end).forEach((t) => { if (t.type === "transfer" || accountById(t.accountId)?.currency !== BASE_CURRENCY) return; const bucket = lookup.get(byMonth ? t.date.slice(0, 7) : t.date); if (bucket) bucket[t.type] += t.amount; });
    return buckets;
  }
  function summarize(transactions) { return transactions.reduce((acc, t) => { if (t.type === "transfer") return acc; const currency = accountById(t.accountId)?.currency || BASE_CURRENCY; acc[currency] ||= { income: 0, expense: 0 }; acc[currency][t.type] += t.amount; return acc; }, {}); }
  function currencySummary(summaries) { const entries = Object.entries(summaries); if (entries.length <= 1 && (!entries.length || entries[0][0] === BASE_CURRENCY)) return ""; return `<section class="panel currency-summary"><div class="panel-header"><h3>多币种收支</h3><span>分别统计，不自动折算</span></div><div class="grid three">${entries.map(([currency, values]) => metric(currency, money(values.income - values.expense, currency), `收入 ${money(values.income, currency)} · 支出 ${money(values.expense, currency)}`)).join("")}</div></section>`; }
  function balances() { const result = {}; state.accounts.forEach((a) => result[a.id] = round(Number(a.initialBalance) || 0)); state.transactions.forEach((t) => { const account = accountById(t.accountId); if (!account) return; if (t.type === "transfer") { result[t.accountId] = round((result[t.accountId] || 0) - t.amount); if (t.targetAccountId) result[t.targetAccountId] = round((result[t.targetAccountId] || 0) - t.amount); return; } const delta = t.type === "income" ? t.amount : -t.amount; if (account.type === "credit") result[t.accountId] = round((result[t.accountId] || 0) - delta); else result[t.accountId] = round((result[t.accountId] || 0) + delta); }); return result; }
  function assetSnapshot() { const b = balances(); const assets = {}, debts = {}, net = {}; state.accounts.forEach((a) => { const cur = a.currency || BASE_CURRENCY; assets[cur] ||= 0; debts[cur] ||= 0; net[cur] ||= 0; const value = b[a.id] || 0; if (a.type === "credit") debts[cur] += Math.max(0, value); else assets[cur] += value; }); Object.keys(net).forEach((cur) => net[cur] = round((assets[cur] || 0) - (debts[cur] || 0))); return { assets, debts, net, balances: b }; }

  function loadState() { try { const raw = localStorage.getItem(STORAGE_KEY); return normalizeState(raw ? JSON.parse(raw) : {}); } catch (_error) { return normalizeState({}); } }
  function normalizeState(data) {
    const defaultAccounts = [{ id: uid(), name: "现金", type: "cash", currency: BASE_CURRENCY, initialBalance: 0 }, { id: uid(), name: "储蓄卡", type: "debit", currency: BASE_CURRENCY, initialBalance: 0 }, { id: uid(), name: "信用卡", type: "credit", currency: BASE_CURRENCY, initialBalance: 0, billDay: 1, dueDay: 20 }];
    const accounts = Array.isArray(data.accounts) && data.accounts.length ? data.accounts.slice(0, 500) : defaultAccounts;
    const categories = Array.isArray(data.categories) && data.categories.length ? data.categories.slice(0, 500) : DEFAULT_CATEGORIES.map(makeCategory);
    const normalized = {
      version: 3,
      accounts: accounts.map((a) => ({ id: safeText(a.id || uid(), 120), name: safeText(a.name || "未命名账户", 50), type: ACCOUNT_TYPES[a.type] ? a.type : inferAccountType(a.name), currency: CURRENCIES.includes(a.currency) ? a.currency : BASE_CURRENCY, initialBalance: round(a.initialBalance), billDay: clampDay(a.billDay), dueDay: clampDay(a.dueDay), creditLimit: Math.max(0, round(a.creditLimit)) })),
      categories: categories.map((c) => ({ id: safeText(c.id || uid(), 120), name: safeText(c.name || "未命名分类", 30), type: c.type === "income" ? "income" : "expense", color: /^#[0-9a-fA-F]{6}$/.test(c.color) ? c.color : "#308df5", icon: safeText(c.icon || c.name || "账", 2) })),
      budgets: Array.isArray(data.budgets) ? data.budgets.slice(0, 1000) : [],
      plans: Array.isArray(data.plans) ? data.plans.slice(0, 10000).map(normalizePlan) : [],
      quickActions: normalizeQuickActions(Array.isArray(data.quickActions) ? data.quickActions : data.templates),
      transactions: Array.isArray(data.transactions) ? data.transactions.slice(0, 100000).map(normalizeTransaction) : []
    };
    migrateBudgets(normalized, data);
    return normalized;
  }
  function migrateBudgets(data, original) { if (Array.isArray(original.plans) && original.plans.length) return; if (!Array.isArray(original.budgets)) return; original.budgets.slice(0, 1000).forEach((budget) => { const category = data.categories.find((c) => c.id === safeText(budget.categoryId, 120)); data.plans.push({ id: `plan-${safeText(budget.id || uid(), 120)}`, name: category?.name ? `${category.name}计划` : "计划支出", amount: Math.max(0, round(budget.amount)), currency: BASE_CURRENCY, accountId: data.accounts[0]?.id || "", categoryId: safeText(budget.categoryId, 120), date: /^\d{4}-\d{2}$/.test(String(budget.month)) ? `${budget.month}-01` : toDate(new Date()), repeat: "none", status: "pending", note: "由旧预算数据迁移" }); }); }
  function normalizeTransaction(t) { return { id: safeText(t.id || uid(), 120), type: t.type === "income" || t.type === "transfer" ? t.type : "expense", date: validDate(t.date) ? t.date : toDate(new Date()), amount: Math.max(0, round(t.amount)), accountId: safeText(t.accountId, 120), targetAccountId: safeText(t.targetAccountId, 120), categoryId: safeText(t.categoryId, 120), note: safeText(t.note, 80) }; }
  function normalizePlan(p) { return { id: safeText(p.id || uid(), 120), name: safeText(p.name || "提醒", 40), amount: Math.max(0, round(p.amount)), currency: CURRENCIES.includes(p.currency) ? p.currency : BASE_CURRENCY, accountId: safeText(p.accountId, 120), categoryId: safeText(p.categoryId, 120), date: validDate(p.date) ? p.date : toDate(new Date()), repeat: PLAN_REPEATS[p.repeat] ? p.repeat : "none", status: PLAN_STATUSES[p.status] ? p.status : "pending", note: safeText(p.note, 80) }; }
  function normalizeQuickActions(input) { const source = Array.isArray(input) ? input.slice(0, 200) : DEFAULT_QUICK_ACTIONS; return source.filter((q) => q && typeof q === "object" && !["早餐", "咖啡"].includes(q.name)).map((q) => ({ id: safeText(q.id || uid(), 120), name: safeText(q.name || "快捷", 16), type: q.type === "income" || q.type === "transfer" ? q.type : "expense", amount: q.amount === "" || q.amount == null ? "" : Math.max(0, round(q.amount)), categoryName: safeText(q.categoryName || "其他", 20), note: safeText(q.note, 80) })); }
  function saveState() { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
  function exportJson() { download(`e-account-backup-${stamp()}.json`, JSON.stringify(state, null, 2), "application/json;charset=utf-8"); }
  function exportCsv() { const header = ["日期", "类型", "分类", "账户", "目标账户", "币种", "金额", "备注"]; const lines = filteredTransactions().map((t) => [t.date, typeLabel(t.type), categoryById(t.categoryId)?.name || "", accountById(t.accountId)?.name || "", accountById(t.targetAccountId)?.name || "", accountById(t.accountId)?.currency || BASE_CURRENCY, t.amount, t.note || ""].map(csv).join(",")); download(`e-account-transactions-${stamp()}.csv`, `\ufeff${header.join(",")}\n${lines.join("\n")}`, "text/csv;charset=utf-8"); }
  function importJson(event) { const input = event.target; const file = input.files[0]; if (!file) return; if (file.size > 5 * 1024 * 1024) { input.value = ""; return notify("备份文件不能超过 5 MB。"); } const reader = new FileReader(); reader.onload = () => { try { const parsed = JSON.parse(String(reader.result)); const known = ["accounts", "categories", "transactions", "plans", "budgets", "quickActions", "templates"]; if (!parsed || Array.isArray(parsed) || typeof parsed !== "object" || !known.some((key) => Array.isArray(parsed[key]))) throw new Error("不是有效的 E-Account 备份。"); state = normalizeState(parsed); saveState(); render(); notify("备份已导入。"); } catch (error) { notify(`导入失败：${safeText(error.message, 120)}`); } finally { input.value = ""; } }; reader.onerror = () => { input.value = ""; notify("导入失败：无法读取备份文件。"); }; reader.readAsText(file); }
  function resetAll() { if (!window.confirm("确认恢复默认数据？当前浏览器里的账本会被清空。")) return; state = normalizeState({}); saveState(); render(); notify("已恢复默认数据。"); }

  function drawCharts() { if (view !== "reports") return; drawShare(); drawTrend(); drawWeek(); }
  function drawShare() { const canvas = document.getElementById("shareChart"); if (!canvas) return; const ctx = setupCanvas(canvas, 300); const range = reportWindow(); const items = categoryTotals(transactionsBetween(range.start, range.end)).slice(0, 6); const total = items.reduce((sum, item) => sum + item.amount, 0); if (!total) return drawEmpty(ctx, "当前区间暂无支出"); const colors = ["#308df5", "#22c7d8", "#8b7cf6", "#ef5f79", "#f59e42", "#35d3a6"]; let start = -Math.PI / 2; items.forEach((item, i) => { const angle = item.amount / total * Math.PI * 2; ctx.beginPath(); ctx.moveTo(120, 128); ctx.arc(120, 128, 84, start, start + angle); ctx.closePath(); ctx.fillStyle = colors[i % colors.length]; ctx.fill(); start += angle; }); ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(120, 128, 44, 0, Math.PI * 2); ctx.fill(); ctx.font = "13px sans-serif"; items.forEach((item, i) => { ctx.fillStyle = colors[i % colors.length]; ctx.fillRect(240, 60 + i * 28, 12, 12); ctx.fillStyle = "#102033"; ctx.fillText(`${item.name} ${Math.round(item.amount / total * 100)}%`, 260, 70 + i * 28); }); }
  function drawTrend() { const canvas = document.getElementById("trendChart"); if (!canvas) return; const ctx = setupCanvas(canvas, 300); drawLines(ctx, reportTrendData(), canvas.clientWidth || 600, 300); }
  function drawWeek() { const canvas = document.getElementById("weekChart"); if (!canvas) return; const ctx = setupCanvas(canvas, 260); const days = Array.from({ length: 7 }, (_, i) => ({ date: toDate(addDays(new Date(), i - 6)), amount: 0 })); state.transactions.forEach((t) => { if (t.type !== "expense" || accountById(t.accountId)?.currency !== BASE_CURRENCY) return; const day = days.find((d) => d.date === t.date); if (day) day.amount += t.amount; }); const width = canvas.clientWidth || 420; const max = Math.max(100, ...days.map((d) => d.amount)); days.forEach((d, i) => { const x = 28 + i * ((width - 64) / 7); const h = d.amount / max * 150; ctx.fillStyle = "#76c7ff"; ctx.beginPath(); ctx.roundRect(x, 190 - h, 24, Math.max(3, h), 8); ctx.fill(); ctx.fillStyle = "#65758b"; ctx.font = "12px sans-serif"; ctx.fillText(d.date.slice(5).replace("-", "/"), x - 4, 222); }); }
  function setupCanvas(canvas, height) { const ratio = window.devicePixelRatio || 1; const width = canvas.clientWidth || Number(canvas.width) || 420; canvas.width = Math.floor(width * ratio); canvas.height = Math.floor(height * ratio); const ctx = canvas.getContext("2d"); ctx.scale(ratio, ratio); ctx.clearRect(0, 0, width, height); return ctx; }
  function drawLines(ctx, daily, width, height) { const pad = { l: 42, r: 18, t: 22, b: 34 }; const max = Math.max(100, ...daily.flatMap((d) => [d.income, d.expense])); ctx.strokeStyle = "#d8e8f4"; ctx.lineWidth = 1; for (let i = 0; i < 4; i++) { const y = pad.t + i * ((height - pad.t - pad.b) / 3); ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(width - pad.r, y); ctx.stroke(); } drawLine("income", "#1aa979"); drawLine("expense", "#ef5f79"); function drawLine(key, color) { ctx.strokeStyle = color; ctx.lineWidth = 3; ctx.beginPath(); daily.forEach((d, i) => { const x = pad.l + (i / Math.max(1, daily.length - 1)) * (width - pad.l - pad.r); const y = height - pad.b - (d[key] / max) * (height - pad.t - pad.b); if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); }); ctx.stroke(); } }
  function drawEmpty(ctx, text) { ctx.fillStyle = "#65758b"; ctx.font = "14px sans-serif"; ctx.fillText(text, 18, 38); }

  function transactionsTable(items) { return `<table><thead><tr><th>日期</th><th>类型</th><th>分类/备注</th><th>账户</th><th class="num">金额</th><th></th></tr></thead><tbody>${items.map((t) => `<tr><td>${t.date}</td><td>${typePill(t.type)}</td><td>${escapeHtml(categoryById(t.categoryId)?.name || transferLabel(t))}<br><small>${escapeHtml(t.note || "")}</small></td><td>${escapeHtml(accountLine(t))}</td><td class="num ${amountClass(t)}">${signedAmount(t)}</td><td><div class="actions"><button class="mini" data-action="edit-transaction" data-id="${escapeAttr(t.id)}">编辑</button><button class="mini" data-action="delete-transaction" data-id="${escapeAttr(t.id)}">删除</button></div></td></tr>`).join("") || `<tr><td colspan="6">${empty("没有流水")}</td></tr>`}</tbody></table>`; }
  function transactionCard(t) { return `<article class="item"><div><strong>${escapeHtml(categoryById(t.categoryId)?.name || transferLabel(t))}</strong><small>${t.date} · ${escapeHtml(accountLine(t))} ${t.note ? "· " + escapeHtml(t.note) : ""}</small></div><div class="${amountClass(t)}">${signedAmount(t)}</div></article>`; }
  function simpleTransaction(t) { return `<div class="item"><div><strong>${escapeHtml(categoryById(t.categoryId)?.name || transferLabel(t))}</strong><small>${t.date} · ${escapeHtml(accountById(t.accountId)?.name || "未知账户")}</small></div><span class="${amountClass(t)}">${signedAmount(t)}</span></div>`; }
  function accountChoice(a) { return `<button class="choice ${draft.accountId === a.id ? "active" : ""}" data-account="${escapeAttr(a.id)}" type="button"><i>${svg(accountIcon(a))}</i><span>${escapeHtml(a.name)}</span><small>${ACCOUNT_TYPES[a.type]} · ${a.currency}</small></button>`; }
  function categoryChoice(c) { return `<button class="choice ${draft.categoryId === c.id ? "active" : ""}" data-category="${escapeAttr(c.id)}" type="button"><i style="background:${hexBg(c.color)};color:${c.color}">${svg(categoryIcon(c))}</i><span>${escapeHtml(c.name)}</span><small>${c.type === "income" ? "收入" : "支出"}分类</small></button>`; }
  function creditTargetBlock() { const source = accountById(draft.accountId); const credits = state.accounts.filter((a) => a.type === "credit" && (!source || a.currency === source.currency)); const message = source ? `仅显示 ${source.currency} 信用卡` : "还款不进入消费报表"; return `<div><div class="panel-header"><h3>还到哪张信用卡</h3><span>${message}</span></div><div class="icon-grid">${credits.map((a) => `<button class="choice ${draft.targetAccountId === a.id ? "active" : ""}" data-credit-target="${escapeAttr(a.id)}" type="button"><i>${svg("i-credit-card")}</i><span>${escapeHtml(a.name)}</span><small>${a.currency}</small></button>`).join("") || empty("没有相同币种的信用卡账户")}</div></div>`; }
  function accountIcon(account) { return ({ cash: "i-banknote", debit: "i-card", credit: "i-credit-card", wallet: "i-wallet", other: "i-grid" })[account.type] || "i-wallet"; }
  function categoryIcon(category) { const names = { 餐饮: "i-utensils", 交通: "i-train", 购物: "i-bag", 学习: "i-book-open", 医疗: "i-heart-pulse", 住房: "i-house", 娱乐: "i-sparkles", 工资: "i-arrow-up", 奖学金: "i-arrow-up", 兼职: "i-arrow-up", 理财: "i-arrow-up", 其他: "i-grid" }; return names[category.name] || (category.type === "income" ? "i-arrow-up" : "i-grid"); }
  function quickActionButton(q) { return `<button class="item" data-quick="${escapeAttr(q.id)}" type="button"><div><strong>${escapeHtml(q.name)}</strong><small>${typeLabel(q.type)}${q.amount ? ` · ${money(q.amount)}` : ""}</small></div><span>填入</span></button>`; }
  function accountAssetItem(a) { const b = balances()[a.id] || 0; const isCredit = a.type === "credit"; return `<div class="item"><div><strong>${escapeHtml(a.name)}</strong><small>${ACCOUNT_TYPES[a.type]} · ${a.currency}${isCredit && a.dueDay ? ` · 还款日 ${a.dueDay} 日` : ""}</small></div><span class="${isCredit ? "debt" : ""}">${isCredit ? "应还 " : ""}${money(Math.max(0, b), a.currency)}</span></div>`; }
  function creditReminderItems() { const b = balances(); const items = state.accounts.filter((a) => a.type === "credit"); return items.map((a) => `<div class="item"><div><strong>${escapeHtml(a.name)}</strong><small>账单日 ${a.billDay || "-"} · 还款日 ${a.dueDay || "-"}</small></div><span class="debt">${money(Math.max(0, b[a.id] || 0), a.currency)}</span></div>`).join("") || empty("暂无信用卡账户"); }
  function accountManageItem(a) { return `<div class="item"><div><strong>${escapeHtml(a.name)}</strong><small>${ACCOUNT_TYPES[a.type]} · ${a.currency}</small></div><button class="mini" data-action="delete-account" data-id="${escapeAttr(a.id)}">删除</button></div>`; }
  function categoryManageItem(c) { return `<div class="item"><div><strong>${escapeHtml(c.icon || "")} ${escapeHtml(c.name)}</strong><small>${typeLabel(c.type)} · 用于报表占比</small></div><button class="mini" data-action="delete-category" data-id="${escapeAttr(c.id)}">删除</button></div>`; }
  function planItem(p) { const id = escapeAttr(p.id); return `<div class="item"><div><strong>${escapeHtml(p.name)}</strong><small>${p.date} · ${PLAN_REPEATS[p.repeat] || "不重复"} · ${PLAN_STATUSES[p.status] || "待处理"}</small></div><div class="actions"><span>${money(p.amount, p.currency)}</span>${p.status === "pending" ? `<button class="mini primary-mini" data-action="pay-plan" data-id="${id}">记为流水</button><button class="mini" data-action="skip-plan" data-id="${id}">跳过</button>` : `<button class="mini" data-action="reopen-plan" data-id="${id}">恢复</button>`}<button class="mini" data-action="delete-plan" data-id="${id}">删除</button></div></div>`; }
  function quickManageItem(q) { return `<div class="item"><div><strong>${escapeHtml(q.name)}</strong><small>${typeLabel(q.type)}${q.amount ? ` · ${money(q.amount)}` : ""}</small></div><button class="mini" data-action="delete-quick" data-id="${escapeAttr(q.id)}">删除</button></div>`; }
  function categoryRank(transactions) { const items = categoryTotals(transactions); const max = Math.max(1, ...items.map((i) => i.amount)); return items.map((i) => `<div class="item"><div><strong>${escapeHtml(i.name)}</strong><small>${Math.round(i.amount / max * 100)}% 相对最高项</small></div><span>${money(i.amount, i.currency)}</span></div>`).join("") || empty("当前区间暂无支出"); }
  function categoryTotals(transactions) { const totals = {}; transactions.forEach((t) => { if (t.type !== "expense") return; const a = accountById(t.accountId); if (a?.currency !== BASE_CURRENCY) return; const c = categoryById(t.categoryId); const key = c?.id || "unknown"; totals[key] ||= { name: c?.name || "未分类", amount: 0, currency: BASE_CURRENCY }; totals[key].amount += t.amount; }); return Object.values(totals).sort((a, b) => b.amount - a.amount); }
  function metric(label, value, hint) { return `<article class="metric"><span>${label}</span><strong>${escapeHtml(value)}</strong><small>${escapeHtml(hint)}</small></article>`; }
  function compareMetric(label, current, prev, positiveGood) { const diff = round(current - prev); const good = diff === 0 || ((diff > 0) === positiveGood); return metric(label, money(current), `${diff >= 0 ? "+" : ""}${money(diff)} · ${good ? "趋势正常" : "需要关注"}`); }
  function chartPanel(title, subtitle, id) { return `<section class="panel"><div class="panel-header"><h3>${title}</h3><span>${subtitle}</span></div><div class="canvas-wrap"><canvas id="${id}" width="620" height="300"></canvas></div></section>`; }
  function selectField(label, id, options, selected) { return `<label class="field"><span>${label}</span><select id="${id}">${options.map(([v, text]) => `<option value="${escapeAttr(v)}" ${String(v) === String(selected) ? "selected" : ""}>${escapeHtml(text)}</option>`).join("")}</select></label>`; }
  function choice(label, type, active, icon, hint) { return `<button class="choice ${active ? "active" : ""}" data-choice="${type}" type="button"><i>${String(icon).startsWith("i-") ? svg(icon) : icon}</i><span>${label}</span><small>${hint}</small></button>`; }
  function typePill(type) { return `<span class="pill ${type}">${typeLabel(type)}</span>`; }
  function typeLabel(type) { return { income: "收入", expense: "支出", transfer: "还款" }[type] || "支出"; }
  function accountLine(t) { const a = accountById(t.accountId)?.name || "未知账户"; const b = accountById(t.targetAccountId)?.name; return b ? `${a} → ${b}` : a; }
  function transferLabel(t) { return t.type === "transfer" ? "信用卡还款" : "未分类"; }
  function amountClass(t) { if (t.type === "income") return "income"; if (t.type === "transfer") return "debt"; return "expense"; }
  function signedAmount(t) { const cur = accountById(t.accountId)?.currency || BASE_CURRENCY; const sign = t.type === "income" ? "+" : t.type === "expense" ? "-" : ""; return `${sign}${money(t.amount, cur)}`; }
  function newDraft(type) { const accountId = preferredAccount(type); return { type, amount: "", date: toDate(new Date()), accountId, targetAccountId: type === "transfer" ? matchingCreditAccount(accountId)?.id || "" : "", categoryId: type === "transfer" ? "" : state?.categories?.find((c) => c.type === type)?.id || "", note: (localStorage.getItem(`${STORAGE_KEY}:last-note`) || "").slice(0, 80) }; }
  function preferredAccount(type) { const stored = localStorage.getItem(`${STORAGE_KEY}:last-account`); if (state?.accounts?.some((a) => a.id === stored && (type !== "transfer" || a.type !== "credit"))) return stored; return state?.accounts?.find((a) => type !== "transfer" || a.type !== "credit")?.id || ""; }
  function matchingCreditAccount(sourceId) { const source = accountById(sourceId); return state?.accounts?.find((a) => a.type === "credit" && (!source || a.currency === source.currency)); }
  function upsert(collection, item) { const index = state[collection].findIndex((x) => x.id === item.id); if (index >= 0) state[collection][index] = item; else state[collection].push(item); }
  function accountById(id) { return state.accounts.find((a) => a.id === id); }
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
