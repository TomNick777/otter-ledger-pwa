/**
 * 海獭账本 PWA
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
            balance += ta.amount;
          });
        });
      
      this.expenses
        .filter(r => new Date(r.date) < cutoff)
        .forEach(r => {
          balance -= r.amount;
        });
      
      months.push({ label, balance, year, month });
    }
    return months;
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
    if (acc) {
      const diff = newBalance - acc.balance;
      acc.balance = newBalance;
      this.save();
      return diff;
    }
    return 0;
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
    document.getElementById('app').style.display = 'block';
    document.getElementById('githubUser').textContent = this.user?.login || '已登录';
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
    ui.showToast('同步中...');
    try {
      const cloudData = await this.pullFromGitHub();
      const localData = dataStore.export();
      const merged = this.mergeData(localData, cloudData);
      dataStore.import(merged);
      await this.pushToGitHub(merged, `Sync from ${new Date().toLocaleString('zh-CN')}`);
      ui.render();
      ui.showToast('同步成功！');
    } catch (err) { ui.showToast('同步失败：' + err.message); }
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
  currentPage: 'home',

  switchPage(page) {
    this.currentPage = page;
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.page').forEach(el => el.classList.remove('active'));
    const navMap = { home: 0, records: 1, settings: 2 };
    document.querySelectorAll('.nav-item')[navMap[page]].classList.add('active');
    document.getElementById('page' + page.charAt(0).toUpperCase() + page.slice(1)).classList.add('active');
    if (page === 'home') ui.drawChart();
    ui.render();
  },

  showModal(id) {
    document.getElementById(id).classList.add('active');
    if (id === 'incomeModal') {
      incomeManager.initDistribution();
      document.getElementById('incomeDate').valueAsDate = new Date();
    }
    if (id === 'expenseModal') {
      expenseManager.init();
      document.getElementById('expenseDate').valueAsDate = new Date();
    }
    if (id === 'accountModal') {
      ui.renderManageAccounts();
    }
  },

  hideModal(id) {
    document.getElementById(id).classList.remove('active');
  }
};

// ==================== 收入管理 ====================
const incomeManager = {
  initDistribution() {
    const list = document.getElementById('distributionList');
    list.innerHTML = dataStore.accounts.map(acc => `
      <div class="distribution-item">
        <span class="account-name">${acc.emoji} ${acc.name}</span>
        <input type="number" step="0.01" placeholder="0.00" data-account="${acc.id}" class="dist-input">
      </div>
    `).join('');
    document.getElementById('incomeAmount').oninput = () => this.autoDistribute();
  },

  autoDistribute() {
    const total = parseFloat(document.getElementById('incomeAmount').value) || 0;
    const inputs = document.querySelectorAll('.dist-input');
    if (inputs.length === 0) return;
    const perAccount = (total / inputs.length).toFixed(2);
    inputs.forEach(input => { input.value = perAccount; });
  },

  submit(e) {
    e.preventDefault();
    const totalAmount = parseFloat(document.getElementById('incomeAmount').value);
    const source = document.getElementById('incomeSource').value;
    const date = document.getElementById('incomeDate').value;
    const toAccounts = [];
    document.querySelectorAll('.dist-input').forEach(input => {
      const amount = parseFloat(input.value) || 0;
      if (amount > 0) toAccounts.push({ id: input.dataset.account, amount });
    });
    if (toAccounts.length === 0) { ui.showToast('请至少分配到一个账户'); return; }
    dataStore.addIncome({ totalAmount, source, date, toAccounts });
    ui.showToast('记录成功！');
    pageManager.hideModal('incomeModal');
    document.getElementById('incomeForm').reset();
    ui.render();
    if (githubAuth.token) syncManager.sync();
  }
};

// ==================== 支出管理 ====================
const expenseManager = {
  init() {
    const sel = document.getElementById('expenseAccount');
    sel.innerHTML = dataStore.accounts.map(a =>
      `<option value="${a.id}">${a.emoji} ${a.name}</option>`
    ).join('');
  },

  submit(e) {
    e.preventDefault();
    const amount = parseFloat(document.getElementById('expenseAmount').value);
    const desc = document.getElementById('expenseDesc').value;
    const date = document.getElementById('expenseDate').value;
    const fromAccount = document.getElementById('expenseAccount').value;
    if (!fromAccount) { ui.showToast('请选择账户'); return; }
    dataStore.addExpense({ amount, desc, date, fromAccount });
    ui.showToast('支出已记录！');
    pageManager.hideModal('expenseModal');
    document.getElementById('expenseForm').reset();
    ui.render();
    if (githubAuth.token) syncManager.sync();
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
      cash: { emoji: '💵', name: '现金' },
      bank: { emoji: '🏦', name: '银行卡' },
      alipay: { emoji: '💙', name: '支付宝' },
      wechat: { emoji: '💚', name: '微信' },
      investment: { emoji: '📈', name: '投资' },
      credit: { emoji: '💳', name: '信用卡' },
      other: { emoji: '📦', name: '其他' }
    };
    dataStore.addAccount({ name, type, emoji: typeMap[type].emoji, initialBalance });
    ui.showToast('添加成功！');
    document.getElementById('addAccountForm').reset();
    ui.renderManageAccounts();
    ui.render();
    if (githubAuth.token) syncManager.sync();
  },

  delete(id) {
    if (!confirm('确定要删除这个账户吗？')) return;
    dataStore.deleteAccount(id);
    ui.renderManageAccounts();
    ui.render();
    if (githubAuth.token) syncManager.sync();
  },

  updateBalance(id) {
    const acc = dataStore.accounts.find(a => a.id === id);
    if (!acc) return;
    const newBalance = prompt(`${acc.emoji} ${acc.name}\n请输入新余额：`, acc.balance.toFixed(2));
    if (newBalance === null) return;
    const parsed = parseFloat(newBalance);
    if (isNaN(parsed)) { ui.showToast('请输入有效数字'); return; }
    dataStore.updateAccountBalance(id, parsed);
    ui.showAccountDetail(id);
    ui.render();
    if (githubAuth.token) syncManager.sync();
    ui.showToast('余额已更新');
  }
};

// ==================== UI 渲染 ====================
const ui = {
  render() {
    this.renderTotal();
    this.renderAccounts();
    this.renderRecords();
    this.renderChart();
  },

  renderTotal() {
    const now = new Date();
    const income = dataStore.getMonthlyIncome(now.getFullYear(), now.getMonth() + 1);
    const expense = dataStore.getMonthlyExpense(now.getFullYear(), now.getMonth() + 1);
    document.getElementById('totalBalance').textContent = '¥' + dataStore.getTotalBalance().toFixed(2);
    document.getElementById('monthIncome').textContent = '+¥' + income.toFixed(2);
    document.getElementById('monthExpense').textContent = '-¥' + expense.toFixed(2);
    document.getElementById('monthBalance').textContent = (income - expense >= 0 ? '+' : '') + '¥' + (income - expense).toFixed(2);
    document.getElementById('monthBalance').style.color = income - expense >= 0 ? 'var(--success)' : 'var(--danger)';
  },

  renderAccounts() {
    const list = document.getElementById('accountsList');
    if (dataStore.accounts.length === 0) {
      list.innerHTML = `<div class="empty-state"><div class="icon">💳</div><p>还没有账户</p></div>`;
      return;
    }
    list.innerHTML = dataStore.accounts.map(acc => `
      <div class="account-card" onclick="ui.showAccountDetail('${acc.id}')">
        <div class="account-emoji" style="background:${this.getAccountColor(acc.type)}">${acc.emoji}</div>
        <div class="account-info">
          <div class="account-name">${acc.name}</div>
          <div class="account-type">${this.getAccountTypeName(acc.type)}</div>
        </div>
        <div class="account-balance"><div class="amount">¥${acc.balance.toFixed(2)}</div></div>
      </div>
    `).join('');
  },

  renderRecords() {
    const list = document.getElementById('recordsList');
    const records = [...dataStore.expenses.map(e => ({ ...e, _type: 'expense' })), ...dataStore.incomeRecords.map(r => ({ ...r, _type: 'income' }))]
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .slice(0, 50);

    if (records.length === 0) {
      list.innerHTML = `<div class="empty-state"><div class="icon">📝</div><p>还没有记录</p></div>`;
      return;
    }
    list.innerHTML = records.map(r => {
      if (r._type === 'income') {
        const mainAccount = dataStore.accounts.find(a => a.id === r.toAccounts[0]?.id);
        return `<div class="record-item"><div class="record-emoji">${mainAccount?.emoji || '💰'}</div><div class="record-info"><div class="record-title">${r.source}</div><div class="record-date">${r.date}</div></div><div class="record-amount income">+¥${r.totalAmount.toFixed(2)}</div></div>`;
      } else {
        const acc = dataStore.accounts.find(a => a.id === r.fromAccount);
        return `<div class="record-item"><div class="record-emoji">${acc?.emoji || '💸'}</div><div class="record-info"><div class="record-title">${r.desc}</div><div class="record-date">${r.date}</div></div><div class="record-amount expense">-¥${r.amount.toFixed(2)}</div></div>`;
      }
    }).join('');
  },

  renderManageAccounts() {
    const list = document.getElementById('manageAccountsList');
    list.innerHTML = dataStore.accounts.map(acc => `
      <div class="account-card">
        <div class="account-emoji" style="background:${this.getAccountColor(acc.type)}">${acc.emoji}</div>
        <div class="account-info">
          <div class="account-name">${acc.name}</div>
          <div class="account-type">余额: ¥${acc.balance.toFixed(2)}</div>
        </div>
        <button onclick="accountManager.delete('${acc.id}')" style="background:none;border:none;color:var(--danger);font-size:20px;cursor:pointer;">🗑️</button>
      </div>
    `).join('');
  },

  getAccountColor(type) {
    const colors = { cash: '#E8F5E9', bank: '#E3F2FD', alipay: '#E1F5FE', wechat: '#E8F5E9', investment: '#FFF3E0', credit: '#FCE4EC', other: '#F5F5F5' };
    return colors[type] || '#F5F5F5';
  },

  getAccountTypeName(type) {
    const names = { cash: '现金', bank: '银行卡', alipay: '支付宝', wechat: '微信支付', investment: '投资理财', credit: '信用卡', other: '其他' };
    return names[type] || '其他';
  },

  showAccountDetail(id) {
    const acc = dataStore.accounts.find(a => a.id === id);
    if (!acc) return;
    const incomeRecords = dataStore.incomeRecords.filter(r => r.toAccounts.some(ta => ta.id === id));
    const expenseRecords = dataStore.expenses.filter(r => r.fromAccount === id);
    const allRecords = [
      ...incomeRecords.map(r => ({ ...r, _type: 'income', amount: r.toAccounts.find(ta => ta.id === id)?.amount || 0 })),
      ...expenseRecords.map(r => ({ ...r, _type: 'expense' }))
    ].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 20);

    let html = `
      <h3>${acc.emoji} ${acc.name}</h3>
      <p>当前余额: ¥${acc.balance.toFixed(2)}</p>
      <button onclick="accountManager.updateBalance('${id}')" class="btn btn-secondary" style="margin:15px 0;width:100%;">✏️ 更新余额</button>
      <h4 style="margin-top:20px;">近期记录</h4>`;

    if (allRecords.length === 0) {
      html += '<p style="color:#999;">暂无记录</p>';
    } else {
      html += allRecords.map(r => `
        <div style="padding:10px;border-bottom:1px solid #eee;display:flex;justify-content:space-between;">
          <div>
            <div>${r._type === 'income' ? r.source : r.desc}</div>
            <small style="color:#999;">${r.date}</small>
          </div>
          <div style="color:${r._type === 'income' ? 'var(--success)' : 'var(--danger)'};">
            ${r._type === 'income' ? '+' : '-'}¥${(r._type === 'income' ? r.amount : r.amount).toFixed(2)}
          </div>
        </div>
      `).join('');
    }

    const modal = document.createElement('div');
    modal.className = 'modal active';
    modal.innerHTML = `<div class="modal-content"><div class="modal-header"><h2>账户详情</h2><button class="modal-close" onclick="this.closest('.modal').remove()">×</button></div><div style="padding:5px 0;">${html}</div></div>`;
    document.body.appendChild(modal);
  },

  drawChart() {
    const canvas = document.getElementById('chartCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const data = dataStore.getHistoryData();
    const width = canvas.width = canvas.offsetWidth * 2;
    const height = canvas.height = 160 * 2;
    ctx.clearRect(0, 0, width, height);

    if (data.length < 2) {
      ctx.fillStyle = '#999';
      ctx.font = '28px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('数据不足', width / 2, height / 2);
      return;
    }

    const max = Math.max(...data.map(d => d.balance));
    const min = Math.min(...data.map(d => d.balance));
    const range = max - min || 1;
    const padding = { top: 30, bottom: 40, left: 20, right: 20 };
    const chartW = width - padding.left - padding.right;
    const chartH = height - padding.top - padding.bottom;

    // 背景
    ctx.fillStyle = '#FAFAFA';
    ctx.fillRect(0, 0, width, height);

    // 网格线
    ctx.strokeStyle = '#E8E0D5';
    ctx.lineWidth = 2;
    for (let i = 0; i <= 3; i++) {
      const y = padding.top + (chartH / 3) * i;
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(width - padding.right, y);
      ctx.stroke();
    }

    // 折线
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
    ctx.fillStyle = 'rgba(90, 138, 60, 0.1)';
    ctx.fill();

    // 线条
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    points.forEach(p => ctx.lineTo(p.x, p.y));
    ctx.strokeStyle = '#5A8A3C';
    ctx.lineWidth = 4;
    ctx.lineJoin = 'round';
    ctx.stroke();

    // 点
    points.forEach((p, i) => {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 6, 0, Math.PI * 2);
      ctx.fillStyle = '#fff';
      ctx.fill();
      ctx.strokeStyle = '#5A8A3C';
      ctx.lineWidth = 3;
      ctx.stroke();
    });

    // X 轴标签
    ctx.fillStyle = '#666';
    ctx.font = '22px sans-serif';
    ctx.textAlign = 'center';
    data.forEach((d, i) => {
      const label = d.label.slice(5).replace('-', '/');
      ctx.fillText(label, points[i].x, height - 10);
    });

    // Y 轴标签
    ctx.font = '18px sans-serif';
    ctx.textAlign = 'right';
    [min, (min + max) / 2, max].forEach((val, i) => {
      const y = padding.top + (chartH / 2) * i;
      ctx.fillStyle = '#999';
      ctx.fillText('¥' + Math.round(val), padding.left - 5, y + 6);
    });
  },

  renderChart() {
    setTimeout(() => this.drawChart(), 100);
  },

  showToast(message) {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 2000);
  },

  setSyncing(syncing) {
    const icon = document.getElementById('syncIcon');
    icon.textContent = syncing ? '⏳' : '🔄';
  }
};

// ==================== 初始化 ====================
document.addEventListener('DOMContentLoaded', () => {
  dataStore.init();
  githubAuth.init();
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(console.error);
  }
});
