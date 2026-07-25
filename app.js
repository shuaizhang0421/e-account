(function () {
  "use strict";

  const STORAGE_KEY = "local-ledger-v1";
  const BASE_CURRENCY = "CNY";
  const CURRENCIES = ["CNY", "USD", "EUR", "JPY", "HKD", "GBP", "AUD", "CAD", "SGD"];
  const ACCOUNT_TYPES = {
    cash: "现金",
    debit: "储蓄卡",
    credit: "信用卡",
    wallet: "电子钱包",
    other: "其他账户"
  };
  const PLAN_REPEATS = {
    none: "不重复",
    monthly: "每月",
    quarterly: "每季度",
    yearly: "每年"
  };
  const PLAN_STATUSES = {
    pending: "待处理",
    paid: "已支付",
    skipped: "已跳过"
  };
  const DEFAULT_TEMPLATES = [
    { id: "tpl-breakfast", name: "早餐", type: "expense", amount: 12, categoryName: "餐饮", note: "早餐" },
    { id: "tpl-coffee", name: "咖啡", type: "expense", amount: 18, categoryName: "餐饮", note: "咖啡" },
    { id: "tpl-traffic", name: "交通", type: "expense", amount: 5, categoryName: "交通", note: "通勤" },
    { id: "tpl-study", name: "学习", type: "expense", amount: 30, categoryName: "学习", note: "资料/课程" },
    { id: "tpl-subscription", name: "会员续费", type: "expense", amount: 28, categoryName: "其他", note: "订阅续费" }
  ];

  const defaultData = {
    version: 1,
    accounts: [
      { id: uid(), name: "现金", type: "cash", currency: "CNY", initialBalance: 0 },
      { id: uid(), name: "储蓄卡", type: "debit", currency: "CNY", initialBalance: 0 },
      { id: uid(), name: "信用卡", type: "credit", currency: "CNY", initialBalance: 0 }
    ],
    categories: [
      { id: uid(), name: "餐饮", type: "expense", color: "#f97373" },
      { id: uid(), name: "交通", type: "expense", color: "#f59e0b" },
      { id: uid(), name: "购物", type: "expense", color: "#a78bfa" },
      { id: uid(), name: "学习", type: "expense", color: "#38bdf8" },
      { id: uid(), name: "医疗", type: "expense", color: "#fb7185" },
      { id: uid(), name: "住房", type: "expense", color: "#2dd4bf" },
      { id: uid(), name: "其他", type: "expense", color: "#94a3b8" },
      { id: uid(), name: "工资", type: "income", color: "#34d399" },
      { id: uid(), name: "奖学金", type: "income", color: "#22d3ee" },
      { id: uid(), name: "兼职", type: "income", color: "#a3e635" },
      { id: uid(), name: "其他", type: "income", color: "#c084fc" }
    ],
    budgets: [],
    plans: [],
    templates: DEFAULT_TEMPLATES.map((template) => ({ ...template })),
    transactions: []
  };

  let state = loadState();
  let currentView = "dashboard";

  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => Array.from(document.querySelectorAll(selector));

  const els = {
    notice: $("#notice"),
    monthPicker: $("#monthPicker"),
    globalSearch: $("#globalSearch"),
    quickAddBtn: $("#quickAddBtn"),
    summaryMetrics: $("#summaryMetrics"),
    categoryRank: $("#categoryRank"),
    accountBalances: $("#accountBalances"),
    upcomingPlans: $("#upcomingPlans"),
    recentTransactions: $("#recentTransactions"),
    categoryShareChart: $("#categoryShareChart"),
    weekChart: $("#weekChart"),
    monthCompare: $("#monthCompare"),
    trendChart: $("#trendChart"),
    transactionForm: $("#transactionForm"),
    transactionId: $("#transactionId"),
    transactionType: $("#transactionType"),
    typeExpense: $("#typeExpense"),
    typeIncome: $("#typeIncome"),
    transactionDate: $("#transactionDate"),
    transactionAmount: $("#transactionAmount"),
    transactionAccount: $("#transactionAccount"),
    transactionCategory: $("#transactionCategory"),
    transactionNote: $("#transactionNote"),
    noteSuggestions: $("#noteSuggestions"),
    templateChips: $("#templateChips"),
    transactionRows: $("#transactionRows"),
    transactionCards: $("#transactionCards"),
    filterStart: $("#filterStart"),
    filterEnd: $("#filterEnd"),
    filterType: $("#filterType"),
    filterCategory: $("#filterCategory"),
    filterAccount: $("#filterAccount"),
    clearFiltersBtn: $("#clearFiltersBtn"),
    accountForm: $("#accountForm"),
    accountId: $("#accountId"),
    accountName: $("#accountName"),
    accountType: $("#accountType"),
    accountCurrency: $("#accountCurrency"),
    accountInitial: $("#accountInitial"),
    accountRows: $("#accountRows"),
    categoryForm: $("#categoryForm"),
    categoryId: $("#categoryId"),
    categoryName: $("#categoryName"),
    categoryType: $("#categoryType"),
    categoryColor: $("#categoryColor"),
    categoryRows: $("#categoryRows"),
    planForm: $("#planForm"),
    planId: $("#planId"),
    planName: $("#planName"),
    planAmount: $("#planAmount"),
    planCurrency: $("#planCurrency"),
    planAccount: $("#planAccount"),
    planCategory: $("#planCategory"),
    planDate: $("#planDate"),
    planRepeat: $("#planRepeat"),
    planStatus: $("#planStatus"),
    planNote: $("#planNote"),
    planRows: $("#planRows"),
    exportJsonBtn: $("#exportJsonBtn"),
    exportCsvBtn: $("#exportCsvBtn"),
    importJsonInput: $("#importJsonInput"),
    resetAllBtn: $("#resetAllBtn")
  };

  init();

  function init() {
    const today = new Date();
    const month = toMonth(today);
    els.monthPicker.value = month;
    els.transactionDate.value = toDate(today);
    els.planDate.value = toDate(today);

    bindEvents();
    populateStaticSelects();
    refreshAll();
  }

  function bindEvents() {
    $$(".nav-item").forEach((button) => {
      button.addEventListener("click", () => setView(button.dataset.view));
    });

    els.quickAddBtn.addEventListener("click", () => {
      setView("transactions");
      els.transactionAmount.focus();
    });

    [
      els.monthPicker,
      els.globalSearch,
      els.filterStart,
      els.filterEnd,
      els.filterType,
      els.filterCategory,
      els.filterAccount,
      els.transactionType
    ].forEach((input) => input.addEventListener("input", refreshAll));

    $$("input[name='transactionTypeChoice']").forEach((input) => {
      input.addEventListener("change", () => {
        els.transactionType.value = input.value;
        refreshAll();
      });
    });

    els.transactionForm.addEventListener("submit", saveTransaction);
    $("#resetTransactionBtn").addEventListener("click", resetTransactionForm);
    els.clearFiltersBtn.addEventListener("click", clearFilters);
    els.templateChips.addEventListener("click", (event) => {
      const button = event.target.closest("[data-template-id]");
      if (button) applyTemplate(button.dataset.templateId);
    });

    els.accountForm.addEventListener("submit", saveAccount);
    $("#resetAccountBtn").addEventListener("click", resetAccountForm);

    els.categoryForm.addEventListener("submit", saveCategory);
    $("#resetCategoryBtn").addEventListener("click", resetCategoryForm);

    els.planForm.addEventListener("submit", savePlan);
    $("#resetPlanBtn").addEventListener("click", resetPlanForm);

    els.exportJsonBtn.addEventListener("click", exportJson);
    els.exportCsvBtn.addEventListener("click", exportCsv);
    els.importJsonInput.addEventListener("change", importJson);
    els.resetAllBtn.addEventListener("click", resetAllData);

    window.addEventListener("resize", drawTrendChart);
  }

  function setView(view) {
    currentView = view;
    $$(".nav-item").forEach((button) => button.classList.toggle("active", button.dataset.view === view));
    $$(".view").forEach((section) => section.classList.toggle("active", section.id === `view-${view}`));
    refreshAll();
  }

  function refreshAll() {
    populateDynamicSelects();
    renderDashboard();
    renderTransactions();
    renderAccounts();
    renderCategories();
    renderPlans();
    renderTemplates();
    renderNoteSuggestions();
  }

  function populateStaticSelects() {
    els.accountCurrency.innerHTML = CURRENCIES.map((currency) => `<option value="${currency}">${currency}</option>`).join("");
  }

  function populateDynamicSelects() {
    const selectedTransactionAccount = els.transactionAccount.value;
    const selectedTransactionCategory = els.transactionCategory.value;
    const selectedPlanAccount = els.planAccount.value;
    const selectedPlanCategory = els.planCategory.value;
    const selectedPlanCurrency = els.planCurrency.value || BASE_CURRENCY;
    const accountsOptions = state.accounts.map((account) => {
      return `<option value="${escapeHtml(account.id)}">${escapeHtml(account.name)} · ${accountTypeLabel(account.type)} · ${account.currency}</option>`;
    }).join("");
    const expenseCategories = state.categories.filter((category) => category.type === "expense");
    const visibleCategories = state.categories.filter((category) => category.type === els.transactionType.value);

    els.transactionAccount.innerHTML = accountsOptions;
    els.transactionCategory.innerHTML = visibleCategories.map(optionCategory).join("");
    els.filterAccount.innerHTML = `<option value="all">全部账户</option>${accountsOptions}`;
    els.filterCategory.innerHTML = `<option value="all">全部分类</option>${state.categories.map(optionCategory).join("")}`;
    els.planAccount.innerHTML = accountsOptions;
    els.planCategory.innerHTML = expenseCategories.map(optionCategory).join("");
    els.planCurrency.innerHTML = CURRENCIES.map((currency) => `<option value="${currency}">${currency}</option>`).join("");
    els.transactionAccount.value = selectedTransactionAccount;
    els.transactionCategory.value = selectedTransactionCategory;
    els.planAccount.value = selectedPlanAccount;
    els.planCategory.value = selectedPlanCategory;
    els.planCurrency.value = selectedPlanCurrency;

    if (!state.accounts.some((account) => account.id === els.transactionAccount.value)) {
      els.transactionAccount.value = getPreferredAccountId();
    }
    if (!visibleCategories.some((category) => category.id === els.transactionCategory.value)) {
      els.transactionCategory.value = visibleCategories[0]?.id || "";
    }
    if (!state.accounts.some((account) => account.id === els.planAccount.value)) {
      els.planAccount.value = state.accounts[0]?.id || "";
    }
    if (!expenseCategories.some((category) => category.id === els.planCategory.value)) {
      els.planCategory.value = expenseCategories[0]?.id || "";
    }
  }

  function optionCategory(category) {
    return `<option value="${escapeHtml(category.id)}">${escapeHtml(category.name)}</option>`;
  }

  function renderDashboard() {
    const month = els.monthPicker.value;
    $("#dashboardSubtitle").textContent = `${month} 的收支、计划和近期流水`;
    const monthTransactions = getTransactionsForMonth(month);
    const byCurrency = summarizeByCurrency(monthTransactions);

    const cnyIncome = byCurrency.CNY?.income || 0;
    const cnyExpense = byCurrency.CNY?.expense || 0;
    const cnyBalance = cnyIncome - cnyExpense;
    const today = new Date();
    const averageDays = month === toMonth(today) ? today.getDate() : daysInMonth(month);
    const dailyAverage = cnyExpense / Math.max(1, averageDays);
    const biggestExpense = monthTransactions
      .filter((transaction) => transaction.type === "expense" && getAccount(transaction.accountId)?.currency === BASE_CURRENCY)
      .sort((a, b) => b.amount - a.amount)[0];
    const biggestHint = biggestExpense
      ? `最大单笔：${formatMoney(biggestExpense.amount, BASE_CURRENCY)}`
      : "暂无人民币支出";

    els.summaryMetrics.innerHTML = [
      metric("本月收入 CNY", formatMoney(cnyIncome, "CNY"), "仅统计人民币账户"),
      metric("本月支出 CNY", formatMoney(cnyExpense, "CNY"), biggestHint),
      metric("本月结余 CNY", formatMoney(cnyBalance, "CNY"), cnyBalance >= 0 ? "收支为正" : "支出高于收入"),
      metric("本月日均支出", formatMoney(dailyAverage, "CNY"), month === toMonth(today) ? "按今天日期估算" : "按整月天数计算")
    ].join("");

    renderCategoryRank(monthTransactions);
    renderAccountBalances();
    renderUpcomingPlans();
    renderRecentTransactions();
    renderMonthCompare(month);
    drawTrendChart();
    drawCategoryShareChart(monthTransactions);
    drawWeekChart();
  }

  function metric(label, value, hint) {
    return `<article class="metric"><span>${label}</span><strong>${escapeHtml(value)}</strong><small>${escapeHtml(hint)}</small></article>`;
  }

  function renderCategoryRank(transactions) {
    const expenses = transactions.filter((transaction) => transaction.type === "expense");
    const totals = {};
    expenses.forEach((transaction) => {
      const account = getAccount(transaction.accountId);
      const category = getCategory(transaction.categoryId);
      const key = `${transaction.categoryId}:${account?.currency || ""}`;
      if (!totals[key]) {
        totals[key] = { categoryName: category?.name || "未分类", currency: account?.currency || "", amount: 0 };
      }
      totals[key].amount += transaction.amount;
    });

    const items = Object.values(totals).sort((a, b) => b.amount - a.amount).slice(0, 8);
    const max = Math.max(...items.map((item) => item.amount), 1);
    els.categoryRank.innerHTML = items.length ? items.map((item) => `
      <div class="rank-item">
        <div class="row-between"><strong>${escapeHtml(item.categoryName)}</strong><span>${formatMoney(item.amount, item.currency)}</span></div>
        <div class="bar"><span style="width:${Math.min(100, item.amount / max * 100)}%"></span></div>
      </div>
    `).join("") : `<div class="empty-state">当前月份暂无支出。</div>`;
  }

  function renderAccountBalances() {
    const balances = calculateAccountBalances();
    els.accountBalances.innerHTML = state.accounts.length ? state.accounts.map((account) => `
      <div class="account-item">
        <div class="row-between"><strong>${escapeHtml(account.name)}</strong><span>${formatMoney(balances[account.id] || 0, account.currency)}</span></div>
        <small>${accountTypeLabel(account.type)} · ${account.currency}</small>
        <div class="bar"><span style="width:100%"></span></div>
      </div>
    `).join("") : `<div class="empty-state">还没有账户。</div>`;
  }

  function renderUpcomingPlans() {
    const today = startOfDay(new Date());
    const limit = addDays(today, 30);
    const plans = state.plans
      .filter((plan) => plan.status === "pending" && parseLocalDate(plan.date) >= today && parseLocalDate(plan.date) <= limit)
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(0, 6);

    els.upcomingPlans.innerHTML = plans.length ? plans.map((plan) => {
      const account = getAccount(plan.accountId);
      return `
        <div class="plan-item">
          <div class="row-between">
            <strong>${escapeHtml(plan.name)}</strong>
            <span>${formatMoney(plan.amount, plan.currency || account?.currency || BASE_CURRENCY)}</span>
          </div>
          <small>${plan.date} · ${escapeHtml(getCategory(plan.categoryId)?.name || "未分类")} · ${repeatLabel(plan.repeat)}</small>
        </div>
      `;
    }).join("") : `<div class="empty-state">未来 30 天暂无待处理计划。</div>`;
  }

  function renderMonthCompare(month) {
    const prev = previousMonth(month);
    const current = summarizeByCurrency(getTransactionsForMonth(month)).CNY || { income: 0, expense: 0 };
    const last = summarizeByCurrency(getTransactionsForMonth(prev)).CNY || { income: 0, expense: 0 };
    const rows = [
      { label: "收入", current: current.income, prev: last.income, positiveGood: true },
      { label: "支出", current: current.expense, prev: last.expense, positiveGood: false },
      { label: "结余", current: current.income - current.expense, prev: last.income - last.expense, positiveGood: true }
    ];
    els.monthCompare.innerHTML = rows.map((row) => {
      const diff = row.current - row.prev;
      const cls = diff === 0 ? "" : (diff > 0 === row.positiveGood ? "income-text" : "expense-text");
      return `<div class="compare-item"><span>${row.label}</span><strong>${formatMoney(row.current, BASE_CURRENCY)}</strong><small class="${cls}">${diff >= 0 ? "+" : ""}${formatMoney(diff, BASE_CURRENCY)}</small></div>`;
    }).join("");
  }

  function renderRecentTransactions() {
    const items = state.transactions
      .slice()
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 5);
    els.recentTransactions.innerHTML = items.length ? items.map((transaction) => {
      const account = getAccount(transaction.accountId);
      const category = getCategory(transaction.categoryId);
      const signed = transaction.type === "income" ? "+" : "-";
      const amountClass = transaction.type === "income" ? "income-text" : "expense-text";
      return `
        <div class="recent-item">
          <div>
            <strong>${escapeHtml(category?.name || "未分类")}</strong>
            <small>${transaction.date} · ${escapeHtml(account?.name || "未知账户")}</small>
          </div>
          <span class="${amountClass}">${signed}${formatMoney(transaction.amount, account?.currency || BASE_CURRENCY)}</span>
        </div>
      `;
    }).join("") : `<div class="empty-state">还没有流水。</div>`;
  }

  function renderTransactions() {
    const filtered = getFilteredTransactions();
    const rows = filtered.map((transaction) => {
      const account = getAccount(transaction.accountId);
      const category = getCategory(transaction.categoryId);
      const amountClass = transaction.type === "income" ? "income-text" : "expense-text";
      const signed = transaction.type === "income" ? "+" : "-";
      return `
        <tr>
          <td>${transaction.date}</td>
          <td>${typePill(transaction.type)}</td>
          <td>${escapeHtml(category?.name || "未分类")}</td>
          <td>${escapeHtml(account?.name || "未知账户")}<br><small>${accountTypeLabel(account?.type)} · ${account?.currency || BASE_CURRENCY}</small></td>
          <td class="num ${amountClass}">${signed}${formatMoney(transaction.amount, account?.currency || BASE_CURRENCY)}</td>
          <td>${escapeHtml(transaction.note || "")}</td>
          <td>${rowActions("transaction", transaction.id)}</td>
        </tr>
      `;
    }).join("");
    els.transactionRows.innerHTML = rows || emptyRow(7, "没有符合条件的流水。");
    els.transactionCards.innerHTML = filtered.length ? filtered.map(transactionCard).join("") : `<div class="empty-state">没有符合条件的流水。</div>`;
  }

  function transactionCard(transaction) {
    const account = getAccount(transaction.accountId);
    const category = getCategory(transaction.categoryId);
    const signed = transaction.type === "income" ? "+" : "-";
    const amountClass = transaction.type === "income" ? "income-text" : "expense-text";
    return `
      <article class="transaction-card">
        <div>
          <strong>${escapeHtml(category?.name || "未分类")}</strong>
          <small>${transaction.date} · ${escapeHtml(account?.name || "未知账户")}</small>
          ${transaction.note ? `<small>${escapeHtml(transaction.note)}</small>` : ""}
        </div>
        <div class="transaction-card-side">
          <span class="${amountClass}">${signed}${formatMoney(transaction.amount, account?.currency || BASE_CURRENCY)}</span>
          ${rowActions("transaction", transaction.id)}
        </div>
      </article>
    `;
  }

  function renderAccounts() {
    const balances = calculateAccountBalances();
    els.accountRows.innerHTML = state.accounts.map((account) => `
      <tr>
        <td>${escapeHtml(account.name)}</td>
        <td>${accountTypePill(account.type)}</td>
        <td>${account.currency}</td>
        <td class="num">${formatMoney(account.initialBalance, account.currency)}</td>
        <td class="num">${formatMoney(balances[account.id] || 0, account.currency)}</td>
        <td>${rowActions("account", account.id)}</td>
      </tr>
    `).join("") || emptyRow(6, "还没有账户。");
  }

  function renderCategories() {
    els.categoryRows.innerHTML = state.categories.map((category) => `
      <tr>
        <td>${escapeHtml(category.name)}</td>
        <td>${typePill(category.type)}</td>
        <td><span class="color-pill"><span class="swatch" style="background:${category.color}"></span>${category.color}</span></td>
        <td>${rowActions("category", category.id)}</td>
      </tr>
    `).join("") || emptyRow(4, "还没有分类。");
  }

  function renderPlans() {
    els.planRows.innerHTML = state.plans
      .slice()
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((plan) => {
        const account = getAccount(plan.accountId);
        const currency = plan.currency || account?.currency || BASE_CURRENCY;
        return `
          <tr>
            <td>${plan.date}</td>
            <td>${escapeHtml(plan.name)}</td>
            <td>${escapeHtml(getCategory(plan.categoryId)?.name || "未分类")}</td>
            <td>${escapeHtml(account?.name || "未指定账户")}</td>
            <td>${repeatLabel(plan.repeat)}</td>
            <td>${planStatusSelect(plan)}</td>
            <td class="num">${formatMoney(plan.amount, currency)}</td>
            <td>${escapeHtml(plan.note || "")}</td>
            <td>${planActions(plan)}</td>
          </tr>
        `;
      }).join("") || emptyRow(9, "还没有计划支出。");
  }

  function planActions(plan) {
    const payButton = plan.status === "pending"
      ? `<button class="icon-button" type="button" title="记为流水" data-action="pay-plan" data-type="plan" data-id="${plan.id}">记账</button>`
      : "";
    return `<div class="row-actions">${payButton}<button class="icon-button" type="button" title="编辑" data-action="edit" data-type="plan" data-id="${plan.id}">编辑</button><button class="icon-button" type="button" title="删除" data-action="delete" data-type="plan" data-id="${plan.id}">删除</button></div>`;
  }

  function rowActions(type, id) {
    return `
      <div class="row-actions">
        <button class="icon-button" type="button" title="编辑" data-action="edit" data-type="${type}" data-id="${id}">编辑</button>
        <button class="icon-button" type="button" title="删除" data-action="delete" data-type="${type}" data-id="${id}">删除</button>
      </div>
    `;
  }

  document.addEventListener("click", (event) => {
    const button = event.target.closest("[data-action]");
    if (!button) return;
    const { action, type, id } = button.dataset;
    if (action === "edit") editItem(type, id);
    if (action === "delete") deleteItem(type, id);
    if (action === "pay-plan") payPlan(id);
  });

  document.addEventListener("change", (event) => {
    const select = event.target.closest("[data-plan-status]");
    if (!select) return;
    const plan = state.plans.find((item) => item.id === select.dataset.planStatus);
    if (!plan) return;
    plan.status = select.value;
    saveState();
    refreshAll();
    notify("计划状态已更新。");
  });

  function saveTransaction(event) {
    event.preventDefault();
    const account = getAccount(els.transactionAccount.value);
    if (!account) return notify("请先创建账户。");
    const amount = Number(els.transactionAmount.value);
    if (!Number.isFinite(amount) || amount <= 0) return notify("金额必须大于 0。");
    const category = getCategory(els.transactionCategory.value);
    const note = els.transactionNote.value.trim();
    if (isOtherCategory(category) && !note) {
      els.transactionNote.focus();
      return notify("选择“其他”分类时必须填写备注。");
    }
    const item = {
      id: els.transactionId.value || uid(),
      type: els.transactionType.value,
      date: els.transactionDate.value,
      amount: roundMoney(amount),
      accountId: els.transactionAccount.value,
      categoryId: els.transactionCategory.value,
      note
    };
    upsert("transactions", item);
    localStorage.setItem(`${STORAGE_KEY}:last-account`, item.accountId);
    localStorage.setItem(`${STORAGE_KEY}:last-category:${item.type}`, item.categoryId);
    if (item.note) localStorage.setItem(`${STORAGE_KEY}:last-note`, item.note);
    saveState();
    resetTransactionForm();
    refreshAll();
    notify("流水已保存。");
  }

  function saveAccount(event) {
    event.preventDefault();
    const item = {
      id: els.accountId.value || uid(),
      name: els.accountName.value.trim(),
      type: els.accountType.value,
      currency: els.accountCurrency.value,
      initialBalance: roundMoney(Number(els.accountInitial.value))
    };
    if (!item.name) return notify("账户名称不能为空。");
    upsert("accounts", item);
    saveState();
    resetAccountForm();
    refreshAll();
    notify("账户已保存。");
  }

  function saveCategory(event) {
    event.preventDefault();
    const item = {
      id: els.categoryId.value || uid(),
      name: els.categoryName.value.trim(),
      type: els.categoryType.value,
      color: els.categoryColor.value
    };
    if (!item.name) return notify("分类名称不能为空。");
    upsert("categories", item);
    saveState();
    resetCategoryForm();
    refreshAll();
    notify("分类已保存。");
  }

  function savePlan(event) {
    event.preventDefault();
    const amount = Number(els.planAmount.value);
    if (!Number.isFinite(amount) || amount <= 0) return notify("计划金额必须大于 0。");
    const item = {
      id: els.planId.value || uid(),
      name: els.planName.value.trim(),
      amount: roundMoney(amount),
      currency: els.planCurrency.value,
      accountId: els.planAccount.value,
      categoryId: els.planCategory.value,
      date: els.planDate.value,
      repeat: els.planRepeat.value,
      status: els.planStatus.value,
      note: els.planNote.value.trim()
    };
    if (!item.name) return notify("计划名称不能为空。");
    upsert("plans", item);
    saveState();
    resetPlanForm();
    refreshAll();
    notify("计划已保存。");
  }

  function payPlan(id) {
    const plan = state.plans.find((entry) => entry.id === id);
    if (!plan) return;
    const transaction = {
      id: uid(),
      type: "expense",
      date: toDate(new Date()),
      amount: plan.amount,
      accountId: plan.accountId,
      categoryId: plan.categoryId,
      note: plan.note || plan.name
    };
    state.transactions.push(transaction);
    plan.status = "paid";
    localStorage.setItem(`${STORAGE_KEY}:last-account`, transaction.accountId);
    localStorage.setItem(`${STORAGE_KEY}:last-category:expense`, transaction.categoryId);
    saveState();
    refreshAll();
    notify("计划已记为流水。");
  }

  function applyTemplate(id) {
    const template = state.templates.find((item) => item.id === id);
    if (!template) return;
    setView("transactions");
    syncTypeChoice(template.type);
    populateDynamicSelects();
    els.transactionAmount.value = template.amount;
    els.transactionAccount.value = getPreferredAccountId();
    const category = state.categories.find((item) => item.type === template.type && item.name === template.categoryName);
    if (category) els.transactionCategory.value = category.id;
    els.transactionNote.value = template.note || "";
    els.transactionAmount.focus();
  }

  function renderTemplates() {
    els.templateChips.innerHTML = state.templates.map((template) => {
      return `<button class="template-chip" type="button" data-template-id="${escapeHtml(template.id)}"><strong>${escapeHtml(template.name)}</strong><span>${formatMoney(template.amount, BASE_CURRENCY)}</span></button>`;
    }).join("");
  }

  function renderNoteSuggestions() {
    const notes = Array.from(new Set(state.transactions.map((item) => item.note).filter(Boolean))).slice(-12).reverse();
    els.noteSuggestions.innerHTML = notes.map((note) => `<option value="${escapeHtml(note)}"></option>`).join("");
  }

  function editItem(type, id) {
    if (type === "transaction") {
      const item = state.transactions.find((entry) => entry.id === id);
      if (!item) return;
      setView("transactions");
      els.transactionId.value = item.id;
      els.transactionType.value = item.type;
      syncTypeChoice(item.type);
      populateDynamicSelects();
      els.transactionDate.value = item.date;
      els.transactionAmount.value = item.amount;
      els.transactionAccount.value = item.accountId;
      els.transactionCategory.value = item.categoryId;
      els.transactionNote.value = item.note || "";
      els.transactionAmount.focus();
    }
    if (type === "account") {
      const item = state.accounts.find((entry) => entry.id === id);
      if (!item) return;
      els.accountId.value = item.id;
      els.accountName.value = item.name;
      els.accountType.value = item.type || "debit";
      els.accountCurrency.value = item.currency;
      els.accountInitial.value = item.initialBalance;
      els.accountName.focus();
    }
    if (type === "category") {
      const item = state.categories.find((entry) => entry.id === id);
      if (!item) return;
      els.categoryId.value = item.id;
      els.categoryName.value = item.name;
      els.categoryType.value = item.type;
      els.categoryColor.value = item.color;
      els.categoryName.focus();
    }
    if (type === "plan") {
      const item = state.plans.find((entry) => entry.id === id);
      if (!item) return;
      setView("plans");
      els.planId.value = item.id;
      els.planName.value = item.name;
      els.planAmount.value = item.amount;
      els.planCurrency.value = item.currency || BASE_CURRENCY;
      els.planAccount.value = item.accountId;
      els.planCategory.value = item.categoryId;
      els.planDate.value = item.date;
      els.planRepeat.value = item.repeat;
      els.planStatus.value = item.status;
      els.planNote.value = item.note || "";
      els.planName.focus();
    }
  }

  function deleteItem(type, id) {
    const collection = {
      transaction: "transactions",
      account: "accounts",
      category: "categories",
      plan: "plans"
    }[type];
    if (!collection) return;
    if (type === "category" && state.transactions.some((item) => item.categoryId === id)) {
      return notify("该分类已有流水，不能删除。");
    }
    if (type === "category" && state.plans.some((item) => item.categoryId === id)) {
      return notify("该分类已有计划，不能删除。");
    }
    if (type === "account" && state.transactions.some((item) => item.accountId === id)) {
      return notify("该账户已有流水，不能删除。");
    }
    if (type === "account" && state.plans.some((item) => item.accountId === id)) {
      return notify("该账户已有计划，不能删除。");
    }
    if (!window.confirm("确认删除这条记录？")) return;
    state[collection] = state[collection].filter((item) => item.id !== id);
    saveState();
    refreshAll();
    notify("已删除。");
  }

  function resetTransactionForm() {
    els.transactionForm.reset();
    els.transactionId.value = "";
    els.transactionType.value = "expense";
    syncTypeChoice("expense");
    els.transactionDate.value = toDate(new Date());
    populateDynamicSelects();
    els.transactionAccount.value = getPreferredAccountId();
    const recentCategory = localStorage.getItem(`${STORAGE_KEY}:last-category:expense`);
    if (state.categories.some((category) => category.id === recentCategory && category.type === "expense")) {
      els.transactionCategory.value = recentCategory;
    }
    els.transactionNote.value = localStorage.getItem(`${STORAGE_KEY}:last-note`) || "";
  }

  function resetAccountForm() {
    els.accountForm.reset();
    els.accountId.value = "";
    els.accountType.value = "debit";
    els.accountCurrency.value = BASE_CURRENCY;
    els.accountInitial.value = "0";
  }

  function resetCategoryForm() {
    els.categoryForm.reset();
    els.categoryId.value = "";
    els.categoryColor.value = "#2563eb";
  }

  function resetPlanForm() {
    els.planForm.reset();
    els.planId.value = "";
    els.planDate.value = toDate(new Date());
    els.planCurrency.value = BASE_CURRENCY;
    els.planRepeat.value = "none";
    els.planStatus.value = "pending";
    populateDynamicSelects();
  }

  function clearFilters() {
    els.filterStart.value = "";
    els.filterEnd.value = "";
    els.filterType.value = "all";
    els.filterCategory.value = "all";
    els.filterAccount.value = "all";
    els.globalSearch.value = "";
    refreshAll();
  }

  function exportJson() {
    downloadFile(`e-account-backup-${todayStamp()}.json`, JSON.stringify(state, null, 2), "application/json;charset=utf-8");
  }

  function exportCsv() {
    const header = ["日期", "类型", "分类", "账户", "账户类型", "币种", "金额", "备注"];
    const lines = getFilteredTransactions().map((transaction) => {
      const account = getAccount(transaction.accountId);
      const category = getCategory(transaction.categoryId);
      return [
        transaction.date,
        transaction.type === "income" ? "收入" : "支出",
        category?.name || "",
        account?.name || "",
        accountTypeLabel(account?.type),
        account?.currency || "",
        transaction.amount,
        transaction.note || ""
      ].map(csvCell).join(",");
    });
    const csv = `\ufeff${header.join(",")}\n${lines.join("\n")}`;
    downloadFile(`e-account-transactions-${todayStamp()}.csv`, csv, "text/csv;charset=utf-8");
  }

  function importJson(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const nextState = JSON.parse(String(reader.result));
        validateState(nextState);
        state = normalizeState(nextState);
        saveState();
        refreshAll();
        notify("JSON 备份已导入。");
      } catch (error) {
        notify(`导入失败：${error.message}`);
      } finally {
        els.importJsonInput.value = "";
      }
    };
    reader.readAsText(file);
  }

  function resetAllData() {
    if (!window.confirm("确认恢复默认数据？当前本地数据会被清空。")) return;
    state = cloneDefaultData();
    saveState();
    resetTransactionForm();
    resetAccountForm();
    resetCategoryForm();
    resetPlanForm();
    refreshAll();
    notify("已恢复默认数据。");
  }

  function getFilteredTransactions() {
    const keyword = els.globalSearch.value.trim().toLowerCase();
    return state.transactions
      .filter((transaction) => {
        if (els.filterStart.value && transaction.date < els.filterStart.value) return false;
        if (els.filterEnd.value && transaction.date > els.filterEnd.value) return false;
        if (els.filterType.value !== "all" && transaction.type !== els.filterType.value) return false;
        if (els.filterCategory.value !== "all" && transaction.categoryId !== els.filterCategory.value) return false;
        if (els.filterAccount.value !== "all" && transaction.accountId !== els.filterAccount.value) return false;
        if (!keyword) return true;
        const account = getAccount(transaction.accountId);
        const category = getCategory(transaction.categoryId);
        return [transaction.note, account?.name, category?.name].some((text) => String(text || "").toLowerCase().includes(keyword));
      })
      .sort((a, b) => b.date.localeCompare(a.date));
  }

  function getTransactionsForMonth(month) {
    return state.transactions.filter((transaction) => transaction.date.startsWith(month));
  }

  function summarizeByCurrency(transactions) {
    return transactions.reduce((acc, transaction) => {
      const account = getAccount(transaction.accountId);
      const currency = account?.currency || BASE_CURRENCY;
      if (!acc[currency]) acc[currency] = { income: 0, expense: 0 };
      acc[currency][transaction.type] += transaction.amount;
      return acc;
    }, {});
  }

  function calculateAccountBalances() {
    const balances = {};
    state.accounts.forEach((account) => {
      balances[account.id] = Number(account.initialBalance) || 0;
    });
    state.transactions.forEach((transaction) => {
      if (!(transaction.accountId in balances)) return;
      balances[transaction.accountId] += transaction.type === "income" ? transaction.amount : -transaction.amount;
    });
    Object.keys(balances).forEach((id) => {
      balances[id] = roundMoney(balances[id]);
    });
    return balances;
  }

  function planStatusSelect(plan) {
    return `
      <select class="status-select ${plan.status}" data-plan-status="${escapeHtml(plan.id)}">
        ${Object.entries(PLAN_STATUSES).map(([value, label]) => {
          return `<option value="${value}" ${plan.status === value ? "selected" : ""}>${label}</option>`;
        }).join("")}
      </select>
    `;
  }

  function repeatLabel(repeat) {
    return PLAN_REPEATS[repeat] || PLAN_REPEATS.none;
  }

  function statusLabel(status) {
    return PLAN_STATUSES[status] || PLAN_STATUSES.pending;
  }

  function syncTypeChoice(type) {
    els.transactionType.value = type;
    els.typeExpense.checked = type === "expense";
    els.typeIncome.checked = type === "income";
  }

  function getPreferredAccountId() {
    const stored = localStorage.getItem(`${STORAGE_KEY}:last-account`);
    if (state.accounts.some((account) => account.id === stored)) return stored;
    return state.accounts[0]?.id || "";
  }

  function drawCategoryShareChart(transactions) {
    const canvas = els.categoryShareChart;
    if (!canvas || currentView !== "dashboard") return;
    const ratio = window.devicePixelRatio || 1;
    const width = canvas.clientWidth || 420;
    const height = 220;
    canvas.width = Math.floor(width * ratio);
    canvas.height = Math.floor(height * ratio);
    const ctx = canvas.getContext("2d");
    ctx.scale(ratio, ratio);
    ctx.clearRect(0, 0, width, height);
    const totals = {};
    transactions.forEach((transaction) => {
      const account = getAccount(transaction.accountId);
      if (transaction.type !== "expense" || account?.currency !== BASE_CURRENCY) return;
      const category = getCategory(transaction.categoryId);
      const name = category?.name || "未分类";
      totals[name] = (totals[name] || 0) + transaction.amount;
    });
    const items = Object.entries(totals).sort((a, b) => b[1] - a[1]).slice(0, 5);
    const total = items.reduce((sum, item) => sum + item[1], 0);
    if (!items.length) {
      ctx.fillStyle = "#7a8ba0";
      ctx.font = "14px -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.fillText("本月暂无人民币支出", 18, 36);
      return;
    }
    const colors = ["#4aa3ff", "#8dcfff", "#7dd3fc", "#a78bfa", "#f9a8b8"];
    let start = -Math.PI / 2;
    items.forEach((item, index) => {
      const angle = (item[1] / total) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(92, 108);
      ctx.arc(92, 108, 72, start, start + angle);
      ctx.closePath();
      ctx.fillStyle = colors[index % colors.length];
      ctx.fill();
      start += angle;
    });
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(92, 108, 38, 0, Math.PI * 2);
    ctx.fill();
    ctx.font = "12px -apple-system, BlinkMacSystemFont, sans-serif";
    items.forEach((item, index) => {
      const y = 46 + index * 28;
      ctx.fillStyle = colors[index % colors.length];
      ctx.fillRect(200, y - 10, 12, 12);
      ctx.fillStyle = "#1d2939";
      ctx.fillText(`${item[0]} ${Math.round(item[1] / total * 100)}%`, 220, y);
    });
  }

  function drawWeekChart() {
    const canvas = els.weekChart;
    if (!canvas || currentView !== "dashboard") return;
    const ratio = window.devicePixelRatio || 1;
    const width = canvas.clientWidth || 420;
    const height = 220;
    canvas.width = Math.floor(width * ratio);
    canvas.height = Math.floor(height * ratio);
    const ctx = canvas.getContext("2d");
    ctx.scale(ratio, ratio);
    ctx.clearRect(0, 0, width, height);
    const days = Array.from({ length: 7 }, (_, index) => {
      const date = addDays(startOfDay(new Date()), index - 6);
      return { date: toDate(date), amount: 0 };
    });
    state.transactions.forEach((transaction) => {
      const account = getAccount(transaction.accountId);
      const item = days.find((day) => day.date === transaction.date);
      if (item && transaction.type === "expense" && account?.currency === BASE_CURRENCY) item.amount += transaction.amount;
    });
    const max = Math.max(...days.map((day) => day.amount), 100);
    const left = 28;
    const bottom = 180;
    const barW = Math.max(18, (width - 72) / 7 - 10);
    ctx.font = "12px -apple-system, BlinkMacSystemFont, sans-serif";
    days.forEach((day, index) => {
      const x = left + index * ((width - 72) / 7);
      const h = Math.max(2, day.amount / max * 130);
      const grad = ctx.createLinearGradient(0, bottom - h, 0, bottom);
      grad.addColorStop(0, "#4aa3ff");
      grad.addColorStop(1, "#b9e3ff");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.roundRect(x, bottom - h, barW, h, 8);
      ctx.fill();
      ctx.fillStyle = "#637083";
      ctx.fillText(day.date.slice(5).replace("-", "/"), x - 2, 204);
    });
  }

  function drawTrendChart() {
    const canvas = els.trendChart;
    if (!canvas || currentView !== "dashboard") return;
    const containerWidth = canvas.clientWidth || 900;
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.floor(containerWidth * ratio);
    canvas.height = Math.floor(320 * ratio);
    const ctx = canvas.getContext("2d");
    ctx.scale(ratio, ratio);
    ctx.clearRect(0, 0, containerWidth, 320);

    const month = els.monthPicker.value;
    const days = daysInMonth(month);
    const daily = Array.from({ length: days }, (_, index) => ({ day: index + 1, income: 0, expense: 0 }));
    getTransactionsForMonth(month).forEach((transaction) => {
      const account = getAccount(transaction.accountId);
      if (account?.currency !== BASE_CURRENCY) return;
      const day = Number(transaction.date.slice(-2));
      daily[day - 1][transaction.type] += transaction.amount;
    });

    const width = containerWidth;
    const height = 320;
    const pad = { top: 24, right: 18, bottom: 34, left: 56 };
    const chartW = width - pad.left - pad.right;
    const chartH = height - pad.top - pad.bottom;
    const maxValue = Math.max(...daily.flatMap((item) => [item.income, item.expense]), 100);

    ctx.strokeStyle = "#d8e8f4";
    ctx.lineWidth = 1;
    ctx.font = "12px -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.fillStyle = "#637083";
    for (let i = 0; i <= 4; i += 1) {
      const y = pad.top + chartH * (i / 4);
      ctx.beginPath();
      ctx.moveTo(pad.left, y);
      ctx.lineTo(width - pad.right, y);
      ctx.stroke();
      const label = Math.round(maxValue * (1 - i / 4));
      ctx.fillText(String(label), 8, y + 4);
    }

    drawLine(ctx, daily, "income", "#24a06a", pad, chartW, chartH, maxValue);
    drawLine(ctx, daily, "expense", "#e55d73", pad, chartW, chartH, maxValue);

    ctx.fillStyle = "#637083";
    [1, Math.ceil(days / 2), days].forEach((day) => {
      const x = pad.left + ((day - 1) / Math.max(1, days - 1)) * chartW;
      ctx.fillText(`${day}日`, x - 10, height - 10);
    });
    ctx.fillStyle = "#24a06a";
    ctx.fillText("收入 CNY", pad.left, 18);
    ctx.fillStyle = "#e55d73";
    ctx.fillText("支出 CNY", pad.left + 78, 18);
  }

  function drawLine(ctx, daily, key, color, pad, chartW, chartH, maxValue) {
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    daily.forEach((item, index) => {
      const x = pad.left + (index / Math.max(1, daily.length - 1)) * chartW;
      const y = pad.top + chartH - (item[key] / maxValue) * chartH;
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
  }

  function upsert(collection, item) {
    const index = state[collection].findIndex((entry) => entry.id === item.id);
    if (index >= 0) state[collection][index] = item;
    else state[collection].push(item);
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return cloneDefaultData();
      const parsed = JSON.parse(raw);
      validateState(parsed);
      return normalizeState(parsed);
    } catch (_error) {
      return cloneDefaultData();
    }
  }

  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function validateState(data) {
    if (!data || typeof data !== "object") throw new Error("文件不是有效的记账数据。");
    ["accounts", "categories", "transactions"].forEach((key) => {
      if (!Array.isArray(data[key])) throw new Error(`缺少 ${key} 数据。`);
    });
    if (data.budgets && !Array.isArray(data.budgets)) throw new Error("budgets 数据格式错误。");
    if (data.plans && !Array.isArray(data.plans)) throw new Error("plans 数据格式错误。");
    if (data.templates && !Array.isArray(data.templates)) throw new Error("templates 数据格式错误。");
  }

  function normalizeState(data) {
    const normalized = {
      version: 1,
      accounts: data.accounts.map((item) => ({
        id: String(item.id || uid()),
        name: String(item.name || "未命名账户"),
        type: ACCOUNT_TYPES[item.type] ? item.type : inferAccountType(item.name),
        currency: CURRENCIES.includes(item.currency) ? item.currency : BASE_CURRENCY,
        initialBalance: roundMoney(Number(item.initialBalance) || 0)
      })),
      categories: data.categories.map((item) => ({
        id: String(item.id || uid()),
        name: String(item.name || "未命名分类"),
        type: item.type === "income" ? "income" : "expense",
        color: /^#[0-9a-fA-F]{6}$/.test(item.color) ? item.color : "#2563eb"
      })),
      budgets: (data.budgets || []).map((item) => ({
        id: String(item.id || uid()),
        month: /^\d{4}-\d{2}$/.test(item.month) ? item.month : toMonth(new Date()),
        categoryId: String(item.categoryId || ""),
        amount: Math.max(0, roundMoney(Number(item.amount) || 0))
      })),
      templates: normalizeTemplates(data.templates),
      plans: (data.plans || []).map((item) => ({
        id: String(item.id || uid()),
        name: String(item.name || "计划支出").slice(0, 40),
        amount: Math.max(0, roundMoney(Number(item.amount) || 0)),
        currency: CURRENCIES.includes(item.currency) ? item.currency : BASE_CURRENCY,
        accountId: String(item.accountId || ""),
        categoryId: String(item.categoryId || ""),
        date: /^\d{4}-\d{2}-\d{2}$/.test(item.date) ? item.date : toDate(new Date()),
        repeat: PLAN_REPEATS[item.repeat] ? item.repeat : "none",
        status: PLAN_STATUSES[item.status] ? item.status : "pending",
        note: String(item.note || "").slice(0, 80)
      })),
      transactions: data.transactions.map((item) => ({
        id: String(item.id || uid()),
        type: item.type === "income" ? "income" : "expense",
        date: /^\d{4}-\d{2}-\d{2}$/.test(item.date) ? item.date : toDate(new Date()),
        amount: Math.max(0, roundMoney(Number(item.amount) || 0)),
        accountId: String(item.accountId || ""),
        categoryId: String(item.categoryId || ""),
        note: String(item.note || "").slice(0, 80)
      }))
    };
    ensureDefaultCategories(normalized);
    ensureDefaultTemplates(normalized);
    migrateBudgetsToPlans(normalized, data);
    return normalized;
  }

  function migrateBudgetsToPlans(data, originalData) {
    if (originalData.plans && originalData.plans.length) return;
    data.budgets.forEach((budget) => {
      const category = data.categories.find((item) => item.id === budget.categoryId);
      data.plans.push({
        id: `plan-${budget.id}`,
        name: category?.name ? `${category.name}计划` : "计划支出",
        amount: budget.amount,
        currency: BASE_CURRENCY,
        accountId: data.accounts[0]?.id || "",
        categoryId: budget.categoryId,
        date: `${budget.month}-01`,
        repeat: "none",
        status: "pending",
        note: "由旧预算数据迁移"
      });
    });
  }

  function normalizeTemplates(templates) {
    return (templates || []).map((item) => ({
      id: String(item.id || uid()),
      name: String(item.name || "模板").slice(0, 16),
      type: item.type === "income" ? "income" : "expense",
      amount: Math.max(0, roundMoney(Number(item.amount) || 0)),
      categoryName: String(item.categoryName || "其他").slice(0, 20),
      note: String(item.note || "").slice(0, 80)
    }));
  }

  function ensureDefaultTemplates(data) {
    DEFAULT_TEMPLATES.forEach((template) => {
      const exists = data.templates.some((item) => item.id === template.id || item.name === template.name);
      if (!exists) data.templates.push({ ...template });
    });
  }

  function ensureDefaultCategories(data) {
    defaultData.categories.forEach((defaultCategory) => {
      const exists = data.categories.some((category) => {
        return category.name === defaultCategory.name && category.type === defaultCategory.type;
      });
      if (!exists) {
        data.categories.push({ ...defaultCategory, id: uid() });
      }
    });
  }

  function inferAccountType(name) {
    const text = String(name || "");
    if (text.includes("信用")) return "credit";
    if (text.includes("现金")) return "cash";
    if (text.includes("微信") || text.includes("支付宝") || text.includes("钱包")) return "wallet";
    if (text.includes("储蓄") || text.includes("银行卡") || text.includes("银行")) return "debit";
    return "debit";
  }

  function cloneDefaultData() {
    return JSON.parse(JSON.stringify(defaultData));
  }

  function getAccount(id) {
    return state.accounts.find((account) => account.id === id);
  }

  function getCategory(id) {
    return state.categories.find((category) => category.id === id);
  }

  function typePill(type) {
    const label = type === "income" ? "收入" : "支出";
    return `<span class="type-pill ${type}">${label}</span>`;
  }

  function accountTypeLabel(type) {
    return ACCOUNT_TYPES[type] || ACCOUNT_TYPES.other;
  }

  function accountTypePill(type) {
    const safeType = ACCOUNT_TYPES[type] ? type : "other";
    return `<span class="account-type-pill ${safeType}">${accountTypeLabel(safeType)}</span>`;
  }

  function isOtherCategory(category) {
    return category?.name === "其他";
  }

  function emptyRow(colspan, text) {
    return `<tr><td colspan="${colspan}" class="empty-state">${text}</td></tr>`;
  }

  function formatMoney(value, currency) {
    return `${currency} ${formatAmount(value)}`;
  }

  function formatAmount(value) {
    return Number(value || 0).toLocaleString("zh-CN", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }

  function roundMoney(value) {
    return Math.round((Number(value) || 0) * 100) / 100;
  }

  function toDate(date) {
    return date.toISOString().slice(0, 10);
  }

  function parseLocalDate(value) {
    const [year, month, day] = String(value).split("-").map(Number);
    return startOfDay(new Date(year, month - 1, day));
  }

  function startOfDay(date) {
    const next = new Date(date);
    next.setHours(0, 0, 0, 0);
    return next;
  }

  function addDays(date, days) {
    const next = new Date(date);
    next.setDate(next.getDate() + days);
    return next;
  }

  function previousMonth(month) {
    const [year, monthNumber] = month.split("-").map(Number);
    return toMonth(new Date(year, monthNumber - 2, 1));
  }

  function toMonth(date) {
    return date.toISOString().slice(0, 7);
  }

  function daysInMonth(month) {
    const [year, monthNumber] = month.split("-").map(Number);
    return new Date(year, monthNumber, 0).getDate();
  }

  function uid() {
    if (crypto && crypto.randomUUID) return crypto.randomUUID();
    return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function todayStamp() {
    return toDate(new Date()).replaceAll("-", "");
  }

  function downloadFile(filename, content, type) {
    const blob = new Blob([content], { type });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(link.href);
  }

  function csvCell(value) {
    const text = String(value ?? "");
    return `"${text.replaceAll("\"", "\"\"")}"`;
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll("\"", "&quot;")
      .replaceAll("'", "&#039;");
  }

  function notify(message) {
    els.notice.textContent = message;
    els.notice.classList.add("show");
    window.clearTimeout(notify.timer);
    notify.timer = window.setTimeout(() => {
      els.notice.classList.remove("show");
    }, 3200);
  }
})();
