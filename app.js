/**
 * 海獭账本 PWA
 * 基于 GitHub 仓库实现数据同步
 */

// ==================== 配置 ====================
const CONFIG = {
  GITHUB_CLIENT_ID: 'YOUR_GITHUB_CLIENT_ID', // 需要替换
  REDIRECT_URI: window.location.origin + window.location.pathname,
  REPO_NAME: 'otter-ledger-data',
  DATA_FILE: 'data.json'
};

// ==================== 数据存储 ====================
const dataStore = {
  accounts: [],
  incomeRecords: [],
  transferRecords: [],
  
  init() {
    const saved = localStorage.getItem('otter-ledger-data');
    if (saved) {
      const data = JSON.parse(saved);
      this.accounts = data.accounts || [];
      this.incomeRecords = data.incomeRecords || [];
      this.transferRecords = data.transferRecords || [];
    }
    // 默认账户
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
      lastModified: Date.now()
    }));
  },
  
  getTotalBalance() {
    return this.accounts.reduce((sum, acc) => sum + acc.balance, 0);
  },
  
  addIncome(record) {
    record.id = Date.now().toString();
    record.datetime = new Date().toISOString();
    this.incomeRecords.unshift(record);
    
    // 更新账户余额
    record.toAccounts.forEach(({ id, amount }) => {
      const acc = this.accounts.find(a => a.id === id);
      if (acc) acc.balance += amount;
    });
    
    this.save();
    return record;
  },
  
  addAccount(account) {
    account.id = 'acc_' + Date.now();
    account.balance = 0;
    account.initialBalance = 0;
    this.accounts.push(account);
    this.save();
    return account;
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
      exportTime: new Date().toISOString()
    };
  },
  
  import(data) {
    if (data.accounts) this.accounts = data.accounts;
    if (data.incomeRecords) this.incomeRecords = data.incomeRecords;
    if (data.transferRecords) this.transferRecords = data.transferRecords;
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
    
    if (this.token && this.user) {
      this.showApp();
    }
  },
  
  login() {
    // 显示 Token 输入弹窗
    document.getElementById('tokenModal').style.display = 'flex';
  },
  
  async submitToken() {
    const token = document.getElementById('tokenInput').value.trim();
    if (!token) {
      ui.showToast('请输入 Token');
      return;
    }
    
    ui.showToast('验证中...');
    try {
      // 验证 token 并获取用户信息
      const userRes = await fetch('https://api.github.com/user', {
        headers: { 'Authorization': `token ${token}` }
      });
      
      if (!userRes.ok) {
        ui.showToast('Token 无效，请检查后重试');
        return;
      }
      
      this.user = await userRes.json();
      this.token = token;
      localStorage.setItem('github-token', token);
      localStorage.setItem('github-user', JSON.stringify(this.user));
      
      document.getElementById('tokenModal').style.display = 'none';
      document.getElementById('tokenInput').value = '';
      
      ui.showToast('登录成功！欢迎 ' + this.user.login);
      this.showApp();
      
      // 初始化仓库并同步
      await syncManager.initRepo();
      await syncManager.sync();
    } catch (err) {
      ui.showToast('登录失败：' + err.message);
    }
  },
  
  showApp() {
    document.getElementById('loginPage').style.display = 'none';
    document.getElementById('app').style.display = 'block';
    document.getElementById('githubUser').textContent = this.user?.login || '已登录';
    dataStore.init();
    ui.render();
  },
  
  logout() {
    if (!confirm('确定要退出登录吗？本地数据将保留。')) return;
    localStorage.removeItem('github-token');
    localStorage.removeItem('github-user');
    this.token = null;
    this.user = null;
    location.reload();
  }
};

// ==================== 同步管理 ====================
const syncManager = {
  syncing: false,
  
  async initRepo() {
    try {
      // 检查仓库是否存在
      const res = await fetch(`https://api.github.com/repos/${githubAuth.user.login}/${CONFIG.REPO_NAME}`, {
        headers: { 'Authorization': `token ${githubAuth.token}` }
      });
      
      if (res.status === 404) {
        // 创建仓库
        ui.showToast('创建数据仓库...');
        await fetch('https://api.github.com/user/repos', {
          method: 'POST',
          headers: {
            'Authorization': `token ${githubAuth.token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            name: CONFIG.REPO_NAME,
            description: '海獭账本数据存储',
            private: true,
            auto_init: true
          })
        });
        
        // 创建初始数据文件
        await this.pushToGitHub({
          accounts: dataStore.accounts,
          incomeRecords: [],
          transferRecords: [],
          version: '1.0'
        }, 'Initial data');
      }
    } catch (err) {
      console.error('Init repo error:', err);
    }
  },
  
  async sync() {
    if (this.syncing) return;
    this.syncing = true;
    ui.setSyncing(true);
    ui.showToast('同步中...');
    
    try {
      // 从 GitHub 拉取数据
      const cloudData = await this.pullFromGitHub();
      const localData = dataStore.export();
      
      // 合并数据（简单策略：以时间戳为准，新的覆盖旧的）
      const merged = this.mergeData(localData, cloudData);
      
      // 更新本地
      dataStore.import(merged);
      
      // 推送到 GitHub
      await this.pushToGitHub(merged, `Sync from ${new Date().toLocaleString('zh-CN')}`);
      
      ui.render();
      ui.showToast('同步成功！');
    } catch (err) {
      ui.showToast('同步失败：' + err.message);
      console.error('Sync error:', err);
    } finally {
      this.syncing = false;
      ui.setSyncing(false);
    }
  },
  
  async pullFromGitHub() {
    try {
      const res = await fetch(`https://api.github.com/repos/${githubAuth.user.login}/${CONFIG.REPO_NAME}/contents/${CONFIG.DATA_FILE}`, {
        headers: { 'Authorization': `token ${githubAuth.token}` }
      });
      
      if (res.status === 404) {
        return null;
      }
      
      const file = await res.json();
      const content = atob(file.content);
      return JSON.parse(content);
    } catch (err) {
      console.error('Pull error:', err);
      return null;
    }
  },
  
  async pushToGitHub(data, message) {
    // 先获取当前文件的 SHA（如果存在）
    let sha = null;
    try {
      const res = await fetch(`https://api.github.com/repos/${githubAuth.user.login}/${CONFIG.REPO_NAME}/contents/${CONFIG.DATA_FILE}`, {
        headers: { 'Authorization': `token ${githubAuth.token}` }
      });
      if (res.ok) {
        const file = await res.json();
        sha = file.sha;
      }
    } catch (e) {}
    
    const body = {
      message: message,
      content: btoa(JSON.stringify(data, null, 2))
    };
    if (sha) body.sha = sha;
    
    const res = await fetch(`https://api.github.com/repos/${githubAuth.user.login}/${CONFIG.REPO_NAME}/contents/${CONFIG.DATA_FILE}`, {
      method: 'PUT',
      headers: {
        'Authorization': `token ${githubAuth.token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });
    
    if (!res.ok) {
      throw new Error('Push failed: ' + res.statusText);
    }
  },
  
  mergeData(local, cloud) {
    if (!cloud || !cloud.accounts) return local;
    
    // 简单合并：比较最后修改时间
    const localTime = local.lastModified || 0;
    const cloudTime = cloud.lastModified || 0;
    
    if (cloudTime > localTime) {
      return cloud;
    }
    return local;
  },
  
  exportData() {
    const data = dataStore.export();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `otter-ledger-backup-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    ui.showToast('导出成功！');
  }
};

// ==================== 页面管理 ====================
const pageManager = {
  currentPage: 'home',
  
  switchPage(page) {
    this.currentPage = page;
    
    // 更新导航
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.page').forEach(el => el.classList.remove('active'));
    
    // 激活当前
    const navMap = { home: 0, records: 1, settings: 2 };
    document.querySelectorAll('.nav-item')[navMap[page]].classList.add('active');
    document.getElementById('page' + page.charAt(0).toUpperCase() + page.slice(1)).classList.add('active');
    
    ui.render();
  },
  
  showModal(id) {
    document.getElementById(id).classList.add('active');
    if (id === 'incomeModal') {
      incomeManager.initDistribution();
      document.getElementById('incomeDate').valueAsDate = new Date();
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
    
    // 自动分配逻辑
    const amountInput = document.getElementById('incomeAmount');
    amountInput.oninput = () => this.autoDistribute();
  },
  
  autoDistribute() {
    const total = parseFloat(document.getElementById('incomeAmount').value) || 0;
    const inputs = document.querySelectorAll('.dist-input');
    const count = inputs.length;
    if (count === 0) return;
    
    const perAccount = (total / count).toFixed(2);
    inputs.forEach(input => {
      input.value = perAccount;
    });
  },
  
  submit(e) {
    e.preventDefault();
    
    const totalAmount = parseFloat(document.getElementById('incomeAmount').value);
    const source = document.getElementById('incomeSource').value;
    const date = document.getElementById('incomeDate').value;
    
    // 收集分配
    const toAccounts = [];
    document.querySelectorAll('.dist-input').forEach(input => {
      const amount = parseFloat(input.value) || 0;
      if (amount > 0) {
        toAccounts.push({
          id: input.dataset.account,
          amount: amount
        });
      }
    });
    
    if (toAccounts.length === 0) {
      ui.showToast('请至少分配到一个账户');
      return;
    }
    
    const record = {
      totalAmount,
      source,
      date,
      toAccounts
    };
    
    dataStore.addIncome(record);
    ui.showToast('记录成功！');
    pageManager.hideModal('incomeModal');
    document.getElementById('incomeForm').reset();
    ui.render();
    
    // 自动同步
    if (githubAuth.token) {
      syncManager.sync();
    }
  }
};

// ==================== 账户管理 ====================
const accountManager = {
  add(e) {
    e.preventDefault();
    
    const name = document.getElementById('newAccountName').value;
    const type = document.getElementById('newAccountType').value;
    
    const typeMap = {
      cash: { emoji: '💵', name: '现金' },
      bank: { emoji: '🏦', name: '银行卡' },
      alipay: { emoji: '💙', name: '支付宝' },
      wechat: { emoji: '💚', name: '微信' },
      investment: { emoji: '📈', name: '投资' },
      other: { emoji: '📦', name: '其他' }
    };
    
    const account = {
      name,
      type,
      emoji: typeMap[type].emoji
    };
    
    dataStore.addAccount(account);
    ui.showToast('添加成功！');
    document.getElementById('addAccountForm').reset();
    ui.renderManageAccounts();
    ui.render();
    
    if (githubAuth.token) {
      syncManager.sync();
    }
  },
  
  delete(id) {
    if (!confirm('确定要删除这个账户吗？')) return;
    dataStore.deleteAccount(id);
    ui.renderManageAccounts();
    ui.render();
    
    if (githubAuth.token) {
      syncManager.sync();
    }
  }
};

// ==================== UI 渲染 ====================
const ui = {
  render() {
    this.renderTotal();
    this.renderAccounts();
    this.renderRecords();
  },
  
  renderTotal() {
    const total = dataStore.getTotalBalance();
    document.getElementById('totalBalance').textContent = '¥' + total.toFixed(2);
  },
  
  renderAccounts() {
    const list = document.getElementById('accountsList');
    if (dataStore.accounts.length === 0) {
      list.innerHTML = `
        <div class="empty-state">
          <div class="icon">💳</div>
          <p>还没有账户，去设置中添加吧</p>
        </div>
      `;
      return;
    }
    
    list.innerHTML = dataStore.accounts.map(acc => `
      <div class="account-card" onclick="ui.showAccountDetail('${acc.id}')">
        <div class="account-emoji" style="background: ${this.getAccountColor(acc.type)}">
          ${acc.emoji}
        </div>
        <div class="account-info">
          <div class="account-name">${acc.name}</div>
          <div class="account-type">${this.getAccountTypeName(acc.type)}</div>
        </div>
        <div class="account-balance">
          <div class="amount">¥${acc.balance.toFixed(2)}</div>
        </div>
      </div>
    `).join('');
  },
  
  renderRecords() {
    const list = document.getElementById('recordsList');
    const records = dataStore.incomeRecords;
    
    if (records.length === 0) {
      list.innerHTML = `
        <div class="empty-state">
          <div class="icon">📝</div>
          <p>还没有记录，点击 + 添加收入</p>
        </div>
      `;
      return;
    }
    
    list.innerHTML = records.slice(0, 50).map(r => {
      const mainAccount = dataStore.accounts.find(a => a.id === r.toAccounts[0]?.id);
      return `
        <div class="record-item">
          <div class="record-emoji">${mainAccount?.emoji || '💰'}</div>
          <div class="record-info">
            <div class="record-title">${r.source}</div>
            <div class="record-date">${r.date}</div>
          </div>
          <div class="record-amount">+¥${r.totalAmount.toFixed(2)}</div>
        </div>
      `;
    }).join('');
  },
  
  renderManageAccounts() {
    const list = document.getElementById('manageAccountsList');
    list.innerHTML = dataStore.accounts.map(acc => `
      <div class="account-card">
        <div class="account-emoji" style="background: ${this.getAccountColor(acc.type)}">
          ${acc.emoji}
        </div>
        <div class="account-info">
          <div class="account-name">${acc.name}</div>
          <div class="account-type">余额: ¥${acc.balance.toFixed(2)}</div>
        </div>
        <button onclick="accountManager.delete('${acc.id}')" style="background: none; border: none; color: var(--danger); font-size: 20px; cursor: pointer;">🗑️</button>
      </div>
    `).join('');
  },
  
  getAccountColor(type) {
    const colors = {
      cash: '#E8F5E9',
      bank: '#E3F2FD',
      alipay: '#E1F5FE',
      wechat: '#E8F5E9',
      investment: '#FFF3E0',
      other: '#F5F5F5'
    };
    return colors[type] || '#F5F5F5';
  },
  
  getAccountTypeName(type) {
    const names = {
      cash: '现金',
      bank: '银行卡',
      alipay: '支付宝',
      wechat: '微信支付',
      investment: '投资理财',
      other: '其他'
    };
    return names[type] || '其他';
  },
  
  showAccountDetail(id) {
    const acc = dataStore.accounts.find(a => a.id === id);
    if (!acc) return;
    
    const records = dataStore.incomeRecords
      .filter(r => r.toAccounts.some(ta => ta.id === id))
      .slice(0, 10);
    
    let html = `<h3>${acc.emoji} ${acc.name}</h3><p>当前余额: ¥${acc.balance.toFixed(2)}</p>`;
    
    if (records.length > 0) {
      html += '<h4 style="margin-top: 20px;">近期记录</h4>';
      html += records.map(r => `
        <div style="padding: 10px; border-bottom: 1px solid #eee;">
          <div>${r.source} <span style="color: var(--success);">+¥${r.toAccounts.find(ta => ta.id === id)?.amount?.toFixed(2) || 0}</span></div>
          <small style="color: #999;">${r.date}</small>
        </div>
      `).join('');
    }
    
    // 简单弹窗
    const modal = document.createElement('div');
    modal.className = 'modal active';
    modal.innerHTML = `
      <div class="modal-content">
        <div class="modal-header">
          <h2>账户详情</h2>
          <button class="modal-close" onclick="this.closest('.modal').remove()">×</button>
        </div>
        ${html}
      </div>
    `;
    document.body.appendChild(modal);
  },
  
  showToast(message) {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 2000);
  },
  
  setSyncing(syncing) {
    const btn = document.getElementById('syncBtn');
    const icon = document.getElementById('syncIcon');
    if (syncing) {
      btn.classList.add('syncing');
      icon.textContent = '⏳';
    } else {
      btn.classList.remove('syncing');
      icon.textContent = '🔄';
    }
  }
};

// ==================== 初始化 ====================
document.addEventListener('DOMContentLoaded', () => {
  dataStore.init();
  githubAuth.init();
  
  // 注册 Service Worker（PWA）
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(console.error);
  }
});
