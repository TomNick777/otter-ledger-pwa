/**
 * 海獭账本 PWA - 专业SaaS风格
 * 基于 GitHub 仓库实现数据同步
 */

// ==================== 配置 ====================
const CONFIG = {
  GITHUB_CLIENT_ID: 'YOUR_GITHUB_CLIENT_ID',
  REDIRECT_URI: window.location.origin + window.location.pathname,
  REPO_NAME: 'otter-ledger-data',
  DATA_FILE: 'data.json'
};

// ==================== 数据存储 ====================
const dataStore = {
  // 账户表 - 存储账户基本信息
  accounts: [],
  // 余额快照表 - 每月末的账户余额记录
  balanceSnapshots: [],
  // 收入记录表 - 日常收入
  incomeRecords: [],
  // 转账记录表 - 账户间转账
  transferRecords: [],
  // 账户动态日志
  activityLog: [],

  init() {
    const saved = localStorage.getItem('otter-ledger-data');
    this.accounts = [];
    this.balanceSnapshots = [];
    this.incomeRecords = [];
    this.transferRecords = [];
    this.activityLog = [];
    if (saved) {
      const data = JSON.parse(saved);
      this.accounts = data.accounts || [];
      this.balanceSnapshots = data.balanceSnapshots || [];
      this.incomeRecords = data.incomeRecords || [];
      this.transferRecords = data.transferRecords || [];
      this.activityLog = data.activityLog || [];
      // 确保所有账户有 sortOrder
      this.accounts.forEach((acc, i) => {
        if (acc.sortOrder === undefined) acc.sortOrder = i;
      });
      this.accounts.sort((a, b) => a.sortOrder - b.sortOrder);
    }
  },

  save() {
    localStorage.setItem('otter-ledger-data', JSON.stringify({
      accounts: this.accounts,
      balanceSnapshots: this.balanceSnapshots,
      incomeRecords: this.incomeRecords,
      transferRecords: this.transferRecords,
      activityLog: this.activityLog,
      lastModified: Date.now()
    }));
  },

  // 获取某账户某日余额 = 初始余额 + 该日及之前的累计收入（仅该账户）
  getAccountBalanceAtDate(accountId, date) {
    const account = this.accounts.find(a => a.id === accountId);
    if (!account) return 0;

    const dateStr = typeof date === 'string' ? date : date.toISOString().split('T')[0];

    // 该账户在该日期及之前的累计收入
    const totalIncome = this.incomeRecords
      .filter(r => r.accountId === accountId && r.date <= dateStr)
      .reduce((sum, r) => sum + r.amount, 0);

    return account.initialBalance + totalIncome;
  },

  // 计算某日期的总资产
  // 总资产 = Σ(储蓄账户余额) - Σ(信用卡欠款)
  getTotalAssetAtDate(date) {
    const dateStr = typeof date === 'string' ? date : date.toISOString().split('T')[0];
    return this.accounts.reduce((sum, acc) => {
      const balance = this.getAccountBalanceAtDate(acc.id, dateStr);
      return acc.type === 'debit' ? sum + balance : sum - balance;
    }, 0);
  },

  // 获取某月收入总额
  getMonthlyIncome(year, month) {
    const start = `${year}-${String(month).padStart(2, '0')}-01`;
    const end = new Date(year, month, 0).toISOString().split('T')[0];
    return this.incomeRecords
      .filter(r => r.date >= start && r.date <= end)
      .reduce((sum, r) => sum + r.amount, 0);
  },

  // 计算某月支出（反推法）
  getMonthlyExpense(year, month) {
    const prevMonth = month === 1 ? 12 : month - 1;
    const prevYear = month === 1 ? year - 1 : year;
    const prevMonthEnd = new Date(prevYear, prevMonth, 0).toISOString().split('T')[0];
    const currMonthEnd = new Date(year, month, 0).toISOString().split('T')[0];
    const prevAsset = this.getTotalAssetAtDate(prevMonthEnd);
    const currAsset = this.getTotalAssetAtDate(currMonthEnd);
    const income = this.getMonthlyIncome(year, month);
    return prevAsset + income - currAsset;
  },

  // 添加账户
  addAccount(account) {
    account.id = 'acc_' + Date.now();
    account.createdAt = account.createdAt || new Date().toISOString().split('T')[0];
    account.initialBalance = parseFloat(account.initialBalance) || 0;
    account.sortOrder = this.accounts.length;
    this.accounts.push(account);
    this.addActivity('account_create', {
      accountId: account.id,
      accountName: account.name,
      accountEmoji: account.emoji,
      accountType: account.type,
      initialBalance: account.initialBalance,
      description: `新建账户「${account.emoji} ${account.name}」，期初余额 ¥${account.initialBalance}`
    });
    this.save();
    return account;
  },

  // 删除账户
  deleteAccount(id) {
    const acc = this.accounts.find(a => a.id === id);
    if (acc) {
      this.addActivity('account_delete', {
        accountId: id,
        accountName: acc.name,
        accountEmoji: acc.emoji,
        description: `删除账户「${acc.emoji} ${acc.name}」`
      });
    }
    this.accounts = this.accounts.filter(a => a.id !== id);
    this.save();
  },

  // 更新账户排序
  updateAccountsOrder(newOrder) {
    // newOrder: 按新顺序排列的 accountId 数组
    newOrder.forEach((id, index) => {
      const acc = this.accounts.find(a => a.id === id);
      if (acc) acc.sortOrder = index;
    });
    this.accounts.sort((a, b) => a.sortOrder - b.sortOrder);
    this.save();
  },

  // 添加收入记录
  addIncomeRecord(record) {
    record.id = 'inc_' + Date.now();
    record.date = record.date || new Date().toISOString().split('T')[0];
    record.amount = parseFloat(record.amount) || 0;
    record.category = record.category || '其他';
    this.incomeRecords.unshift(record);

    // 记录账户动态
    const acc = this.accounts.find(a => a.id === record.accountId);
    if (acc) {
      const newBalance = this.getAccountBalanceAtDate(acc.id, record.date);
      this.addActivity('income_add', {
        incomeId: record.id,
        accountId: acc.id,
        accountName: acc.name,
        accountEmoji: acc.emoji,
        amount: record.amount,
        source: record.source,
        category: record.category,
        balance: newBalance,
        description: `${acc.emoji} ${acc.name} +¥${record.amount}（来源：${record.source}），余额 ¥${newBalance.toFixed(2)}`
      });
    }

    this.save();
    return record;
  },

  // 添加动态日志
  addActivity(type, data) {
    this.activityLog.unshift({
      id: 'act_' + Date.now(),
      type,
      data,
      createdAt: Date.now()
    });
    // 最多保留200条
    if (this.activityLog.length > 200) {
      this.activityLog = this.activityLog.slice(0, 200);
    }
  },

  // 获取历史资产数据（用于折线图）
  getHistoryData(months = 6) {
    const history = [];
    const now = new Date();
    for (let i = months - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const year = d.getFullYear();
      const month = d.getMonth() + 1;
      const label = `${year}-${String(month).padStart(2, '0')}`;
      const monthEnd = new Date(year, month, 0).toISOString().split('T')[0];
      const totalAsset = this.getTotalAssetAtDate(monthEnd);
      const income = this.getMonthlyIncome(year, month);
      const expense = this.getMonthlyExpense(year, month);
      history.push({ label, totalAsset, income, expense, year, month });
    }
    return history;
  },

  // 按分类统计收入
  getIncomeByCategory() {
    const catMap = {};
    this.incomeRecords.forEach(r => {
      const cat = r.category || '其他';
      catMap[cat] = (catMap[cat] || 0) + r.amount;
    });
    const catEmojis = { '工资': '💰', '奖金': '🎁', '红包': '🧧', '理财收益': '📈', '兼职': '💼', '退款': '↩️', '其他': '📦' };
    return Object.entries(catMap)
      .map(([name, amount]) => ({ name, amount, emoji: catEmojis[name] || '📦' }))
      .sort((a, b) => b.amount - a.amount);
  },

  // 兼容旧版本
  getTotalBalance() {
    const now = new Date();
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];
    return this.getTotalAssetAtDate(monthEnd);
  },

  getTotalInitialBalance() {
    return this.accounts.reduce((sum, acc) => sum + (acc.initialBalance || 0), 0);
  },

  getExpenseByCategory() {
    return [];
  },

  export() {
    return {
      accounts: this.accounts,
      balanceSnapshots: this.balanceSnapshots,
      incomeRecords: this.incomeRecords,
      transferRecords: this.transferRecords,
      activityLog: this.activityLog,
      lastModified: Date.now()
    };
  },

  import(data) {
    if (data.accounts) this.accounts = data.accounts;
    if (data.balanceSnapshots) this.balanceSnapshots = data.balanceSnapshots;
    if (data.incomeRecords) this.incomeRecords = data.incomeRecords;
    if (data.transferRecords) this.transferRecords = data.transferRecords;
    if (data.activityLog) this.activityLog = data.activityLog;
    this.save();
  }
};

// ==================== GitHub 认证 ====================
const githubAuth = {
  token: null,
  user: null,

  async init() {
    this.token = localStorage.getItem('github-token');
    this.user = JSON.parse(localStorage.getItem('github-user') || 'null');
    if (this.token && this.user) {
      await this.showApp();
    }
  },

  login() {
    document.getElementById('tokenModal').style.display = 'flex';
  },

  async submitToken() {
    const token = document.getElementById('tokenInput').value.trim();
    if (!token) { ui.showToast('请输入 Token'); return; }
    ui.showToast('验证中...');
    try {
      const userRes = await fetch('https://api.github.com/user', {
        headers: { 'Authorization': `token ${token}` }
      });
      if (!userRes.ok) { ui.showToast('Token 无效'); return; }
      this.user = await userRes.json();
      this.token = token;
      localStorage.setItem('github-token', token);
      localStorage.setItem('github-user', JSON.stringify(this.user));
      document.getElementById('tokenModal').style.display = 'none';
      document.getElementById('tokenInput').value = '';
      ui.showToast('登录成功！欢迎 ' + this.user.login);
      // showApp 内部会处理初始化和同步
      await this.showApp();
    } catch (err) { ui.showToast('登录失败：' + err.message); }
  },

  async showApp() {
    document.getElementById('loginPage').style.display = 'none';
    document.getElementById('app').classList.add('show');
    if (this.user) {
      document.getElementById('sidebarUserName').textContent = this.user.login;
      document.getElementById('settingsUser').textContent = 'GitHub: ' + this.user.login;
    }
    dataStore.init();
    // 先等 GitHub 数据拉回来再渲染，避免新设备看到空白
    await this._renderAfterSync();
  },

  async _renderAfterSync() {
    ui.setSyncing(true);
    try {
      await syncManager.sync();
      ui.render();
    } catch (err) {
      ui.render(); // 网络失败时至少渲染本地数据
      ui.showToast('同步失败，使用本地数据');
    }
    ui.setSyncing(false);
  },

  logout() {
    if (!confirm('确定要退出登录吗？')) return;
    localStorage.removeItem('github-token');
    localStorage.removeItem('github-user');
    location.reload();
  }
};

// ==================== 主题管理 ====================
const themeManager = {
  STORAGE_KEY: 'otter-theme',

  init() {
    const saved = localStorage.getItem(this.STORAGE_KEY) || 'dark';
    this.apply(saved);
  },

  toggle() {
    const current = document.documentElement.getAttribute('data-theme') || 'dark';
    const next = current === 'dark' ? 'light' : 'dark';
    this.apply(next);
    localStorage.setItem(this.STORAGE_KEY, next);
  },

  apply(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    const icons = document.querySelectorAll('.theme-icon');
    icons.forEach(icon => {
      icon.textContent = theme === 'dark' ? '☀️' : '🌙';
    });
    const switchIcon = document.getElementById('themeSwitchIcon');
    if (switchIcon) {
      switchIcon.textContent = theme === 'dark' ? '☀️' : '🌙';
    }
    const meta = document.getElementById('themeMeta');
    if (meta) {
      meta.setAttribute('content', theme === 'dark' ? '#0A0A0A' : '#FAFAFA');
    }
  }
};

// ==================== 同步管理 ====================
const syncManager = {
  syncing: false,

  async initRepo() {
    try {
      const res = await fetch(`https://api.github.com/repos/${githubAuth.user.login}/${CONFIG.REPO_NAME}`, {
        headers: { 'Authorization': `token ${githubAuth.token}` }
      });
      if (res.status === 404) {
        ui.showToast('创建数据仓库...');
        await fetch('https://api.github.com/user/repos', {
          method: 'POST',
          headers: { 'Authorization': `token ${githubAuth.token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: CONFIG.REPO_NAME, description: '海獭账本数据存储', private: true, auto_init: true })
        });
        // 创建仓库后立即推送本地数据（如果有的话），避免空数据覆盖
        const local = dataStore.export();
        await this.pushToGitHub(local, 'Initial data');
      }
    } catch (err) { console.error('Init repo error:', err); }
  },

  async sync() {
    if (this.syncing) return;
    this.syncing = true;
    ui.setSyncing(true);
    try {
      const result = await this.pullFromGitHub();
      
      if (result.exists && result.data && (result.data.lastModified || result.data.exportTime)) {
        const localData = dataStore.export();
        const merged = this.mergeData(localData, result.data);
        dataStore.import(merged);
        await this.pushToGitHub(merged, `Sync ${new Date().toLocaleString('zh-CN')}`);
      } else if (result.exists === false) {
        const localData = dataStore.export();
        if (localData.accounts && localData.accounts.length > 0) {
          await this.pushToGitHub(localData, 'Initial data from local');
        }
      }
      ui.render();
      ui.showToast('同步完成 ✓');
    } catch (err) {
      console.error('Sync error:', err);
      ui.showToast('同步失败: ' + err.message);
      throw err;
    }
    finally { this.syncing = false; ui.setSyncing(false); }
  },

  async pullFromGitHub() {
    try {
      const res = await fetch(`https://api.github.com/repos/${githubAuth.user.login}/${CONFIG.REPO_NAME}/contents/${CONFIG.DATA_FILE}`, {
        headers: { 'Authorization': `token ${githubAuth.token}` }
      });
      if (res.status === 404) return { exists: false, data: null };
      if (!res.ok) return { exists: null, data: null }; // 网络错误，不明确状态
      const file = await res.json();
      return { exists: true, data: JSON.parse(decodeURIComponent(escape(atob(file.content)))) };
    } catch (err) { return { exists: null, data: null }; }
  },

  async pushToGitHub(data, message) {
    let sha = null;
    try {
      const res = await fetch(`https://api.github.com/repos/${githubAuth.user.login}/${CONFIG.REPO_NAME}/contents/${CONFIG.DATA_FILE}`, {
        headers: { 'Authorization': `token ${githubAuth.token}` }
      });
      if (res.ok) { const file = await res.json(); sha = file.sha; }
    } catch (e) {}
    const body = { message, content: btoa(unescape(encodeURIComponent(JSON.stringify(data, null, 2)))) };
    if (sha) body.sha = sha;
    const res = await fetch(`https://api.github.com/repos/${githubAuth.user.login}/${CONFIG.REPO_NAME}/contents/${CONFIG.DATA_FILE}`, {
      method: 'PUT',
      headers: { 'Authorization': `token ${githubAuth.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (!res.ok) throw new Error('Push failed');
  },

  mergeData(local, cloud) {
    if (!cloud || !cloud.accounts) return local;
    if (!local || !local.accounts || local.accounts.length === 0) return cloud;
    
    const cloudTime = cloud.lastModified || (cloud.exportTime ? new Date(cloud.exportTime).getTime() : 0);
    const localTime = local.lastModified || (local.exportTime ? new Date(local.exportTime).getTime() : 0);
    
    if (cloudTime >= localTime) {
      return cloud;
    }
    
    const timeDiff = localTime - cloudTime;
    if (timeDiff > 5 * 60 * 1000) {
      return local;
    }
    
    return cloud;
  },

  exportData() {
    const blob = new Blob([JSON.stringify(dataStore.export(), null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `otter-ledger-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    ui.showToast('导出成功！');
  }
};

// ==================== 页面管理 ====================
const pageManager = {
  currentPage: 'dashboard',

  switchPage(page) {
    this.currentPage = page;
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.page').forEach(el => el.classList.remove('active'));
    const navMap = { dashboard: 0, records: 1, accounts: 2, settings: 3 };
    document.querySelectorAll('.nav-item')[navMap[page]]?.classList.add('active');
    document.getElementById('page' + page.charAt(0).toUpperCase() + page.slice(1))?.classList.add('active');
    ui.render();
  },

  showAddModal() {
    document.getElementById('addModal').classList.add('active');
    document.getElementById('addDate').valueAsDate = new Date();
    addManager.initAccount();
  },

  showModal(id) {
    document.getElementById(id).classList.add('active');
  },

  hideModal(id) {
    document.getElementById(id).classList.remove('active');
  }
};

// ==================== 添加管理 ====================
const addManager = {
  initAccount() {
    const sel = document.getElementById('addAccount');
    sel.innerHTML = dataStore.accounts.map(a =>
      `<option value="${a.id}">${a.emoji} ${a.name}</option>`
    ).join('');
  },

  submit(e) {
    e.preventDefault();
    const amount = parseFloat(document.getElementById('addAmount').value);
    const desc = document.getElementById('addDesc').value;
    const date = document.getElementById('addDate').value;
    const accountId = document.getElementById('addAccount').value;

    if (!amount || amount <= 0) { ui.showToast('请输入有效金额'); return; }

    dataStore.addIncomeRecord({
      amount,
      source: desc,
      date,
      category: this.guessCategory(desc),
      accountId
    });
    ui.showToast('收入已记录 ✓');

    pageManager.hideModal('addModal');
    document.getElementById('addForm').reset();
    ui.render();
    if (githubAuth.token) syncManager.sync();
  },

  guessCategory(desc) {
    const keywords = {
      '工资': ['工资', '月薪', '底薪'],
      '奖金': ['奖金', '年终奖', '绩效', '佣金'],
      '兼职': ['兼职', '外快', '副业'],
      '理财收益': ['理财', '利息', '投资收益', '分红'],
      '红包': ['红包', '礼金'],
      '退款': ['退款', '退款到账'],
      '其他': []
    };
    for (const [cat, words] of Object.entries(keywords)) {
      if (words.some(w => desc.includes(w))) return cat;
    }
    return '其他';
  }
};

// ==================== 账户管理 ====================
const accountManager = {
  add(e) {
    e.preventDefault();
    const name = document.getElementById('newAccountName').value;
    const type = document.getElementById('newAccountType').value;
    const initialBalance = parseFloat(document.getElementById('newAccountInitialBalance').value) || 0;
    const typeMap = {
      debit: { emoji: '💰', name: '储蓄账户' },
      credit: { emoji: '💳', name: '信用卡' }
    };

    dataStore.addAccount({ name, type, emoji: typeMap[type].emoji, initialBalance });
    ui.showToast('账户添加成功 ✓');
    document.getElementById('newAccountName').value = '';
    document.getElementById('newAccountInitialBalance').value = '0';
    pageManager.hideModal('accountModal');
    ui.render();
    addManager.initAccount();
    if (githubAuth.token) syncManager.sync();
  },

  edit(id) {
    const acc = dataStore.accounts.find(a => a.id === id);
    if (!acc) return;
    const nameEl = document.getElementById('accName_' + id);
    const editBtn = document.getElementById('editBtn_' + id);
    if (!nameEl || !editBtn) return;

    const originalName = acc.name;
    nameEl.innerHTML = `<input type="text" id="nameInput_${id}" value="${acc.name}" style="width:100px;padding:4px 8px;border:1.5px solid var(--primary);border-radius:4px;font-size:14px;font-weight:600;">`;
    editBtn.textContent = '💾 保存';
    editBtn.onclick = () => this.saveEdit(id);
  },

  saveEdit(id) {
    const acc = dataStore.accounts.find(a => a.id === id);
    if (!acc) return;
    const input = document.getElementById('nameInput_' + id);
    if (!input) return;
    const newName = input.value.trim();
    if (!newName) return;
    const oldName = acc.name;
    acc.name = newName;
    dataStore.addActivity('account_update', {
      accountId: id,
      accountName: newName,
      accountEmoji: acc.emoji,
      oldName,
      newName,
      description: `${acc.emoji} ${oldName} → ${acc.emoji} ${newName}`
    });
    dataStore.save();
    ui.render();
    if (githubAuth.token) syncManager.sync();
  },

  updateBalance(id) {
    const acc = dataStore.accounts.find(a => a.id === id);
    if (!acc) return;
    const input = document.getElementById('updateInput_' + id);
    if (!input) return;
    const newBalance = parseFloat(input.value);
    if (isNaN(newBalance)) {
      ui.showToast('请输入有效金额');
      return;
    }

    const currentBalance = dataStore.getAccountBalanceAtDate(acc.id, new Date());
    const today = new Date().toISOString().split('T')[0];

    // 创建/更新今天的余额快照
    const existingIdx = dataStore.balanceSnapshots.findIndex(s => s.accountId === id && s.date === today);
    if (existingIdx >= 0) {
      dataStore.balanceSnapshots[existingIdx].balance = newBalance;
    } else {
      dataStore.balanceSnapshots.push({
        id: 'snap_' + Date.now(),
        accountId: id,
        date: today,
        balance: newBalance
      });
    }

    dataStore.addActivity('account_update', {
      accountId: id,
      accountName: acc.name,
      accountEmoji: acc.emoji,
      oldBalance: currentBalance,
      newBalance: newBalance,
      description: `${acc.emoji} ${acc.name} 余额更新：¥${currentBalance.toFixed(2)} → ¥${newBalance.toFixed(2)}`
    });
    dataStore.save();
    input.value = '';
    ui.showToast('余额已更新 ✓');
    ui.render();
    if (githubAuth.token) syncManager.sync();
  },

  delete(id) {
    if (!confirm('确定要删除这个账户吗？')) return;
    dataStore.deleteAccount(id);
    ui.render();
    if (githubAuth.token) syncManager.sync();
  }
};

// ==================== UI 渲染 ====================
const ui = {
  render() {
    this.renderToday();
    this.renderStats();
    this.renderSidebarAccounts();
    this.renderCategories();
    this.renderActivityLog();
    this.renderAccountsPage();
    this.renderBadge();
    this.drawCharts();
    this.renderForecast();
  },

  renderToday() {
    const now = new Date();
    const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
    document.getElementById('todayDate').textContent =
      `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日 ${weekdays[now.getDay()]}`;
  },

  renderStats() {
    const now = new Date();
    const income = dataStore.getMonthlyIncome(now.getFullYear(), now.getMonth() + 1);
    const expense = dataStore.getMonthlyExpense(now.getFullYear(), now.getMonth() + 1);
    const balance = dataStore.getTotalBalance();
    const balance2 = income - expense;

    const setIfExists = (id, value) => {
      const el = document.getElementById(id);
      if (el) el.textContent = value;
    };

    setIfExists('statTotal', '¥' + (balance >= 0 ? balance.toFixed(2) : '(-' + Math.abs(balance).toFixed(2) + ')'));
    setIfExists('statIncome', '+¥' + income.toFixed(2));
    setIfExists('statExpense', '-¥' + Math.abs(expense).toFixed(2));
    setIfExists('statBalance', (balance2 >= 0 ? '+' : '') + '¥' + balance2.toFixed(2));
    setIfExists('statIncomeSub', `${now.getMonth() + 1}月收入`);
    setIfExists('statExpenseSub', `${now.getMonth() + 1}月支出`);
    setIfExists('statBalanceSub', balance2 >= 0 ? '本月盈利' : '本月亏损');

    const statBalance = document.getElementById('statBalance');
    if (statBalance) statBalance.className = 'value ' + (balance2 >= 0 ? 'savings' : 'expense');
  },

  renderSidebarAccounts() {
    const container = document.getElementById('sidebarAccounts');
    const colors = { debit: '#E8F5E9', credit: '#FCE4EC' };
    container.innerHTML = dataStore.accounts.map(acc => {
      const balance = dataStore.getAccountBalanceAtDate(acc.id, new Date());
      // 信用卡显示为负值（欠款）
      const displayBalance = acc.type === 'credit' ? -balance : balance;
      return `
      <div class="account-item">
        <div class="acc-icon" style="background:${colors[acc.type] || '#F5F5F5'}">${acc.emoji}</div>
        <div class="acc-info">
          <div class="acc-name">${acc.name}</div>
          <div class="acc-type">${acc.type === 'debit' ? '储蓄账户' : '信用卡'}</div>
        </div>
        <div class="acc-balance" style="color:${displayBalance >= 0 ? 'var(--text)' : 'var(--danger)'}">
          ${acc.type === 'credit' ? '-' : ''}¥${Math.abs(displayBalance).toFixed(2)}
        </div>
      </div>
    `}).join('');
  },

  renderCategories() {
    const container = document.getElementById('categoryList');
    const cats = dataStore.getIncomeByCategory();
    if (cats.length === 0) {
      container.innerHTML = '<div style="font-size:12px;color:var(--text-light);text-align:center;padding:16px 0;">暂无收入分类</div>';
      return;
    }
    const total = cats.reduce((s, c) => s + c.amount, 0);
    container.innerHTML = cats.slice(0, 6).map(cat => `
      <div class="category-item">
        <div class="cat-icon" style="background:rgba(0,255,179,0.12)">${cat.emoji}</div>
        <div class="cat-info">
          <div class="cat-name">${cat.name} <span style="color:var(--text-light);font-weight:400">${((cat.amount / total) * 100).toFixed(0)}%</span></div>
          <div class="cat-bar-wrap">
            <div class="cat-bar" style="width:${(cat.amount / total) * 100}%"></div>
          </div>
        </div>
        <div class="cat-amount" style="color:var(--success)">+¥${cat.amount.toFixed(2)}</div>
      </div>
    `).join('');
  },

  // 账户动态日志
  renderActivityLog() {
    const tbody = document.getElementById('recordsTableBody');
    const allBody = document.getElementById('allRecordsBody');

    const renderRow = (act) => {
      const d = act.data;
      const time = new Date(act.createdAt);
      const timeStr = `${time.getFullYear()}-${String(time.getMonth() + 1).padStart(2, '0')}-${String(time.getDate()).padStart(2, '0')} ${String(time.getHours()).padStart(2, '0')}:${String(time.getMinutes()).padStart(2, '0')}`;

      let tag = '';
      let tagClass = '';
      let amountStr = '';

      if (act.type === 'account_create') {
        tag = '◇ 新建账户';
        tagClass = 'type-create';
        amountStr = `<span style="color:var(--neon-cyan)">+¥${d.initialBalance?.toFixed(2) || '0.00'}</span>`;
      } else if (act.type === 'account_delete') {
        tag = '◇ 删除账户';
        tagClass = 'type-delete';
        amountStr = '';
      } else if (act.type === 'account_update') {
        tag = '✏️ 账户更新';
        tagClass = 'type-update';
        amountStr = '';
      } else if (act.type === 'income_add') {
        tag = '📈 收入登记';
        tagClass = 'type-income';
        amountStr = `<span style="color:var(--neon-cyan)">+¥${d.amount?.toFixed(2)}</span>`;
      }

      return `
      <tr>
        <td><span class="record-type-tag ${tagClass}">${tag}</span></td>
        <td style="font-weight:500">${d.description || '-'}</td>
        <td></td>
        <td style="color:var(--text-secondary);font-size:12px">${timeStr}</td>
        <td style="text-align:right;font-family:var(--font-mono)">${amountStr}</td>
      </tr>`;
    };

    const recent = dataStore.activityLog.slice(0, 20);
    tbody.innerHTML = recent.length > 0
      ? recent.map(renderRow).join('')
      : '<tr><td colspan="5" style="text-align:center;color:var(--text-light);padding:32px 0;">暂无动态记录</td></tr>';

    const allLogs = dataStore.activityLog;
    allBody.innerHTML = allLogs.length > 0
      ? allLogs.map(renderRow).join('')
      : '<tr><td colspan="5" style="text-align:center;color:var(--text-light);padding:32px 0;">暂无动态记录</td></tr>';
  },

  renderAccountsPage() {
    const accCountEl = document.getElementById('accountCount');
    const totalInitialEl = document.getElementById('totalInitial');
    const totalCurrentEl = document.getElementById('totalCurrent');
    const accountsListEl = document.getElementById('accountsList');
    const accountsListCountEl = document.getElementById('accountsListCount');

    if (accCountEl) accCountEl.textContent = dataStore.accounts.length;
    if (totalInitialEl) totalInitialEl.textContent = dataStore.getTotalInitialBalance().toFixed(2);
    if (totalCurrentEl) totalCurrentEl.textContent = dataStore.getTotalBalance().toFixed(2);
    if (accountsListCountEl) accountsListCountEl.textContent = `(${dataStore.accounts.length} 个账户)`;

    if (!accountsListEl) return;

    const colors = { debit: '#E8F5E9', credit: '#FCE4EC' };
    const typeNames = { debit: '储蓄账户', credit: '信用卡' };

    // 信用卡汇总
    const creditTotal = dataStore.accounts
      .filter(a => a.type === 'credit')
      .reduce((sum, acc) => {
        const bal = dataStore.getAccountBalanceAtDate(acc.id, new Date());
        return sum + bal;
      }, 0);

    accountsListEl.innerHTML = dataStore.accounts.length > 0
      ? dataStore.accounts.map((acc, idx) => {
          const currentBalance = dataStore.getAccountBalanceAtDate(acc.id, new Date());
          const displayBalance = acc.type === 'credit' ? -currentBalance : currentBalance;
          return `
        <div class="account-row" draggable="true" data-id="${acc.id}" data-sort="${acc.sortOrder}">
          <div class="drag-handle" title="拖动排序">⋮⋮</div>
          <div class="acc-icon" style="background:${colors[acc.type] || '#F5F5F5'};width:40px;height:40px;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:20px;flex-shrink:0;">${acc.emoji}</div>
          <div style="flex:1;min-width:0">
            <div style="font-weight:600;font-size:14px" id="accName_${acc.id}">${acc.name}</div>
            <div style="font-size:12px;color:var(--text-secondary)">${typeNames[acc.type] || '其他'} · 期初 ¥${(acc.initialBalance || 0).toFixed(2)}</div>
          </div>
          <div style="text-align:right;flex-shrink:0">
            <div style="font-weight:700;font-size:15px;color:${displayBalance >= 0 ? 'var(--success)' : 'var(--danger)'}">
              ${acc.type === 'credit' ? '-' : ''}¥${Math.abs(displayBalance).toFixed(2)}
            </div>
            <div style="margin-top:6px;display:flex;gap:6px;align-items:center;justify-content:flex-end;">
              <input type="number" id="updateInput_${acc.id}" placeholder="新余额" step="0.01" style="width:70px;padding:4px 6px;font-size:11px;border:1px solid var(--border);border-radius:4px;background:var(--input-bg);color:var(--text);text-align:right;">
              <button onclick="accountManager.updateBalance('${acc.id}')" style="padding:5px 10px;background:rgba(0,255,179,0.1);color:var(--neon-cyan);border:1px solid rgba(0,255,179,0.3);border-radius:6px;font-size:11px;cursor:pointer;">更新</button>
              <button onclick="accountManager.edit('${acc.id}')" id="editBtn_${acc.id}" style="padding:5px 8px;background:rgba(56,189,248,0.1);color:var(--primary);border:none;border-radius:6px;font-size:12px;cursor:pointer;">✏️</button>
              <button onclick="accountManager.delete('${acc.id}')" style="padding:5px 8px;background:rgba(229,115,115,0.1);color:var(--danger);border:none;border-radius:6px;font-size:12px;cursor:pointer;">🗑️</button>
            </div>
          </div>
        </div>
        `}).join('')
      : '<div class="empty-state"><div class="icon">💳</div><p>还没有账户</p></div>';

    // 绑定拖拽排序
    this.bindDragSort();
  },

  bindDragSort() {
    const list = document.getElementById('accountsList');
    if (!list) return;
    let dragSrcEl = null;

    list.querySelectorAll('.account-row').forEach(row => {
      row.addEventListener('dragstart', function(e) {
        dragSrcEl = this;
        this.style.opacity = '0.5';
        e.dataTransfer.effectAllowed = 'move';
      });
      row.addEventListener('dragend', function() {
        this.style.opacity = '1';
      });
      row.addEventListener('dragover', function(e) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
      });
      row.addEventListener('drop', function(e) {
        e.preventDefault();
        if (dragSrcEl && dragSrcEl !== this) {
          const all = [...list.querySelectorAll('.account-row')];
          const fromIdx = all.indexOf(dragSrcEl);
          const toIdx = all.indexOf(this);
          if (fromIdx < toIdx) {
            this.parentNode.insertBefore(dragSrcEl, this.nextSibling);
          } else {
            this.parentNode.insertBefore(dragSrcEl, this);
          }
          // 更新排序
          const newOrder = [...list.querySelectorAll('.account-row')].map(r => r.dataset.id);
          dataStore.updateAccountsOrder(newOrder);
          ui.render();
          if (githubAuth.token) syncManager.sync();
        }
      });
    });
  },

  renderBadge() {
    const count = dataStore.activityLog.length;
    document.getElementById('recordBadge').textContent = count;
  },

  renderForecast() {
    const now = new Date();
    const income = dataStore.getMonthlyIncome(now.getFullYear(), now.getMonth() + 1);
    const expense = dataStore.getMonthlyExpense(now.getFullYear(), now.getMonth() + 1);
    const forecast = income - expense;
    const el = document.getElementById('forecastValue');
    if (el) el.textContent = (forecast >= 0 ? '+' : '') + '¥' + forecast.toFixed(2);
    const sub = document.getElementById('forecastSub');
    if (sub) sub.textContent = `${now.getMonth() + 1}月预测结余`;
  },

  drawCharts() {
    setTimeout(() => {
      this.drawLineChart();
      this.drawBarChart();
    }, 100);
  },

  drawLineChart() {
    const canvas = document.getElementById('chartLine');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const data = dataStore.getHistoryData();
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = 200 * dpr;
    ctx.scale(dpr, dpr);
    const width = rect.width;
    const height = 200;

    ctx.clearRect(0, 0, width, height);

    if (data.length < 2) {
      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      ctx.font = '12px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillText('暂无足够数据', width / 2, height / 2);
      return;
    }

    const padding = { top: 20, bottom: 30, left: 50, right: 10 };
    const chartW = width - padding.left - padding.right;
    const chartH = height - padding.top - padding.bottom;

    const balances = data.map(d => d.totalAsset);
    const max = Math.max(...balances);
    const min = Math.min(...balances);
    const range = max - min || 1;

    ctx.fillStyle = 'rgba(0,255,179,0.01)';
    ctx.fillRect(padding.left, padding.top, chartW, chartH);

    // 绘制 Y 轴网格线 + 标签
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth = 1;
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';

    for (let i = 0; i <= 3; i++) {
      const y = padding.top + (chartH / 3) * i;
      const value = max - (range / 3) * i;
      // 网格线
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(width - padding.right, y);
      ctx.stroke();
      // Y 轴标签
      ctx.fillText('¥' + (value >= 10000 ? (value/10000).toFixed(1) + 'w' : value.toFixed(0)), padding.left - 6, y);
    }

    const points = data.map((d, i) => ({
      x: padding.left + (chartW / (data.length - 1)) * i,
      y: padding.top + chartH - ((d.totalAsset - min) / range) * chartH
    }));

    ctx.beginPath();
    ctx.moveTo(points[0].x, height - padding.bottom);
    points.forEach(p => ctx.lineTo(p.x, p.y));
    ctx.lineTo(points[points.length - 1].x, height - padding.bottom);
    ctx.closePath();
    ctx.fillStyle = 'rgba(0,255,179,0.08)';
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    points.forEach(p => ctx.lineTo(p.x, p.y));
    ctx.strokeStyle = '#00FFB3';
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.stroke();

    points.forEach(p => {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
      ctx.fillStyle = '#0A0A0A';
      ctx.fill();
      ctx.strokeStyle = '#00FFB3';
      ctx.lineWidth = 2;
      ctx.stroke();
    });

    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    data.forEach((d, i) => {
      const label = d.label.slice(5).replace('-', '/');
      ctx.fillText(label, points[i].x, height - 8);
    });
  },

  drawBarChart() {
    const canvas = document.getElementById('chartBar');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = 200 * dpr;
    ctx.scale(dpr, dpr);
    const width = rect.width;
    const height = 200;

    ctx.clearRect(0, 0, width, height);

    const now = new Date();
    const income = dataStore.getMonthlyIncome(now.getFullYear(), now.getMonth() + 1);
    const expense = dataStore.getMonthlyExpense(now.getFullYear(), now.getMonth() + 1);

    const padding = { top: 20, bottom: 30, left: 10, right: 10 };
    const chartW = width - padding.left - padding.right;
    const chartH = height - padding.top - padding.bottom;

    const max = Math.max(income, Math.abs(expense), 1);

    const barWidth = (chartW / 2) * 0.6;
    const incomeBarH = (income / max) * chartH;
    const expenseBarH = (Math.abs(expense) / max) * chartH;

    const incomeX = padding.left + chartW / 4 - barWidth / 2;
    const expenseX = padding.left + (chartW * 3) / 4 - barWidth / 2;

    ctx.fillStyle = 'rgba(0,255,179,0.9)';
    ctx.beginPath();
    ctx.roundRect(incomeX, padding.top + chartH - incomeBarH, barWidth, incomeBarH, 4);
    ctx.fill();

    ctx.fillStyle = 'rgba(255,46,99,0.9)';
    ctx.beginPath();
    ctx.roundRect(expenseX, padding.top + chartH - expenseBarH, barWidth, expenseBarH, 4);
    ctx.fill();

    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.font = '11px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('收入', padding.left + chartW / 4, height - 8);
    ctx.fillText('支出', padding.left + (chartW * 3) / 4, height - 8);

    ctx.font = 'bold 12px "Plus Jakarta Sans", sans-serif';
    ctx.fillStyle = '#00FFB3';
    ctx.fillText('¥' + income.toFixed(0), padding.left + chartW / 4, padding.top + chartH - incomeBarH - 10);
    ctx.fillStyle = '#FF2E63';
    ctx.fillText('¥' + Math.abs(expense).toFixed(0), padding.left + (chartW * 3) / 4, padding.top + chartH - expenseBarH - 10);
  },

  showToast(message) {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 2500);
  },

  setSyncing(syncing) {
    const dot = document.getElementById('syncDot');
    const icon = document.getElementById('syncIcon2');
    const text = document.getElementById('syncStatusText');
    if (syncing) {
      dot.classList.add('syncing');
      if (icon) icon.textContent = '⏳';
      if (text) text.textContent = '同步中...';
    } else {
      dot.classList.remove('syncing');
      if (icon) icon.textContent = '🔄';
      if (text) text.textContent = '已同步';
    }
  }
};

// ==================== 初始化 ====================
document.addEventListener('DOMContentLoaded', async () => {
  themeManager.init();
  dataStore.init();
  await githubAuth.init();
  if ('serviceWorker' in navigator) {
    const base = window.location.pathname.replace(/\/[^\/]*$/, '');
    navigator.serviceWorker.register(base + '/sw.js').catch(console.error);
  }
});

// 模态框点击背景关闭
document.querySelectorAll('.modal').forEach(modal => {
  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.classList.remove('active');
  });
});
