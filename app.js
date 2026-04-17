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
// 数据结构完全按 DESIGN.md 设计文档实现
const dataStore = {
  // 账户表 - 存储账户基本信息
  accounts: [],
  // 余额快照表 - 每月末的账户余额记录
  balanceSnapshots: [],
  // 收入记录表 - 日常收入
  incomeRecords: [],
  // 转账记录表 - 账户间转账
  transferRecords: [],

  init() {
    const saved = localStorage.getItem('otter-ledger-data');
    console.log('[init] localStorage 原始数据:', saved ? JSON.parse(saved) : null);
    this.accounts = [];
    this.balanceSnapshots = [];
    this.incomeRecords = [];
    this.transferRecords = [];
    if (saved) {
      const data = JSON.parse(saved);
      // 兼容旧版本迁移
      this.accounts = data.accounts || [];
      this.balanceSnapshots = data.balanceSnapshots || [];
      this.incomeRecords = data.incomeRecords || data.incomeRecords || [];
      this.transferRecords = data.transferRecords || [];
      // 旧版 expenses 废弃，转账记录包含在 transferRecords 中
    }
    console.log('[init] this.accounts 加载后:', this.accounts, '长度:', this.accounts.length);
    if (this.accounts.length === 0) {
      // 创建默认账户（储蓄卡类型）
      this.accounts = [
        { id: 'acc_1', name: '现金', type: 'debit', emoji: '💵', initialBalance: 0, createdAt: new Date().toISOString().split('T')[0] },
        { id: 'acc_2', name: '银行卡', type: 'debit', emoji: '🏦', initialBalance: 0, createdAt: new Date().toISOString().split('T')[0] }
      ];
      console.log('[init] 创建默认账户，保存...');
      this.save();
      console.log('[init] 保存后 localStorage:', localStorage.getItem('otter-ledger-data'));
    }
  },

  save() {
    localStorage.setItem('otter-ledger-data', JSON.stringify({
      accounts: this.accounts,
      balanceSnapshots: this.balanceSnapshots,
      incomeRecords: this.incomeRecords,
      transferRecords: this.transferRecords,
      lastModified: Date.now()
    }));
  },

  // 获取某日期的账户余额（优先用快照，没有则用初始余额）
  getAccountBalanceAtDate(accountId, date) {
    const account = this.accounts.find(a => a.id === accountId);
    if (!account) return 0;
    
    const dateStr = typeof date === 'string' ? date : date.toISOString().split('T')[0];
    const snapshots = this.balanceSnapshots
      .filter(s => s.accountId === accountId && s.snapshotDate <= dateStr)
      .sort((a, b) => b.snapshotDate.localeCompare(a.snapshotDate));
    
    if (snapshots.length > 0) {
      return snapshots[0].balance;
    }
    // 没有快照时，使用初始余额
    return account.initialBalance;
  },

  // 计算某日期的总资产
  // 总资产 = Σ(储蓄卡余额) - Σ(信用卡欠款)
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
  // 支出 = 期初资产 + 本月收入 - 期末资产
  getMonthlyExpense(year, month) {
    // 期初：上月末
    const prevMonth = month === 1 ? 12 : month - 1;
    const prevYear = month === 1 ? year - 1 : year;
    const prevMonthEnd = new Date(prevYear, prevMonth, 0).toISOString().split('T')[0];
    
    // 期末：本月末
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
    this.accounts.push(account);
    this.save();
    return account;
  },

  // 更新账户初始余额
  updateAccountInitialBalance(id, newInitialBalance) {
    const acc = this.accounts.find(a => a.id === id);
    if (acc) {
      acc.initialBalance = parseFloat(newInitialBalance);
      this.save();
    }
  },

  // 删除账户
  deleteAccount(id) {
    this.accounts = this.accounts.filter(a => a.id !== id);
    this.save();
  },

  // 添加余额快照（月末盘点）
  addSnapshot(accountId, snapshotDate, balance) {
    // 检查是否已有该账户在该日期的快照，有则更新，无则新增
    const existing = this.balanceSnapshots.find(
      s => s.accountId === accountId && s.snapshotDate === snapshotDate
    );
    if (existing) {
      existing.balance = balance;
      existing.updatedAt = Date.now();
    } else {
      this.balanceSnapshots.push({
        id: 'snap_' + Date.now(),
        accountId,
        snapshotDate,
        balance,
        createdAt: Date.now()
      });
    }
    this.save();
  },

  // 获取账户的所有快照
  getAccountSnapshots(accountId) {
    return this.balanceSnapshots
      .filter(s => s.accountId === accountId)
      .sort((a, b) => b.snapshotDate.localeCompare(a.snapshotDate));
  },

  // 添加收入记录
  addIncomeRecord(record) {
    record.id = 'inc_' + Date.now();
    record.date = record.date || new Date().toISOString().split('T')[0];
    record.amount = parseFloat(record.amount) || 0;
    record.category = record.category || '其他';
    this.incomeRecords.unshift(record);
    this.save();
    return record;
  },

  // 添加转账记录
  addTransferRecord(record) {
    record.id = 'trans_' + Date.now();
    record.date = record.date || new Date().toISOString().split('T')[0];
    record.amount = parseFloat(record.amount) || 0;
    this.transferRecords.unshift(record);
    this.save();
    return record;
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

  // 兼容旧版本的接口（过渡用）
  getTotalBalance() {
    // 总资产 = 储蓄账户总资产 - 信用卡总欠款
    const now = new Date();
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];
    return this.getTotalAssetAtDate(monthEnd);
  },

  getTotalInitialBalance() {
    return this.accounts.reduce((sum, acc) => sum + (acc.initialBalance || 0), 0);
  },

  getMonthlyExpenseOld(year, month) {
    const start = new Date(year, month - 1, 1);
    const end = new Date(year, month, 0);
    // 兼容旧版 expenses 表
    return 0;
  },

  getHistoryDataOld() {
    return this.getHistoryData(6);
  },

  getExpenseByCategory() {
    return [];
  }
};

// ==================== GitHub 认证 ====================
const githubAuth = {
  token: null,
  user: null,

  init() {
    this.token = localStorage.getItem('github-token');
    this.user = JSON.parse(localStorage.getItem('github-user') || 'null');
    if (this.token && this.user) this.showApp();
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
      this.showApp();
      await syncManager.initRepo();
      await syncManager.sync();
    } catch (err) { ui.showToast('登录失败：' + err.message); }
  },

  showApp() {
    document.getElementById('loginPage').style.display = 'none';
    document.getElementById('app').classList.add('show');
    if (this.user) {
      document.getElementById('sidebarUserName').textContent = this.user.login;
      document.getElementById('settingsUser').textContent = 'GitHub: ' + this.user.login;
    }
    dataStore.init();
    ui.render();
    // 确保主题开关图标同步
    const current = document.documentElement.getAttribute('data-theme') || 'dark';
    const switchIcon = document.getElementById('themeSwitchIcon');
    if (switchIcon) switchIcon.textContent = current === 'dark' ? '☀️' : '🌙';
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
    
    // Update all theme icons
    const icons = document.querySelectorAll('.theme-icon');
    icons.forEach(icon => {
      icon.textContent = theme === 'dark' ? '☀️' : '🌙';
    });
    
    // Update theme switch icon
    const switchIcon = document.getElementById('themeSwitchIcon');
    if (switchIcon) {
      switchIcon.textContent = theme === 'dark' ? '☀️' : '🌙';
    }
    
    // Update meta theme-color
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
        await this.pushToGitHub({ 
          accounts: dataStore.accounts, 
          balanceSnapshots: dataStore.balanceSnapshots,
          incomeRecords: dataStore.incomeRecords, 
          transferRecords: [], 
          version: '2.0' 
        }, 'Initial data');
      }
    } catch (err) { console.error('Init repo error:', err); }
  },

  async sync() {
    if (this.syncing) return;
    this.syncing = true;
    ui.setSyncing(true);
    try {
      const cloudData = await this.pullFromGitHub();
      if (cloudData && cloudData.lastModified) {
        const localData = dataStore.export();
        const merged = this.mergeData(localData, cloudData);
        dataStore.import(merged);
        await this.pushToGitHub(merged, `Sync ${new Date().toLocaleString('zh-CN')}`);
      }
      ui.render();
      ui.showToast('同步完成 ✓');
    } catch (err) { ui.showToast('同步失败'); }
    finally { this.syncing = false; ui.setSyncing(false); }
  },

  async pullFromGitHub() {
    try {
      const res = await fetch(`https://api.github.com/repos/${githubAuth.user.login}/${CONFIG.REPO_NAME}/contents/${CONFIG.DATA_FILE}`, {
        headers: { 'Authorization': `token ${githubAuth.token}` }
      });
      if (res.status === 404) return null;
      const file = await res.json();
      return JSON.parse(atob(file.content));
    } catch (err) { return null; }
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
    return (cloud.lastModified || 0) > (local.lastModified || 0) ? cloud : local;
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
    this.showAddType('income');
    document.getElementById('addModal').classList.add('active');
    document.getElementById('addDate').valueAsDate = new Date();
    addManager.initAccount();
  },

  showAddType(type) {
    document.getElementById('addType').value = type;
    const tabIncome = document.getElementById('tabIncome');
    const tabExpense = document.getElementById('tabExpense');
    const sourceGroup = document.getElementById('sourceGroup');
    const label = sourceGroup.querySelector('label');
    const input = document.getElementById('addDesc');
    const submitBtn = document.getElementById('addSubmitBtn');

    if (type === 'income') {
      tabIncome.style.background = 'var(--success)';
      tabIncome.style.color = 'white';
      tabExpense.style.background = 'var(--bg-warm)';
      tabExpense.style.color = 'var(--text)';
      label.textContent = '来源';
      input.placeholder = '工资、奖金、投资收益...';
      submitBtn.style.background = 'var(--success)';
    } else {
      tabExpense.style.background = 'var(--danger)';
      tabExpense.style.color = 'white';
      tabIncome.style.background = 'var(--bg-warm)';
      tabIncome.style.color = 'var(--text)';
      label.textContent = '说明';
      input.placeholder = '午餐、购物、交通...';
      submitBtn.style.background = 'var(--danger)';
    }
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
    const type = document.getElementById('addType').value;
    const amount = parseFloat(document.getElementById('addAmount').value);
    const desc = document.getElementById('addDesc').value;
    const date = document.getElementById('addDate').value;
    const accountId = document.getElementById('addAccount').value;

    if (!amount || amount <= 0) { ui.showToast('请输入有效金额'); return; }

    if (type === 'income') {
      dataStore.addIncomeRecord({
        amount: amount,
        source: desc,
        date: date,
        category: this.guessCategory(desc)
      });
      ui.showToast('收入已记录 ✓');
    } else {
      // 按 DESIGN.md：不直接记录支出，通过反推计算
      // 这里暂时不做任何操作
      ui.showToast('请使用快照记录月末余额 ✓');
    }

    pageManager.hideModal('addModal');
    document.getElementById('addForm').reset();
    ui.render();
    if (githubAuth.token) syncManager.sync();
  },

  guessCategory(desc) {
    const keywords = {
      '餐饮': ['餐饮', '午餐', '晚餐', '早餐', '吃饭', '外卖', '食堂', '美食', '咖啡'],
      '交通': ['交通', '打车', '地铁', '公交', '停车', '油费', '过路'],
      '购物': ['购物', '衣服', '鞋', '包', '日用品', '超市'],
      '娱乐': ['电影', '游戏', '娱乐', 'KTV', '酒吧', '旅游'],
      '居住': ['房租', '水电', '物业', '居住'],
      '医疗': ['医疗', '医院', '药品', '看病', '医保'],
      '教育': ['教育', '培训', '课程', '学费', '书籍']
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
    
    console.log('[accountManager.add] 添加账户:', { name, type, initialBalance });
    const newAcc = dataStore.addAccount({ name, type, emoji: typeMap[type].emoji, initialBalance });
    console.log('[accountManager.add] 添加后 accounts:', dataStore.accounts);
    console.log('[accountManager.add] localStorage:', localStorage.getItem('otter-ledger-data'));
    ui.showToast('账户添加成功 ✓');
    document.getElementById('newAccountName').value = '';
    document.getElementById('newAccountInitialBalance').value = '0';
    pageManager.hideModal('accountModal');
    console.log('[accountManager.add] 调用 ui.render()...');
    ui.render();
    console.log('[accountManager.add] ui.render() 完成');
    addManager.initAccount(); // 更新账户选择下拉框
    if (githubAuth.token) syncManager.sync();
  },

  edit(id) {
    const acc = dataStore.accounts.find(a => a.id === id);
    if (!acc) return;
    const nameEl = document.getElementById('accName_' + id);
    const editBtn = document.getElementById('editBtn_' + id);
    if (!nameEl || !editBtn) return;
    
    // 将账户名改为输入框
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
    acc.name = newName;
    dataStore.save();
    ui.render();
    if (githubAuth.token) syncManager.sync();
  },

  delete(id) {
    if (!confirm('确定要删除这个账户吗？')) return;
    dataStore.deleteAccount(id);
    ui.render();
    if (githubAuth.token) syncManager.sync();
  },

  quickSnapshot(id, snapshotDate) {
    const input = document.getElementById('balanceInput_' + id);
    if (!input) return;
    const newBalance = parseFloat(input.value);
    if (isNaN(newBalance)) { ui.showToast('请输入有效金额'); return; }
    
    // 添加月末快照
    dataStore.addSnapshot(id, snapshotDate, newBalance);
    ui.showToast('快照已保存 ✓');
    ui.render();
    if (githubAuth.token) syncManager.sync();
  },
  
  quickUpdate(id) {
    // 兼容旧版本：直接更新账户余额（不推荐，建议用快照）
    const input = document.getElementById('balanceInput_' + id);
    if (!input) return;
    const newBalance = parseFloat(input.value);
    if (isNaN(newBalance)) return;
    
    const now = new Date();
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];
    dataStore.addSnapshot(id, monthEnd, newBalance);
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
    this.renderRecords();
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

    setIfExists('statTotal', '¥' + balance.toFixed(2));
    setIfExists('statIncome', '+¥' + income.toFixed(2));
    setIfExists('statExpense', '-¥' + expense.toFixed(2));
    setIfExists('statBalance', (balance2 >= 0 ? '+' : '') + '¥' + balance2.toFixed(2));

    // Sub texts (optional elements, may not exist in all layouts)
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
      const balance = acc.balance ?? acc.initialBalance ?? 0;
      return `
      <div class="account-item">
        <div class="acc-icon" style="background:${colors[acc.type] || '#F5F5F5'}">${acc.emoji}</div>
        <div class="acc-info">
          <div class="acc-name">${acc.name}</div>
          <div class="acc-type">${acc.type === 'debit' ? '储蓄账户' : '信用卡'}</div>
        </div>
        <div class="acc-balance" style="color:${balance >= 0 ? 'var(--text)' : 'var(--danger)'}">¥${balance.toFixed(2)}</div>
      </div>
    `}).join('');
  },

  renderCategories() {
    const container = document.getElementById('categoryList');
    const cats = dataStore.getExpenseByCategory();
    const total = cats.reduce((s, c) => s + c.amount, 0);
    if (cats.length === 0) {
      container.innerHTML = '<div style="font-size:12px;color:var(--text-light);text-align:center;padding:16px 0;">暂无支出记录</div>';
      return;
    }
    container.innerHTML = cats.slice(0, 6).map(cat => `
      <div class="category-item">
        <div class="cat-icon" style="background:rgba(232,168,124,0.12)">${cat.emoji}</div>
        <div class="cat-info">
          <div class="cat-name">${cat.name} <span style="color:var(--text-light);font-weight:400">${((cat.amount / total) * 100).toFixed(0)}%</span></div>
          <div class="cat-bar-wrap">
            <div class="cat-bar" style="width:${(cat.amount / total) * 100}%"></div>
          </div>
        </div>
        <div class="cat-amount" style="color:var(--danger)">-¥${cat.amount.toFixed(2)}</div>
      </div>
    `).join('');
  },

  renderRecords() {
    // 根据 DESIGN.md：只记录收入，支出通过"期初资产 + 收入 - 期末资产"反推
    const records = [
      ...dataStore.incomeRecords.map(r => ({ ...r, _type: 'income', account: dataStore.accounts.find(a => a.id === r.toAccounts[0]?.id) }))
    ].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 20);

    const tbody = document.getElementById('recordsTableBody');
    const allBody = document.getElementById('allRecordsBody');

    const renderRows = (data) => data.map(r => `
      <tr>
        <td><span class="record-type-tag ${r._type}">📈 收入</span></td>
        <td style="font-weight:500">${r.source}</td>
        <td style="color:var(--text-secondary)">${r.account?.emoji || ''} ${r.account?.name || '-'}</td>
        <td style="color:var(--text-secondary);font-size:12px">${r.date}</td>
        <td style="text-align:right"><span class="amount-value ${r._type}">+¥${r.totalAmount.toFixed(2)}</span></td>
      </tr>
    `).join('');

    tbody.innerHTML = records.length > 0 ? renderRows(records) : '<tr><td colspan="5" style="text-align:center;color:var(--text-light);padding:32px 0;">暂无收入记录</td></tr>';

    const allRecords = [
      ...dataStore.incomeRecords.map(r => ({ ...r, _type: 'income', account: dataStore.accounts.find(a => a.id === r.toAccounts[0]?.id) }))
    ].sort((a, b) => new Date(b.date) - new Date(a.date));

    allBody.innerHTML = allRecords.length > 0 ? renderRows(allRecords) : '<tr><td colspan="5" style="text-align:center;color:var(--text-light);padding:32px 0;">暂无收入记录</td></tr>';
  },

  renderAccountsPage() {
    console.log('[renderAccountsPage] ===== 开始渲染 =====');
    console.log('[renderAccountsPage] dataStore.accounts:', dataStore.accounts);
    const accCountEl = document.getElementById('accountCount');
    const totalInitialEl = document.getElementById('totalInitial');
    const totalCurrentEl = document.getElementById('totalCurrent');
    const accountsListEl = document.getElementById('accountsList');
    const accountsListCountEl = document.getElementById('accountsListCount');
    
    console.log('[renderAccountsPage] 元素:', { 
      accCountEl: !!accCountEl, 
      totalInitialEl: !!totalInitialEl,
      totalCurrentEl: !!totalCurrentEl,
      accountsListEl: !!accountsListEl,
      accountsListCountEl: !!accountsListCountEl
    });
    if (accCountEl) accCountEl.textContent = dataStore.accounts.length;
    if (totalInitialEl) totalInitialEl.textContent = dataStore.getTotalInitialBalance().toFixed(2);
    if (totalCurrentEl) totalCurrentEl.textContent = dataStore.getTotalAssetAtDate(new Date()).toFixed(2);
    if (accountsListCountEl) accountsListCountEl.textContent = `(${dataStore.accounts.length} 个账户)`;

    if (!accountsListEl) return;
    
    const colors = { debit: '#E8F5E9', credit: '#FCE4EC' };
    const typeNames = { debit: '储蓄账户', credit: '信用卡' };
    
    // 获取本月末日期
    const now = new Date();
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];
    
    accountsListEl.innerHTML = dataStore.accounts.length > 0
      ? dataStore.accounts.map(acc => {
          // 从快照获取当前余额，没有则用初始余额
          const currentBalance = dataStore.getAccountBalanceAtDate(acc.id, monthEnd);
          return `
        <div style="display:flex;align-items:center;gap:14px;padding:14px 20px;border-bottom:1px solid var(--border);">
          <div class="acc-icon" style="background:${colors[acc.type] || '#F5F5F5'};width:40px;height:40px;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:20px;flex-shrink:0;">${acc.emoji}</div>
          <div style="flex:1">
            <div style="font-weight:600;font-size:14px" id="accName_${acc.id}">${acc.name}</div>
            <div style="font-size:12px;color:var(--text-secondary)">${typeNames[acc.type] || '其他'} · 期初 ¥${(acc.initialBalance || 0).toFixed(2)}</div>
          </div>
          <div style="text-align:right">
            <div style="font-weight:700;font-size:15px;color:${currentBalance >= 0 ? 'var(--text)' : 'var(--danger)'}">¥${currentBalance.toFixed(2)}</div>
            <div style="margin-top:6px;display:flex;gap:6px;align-items:center;">
              <button onclick="accountManager.edit('${acc.id}')" id="editBtn_${acc.id}" style="padding:5px 10px;background:rgba(56,189,248,0.1);color:var(--primary);border:none;border-radius:6px;font-size:12px;cursor:pointer;">✏️ 编辑</button>
              <input type="number" step="0.01" id="balanceInput_${acc.id}" placeholder="月末余额" style="width:80px;padding:5px 8px;border:1.5px solid var(--border);border-radius:6px;font-size:12px;">
              <button onclick="accountManager.quickSnapshot('${acc.id}', '${monthEnd}')" style="padding:5px 10px;background:var(--primary);color:white;border:none;border-radius:6px;font-size:12px;cursor:pointer;">📸 快照</button>
              <button onclick="accountManager.delete('${acc.id}')" style="padding:5px 8px;background:rgba(229,115,115,0.1);color:var(--danger);border:none;border-radius:6px;font-size:12px;cursor:pointer;">🗑️</button>
            </div>
          </div>
        </div>
        `}).join('')
      : '<div class="empty-state"><div class="icon">💳</div><p>还没有账户</p></div>';
  },

  renderBadge() {
    // 只统计收入记录（按 DESIGN.md）
    const count = dataStore.incomeRecords.length;
    document.getElementById('recordBadge').textContent = count;
  },

  renderForecast() {
    const now = new Date();
    const income = dataStore.getMonthlyIncome(now.getFullYear(), now.getMonth() + 1);
    const expense = dataStore.getMonthlyExpense(now.getFullYear(), now.getMonth() + 1);
    const forecast = income - expense;
    document.getElementById('forecastValue').textContent = (forecast >= 0 ? '+' : '') + '¥' + forecast.toFixed(2);
    document.getElementById('forecastSub').textContent = `${now.getMonth() + 1}月预测结余`;
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

    const padding = { top: 20, bottom: 30, left: 10, right: 10 };
    const chartW = width - padding.left - padding.right;
    const chartH = height - padding.top - padding.bottom;

    const balances = data.map(d => d.balance);
    const max = Math.max(...balances);
    const min = Math.min(...balances);
    const range = max - min || 1;

    // 背景
    ctx.fillStyle = 'rgba(0,255,179,0.01)';
    ctx.fillRect(padding.left, padding.top, chartW, chartH);

    // 网格
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 3; i++) {
      const y = padding.top + (chartH / 3) * i;
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(width - padding.right, y);
      ctx.stroke();
    }

    // 折线点
    const points = data.map((d, i) => ({
      x: padding.left + (chartW / (data.length - 1)) * i,
      y: padding.top + chartH - ((d.balance - min) / range) * chartH
    }));

    // 填充
    ctx.beginPath();
    ctx.moveTo(points[0].x, height - padding.bottom);
    points.forEach(p => ctx.lineTo(p.x, p.y));
    ctx.lineTo(points[points.length - 1].x, height - padding.bottom);
    ctx.closePath();
    ctx.fillStyle = 'rgba(0,255,179,0.08)';
    ctx.fill();

    // 线条
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    points.forEach(p => ctx.lineTo(p.x, p.y));
    ctx.strokeStyle = '#00FFB3';
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.stroke();

    // 点
    points.forEach(p => {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
      ctx.fillStyle = '#0A0A0A';
      ctx.fill();
      ctx.strokeStyle = '#00FFB3';
      ctx.lineWidth = 2;
      ctx.stroke();
    });

    // X轴
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

    const max = Math.max(income, expense, 1);

    // 收入柱
    const barWidth = (chartW / 2) * 0.6;
    const incomeBarH = (income / max) * chartH;
    const expenseBarH = (expense / max) * chartH;

    const incomeX = padding.left + chartW / 4 - barWidth / 2;
    const expenseX = padding.left + (chartW * 3) / 4 - barWidth / 2;

    // 收入柱
    ctx.fillStyle = 'rgba(0,255,179,0.9)';
    ctx.beginPath();
    ctx.roundRect(incomeX, padding.top + chartH - incomeBarH, barWidth, incomeBarH, 4);
    ctx.fill();

    // 支出柱
    ctx.fillStyle = 'rgba(255,46,99,0.9)';
    ctx.beginPath();
    ctx.roundRect(expenseX, padding.top + chartH - expenseBarH, barWidth, expenseBarH, 4);
    ctx.fill();

    // 标签
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.font = '11px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('收入', padding.left + chartW / 4, height - 8);
    ctx.fillText('支出', padding.left + (chartW * 3) / 4, height - 8);

    // 数值
    ctx.font = 'bold 12px "Plus Jakarta Sans", sans-serif';
    ctx.fillStyle = '#00FFB3';
    ctx.fillText('¥' + income.toFixed(0), padding.left + chartW / 4, padding.top + chartH - incomeBarH - 10);
    ctx.fillStyle = '#FF2E63';
    ctx.fillText('¥' + expense.toFixed(0), padding.left + (chartW * 3) / 4, padding.top + chartH - expenseBarH - 10);
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
      icon.textContent = '⏳';
      text.textContent = '同步中...';
    } else {
      dot.classList.remove('syncing');
      icon.textContent = '🔄';
      text.textContent = '已同步';
    }
  }
};

// ==================== 初始化 ====================
document.addEventListener('DOMContentLoaded', () => {
  themeManager.init(); // 初始化主题
  dataStore.init();
  githubAuth.init();
  if ('serviceWorker' in navigator) {
    const base = window.location.pathname.replace(/\/[^/]*$/, '');
    navigator.serviceWorker.register(base + '/sw.js').catch(console.error);
  }
});

// 模态框点击背景关闭
document.querySelectorAll('.modal').forEach(modal => {
  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.classList.remove('active');
  });
});
