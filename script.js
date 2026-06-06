// ==================== 全局变量 ====================
let apiKey = localStorage.getItem('deepseek_api_key') || '';
let conversations = [];
let currentChatId = null;
let isWaiting = false;
let currentFile = null;
let editingMessageIndex = null; // 正在编辑的消息索引

// 头像
const AVATAR_URL = 'deepseek.png';

// 模型列表
const modelList = [
    { key: 'pro', id: 'deepseek-chat', name: 'V4-Pro', desc: '旗舰模型' },
    { key: 'reasoner', id: 'deepseek-reasoner', name: 'V4-Reasoner', desc: '深度思考' },
    { key: 'flash', id: 'deepseek-chat', name: 'V4-Flash', desc: '轻量快速' }
];

let currentModelKey = localStorage.getItem('deepseek_model_key') || 'pro';
let currentModel = modelList.find(m => m.key === currentModelKey).id;

// DOM
const chatContainer = document.getElementById('chatContainer');
const messageInput = document.getElementById('messageInput');
const sendBtn = document.getElementById('sendBtn');
const clearBtn = document.getElementById('clearBtn');
const branchBtn = document.getElementById('branchBtn');
const apiKeyInput = document.getElementById('apiKeyInput');
const saveApiKeyBtn = document.getElementById('saveApiKey');
const toggleConfig = document.getElementById('toggleConfig');
const configBody = document.getElementById('configBody');
const sidebar = document.getElementById('sidebar');
const overlay = document.getElementById('overlay');
const menuBtn = document.getElementById('menuBtn');
const newChatBtn = document.getElementById('newChatBtn');
const chatList = document.getElementById('chatList');
const chatTitle = document.getElementById('chatTitle');
const fileInput = document.getElementById('fileInput');
const attachBtn = document.getElementById('attachBtn');
const searchInput = document.getElementById('searchInput');
const modelToggleBtn = document.getElementById('modelToggleBtn');
const modelDropdown = document.getElementById('modelDropdown');

// ==================== 初始化 ====================
function init() {
    if (apiKey) apiKeyInput.value = apiKey;
    loadConversations();
    if (conversations.length === 0) createNewChat();
    else switchChat(conversations[0].id);

    updateModelBtnText();
    renderDropdownActive();

    // 事件
    sendBtn.addEventListener('click', sendMessage);
    clearBtn.addEventListener('click', clearCurrentChat);
    branchBtn.addEventListener('click', branchCurrentChat);
    saveApiKeyBtn.addEventListener('click', saveApiKey);
    toggleConfig.addEventListener('click', toggleConfigPanel);
    menuBtn.addEventListener('click', openSidebar);
    newChatBtn.addEventListener('click', () => { createNewChat(); closeSidebar(); });
    overlay.addEventListener('click', closeSidebar);
    attachBtn.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', handleFileSelect);
    searchInput.addEventListener('input', handleSearch);

    modelToggleBtn.addEventListener('click', function(e) {
        e.preventDefault();
        e.stopPropagation();
        modelDropdown.classList.toggle('show');
    });

    modelDropdown.querySelectorAll('.model-dropdown-item').forEach(function(item) {
        item.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            switchModel(item.dataset.modelKey);
            modelDropdown.classList.remove('show');
        });
    });

    document.addEventListener('click', function(e) {
        if (!modelDropdown.contains(e.target) && e.target !== modelToggleBtn) {
            modelDropdown.classList.remove('show');
        }
    });

    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            modelDropdown.classList.remove('show');
            // 取消编辑模式
            if (editingMessageIndex !== null) {
                cancelEdit();
            }
        }
    });

    messageInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });
    messageInput.addEventListener('input', autoResize);
}

// ==================== 模型切换 ====================
function switchModel(modelKey) {
    currentModelKey = modelKey;
    currentModel = modelList.find(m => m.key === modelKey).id;
    localStorage.setItem('deepseek_model_key', modelKey);
    updateModelBtnText();
    renderDropdownActive();
    updateInputPlaceholder();
    showToast('已切换到 ' + modelList.find(m => m.key === modelKey).name);
}

function updateModelBtnText() {
    modelToggleBtn.textContent = modelList.find(m => m.key === currentModelKey).name + ' ▾';
}

function renderDropdownActive() {
    modelDropdown.querySelectorAll('.model-dropdown-item').forEach(item => {
        item.classList.toggle('active', item.dataset.modelKey === currentModelKey);
    });
}

function updateInputPlaceholder() {
    if (editingMessageIndex !== null) {
        messageInput.placeholder = '✏️ 编辑消息中... (Esc 取消)';
    } else if (currentModelKey === 'reasoner') {
        messageInput.placeholder = '深度思考模式...';
    } else {
        messageInput.placeholder = '输入消息...';
    }
}

// ==================== 对话管理 ====================
function loadConversations() {
    const saved = localStorage.getItem('deepseek_conversations');
    if (saved) { try { conversations = JSON.parse(saved); } catch (e) { conversations = []; } }
    renderChatList();
}

function saveConversations() {
    localStorage.setItem('deepseek_conversations', JSON.stringify(conversations));
}

function createNewChat(parentChatId = null, branchPoint = null) {
    const chat = {
        id: Date.now().toString(),
        title: parentChatId ? '分支对话' : '新对话',
        messages: [],
        parentId: parentChatId || null,
        branchPoint: branchPoint || null,
        branches: [],
        modelKey: currentModelKey,
        tokenUsage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };

    if (parentChatId && branchPoint !== null) {
        const p = conversations.find(c => c.id === parentChatId);
        if (p) {
            chat.messages = p.messages.slice(0, branchPoint + 1);
            chat.title = p.title + ' (分支)';
            chat.modelKey = p.modelKey || currentModelKey;
            if (p.tokenUsage) chat.tokenUsage = { ...p.tokenUsage };
            p.branches = p.branches || [];
            p.branches.push({ chatId: chat.id, atMessageIndex: branchPoint });
        }
    }

    conversations.unshift(chat);
    saveConversations();
    renderChatList();
    switchChat(chat.id);
}

function switchChat(chatId) {
    currentChatId = chatId;
    cancelEdit(); // 切换对话时取消编辑
    const chat = conversations.find(c => c.id === chatId);
    if (!chat) return;
    chatTitle.textContent = chat.title;
    if (chat.modelKey && chat.modelKey !== currentModelKey) {
        currentModelKey = chat.modelKey;
        currentModel = modelList.find(m => m.key === currentModelKey).id;
        updateModelBtnText();
        renderDropdownActive();
        updateInputPlaceholder();
    }
    renderMessages(chat.messages);
    renderChatList();
}

function branchCurrentChat() {
    const chat = conversations.find(c => c.id === currentChatId);
    if (!chat || chat.messages.length === 0) { alert('请先发送消息'); return; }
    let bp = chat.messages.length - 1;
    for (let i = chat.messages.length - 1; i >= 0; i--) {
        if (chat.messages[i].role === 'user') { bp = i; break; }
    }
    if (confirm('从第 ' + (bp + 1) + ' 条消息处创建分支？')) {
        createNewChat(currentChatId, bp);
        closeSidebar();
    }
}

function deleteChat(chatId) {
    if (conversations.length <= 1) { alert('至少保留一个对话'); return; }
    if (confirm('确定删除这个对话吗？')) {
        conversations = conversations.filter(c => c.id !== chatId);
        saveConversations();
        renderChatList();
        if (chatId === currentChatId) switchChat(conversations[0].id);
    }
}

function renameChat(chatId) {
    const chat = conversations.find(c => c.id === chatId);
    if (!chat) return;
    const t = prompt('输入新标题:', chat.title);
    if (t && t.trim()) { chat.title = t.trim(); saveConversations(); renderChatList(); if (chatId === currentChatId) chatTitle.textContent = chat.title; }
}

function clearCurrentChat() {
    if (confirm('确定清空当前对话？')) {
        const chat = conversations.find(c => c.id === currentChatId);
        if (chat) {
            chat.messages = [];
            chat.tokenUsage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
            chat.updatedAt = new Date().toISOString();
            cancelEdit();
            saveConversations();
            renderMessages([]);
            renderChatList();
        }
    }
}

// ==================== 编辑消息功能 ====================

// 进入编辑模式
function startEdit(msgIndex) {
    const chat = conversations.find(c => c.id === currentChatId);
    if (!chat || isWaiting) return;
    
    const msg = chat.messages[msgIndex];
    if (!msg || msg.role !== 'user') return;
    
    editingMessageIndex = msgIndex;
    messageInput.value = msg.content;
    messageInput.focus();
    updateInputPlaceholder();
    
    // 高亮被编辑的消息
    renderMessages(chat.messages);
    
    // 滚动到输入框
    messageInput.scrollIntoView({ behavior: 'smooth' });
}

// 取消编辑
function cancelEdit() {
    editingMessageIndex = null;
    messageInput.value = '';
    updateInputPlaceholder();
    
    // 重新渲染以移除高亮
    const chat = conversations.find(c => c.id === currentChatId);
    if (chat) renderMessages(chat.messages);
}

// 确认编辑并重新发送
function confirmEdit() {
    const chat = conversations.find(c => c.id === currentChatId);
    if (!chat || editingMessageIndex === null) return;
    
    const newContent = messageInput.value.trim();
    if (!newContent) {
        cancelEdit();
        return;
    }
    
    // 更新消息内容
    chat.messages[editingMessageIndex].content = newContent;
    
    // 删除该消息之后的所有消息
    chat.messages = chat.messages.slice(0, editingMessageIndex + 1);
    
    // 重置编辑状态
    editingMessageIndex = null;
    messageInput.value = '';
    updateInputPlaceholder();
    
    chat.updatedAt = new Date().toISOString();
    saveConversations();
    renderMessages(chat.messages);
    renderChatList();
    
    // 自动重新发送
    autoResend();
}

// 自动重新发送（编辑后）
async function autoResend() {
    const chat = conversations.find(c => c.id === currentChatId);
    if (!chat || chat.messages.length === 0) return;
    
    // 检查最后一条是否是用户消息
    const lastMsg = chat.messages[chat.messages.length - 1];
    if (lastMsg.role !== 'user') return;
    
    isWaiting = true;
    sendBtn.disabled = true;
    showTyping();
    
    try {
        const r = await callAPI(chat.messages);
        removeTyping();
        if (r) {
            chat.messages.push({ role: 'assistant', content: r.content, reasoning: r.reasoning || null });
            chat.updatedAt = new Date().toISOString();
            saveConversations();
            renderMessages(chat.messages);
            renderChatList();
        }
    } catch (e) {
        removeTyping();
        chatContainer.innerHTML += '<div class="message assistant"><div class="bot-avatar"><img src="' + AVATAR_URL + '" alt="助手"></div><div class="message-content">' + esc(e.message) + '</div></div>';
    } finally {
        isWaiting = false;
        sendBtn.disabled = false;
    }
}

// ==================== 搜索 ====================
function handleSearch() { renderChatList(searchInput.value.trim().toLowerCase()); }

function renderChatList(filter = '') {
    chatList.innerHTML = '';
    let list = filter
        ? conversations.filter(c => c.title.toLowerCase().includes(filter) || c.messages.some(m => m.content.toLowerCase().includes(filter)))
        : conversations;
    if (!list.length) { chatList.innerHTML = '<div class="no-results">未找到</div>'; return; }

    list.forEach(chat => {
        const d = document.createElement('div');
        d.className = 'chat-item ' + (chat.id === currentChatId ? 'active' : '');
        const tokens = chat.tokenUsage?.total_tokens || 0;
        let title = chat.title;
        if (filter && !chat.title.toLowerCase().includes(filter)) {
            const m = chat.messages.find(m => m.content.toLowerCase().includes(filter));
            if (m) title += ' (含: "' + m.content.substring(0, 15) + '...")';
        }
        d.innerHTML = '<div class="chat-item-info" data-chat-id="' + chat.id + '">' +
            '<div class="chat-item-title">' + esc(title) + '</div>' +
            '<div class="chat-item-meta">' +
            '<span>' + fmtTime(new Date(chat.updatedAt)) + '</span>' +
            '<span>' + chat.messages.length + '条</span>' +
            (tokens > 0 ? '<span>🔢' + fmtToken(tokens) + '</span>' : '') +
            (chat.parentId ? '<span class="chat-item-branch">🔀</span>' : '') +
            ((chat.branches || []).length > 0 ? '<span class="chat-item-branch">🌿' + chat.branches.length + '</span>' : '') +
            '</div></div>' +
            '<div class="chat-item-actions">' +
            '<button class="rename-chat" data-chat-id="' + chat.id + '">✏️</button>' +
            '<button class="delete-chat" data-chat-id="' + chat.id + '">🗑️</button>' +
            '</div>';
        d.querySelector('.chat-item-info').addEventListener('click', () => { switchChat(chat.id); closeSidebar(); });
        d.querySelector('.rename-chat').addEventListener('click', e => { e.stopPropagation(); renameChat(chat.id); });
        d.querySelector('.delete-chat').addEventListener('click', e => { e.stopPropagation(); deleteChat(chat.id); });
        chatList.appendChild(d);
    });
}

// ==================== 消息渲染 ====================
function renderMessages(messages) {
    chatContainer.innerHTML = '';
    if (!messages || !messages.length) {
        chatContainer.innerHTML = '<div class="welcome-message"><div class="bot-avatar"><img src="' + AVATAR_URL + '" alt="助手"></div><div class="message-content">你好！我是 DeepSeek 助手<br>上方按钮切换模型 | 点击 ✏️ 编辑消息 | 上传文件</div></div>';
        renderTokenStats();
        return;
    }

    let i = 0;
    while (i < messages.length) {
        if (messages[i].role === 'user') {
            const grp = document.createElement('div');
            grp.className = 'message-group';

            // 用户消息
            const isEditing = (i === editingMessageIndex);
            const userDiv = document.createElement('div');
            userDiv.className = 'message user' + (isEditing ? ' editing' : '');
            userDiv.innerHTML = '<div class="message-content">' + esc(messages[i].content) + '</div>';
            grp.appendChild(userDiv);

            if (i + 1 < messages.length && messages[i + 1].role === 'assistant') {
                const wrap = document.createElement('div');
                wrap.className = 'message-collapsible';
                const reasoning = messages[i + 1].reasoning;

                const hdr = document.createElement('div');
                hdr.className = 'message-collapsible-header';
                hdr.innerHTML = '<span class="toggle-icon">▼</span><span>助手回复</span>' +
                    (reasoning ? '<span style="color:var(--warning-color);margin-left:6px;font-size:0.7rem">🧠思考</span>' : '') +
                    '<span style="flex:1"></span><span style="font-size:0.7rem;color:var(--text-muted)">折叠</span>';

                const body = document.createElement('div');
                body.className = 'message-collapsible-body';

                if (reasoning) {
                    const rb = document.createElement('div');
                    rb.className = 'reasoning-block';
                    rb.innerHTML = '<div class="reasoning-header" onclick="this.nextElementSibling.classList.toggle(\'hidden\')">🧠 思考过程 <span class="toggle-icon">▼</span></div><div class="reasoning-content">' + fmt(reasoning) + '</div>';
                    body.appendChild(rb);
                }
                body.appendChild(msgEl('assistant', messages[i + 1].content));

                // 操作按钮：编辑、重新生成、分支
                const act = document.createElement('div');
                act.className = 'message-actions';
                act.innerHTML = '<button class="edit-btn" data-idx="' + i + '">✏️ 编辑</button>' +
                    '<button class="regenerate-btn" data-idx="' + i + '">🔄 重新生成</button>' +
                    '<button class="branch-msg-btn" data-idx="' + i + '">🔀 分支</button>';
                body.appendChild(act);

                hdr.addEventListener('click', () => { body.classList.toggle('hidden'); hdr.classList.toggle('collapsed'); });
                wrap.appendChild(hdr);
                wrap.appendChild(body);
                grp.appendChild(wrap);

                setTimeout(() => {
                    act.querySelector('.edit-btn')?.addEventListener('click', e => { e.stopPropagation(); startEdit(i); });
                    act.querySelector('.regenerate-btn')?.addEventListener('click', e => { e.stopPropagation(); regenerateMessage(i); });
                    act.querySelector('.branch-msg-btn')?.addEventListener('click', e => { e.stopPropagation(); branchFromMessage(i); });
                }, 0);
                i += 2;
            } else {
                // 孤立的用户消息，也可以编辑
                const act = document.createElement('div');
                act.className = 'message-actions';
                act.style.paddingLeft = '0';
                act.style.justifyContent = 'flex-end';
                act.innerHTML = '<button class="edit-btn" data-idx="' + i + '">✏️ 编辑</button>';
                grp.appendChild(act);
                
                setTimeout(() => {
                    act.querySelector('.edit-btn')?.addEventListener('click', e => { e.stopPropagation(); startEdit(i); });
                }, 0);
                i++;
            }
            chatContainer.appendChild(grp);
        } else {
            chatContainer.appendChild(msgEl('assistant', messages[i].content));
            i++;
        }
    }
    renderTokenStats();
    scrollBottom();
}

function msgEl(role, content) {
    const d = document.createElement('div');
    d.className = 'message ' + role;
    d.innerHTML = role === 'assistant'
        ? '<div class="bot-avatar"><img src="' + AVATAR_URL + '" alt="助手"></div><div class="message-content">' + fmt(content) + '</div>'
        : '<div class="message-content">' + esc(content) + '</div>';
    return d;
}

function renderTokenStats() {
    const old = document.getElementById('tokenStats'); if (old) old.remove();
    const chat = conversations.find(c => c.id === currentChatId);
    if (!chat?.tokenUsage?.total_tokens) return;
    const d = document.createElement('div');
    d.id = 'tokenStats';
    d.className = 'token-stats';
    const ic = (chat.tokenUsage.prompt_tokens / 1e6 * 1).toFixed(4);
    const oc = (chat.tokenUsage.completion_tokens / 1e6 * 2).toFixed(4);
    d.innerHTML = '<div class="token-stats-content"><span class="token-item">📥 ' + fmtToken(chat.tokenUsage.prompt_tokens) + '</span><span class="token-item">📤 ' + fmtToken(chat.tokenUsage.completion_tokens) + '</span><span class="token-item">🔢 ' + fmtToken(chat.tokenUsage.total_tokens) + '</span><span class="token-item token-cost">💰 ¥' + (parseFloat(ic) + parseFloat(oc)).toFixed(4) + '</span></div>';
    chatContainer.appendChild(d);
}

// ==================== 发送消息 ====================
async function sendMessage() {
    // 如果正在编辑模式，先确认编辑
    if (editingMessageIndex !== null) {
        confirmEdit();
        return;
    }

    const content = messageInput.value.trim();
    if (!content || isWaiting) return;
    if (!apiKey) { alert('请先配置 API Key'); configBody.classList.remove('collapsed'); toggleConfig.classList.remove('collapsed'); return; }

    const chat = conversations.find(c => c.id === currentChatId);
    if (!chat) return;
    chat.modelKey = currentModelKey;
    chat.messages.push({ role: 'user', content });
    renderMessages(chat.messages);
    messageInput.value = '';
    autoResize();
    removeFilePreview();
    chat.updatedAt = new Date().toISOString();
    if (chat.messages.length === 2 && chat.title === '新对话') chat.title = content.substring(0, 20) + (content.length > 20 ? '...' : '');
    saveConversations();
    renderChatList();

    isWaiting = true;
    sendBtn.disabled = true;
    showTyping();

    try {
        const r = await callAPI(chat.messages);
        removeTyping();
        if (r) {
            chat.messages.push({ role: 'assistant', content: r.content, reasoning: r.reasoning || null });
            chat.updatedAt = new Date().toISOString();
            saveConversations();
            renderMessages(chat.messages);
            renderChatList();
        }
    } catch (e) {
        removeTyping();
        chatContainer.innerHTML += '<div class="message assistant"><div class="bot-avatar"><img src="' + AVATAR_URL + '" alt="助手"></div><div class="message-content">' + esc(e.message) + '</div></div>';
    } finally { isWaiting = false; sendBtn.disabled = false; }
}

async function regenerateMessage(idx) {
    const chat = conversations.find(c => c.id === currentChatId);
    if (!chat || isWaiting) return;
    if (idx + 1 < chat.messages.length) chat.messages.splice(idx + 1, 1);
    chat.messages = chat.messages.slice(0, idx + 1);
    saveConversations();
    renderMessages(chat.messages);
    isWaiting = true; sendBtn.disabled = true; showTyping();
    try {
        const r = await callAPI(chat.messages);
        removeTyping();
        if (r) {
            chat.messages.push({ role: 'assistant', content: r.content, reasoning: r.reasoning || null });
            chat.updatedAt = new Date().toISOString();
            saveConversations();
            renderMessages(chat.messages);
            renderChatList();
        }
    } catch (e) {
        removeTyping();
        chatContainer.innerHTML += '<div class="message assistant"><div class="bot-avatar"><img src="' + AVATAR_URL + '" alt="助手"></div><div class="message-content">' + esc(e.message) + '</div></div>';
    } finally { isWaiting = false; sendBtn.disabled = false; }
}

function branchFromMessage(idx) {
    if (confirm('从第 ' + (idx + 1) + ' 条消息处创建分支？')) { createNewChat(currentChatId, idx); closeSidebar(); }
}

// ==================== API ====================
async function callAPI(messages) {
    const body = { model: currentModel, messages: messages.map(m => ({ role: m.role, content: m.content })), stream: false };
    if (currentModelKey !== 'reasoner') { body.temperature = 0.7; body.max_tokens = 2000; }
    const res = await fetch('https://api.deepseek.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey },
        body: JSON.stringify(body)
    });
    if (!res.ok) { const err = await res.json(); throw new Error(err.error?.message || '请求失败'); }
    const data = await res.json();
    if (data.usage) addTokens(data.usage);
    return { content: data.choices[0].message.content, reasoning: data.choices[0].message.reasoning_content || null };
}

function addTokens(u) {
    const chat = conversations.find(c => c.id === currentChatId);
    if (chat) {
        chat.tokenUsage = chat.tokenUsage || { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
        chat.tokenUsage.prompt_tokens += u.prompt_tokens || 0;
        chat.tokenUsage.completion_tokens += u.completion_tokens || 0;
        chat.tokenUsage.total_tokens += u.total_tokens || 0;
        saveConversations();
    }
}

// ==================== 文件 ====================
function handleFileSelect(e) {
    const f = e.target.files[0];
    if (!f) return;
    if (f.size > 10 * 1024 * 1024) { alert('文件太大'); fileInput.value = ''; return; }
    currentFile = f; showFilePreview(f); readFileContent(f);
}

function showFilePreview(f) {
    removeFilePreview();
    const p = document.createElement('div');
    p.className = 'file-preview';
    p.id = 'filePreview';
    p.innerHTML = '<div class="file-preview-info"><span>📄</span><span class="file-preview-name">' + esc(f.name) + '</span><span class="file-preview-size">' + fmtSize(f.size) + '</span></div><button class="file-preview-remove" onclick="removeFilePreview()">✕</button>';
    document.querySelector('.input-container').parentNode.insertBefore(p, document.querySelector('.input-container'));
}

function removeFilePreview() { const p = document.getElementById('filePreview'); if (p) p.remove(); currentFile = null; fileInput.value = ''; }

function readFileContent(f) {
    const r = new FileReader();
    const ext = f.name.split('.').pop().toLowerCase();
    const ok = ['txt','md','json','csv','js','py','html','css','xml','yaml','yml','log','sh','java','c','cpp','php','rb','go','rs','ts','tsx','vue','sql','swift','kt'];
    r.onload = function(e) {
        let t = '';
        if (ok.includes(ext)) { const ct = e.target.result.length > 5000 ? e.target.result.substring(0, 5000) + '\n...(已截断)' : e.target.result; t = '\n\n--- 文件: ' + f.name + ' ---\n' + ct + '\n--- 文件结束 ---'; }
        else { const h = { pdf:'PDF', doc:'Word', docx:'Word', xlsx:'Excel', png:'图片', jpg:'图片', jpeg:'图片' }; t = '\n\n[' + (h[ext] || '未知') + '文件: ' + f.name + ']'; }
        messageInput.value += t; messageInput.focus(); autoResize();
    };
    ok.includes(ext) ? r.readAsText(f) : (messageInput.value += '\n\n[文件: ' + f.name + ']', messageInput.focus());
}

// ==================== 工具 ====================
function fmt(s) { if (!s) return ''; let f = esc(s); f = f.replace(/```(\w*)\n([\s\S]*?)```/g, (_, l, c) => '<pre><code>' + esc(c.trim()) + '</code></pre>'); f = f.replace(/`([^`]+)`/g, '<code>$1</code>'); f = f.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>'); f = f.replace(/\n/g, '<br>'); return f; }
function esc(s) { if (!s) return ''; const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
function saveApiKey() { const k = apiKeyInput.value.trim(); if (!k) { alert('请输入 API Key'); return; } apiKey = k; localStorage.setItem('deepseek_api_key', apiKey); alert('✅ 已保存'); configBody.classList.add('collapsed'); toggleConfig.classList.add('collapsed'); }
function toggleConfigPanel() { configBody.classList.toggle('collapsed'); toggleConfig.classList.toggle('collapsed'); }
function showTyping() { const d = document.createElement('div'); d.className = 'message assistant'; d.id = 'typingIndicator'; d.innerHTML = '<div class="bot-avatar"><img src="' + AVATAR_URL + '" alt="助手"></div><div class="message-content"><div class="typing-indicator"><span></span><span></span><span></span></div></div>'; chatContainer.appendChild(d); scrollBottom(); }
function removeTyping() { const e = document.getElementById('typingIndicator'); if (e) e.remove(); }
function openSidebar() { sidebar.classList.add('open'); overlay.classList.add('show'); }
function closeSidebar() { sidebar.classList.remove('open'); overlay.classList.remove('show'); }
function autoResize() { messageInput.style.height = 'auto'; messageInput.style.height = Math.min(messageInput.scrollHeight, 100) + 'px'; }
function scrollBottom() { chatContainer.scrollTop = chatContainer.scrollHeight; }
function showToast(msg) { const e = document.getElementById('toast'); if (e) e.remove(); const t = document.createElement('div'); t.id = 'toast'; t.className = 'toast'; t.textContent = msg; document.body.appendChild(t); requestAnimationFrame(() => { t.classList.add('show'); setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, 1500); }); }
function fmtTime(d) { const df = Date.now() - d; if (df < 6e4) return '刚刚'; if (df < 36e5) return Math.floor(df/6e4) + '分钟前'; if (df < 864e5) return Math.floor(df/36e5) + '小时前'; if (df < 6048e5) return Math.floor(df/864e5) + '天前'; return (d.getMonth()+1) + '/' + d.getDate(); }
function fmtSize(b) { if (b < 1024) return b + ' B'; if (b < 1048576) return (b/1024).toFixed(1) + ' KB'; return (b/1048576).toFixed(1) + ' MB'; }
function fmtToken(c) { if (c >= 1e6) return (c/1e6).toFixed(1) + 'M'; if (c >= 1e3) return (c/1e3).toFixed(1) + 'K'; return String(c); }

init();
