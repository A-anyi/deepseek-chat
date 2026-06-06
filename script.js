// ==================== 全局变量 ====================
var apiKey = localStorage.getItem('deepseek_api_key') || '';
var conversations = [];
var currentChatId = null;
var isWaiting = false;
var currentFile = null;
var editingMessageIndex = null;

var AVATAR_URL = 'deepseek.png';

var modelList = [
    { key: 'pro', id: 'deepseek-chat', name: 'V4-Pro', desc: '旗舰模型' },
    { key: 'reasoner', id: 'deepseek-reasoner', name: 'V4-Reasoner', desc: '深度思考' },
    { key: 'flash', id: 'deepseek-chat', name: 'V4-Flash', desc: '轻量快速' }
];

var currentModelKey = localStorage.getItem('deepseek_model_key') || 'pro';
var currentModel = modelList.find(function(m) { return m.key === currentModelKey; }).id;

// DOM 元素
var chatContainer = document.getElementById('chatContainer');
var messageInput = document.getElementById('messageInput');
var sendBtn = document.getElementById('sendBtn');
var clearBtn = document.getElementById('clearBtn');
var branchBtn = document.getElementById('branchBtn');
var apiKeyInput = document.getElementById('apiKeyInput');
var saveApiKeyBtn = document.getElementById('saveApiKey');
var toggleConfig = document.getElementById('toggleConfig');
var configBody = document.getElementById('configBody');
var sidebar = document.getElementById('sidebar');
var overlay = document.getElementById('overlay');
var menuBtn = document.getElementById('menuBtn');
var newChatBtn = document.getElementById('newChatBtn');
var chatList = document.getElementById('chatList');
var chatTitle = document.getElementById('chatTitle');
var fileInput = document.getElementById('fileInput');
var attachBtn = document.getElementById('attachBtn');
var searchInput = document.getElementById('searchInput');
var modelToggleBtn = document.getElementById('modelToggleBtn');
var modelDropdown = document.getElementById('modelDropdown');
var exportBtn = document.getElementById('exportBtn');
var importBtn = document.getElementById('importBtn');
var importFileInput = document.getElementById('importFileInput');

// ==================== 初始化 ====================
function init() {
    if (apiKey) apiKeyInput.value = apiKey;
    loadConversations();
    if (conversations.length === 0) createNewChat();
    else switchChat(conversations[0].id);

    updateModelBtnText();
    renderDropdownActive();

    // 基础事件绑定
    sendBtn.addEventListener('click', sendMessage);
    clearBtn.addEventListener('click', clearCurrentChat);
    branchBtn.addEventListener('click', branchCurrentChat);
    saveApiKeyBtn.addEventListener('click', saveApiKey);
    toggleConfig.addEventListener('click', toggleConfigPanel);
    menuBtn.addEventListener('click', openSidebar);
    newChatBtn.addEventListener('click', function() { createNewChat(); closeSidebar(); });
    overlay.addEventListener('click', closeSidebar);
    attachBtn.addEventListener('click', function() { fileInput.click(); });
    fileInput.addEventListener('change', handleFileSelect);
    searchInput.addEventListener('input', handleSearch);
    exportBtn.addEventListener('click', exportData);
    importBtn.addEventListener('click', function() { importFileInput.click(); });
    importFileInput.addEventListener('change', importData);

    // 模型切换
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

    // ESC 取消编辑或关闭下拉
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            modelDropdown.classList.remove('show');
            if (editingMessageIndex !== null) cancelEdit();
        }
    });

    // 输入框：Shift+Enter 换行，不拦截 Enter
    messageInput.addEventListener('input', autoResize);

    // 事件委托：处理所有消息操作按钮（PC + 移动端）
    chatContainer.addEventListener('click', handleActionClick);
    chatContainer.addEventListener('touchend', handleActionClick);
}

// 统一的事件处理函数
function handleActionClick(e) {
    var target = e.target;
    while (target && target !== chatContainer) {
        if (target.classList.contains('edit-msg-btn')) {
            e.preventDefault();
            e.stopPropagation();
            var idx = parseInt(target.getAttribute('data-edit-idx'));
            if (!isNaN(idx)) startEdit(idx);
            return;
        }
        if (target.classList.contains('regenerate-btn')) {
            e.preventDefault();
            e.stopPropagation();
            var idx = parseInt(target.getAttribute('data-idx'));
            if (!isNaN(idx)) regenerateMessage(idx);
            return;
        }
        if (target.classList.contains('branch-msg-btn')) {
            e.preventDefault();
            e.stopPropagation();
            var idx = parseInt(target.getAttribute('data-idx'));
            if (!isNaN(idx)) branchFromMessage(idx);
            return;
        }
        target = target.parentElement;
    }
}

// ==================== 模型切换 ====================
function switchModel(modelKey) {
    currentModelKey = modelKey;
    currentModel = modelList.find(function(m) { return m.key === modelKey; }).id;
    localStorage.setItem('deepseek_model_key', modelKey);
    updateModelBtnText();
    renderDropdownActive();
    updateInputPlaceholder();
    showToast('已切换到 ' + modelList.find(function(m) { return m.key === modelKey; }).name);
}

function updateModelBtnText() {
    modelToggleBtn.textContent = modelList.find(function(m) { return m.key === currentModelKey; }).name + ' ▾';
}

function renderDropdownActive() {
    modelDropdown.querySelectorAll('.model-dropdown-item').forEach(function(item) {
        if (item.dataset.modelKey === currentModelKey) {
            item.classList.add('active');
        } else {
            item.classList.remove('active');
        }
    });
}

function updateInputPlaceholder() {
    if (editingMessageIndex !== null) {
        messageInput.placeholder = '✏️ 编辑中，点击发送提交...';
    } else if (currentModelKey === 'reasoner') {
        messageInput.placeholder = '深度思考模式...（Shift+Enter 换行）';
    } else {
        messageInput.placeholder = '输入消息...（Shift+Enter 换行）';
    }
}

// ==================== 对话管理 ====================
function loadConversations() {
    var saved = localStorage.getItem('deepseek_conversations');
    if (saved) {
        try { conversations = JSON.parse(saved); } catch (e) { conversations = []; }
    }
    renderChatList();
}

function saveConversations() {
    localStorage.setItem('deepseek_conversations', JSON.stringify(conversations));
}

function createNewChat(parentChatId, branchPoint) {
    var chat = {
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
        var p = conversations.find(function(c) { return c.id === parentChatId; });
        if (p) {
            chat.messages = p.messages.slice(0, branchPoint + 1);
            chat.title = p.title + ' (分支)';
            chat.modelKey = p.modelKey || currentModelKey;
            if (p.tokenUsage) chat.tokenUsage = { prompt_tokens: p.tokenUsage.prompt_tokens, completion_tokens: p.tokenUsage.completion_tokens, total_tokens: p.tokenUsage.total_tokens };
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
    cancelEdit();
    var chat = conversations.find(function(c) { return c.id === chatId; });
    if (!chat) return;
    chatTitle.textContent = chat.title;
    if (chat.modelKey && chat.modelKey !== currentModelKey) {
        currentModelKey = chat.modelKey;
        currentModel = modelList.find(function(m) { return m.key === currentModelKey; }).id;
        updateModelBtnText();
        renderDropdownActive();
        updateInputPlaceholder();
    }
    renderMessages(chat.messages);
    renderChatList();
}

function branchCurrentChat() {
    var chat = conversations.find(function(c) { return c.id === currentChatId; });
    if (!chat || chat.messages.length === 0) { alert('请先发送消息'); return; }
    var bp = chat.messages.length - 1;
    for (var i = chat.messages.length - 1; i >= 0; i--) {
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
        conversations = conversations.filter(function(c) { return c.id !== chatId; });
        saveConversations();
        renderChatList();
        if (chatId === currentChatId) switchChat(conversations[0].id);
    }
}

function renameChat(chatId) {
    var chat = conversations.find(function(c) { return c.id === chatId; });
    if (!chat) return;
    var t = prompt('输入新标题:', chat.title);
    if (t && t.trim()) {
        chat.title = t.trim();
        saveConversations();
        renderChatList();
        if (chatId === currentChatId) chatTitle.textContent = chat.title;
    }
}

function clearCurrentChat() {
    if (confirm('确定清空当前对话？')) {
        var chat = conversations.find(function(c) { return c.id === currentChatId; });
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

// ==================== 编辑消息 ====================
function startEdit(msgIndex) {
    var chat = conversations.find(function(c) { return c.id === currentChatId; });
    if (!chat || isWaiting) return;
    var msg = chat.messages[msgIndex];
    if (!msg || msg.role !== 'user') return;

    if (editingMessageIndex !== null && editingMessageIndex !== msgIndex) {
        cancelEditSilent();
    }

    editingMessageIndex = msgIndex;
    messageInput.value = msg.content;
    messageInput.focus();
    updateInputPlaceholder();
    showEditNotice();
    renderMessages(chat.messages);
    messageInput.scrollIntoView({ behavior: 'smooth' });
}

function cancelEdit() {
    editingMessageIndex = null;
    messageInput.value = '';
    updateInputPlaceholder();
    removeEditNotice();
    var chat = conversations.find(function(c) { return c.id === currentChatId; });
    if (chat) renderMessages(chat.messages);
}

function cancelEditSilent() {
    editingMessageIndex = null;
    updateInputPlaceholder();
    removeEditNotice();
}

function confirmEdit() {
    var chat = conversations.find(function(c) { return c.id === currentChatId; });
    if (!chat || editingMessageIndex === null) return;
    var newContent = messageInput.value.trim();
    if (!newContent) { cancelEdit(); return; }

    chat.messages[editingMessageIndex].content = newContent;
    chat.messages = chat.messages.slice(0, editingMessageIndex + 1);
    editingMessageIndex = null;
    messageInput.value = '';
    updateInputPlaceholder();
    removeEditNotice();
    chat.updatedAt = new Date().toISOString();
    saveConversations();
    renderMessages(chat.messages);
    renderChatList();
    autoResend();
}

function showEditNotice() {
    removeEditNotice();
    var notice = document.createElement('div');
    notice.id = 'editNotice';
    notice.className = 'edit-notice';
    notice.innerHTML = '✏️ 编辑模式 <button id="cancelEditBtn">取消</button>';
    document.body.appendChild(notice);
    document.getElementById('cancelEditBtn').addEventListener('click', cancelEdit);
}

function removeEditNotice() {
    var notice = document.getElementById('editNotice');
    if (notice) notice.remove();
}

async function autoResend() {
    var chat = conversations.find(function(c) { return c.id === currentChatId; });
    if (!chat || chat.messages.length === 0) return;
    var lastMsg = chat.messages[chat.messages.length - 1];
    if (lastMsg.role !== 'user') return;

    isWaiting = true;
    sendBtn.disabled = true;
    showTyping();

    try {
        var r = await callAPI(chat.messages);
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

function renderChatList(filter) {
    chatList.innerHTML = '';
    var list = filter
        ? conversations.filter(function(c) {
            return c.title.toLowerCase().includes(filter) || c.messages.some(function(m) { return m.content.toLowerCase().includes(filter); });
          })
        : conversations;

    if (!list.length) { chatList.innerHTML = '<div class="no-results">未找到</div>'; return; }

    list.forEach(function(chat) {
        var d = document.createElement('div');
        d.className = 'chat-item' + (chat.id === currentChatId ? ' active' : '');
        var tokens = (chat.tokenUsage && chat.tokenUsage.total_tokens) || 0;
        var title = chat.title;
        if (filter && !chat.title.toLowerCase().includes(filter)) {
            var match = chat.messages.find(function(m) { return m.content.toLowerCase().includes(filter); });
            if (match) title += ' (含: "' + match.content.substring(0, 15) + '...")';
        }

        d.innerHTML =
            '<div class="chat-item-info" data-chat-id="' + chat.id + '">' +
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

        d.querySelector('.chat-item-info').addEventListener('click', function() { switchChat(chat.id); closeSidebar(); });
        d.querySelector('.rename-chat').addEventListener('click', function(e) { e.stopPropagation(); renameChat(chat.id); });
        d.querySelector('.delete-chat').addEventListener('click', function(e) { e.stopPropagation(); deleteChat(chat.id); });
        chatList.appendChild(d);
    });
}

// ==================== 消息渲染 ====================
function renderMessages(messages) {
    chatContainer.innerHTML = '';
    if (!messages || !messages.length) {
        chatContainer.innerHTML =
            '<div class="welcome-message">' +
            '<div class="bot-avatar"><img src="' + AVATAR_URL + '" alt="助手"></div>' +
            '<div class="message-content">你好！我是 DeepSeek 助手<br>点击 ✏️ 编辑任意消息 | 🔄 重新生成 | 🔀 分支</div>' +
            '</div>';
        renderTokenStats();
        return;
    }

    var i = 0;
    while (i < messages.length) {
        if (messages[i].role === 'user') {
            var grp = document.createElement('div');
            grp.className = 'message-group';
            var isEditing = (i === editingMessageIndex);
            var userDiv = document.createElement('div');
            userDiv.className = 'message user' + (isEditing ? ' editing' : '');
            userDiv.innerHTML = '<div class="message-content">' + esc(messages[i].content) + '</div>';
            grp.appendChild(userDiv);

            if (i + 1 < messages.length && messages[i + 1].role === 'assistant') {
                var wrap = document.createElement('div');
                wrap.className = 'message-collapsible';
                var reasoning = messages[i + 1].reasoning;

                var hdr = document.createElement('div');
                hdr.className = 'message-collapsible-header';
                hdr.innerHTML =
                    '<span class="toggle-icon">▼</span><span>助手回复</span>' +
                    (reasoning ? '<span style="color:var(--warning-color);margin-left:6px;font-size:0.7rem">🧠思考</span>' : '') +
                    '<span style="flex:1"></span><span style="font-size:0.7rem;color:var(--text-muted)">折叠</span>';

                var body = document.createElement('div');
                body.className = 'message-collapsible-body';

                if (reasoning) {
                    var rb = document.createElement('div');
                    rb.className = 'reasoning-block';
                    rb.innerHTML =
                        '<div class="reasoning-header" onclick="this.nextElementSibling.classList.toggle(\'hidden\')">🧠 思考过程 <span class="toggle-icon">▼</span></div>' +
                        '<div class="reasoning-content">' + fmt(reasoning) + '</div>';
                    body.appendChild(rb);
                }

                body.appendChild(msgEl('assistant', messages[i + 1].content));

                var act = document.createElement('div');
                act.className = 'message-actions';
                act.innerHTML =
                    '<button class="edit-msg-btn" data-edit-idx="' + i + '">✏️ 编辑</button>' +
                    '<button class="regenerate-btn" data-idx="' + i + '">🔄 重新生成</button>' +
                    '<button class="branch-msg-btn" data-idx="' + i + '">🔀 分支</button>';
                body.appendChild(act);

                hdr.addEventListener('click', function() { body.classList.toggle('hidden'); hdr.classList.toggle('collapsed'); });
                wrap.appendChild(hdr);
                wrap.appendChild(body);
                grp.appendChild(wrap);
                i += 2;
            } else {
                var act2 = document.createElement('div');
                act2.className = 'message-actions';
                act2.style.cssText = 'padding-left:0;justify-content:flex-end;';
                act2.innerHTML = '<button class="edit-msg-btn" data-edit-idx="' + i + '">✏️ 编辑</button>';
                grp.appendChild(act2);
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
    var d = document.createElement('div');
    d.className = 'message ' + role;
    d.innerHTML = role === 'assistant'
        ? '<div class="bot-avatar"><img src="' + AVATAR_URL + '" alt="助手"></div><div class="message-content">' + fmt(content) + '</div>'
        : '<div class="message-content">' + esc(content) + '</div>';
    return d;
}

function renderTokenStats() {
    var old = document.getElementById('tokenStats');
    if (old) old.remove();
    var chat = conversations.find(function(c) { return c.id === currentChatId; });
    if (!chat || !chat.tokenUsage || !chat.tokenUsage.total_tokens) return;

    var d = document.createElement('div');
    d.id = 'tokenStats';
    d.className = 'token-stats';
    var ic = (chat.tokenUsage.prompt_tokens / 1000000 * 1).toFixed(4);
    var oc = (chat.tokenUsage.completion_tokens / 1000000 * 2).toFixed(4);
    d.innerHTML =
        '<div class="token-stats-content">' +
        '<span class="token-item">📥 ' + fmtToken(chat.tokenUsage.prompt_tokens) + '</span>' +
        '<span class="token-item">📤 ' + fmtToken(chat.tokenUsage.completion_tokens) + '</span>' +
        '<span class="token-item">🔢 ' + fmtToken(chat.tokenUsage.total_tokens) + '</span>' +
        '<span class="token-item token-cost">💰 ¥' + (parseFloat(ic) + parseFloat(oc)).toFixed(4) + '</span>' +
        '</div>';
    chatContainer.appendChild(d);
}

// ==================== 发送消息 ====================
async function sendMessage() {
    if (editingMessageIndex !== null) { confirmEdit(); return; }

    var content = messageInput.value.trim();
    if (!content || isWaiting) return;
    if (!apiKey) { alert('请先配置 API Key'); configBody.classList.remove('collapsed'); toggleConfig.classList.remove('collapsed'); return; }

    var chat = conversations.find(function(c) { return c.id === currentChatId; });
    if (!chat) return;

    chat.modelKey = currentModelKey;
    chat.messages.push({ role: 'user', content: content });
    renderMessages(chat.messages);
    messageInput.value = '';
    autoResize();
    removeFilePreview();
    chat.updatedAt = new Date().toISOString();
    if (chat.messages.length === 2 && chat.title === '新对话') {
        chat.title = content.substring(0, 20) + (content.length > 20 ? '...' : '');
    }
    saveConversations();
    renderChatList();

    isWaiting = true;
    sendBtn.disabled = true;
    showTyping();

    try {
        var r = await callAPI(chat.messages);
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
    var chat = conversations.find(function(c) { return c.id === currentChatId; });
    if (!chat || isWaiting) return;
    if (idx + 1 < chat.messages.length) chat.messages.splice(idx + 1, 1);
    chat.messages = chat.messages.slice(0, idx + 1);
    saveConversations();
    renderMessages(chat.messages);

    isWaiting = true; sendBtn.disabled = true; showTyping();
    try {
        var r = await callAPI(chat.messages);
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
    var body = { model: currentModel, messages: messages.map(function(m) { return { role: m.role, content: m.content }; }), stream: false };
    if (currentModelKey !== 'reasoner') { body.temperature = 0.7; body.max_tokens = 2000; }

    var res = await fetch('https://api.deepseek.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey },
        body: JSON.stringify(body)
    });

    if (!res.ok) { var err = await res.json(); throw new Error(err.error?.message || '请求失败'); }
    var data = await res.json();
    if (data.usage) addTokens(data.usage);
    return { content: data.choices[0].message.content, reasoning: data.choices[0].message.reasoning_content || null };
}

function addTokens(u) {
    var chat = conversations.find(function(c) { return c.id === currentChatId; });
    if (chat) {
        chat.tokenUsage = chat.tokenUsage || { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
        chat.tokenUsage.prompt_tokens += u.prompt_tokens || 0;
        chat.tokenUsage.completion_tokens += u.completion_tokens || 0;
        chat.tokenUsage.total_tokens += u.total_tokens || 0;
        saveConversations();
    }
}

// ==================== 文件处理 ====================
function handleFileSelect(e) {
    var f = e.target.files[0];
    if (!f) return;
    if (f.size > 10 * 1024 * 1024) { alert('文件太大'); fileInput.value = ''; return; }
    currentFile = f; showFilePreview(f); readFileContent(f);
}

function showFilePreview(f) {
    removeFilePreview();
    var p = document.createElement('div');
    p.className = 'file-preview';
    p.id = 'filePreview';
    p.innerHTML = '<div class="file-preview-info"><span>📄</span><span class="file-preview-name">' + esc(f.name) + '</span><span class="file-preview-size">' + fmtSize(f.size) + '</span></div><button class="file-preview-remove" onclick="removeFilePreview()">✕</button>';
    document.querySelector('.input-container').parentNode.insertBefore(p, document.querySelector('.input-container'));
}

function removeFilePreview() { var p = document.getElementById('filePreview'); if (p) p.remove(); currentFile = null; fileInput.value = ''; }

function readFileContent(f) {
    var r = new FileReader();
    var ext = f.name.split('.').pop().toLowerCase();
    var ok = ['txt','md','json','csv','js','py','html','css','xml','yaml','yml','log','sh','java','c','cpp','php','rb','go','rs','ts','tsx','vue','sql','swift','kt'];

    r.onload = function(e) {
        var t = '';
        if (ok.includes(ext)) {
            var ct = e.target.result;
            if (ct.length > 5000) ct = ct.substring(0, 5000) + '\n...(已截断)';
            t = '\n\n--- 文件: ' + f.name + ' ---\n' + ct + '\n--- 文件结束 ---';
        } else {
            var hints = { pdf:'PDF', doc:'Word', docx:'Word', xlsx:'Excel', png:'图片', jpg:'图片', jpeg:'图片' };
            t = '\n\n[' + (hints[ext] || '未知') + '文件: ' + f.name + ']';
        }
        messageInput.value += t; messageInput.focus(); autoResize();
    };

    ok.includes(ext) ? r.readAsText(f) : (messageInput.value += '\n\n[文件: ' + f.name + ']', messageInput.focus());
}

// ==================== 导出导入 ====================
function exportData() {
    var data = {
        conversations: conversations,
        apiKey: apiKey,
        currentModelKey: currentModelKey,
        exportTime: new Date().toISOString()
    };
    var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'deepseek-backup-' + new Date().toISOString().slice(0, 10) + '.json';
    a.click();
    URL.revokeObjectURL(url);
    showToast('✅ 数据已导出');
}

function importData(e) {
    var file = e.target.files[0];
    if (!file) return;

    var reader = new FileReader();
    reader.onload = function(ev) {
        try {
            var data = JSON.parse(ev.target.result);
            var msg = '导入将覆盖当前所有对话，确定继续？\n\n备份时间：' + (data.exportTime || '未知') + '\n对话数量：' + (data.conversations ? data.conversations.length : 0) + '个';

            if (confirm(msg)) {
                if (data.apiKey) { apiKey = data.apiKey; localStorage.setItem('deepseek_api_key', apiKey); apiKeyInput.value = apiKey; }
                if (data.conversations) { conversations = data.conversations; saveConversations(); }
                if (data.currentModelKey) {
                    currentModelKey = data.currentModelKey;
                    currentModel = modelList.find(function(m) { return m.key === currentModelKey; }).id;
                    localStorage.setItem('deepseek_model_key', currentModelKey);
                    updateModelBtnText();
                    renderDropdownActive();
                }
                renderChatList();
                if (conversations.length > 0) switchChat(conversations[0].id);
                showToast('✅ 已导入 ' + (data.conversations ? data.conversations.length : 0) + ' 个对话');
            }
        } catch (err) { alert('❌ 导入失败：文件格式不正确'); }
    };
    reader.readAsText(file);
    e.target.value = '';
}

// ==================== 工具函数 ====================
function fmt(s) {
    if (!s) return '';
    var f = esc(s);
    f = f.replace(/```(\w*)\n([\s\S]*?)```/g, function(_, l, c) { return '<pre><code>' + esc(c.trim()) + '</code></pre>'; });
    f = f.replace(/`([^`]+)`/g, '<code>$1</code>');
    f = f.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    f = f.replace(/\n/g, '<br>');
    return f;
}

function esc(s) { if (!s) return ''; var d = document.createElement('div'); d.textContent = s; return d.innerHTML; }

function saveApiKey() {
    var k = apiKeyInput.value.trim();
    if (!k) { alert('请输入 API Key'); return; }
    apiKey = k; localStorage.setItem('deepseek_api_key', apiKey);
    alert('✅ 已保存'); configBody.classList.add('collapsed'); toggleConfig.classList.add('collapsed');
}

function toggleConfigPanel() { configBody.classList.toggle('collapsed'); toggleConfig.classList.toggle('collapsed'); }

function showTyping() {
    var d = document.createElement('div');
    d.className = 'message assistant';
    d.id = 'typingIndicator';
    d.innerHTML = '<div class="bot-avatar"><img src="' + AVATAR_URL + '" alt="助手"></div><div class="message-content"><div class="typing-indicator"><span></span><span></span><span></span></div></div>';
    chatContainer.appendChild(d); scrollBottom();
}

function removeTyping() { var e = document.getElementById('typingIndicator'); if (e) e.remove(); }
function openSidebar() { sidebar.classList.add('open'); overlay.classList.add('show'); }
function closeSidebar() { sidebar.classList.remove('open'); overlay.classList.remove('show'); }
function autoResize() { messageInput.style.height = 'auto'; messageInput.style.height = Math.min(messageInput.scrollHeight, 100) + 'px'; }
function scrollBottom() { chatContainer.scrollTop = chatContainer.scrollHeight; }

function showToast(msg) {
    var e = document.getElementById('toast'); if (e) e.remove();
    var t = document.createElement('div'); t.id = 'toast'; t.className = 'toast'; t.textContent = msg;
    document.body.appendChild(t);
    requestAnimationFrame(function() { t.classList.add('show'); setTimeout(function() { t.classList.remove('show'); setTimeout(function() { t.remove(); }, 300); }, 1500); });
}

function fmtTime(d) {
    var df = Date.now() - d;
    if (df < 6e4) return '刚刚';
    if (df < 36e5) return Math.floor(df / 6e4) + '分钟前';
    if (df < 864e5) return Math.floor(df / 36e5) + '小时前';
    if (df < 6048e5) return Math.floor(df / 864e5) + '天前';
    return (d.getMonth() + 1) + '/' + d.getDate();
}

function fmtSize(b) { if (b < 1024) return b + ' B'; if (b < 1048576) return (b / 1024).toFixed(1) + ' KB'; return (b / 1048576).toFixed(1) + ' MB'; }
function fmtToken(c) { if (c >= 1e6) return (c / 1e6).toFixed(1) + 'M'; if (c >= 1e3) return (c / 1e3).toFixed(1) + 'K'; return String(c); }

// ==================== 启动 ====================
init();
