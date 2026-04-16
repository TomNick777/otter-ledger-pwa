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
  accounts: [],
  incomeRecords: [],
  transferRecords: [],
  expenses: [],

  init() {
    const saved = localStorage.getItem('otter-ledger-data');
    if (saved) {
      const data = JSON.parse(saved);
      this.accounts = data.accounts || [];
      this.incomeRecords = data.incomeRecords || [];
      this.transferRecords = data.transferRecords || [];
      this.expenses = data.expenses || [];
    }
    if (this.accounts.length === 0) {
      this.accounts = [
        { id: 'cash', name: '现金', type: 'cash', emoji: '💵', balance: 0, initialBalance: 0 },
        { id: 'bank', name: '银行卡', type: 'bank', emoji: '🏦', balance: 0, initialBalance: 0 }
      ];
      this.save();
    }
  },

  save() {
    localStorage.setItem('otter-ledger-data', JSON.stringify({
      accounts: this.accounts,
      incomeRecords: this.incomeRecords,
      transferRecords: this.transferRecords,
      expenses: this.expenses,
      lastModified: Date.now()
    }));
  },

  getTotalBalance() {
    return this.accounts.reduce((sum, acc) => sum + acc.balance, 0);
  },

  getTotalInitialBalance() {
    return this.accounts.reduce((sum, acc) => sum + (acc.initialBalance || 0), 0);
  },

  getMonthlyIncome(year, month) {
    const start = new Date(year, month - 1, 1);
    const end = new Date(year, month, 0);
    return this.incomeRecords
      .filter(r => {
        const d = new Date(r.date);
        return d >= start && d <= end;
      })
      .reduce((sum, r) => sum + r.totalAmount, 0);
  },

  getMonthlyExpense(year, month) {
    const start = new Date(year, month - 1, 1);
    const end = new Date(year, month, 0);
    return this.expenses
      .filter(r => {
        const d = new Date(r.date);
        return d >= start && d <= end;
      })
      .reduce((sum, r) => sum + r.amount, 0);
  },

  getHistoryData() {
    const months = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const year = d.getFullYear();
      const month = d.getMonth() + 1;
      const label = `${year}-${String(month).padStart(2, '0')}`;

      let balance = this.getTotalInitialBalance();
      const cutoff = new Date(year, month - 1, 1);

      this.incomeRecords
        .filter(r => new Date(r.date) < cutoff)
        .forEach(r => {
          r.toAccounts.forEach(ta => {
            const acc = this.accounts.find(a => a.id === ta.id);
            if (acc) {
              balance = acc.initialBalance || 0;
            }
          });
        });

      months.push({ label, balance, year, month });
    }
    // Calculate actual balances
    let runningBalance = this.getTotalInitialBalance();
    const history = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const year = d.getFullYear();
      const month = d.getMonth() + 1;
      const label = `${year}-${String(month).padStart(2, '0')}`;
      const monthEnd = new Date(year, month, 0);

      this.incomeRecords
        .filter(r => new Date(r.date) >= new Date(year, month - 1, 1) && new Date(r.date) <= monthEnd)
        .forEach(r => { r.toAccounts.forEach(ta => { runningBalance += ta.amount; }); });

      this.expenses
        .filter(r => new Date(r.date) >= new Date(year, month - 1, 1) && new Date(r.date) <= monthEnd)
        .forEach(r => { runningBalance -= r.amount; });

      history.push({ label, balance: runningBalance, year, month });
    }
    return history;
  },

  getExpenseByCategory() {
    const catMap = {};
    this.expenses.forEach(e => {
      const cat = e.category || '其他';
      catMap[cat] = (catMap[cat] || 0) + e.amount;
    });
    const catEmojis = { '餐饮': '🍜', '交通': '🚗', '购物': '🛒', '娱乐': '🎮', '居住': '🏠', '医疗': '💊', '教育': '📚', '其他': '📦' };
    return Object.entries(catMap)
      .map(([name, amount]) => ({ name, amount, emoji: catEmojis[name] || '📦' }))
      .sort((a, b) => b.amount - a.amount);
  },

  addIncome(record) {
    record.id = Date.now().toString();
    record.datetime = new Date().toISOString();
    this.incomeRecords.unshift(record);
    record.toAccounts.forEach(({ id, amount }) => {
      const acc = this.accounts.find(a => a.id === id);
      if (acc) acc.balance += amount;
    });
    this.save();
    return record;
  },

  addExpense(record) {
    record.id = 'exp_' + Date.now();
    record.datetime = new Date().toISOString();
    this.expenses.unshift(record);
    const acc = this.accounts.find(a => a.id === record.fromAccount);
    if (acc) acc.balance -= record.amount;
    this.save();
    return record;
  },

  addAccount(account) {
    account.id = 'acc_' + Date.now();
    account.balance = parseFloat(account.initialBalance) || 0;
    this.accounts.push(account);
    this.save();
    return account;
  },

  updateAccountBalance(id, newBalance) {
    const acc = this.accounts.find(a => a.id === id);
    if (acc) { acc.balance = newBalance; this.save(); }
  },

  deleteAccount(id) {
    this.accounts = this.accounts.filter(a => a.id !== id);
    this.save();
  },

  export() {
    return {
      accounts: this.accounts,
      incomeRecords: this.incomeRecords,
      transferRecords: this.transferRecords,
      expenses: this.expenses,
      exportTime: new Date().toISOString()
    };
  },

  import(data) {
    if (data.accounts) this.accounts = data.accounts;
    if (data.incomeRecords) this.incomeRecords = data.incomeRecords;
    if (data.transferRecords) this.transferRecords = data.transferRecords;
    if (data.expenses) this.expenses = data.expenses;
    this.save();
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
      document.getElementById('settingsUser').textContent = '👤 ' + this.user.login;
    }
    dataStore.init();
    ui.render();
  },

  logout() {
    if (!confirm('确定要退出登录吗？')) return;
    localStorage.removeItem('github-token');
    localStorage.removeItem('github-user');
    location.reload();
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
        await this.pushToGitHub({ accounts: dataStore.accounts, incomeRecords: [], transferRecords: [], expenses: [], version: '1.0' }, 'Initial data');
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
      dataStore.addIncome({
        totalAmount: amount,
        source: desc,
        date: date,
        toAccounts: [{ id: accountId, amount: amount }]
      });
      ui.showToast('收入已记录 ✓');
    } else {
      dataStore.addExpense({
        amount: amount,
        desc: desc,
        date: date,
        fromAccount: accountId,
        category: this.guessCategory(desc)
      });
      ui.showToast('支出已记录 ✓');
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
      cash: { emoji: '💵' }, bank: { emoji: '🏦' },
      alipay: { emoji: '💙' }, wechat: { emoji: '💚' },
      investment: { emoji: '📈' }, credit: { emoji: '💳' }, other: { emoji: '📦' }
    };
    dataStore.addAccount({ name, type, emoji: typeMap[type].emoji, initialBalance });
    ui.showToast('账户添加成功 ✓');
    document.getElementById('newAccountName').value = '';
    document.getElementById('newAccountInitialBalance').value = '0';
    pageManager.hideModal('accountModal');
    ui.render();
    if (githubAuth.token) syncManager.sync();
  },

  delete(id) {
    if (!confirm('确定要删除这个账户吗？')) return;
    dataStore.deleteAccount(id);
    ui.render();
    if (githubAuth.token) syncManager.sync();
  },

  quickUpdate(id) {
    const input = document.getElementById('balanceInput_' + id);
    if (!input) return;
    const newBalance = parseFloat(input.value);
    if (isNaN(newBalance)) return;
    dataStore.updateAccountBalance(id, newBalance);
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

    document.getElementById('statTotal').textContent = '¥' + balance.toFixed(2);
    document.getElementById('statIncome').textContent = '+¥' + income.toFixed(2);
    document.getElementById('statExpense').textContent = '-¥' + expense.toFixed(2);
    document.getElementById('statBalance').textContent = (balance2 >= 0 ? '+' : '') + '¥' + balance2.toFixed(2);

    // Sub texts
    document.getElementById('statIncomeSub').textContent = `${now.getMonth() + 1}月收入`;
    document.getElementById('statExpenseSub').textContent = `${now.getMonth() + 1}月支出`;
    document.getElementById('statBalanceSub').textContent = balance2 >= 0 ? '本月盈利' : '本月亏损';
    document.getElementById('statBalance').className = 'value ' + (balance2 >= 0 ? 'savings' : 'expense');
  },

  renderSidebarAccounts() {
    const container = document.getElementById('sidebarAccounts');
    const colors = { cash: '#E8F5E9', bank: '#E3F2FD', alipay: '#E1F5FE', wechat: '#E8F5E9', investment: '#FFF3E0', credit: '#FCE4EC', other: '#F5F5F5' };
    container.innerHTML = dataStore.accounts.map(acc => `
      <div class="account-item">
        <div class="acc-icon" style="background:${colors[acc.type] || '#F5F5F5'}">${acc.emoji}</div>
        <div class="acc-info">
          <div class="acc-name">${acc.name}</div>
          <div class="acc-type">${acc.type === 'bank' ? '银行卡' : acc.type === 'cash' ? '现金' : acc.type === 'alipay' ? '支付宝' : acc.type === 'wechat' ? '微信' : acc.type === 'investment' ? '投资' : acc.type === 'credit' ? '信用卡' : '其他'}</div>
        </div>
        <div class="acc-balance" style="color:${acc.balance >= 0 ? 'var(--text)' : 'var(--danger)'}">¥${acc.balance.toFixed(2)}</div>
      </div>
    `).join('');
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
    const records = [
      ...dataStore.expenses.map(e => ({ ...e, _type: 'expense', account: dataStore.accounts.find(a => a.id === e.fromAccount) })),
      ...dataStore.incomeRecords.map(r => ({ ...r, _type: 'income', account: dataStore.accounts.find(a => a.id === r.toAccounts[0]?.id) }))
    ].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 20);

    const tbody = document.getElementById('recordsTableBody');
    const allBody = document.getElementById('allRecordsBody');

    const renderRows = (data) => data.map(r => `
      <tr>
        <td><span class="record-type-tag ${r._type}">${r._type === 'income' ? '📈 收入' : '📉 支出'}</span></td>
        <td style="font-weight:500">${r._type === 'income' ? r.source : r.desc}</td>
        <td style="color:var(--text-secondary)">${r.account?.emoji || ''} ${r.account?.name || '-'}</td>
        <td style="color:var(--text-secondary);font-size:12px">${r.date}</td>
        <td style="text-align:right"><span class="amount-value ${r._type}">${r._type === 'income' ? '+' : '-'}¥${(r._type === 'income' ? r.totalAmount : r.amount).toFixed(2)}</span></td>
      </tr>
    `).join('');

    tbody.innerHTML = records.length > 0 ? renderRows(records) : '<tr><td colspan="5" style="text-align:center;color:var(--text-light);padding:32px 0;">暂无记录</td></tr>';

    const allRecords = [
      ...dataStore.expenses.map(e => ({ ...e, _type: 'expense', account: dataStore.accounts.find(a => a.id === e.fromAccount) })),
      ...dataStore.incomeRecords.map(r => ({ ...r, _type: 'income', account: dataStore.accounts.find(a => a.id === r.toAccounts[0]?.id) }))
    ].sort((a, b) => new Date(b.date) - new Date(a.date));

    allBody.innerHTML = allRecords.length > 0 ? renderRows(allRecords) : '<tr><td colspan="5" style="text-align:center;color:var(--text-light);padding:32px 0;">暂无记录</td></tr>';
  },

  renderAccountsPage() {
    document.getElementById('accountCount').textContent = dataStore.accounts.length;
    document.getElementById('totalInitial').textContent = dataStore.getTotalInitialBalance().toFixed(2);
    document.getElementById('totalCurrent').textContent = dataStore.getTotalBalance().toFixed(2);

    const colors = { cash: '#E8F5E9', bank: '#E3F2FD', alipay: '#E1F5FE', wechat: '#E8F5E9', investment: '#FFF3E0', credit: '#FCE4EC', other: '#F5F5F5' };
    document.getElementById('accountsList').innerHTML = dataStore.accounts.length > 0
      ? dataStore.accounts.map(acc => `
        <div style="display:flex;align-items:center;gap:14px;padding:14px 20px;border-bottom:1px solid var(--border);">
          <div class="acc-icon" style="background:${colors[acc.type] || '#F5F5F5'};width:40px;height:40px;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:20px;flex-shrink:0;">${acc.emoji}</div>
          <div style="flex:1">
            <div style="font-weight:600;font-size:14px">${acc.name}</div>
            <div style="font-size:12px;color:var(--text-secondary)">${acc.type === 'bank' ? '银行卡' : acc.type === 'cash' ? '现金' : acc.type === 'alipay' ? '支付宝' : acc.type === 'wechat' ? '微信' : acc.type === 'investment' ? '投资理财' : acc.type === 'credit' ? '信用卡' : '其他'}</div>
          </div>
          <div style="text-align:right">
            <div style="font-weight:700;font-size:15px;color:${acc.balance >= 0 ? 'var(--text)' : 'var(--danger)'}">¥${acc.balance.toFixed(2)}</div>
            <div style="margin-top:6px;display:flex;gap:6px;align-items:center;">
              <input type="number" step="0.01" id="balanceInput_${acc.id}" placeholder="新余额" style="width:90px;padding:5px 8px;border:1.5px solid var(--border);border-radius:6px;font-size:12px;">
              <button onclick="accountManager.quickUpdate('${acc.id}')" style="padding:5px 10px;background:var(--primary);color:white;border:none;border-radius:6px;font-size:12px;cursor:pointer;">更新</button>
              <button onclick="accountManager.delete('${acc.id}')" style="padding:5px 8px;background:rgba(229,115,115,0.1);color:var(--danger);border:none;border-radius:6px;font-size:12px;cursor:pointer;">🗑️</button>
            </div>
          </div>
        </div>
      `).join('')
      : '<div class="empty-state"><div class="icon">💳</div><p>还没有账户</p></div>';
  },

  renderBadge() {
    const count = dataStore.incomeRecords.length + dataStore.expenses.length;
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
      ctx.fillStyle = '#A0A0A0';
      ctx.font = '13px Inter, sans-serif';
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
    ctx.fillStyle = 'rgba(232,168,124,0.04)';
    ctx.fillRect(padding.left, padding.top, chartW, chartH);

    // 网格
    ctx.strokeStyle = 'rgba(0,0,0,0.05)';
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
    ctx.fillStyle = 'rgba(232,168,124,0.15)';
    ctx.fill();

    // 线条
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    points.forEach(p => ctx.lineTo(p.x, p.y));
    ctx.strokeStyle = '#E8A87C';
    ctx.lineWidth = 2.5;
    ctx.lineJoin = 'round';
    ctx.stroke();

    // 点
    points.forEach(p => {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
      ctx.fillStyle = '#fff';
      ctx.fill();
      ctx.strokeStyle = '#E8A87C';
      ctx.lineWidth = 2;
      ctx.stroke();
    });

    // X轴
    ctx.fillStyle = '#7A7A7A';
    ctx.font = '11px Inter, sans-serif';
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
    ctx.fillStyle = 'rgba(109,190,109,0.8)';
    ctx.beginPath();
    ctx.roundRect(incomeX, padding.top + chartH - incomeBarH, barWidth, incomeBarH, 6);
    ctx.fill();

    // 支出柱
    ctx.fillStyle = 'rgba(229,115,115,0.8)';
    ctx.beginPath();
    ctx.roundRect(expenseX, padding.top + chartH - expenseBarH, barWidth, expenseBarH, 6);
    ctx.fill();

    // 标签
    ctx.fillStyle = '#7A7A7A';
    ctx.font = '11px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('收入', padding.left + chartW / 4, height - 8);
    ctx.fillText('支出', padding.left + (chartW * 3) / 4, height - 8);

    // 数值
    ctx.font = 'bold 12px Inter, sans-serif';
    ctx.fillStyle = '#6DBE6D';
    ctx.fillText('¥' + income.toFixed(0), padding.left + chartW / 4, padding.top + chartH - incomeBarH - 8);
    ctx.fillStyle = '#E57373';
    ctx.fillText('¥' + expense.toFixed(0), padding.left + (chartW * 3) / 4, padding.top + chartH - expenseBarH - 8);
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
