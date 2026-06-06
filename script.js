var apiKey = localStorage.getItem('deepseek_api_key') || '';
var conversations = [];
var currentChatId = null;
var isWaiting = false;
var currentFile = null;
var editingMessageIndex = null;

var AVATAR_URL = 'deepseek.png';

var modelList = [
    { key: 'chat', id: 'deepseek-chat', name: 'V3' },
    { key: 'reasoner', id: 'deepseek-reasoner', name: 'R1' }
];

var currentModelKey = localStorage.getItem('deepseek_model_key') || 'chat';
var currentModel = modelList.find(function(m) { return m.key === currentModelKey; }).id;

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
var summarizeBtn = document.getElementById('summarizeBtn');
var newFromSummaryBtn = document.getElementById('newFromSummaryBtn');
var contextInfo = document.getElementById('contextInfo');

// ==================== 初始化 ====================
function init() {
    if (apiKey) apiKeyInput.value = apiKey;
    loadConversations();
    if (conversations.length === 0) createNewChat();
    else switchChat(conversations[0].id);

    updateModelBtnText();
    renderDropdownActive();

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
    summarizeBtn.addEventListener('click', summarizeContext);
    newFromSummaryBtn.addEventListener('click', newFromSummary);

    modelToggleBtn.addEventListener('click', function(e) {
        e.preventDefault(); e.stopPropagation();
        modelDropdown.classList.toggle('show');
    });

    modelDropdown.querySelectorAll('.model-dropdown-item').forEach(function(item) {
        item.addEventListener('click', function(e) {
            e.preventDefault(); e.stopPropagation();
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
            if (editingMessageIndex !== null) cancelEdit();
        }
    });

    messageInput.addEventListener('input', autoResize);
    chatContainer.addEventListener('click', handleActionClick);
}

function handleActionClick(e) {
    var target = e.target;
    while (target && target !== chatContainer) {
        if (target.classList.contains('edit-msg-btn')) {
            e.preventDefault(); e.stopPropagation();
            var idx = parseInt(target.getAttribute('data-edit-idx'));
            if (!isNaN(idx)) startEdit(idx);
            return;
        }
        if (target.classList.contains('regenerate-btn')) {
            e.preventDefault(); e.stopPropagation();
            var idx = parseInt(target.getAttribute('data-idx'));
            if (!isNaN(idx)) regenerateMessage(idx);
            return;
        }
        if (target.classList.contains('branch-msg-btn')) {
            e.preventDefault(); e.stopPropagation();
            var idx = parseInt(target.getAttribute('data-idx'));
            if (!isNaN(idx)) branchFromMessage(idx);
            return;
        }
        target = target.parentElement;
    }
}

// ==================== 模型 ====================
function switchModel(modelKey) {
    currentModelKey = modelKey;
    currentModel = modelList.find(function(m) { return m.key === modelKey; }).id;
    localStorage.setItem('deepseek_model_key', modelKey);
    updateModelBtnText();
    renderDropdownActive();
    showToast('已切换到 ' + modelList.find(function(m) { return m.key === modelKey; }).name);
}

function updateModelBtnText() {
    modelToggleBtn.textContent = modelList.find(function(m) { return m.key === currentModelKey; }).name + ' ▾';
}

function renderDropdownActive() {
    modelDropdown.querySelectorAll('.model-dropdown-item').forEach(function(item) {
        item.classList.toggle('active', item.dataset.modelKey === currentModelKey);
    });
}

// ==================== 上下文估算 ====================
function estimateContextTokens(chat) {
    if (!chat || !chat.messages.length) return 0;
    var total = 0;
    chat.messages.forEach(function(msg) {
        var c = msg.content || '';
        var cn = (c.match(/[\u4e00-\u9fff]/g) || []).length;
        total += Math.ceil(cn * 0.6 + (c.length - cn) * 0.25);
    });
    return Math.max(total, (chat.tokenUsage && chat.tokenUsage.total_tokens) || 0);
}

function updateContextInfo() {
    var chat = conversations.find(function(c) { return c.id === currentChatId; });
    var tokens = chat ? estimateContextTokens(chat) : 0;
    contextInfo.textContent = '📊 ~' + fmtToken(tokens) + ' tokens';
    contextInfo.className = 'context-info';
    if (tokens > 4000) contextInfo.className = 'context-info danger';
    else if (tokens > 2000) contextInfo.className = 'context-info warning';
}

// ==================== 摘要 ====================
function summarizeContext() {
    var chat = conversations.find(function(c) { return c.id === currentChatId; });
    if (!chat || chat.messages.length === 0) { alert('无内容可摘要'); return; }
    if (isWaiting) { alert('请等待回复完成'); return; }
    if (!apiKey) { alert('请先配置 API Key'); configBody.classList.remove('collapsed'); toggleConfig.classList.remove('collapsed'); return; }

    var text = '';
    chat.messages.forEach(function(msg) {
        var role = msg.role === 'user' ? '用户' : 'AI';
        var c = msg.content.length > 300 ? msg.content.substring(0, 300) + '...' : msg.content;
        text += role + ': ' + c + '\n';
    });

    if (!confirm('调用 API 生成摘要？')) return;

    isWaiting = true; sendBtn.disabled = true;
    var loadingDiv = document.createElement('div');
    loadingDiv.className = 'message assistant';
    loadingDiv.id = 'summaryLoading';
    loadingDiv.innerHTML = '<div class="bot-avatar"><img src="' + AVATAR_URL + '"></div><div class="message-content">📋 生成摘要中...</div>';
    chatContainer.appendChild(loadingDiv);
    scrollBottom();

    callAPIStream(
        [{ role: 'user', content: '请将以下对话压缩为200字以内的前情提要：\n\n' + text }],
        function(fullText) {
            var el = document.getElementById('summaryLoading'); if (el) el.remove();
            chat.summary = fullText;
            chat.messages.push({ role: 'assistant', content: '📋 **前情提要**：\n\n' + fullText + '\n\n---\n💡 点击「🆕 从摘要新建」开始新对话', isSummary: true });
            chat.updatedAt = new Date().toISOString();
            saveConversations(); renderMessages(chat.messages); renderChatList(); updateContextInfo();
            isWaiting = false; sendBtn.disabled = false;
            showToast('✅ 摘要已生成');
        },
        function(err) {
            var el = document.getElementById('summaryLoading'); if (el) el.remove();
            isWaiting = false; sendBtn.disabled = false;
            alert('摘要失败: ' + err);
        }
    );
}

function newFromSummary() {
    var chat = conversations.find(function(c) { return c.id === currentChatId; });
    if (!chat || !chat.summary) { alert('请先生成摘要'); return; }
    if (!confirm('基于摘要创建新对话？')) return;

    var nc = {
        id: Date.now().toString(), title: chat.title + ' (续)', messages: [],
        parentId: chat.id, branchPoint: null, branches: [],
        modelKey: currentModelKey, summary: chat.summary,
        tokenUsage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
    };
    nc.messages.push({ role: 'user', content: '[前情提要]\n' + chat.summary + '\n\n请基于以上前情提要继续创作。', isContext: true });
    conversations.unshift(nc); saveConversations(); renderChatList();
    switchChat(nc.id); closeSidebar();
    showToast('✅ 新对话已创建');
}

// ==================== 对话管理 ====================
function loadConversations() {
    var s = localStorage.getItem('deepseek_conversations');
    if (s) { try { conversations = JSON.parse(s); } catch(e) { conversations = []; } }
    renderChatList();
}

function saveConversations() { localStorage.setItem('deepseek_conversations', JSON.stringify(conversations)); }

function createNewChat(parentChatId, branchPoint) {
    var chat = {
        id: Date.now().toString(), title: '新对话', messages: [],
        parentId: parentChatId || null, branchPoint: branchPoint || null, branches: [],
        modelKey: currentModelKey, summary: null,
        tokenUsage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
    };
    if (parentChatId && branchPoint !== null) {
        var p = conversations.find(function(c) { return c.id === parentChatId; });
        if (p) {
            chat.messages = p.messages.slice(0, branchPoint + 1);
            chat.title = p.title + ' (分支)'; chat.modelKey = p.modelKey || currentModelKey; chat.summary = p.summary;
            if (p.tokenUsage) chat.tokenUsage = { prompt_tokens: p.tokenUsage.prompt_tokens, completion_tokens: p.tokenUsage.completion_tokens, total_tokens: p.tokenUsage.total_tokens };
            p.branches = p.branches || []; p.branches.push({ chatId: chat.id, atMessageIndex: branchPoint });
        }
    }
    conversations.unshift(chat); saveConversations(); renderChatList(); switchChat(chat.id);
}

function switchChat(chatId) {
    currentChatId = chatId; cancelEdit();
    var chat = conversations.find(function(c) { return c.id === chatId; });
    if (!chat) return;
    chatTitle.textContent = chat.title;
    if (chat.modelKey && chat.modelKey !== currentModelKey) {
        currentModelKey = chat.modelKey; currentModel = modelList.find(function(m) { return m.key === currentModelKey; }).id;
        updateModelBtnText(); renderDropdownActive();
    }
    renderMessages(chat.messages); renderChatList(); updateContextInfo();
}

function branchCurrentChat() {
    var chat = conversations.find(function(c) { return c.id === currentChatId; });
    if (!chat || chat.messages.length === 0) { alert('请先发送消息'); return; }
    var bp = chat.messages.length - 1;
    for (var i = bp; i >= 0; i--) { if (chat.messages[i].role === 'user') { bp = i; break; } }
    if (confirm('从第 ' + (bp + 1) + ' 条消息处创建分支？')) { createNewChat(currentChatId, bp); closeSidebar(); }
}

function deleteChat(chatId) {
    if (conversations.length <= 1) { alert('至少保留一个'); return; }
    if (confirm('确定删除？')) {
        conversations = conversations.filter(function(c) { return c.id !== chatId; });
        saveConversations(); renderChatList();
        if (chatId === currentChatId) switchChat(conversations[0].id);
    }
}

function renameChat(chatId) {
    var chat = conversations.find(function(c) { return c.id === chatId; });
    if (!chat) return;
    var t = prompt('新标题:', chat.title);
    if (t && t.trim()) { chat.title = t.trim(); saveConversations(); renderChatList(); if (chatId === currentChatId) chatTitle.textContent = chat.title; }
}

function clearCurrentChat() {
    if (confirm('清空当前对话？')) {
        var chat = conversations.find(function(c) { return c.id === currentChatId; });
        if (chat) {
            chat.messages = []; chat.summary = null;
            chat.tokenUsage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
            chat.updatedAt = new Date().toISOString();
            cancelEdit(); saveConversations(); renderMessages([]); renderChatList(); updateContextInfo();
        }
    }
}

// ==================== 编辑 ====================
function startEdit(idx) {
    var chat = conversations.find(function(c) { return c.id === currentChatId; });
    if (!chat || isWaiting) return;
    var msg = chat.messages[idx];
    if (!msg || msg.role !== 'user' || msg.isContext) return;
    if (editingMessageIndex !== null && editingMessageIndex !== idx) cancelEditSilent();
    editingMessageIndex = idx; messageInput.value = msg.content; messageInput.focus();
    showEditNotice(); renderMessages(chat.messages);
}

function cancelEdit() {
    editingMessageIndex = null; messageInput.value = ''; removeEditNotice();
    var chat = conversations.find(function(c) { return c.id === currentChatId; });
    if (chat) renderMessages(chat.messages);
}

function cancelEditSilent() { editingMessageIndex = null; removeEditNotice(); }

function confirmEdit() {
    var chat = conversations.find(function(c) { return c.id === currentChatId; });
    if (!chat || editingMessageIndex === null) return;
    var nc = messageInput.value.trim(); if (!nc) { cancelEdit(); return; }
    chat.messages[editingMessageIndex].content = nc;
    chat.messages = chat.messages.slice(0, editingMessageIndex + 1);
    editingMessageIndex = null; messageInput.value = ''; removeEditNotice();
    chat.updatedAt = new Date().toISOString();
    saveConversations(); renderMessages(chat.messages); renderChatList(); updateContextInfo();
    autoResend();
}

function showEditNotice() {
    removeEditNotice();
    var n = document.createElement('div'); n.id = 'editNotice'; n.className = 'edit-notice';
    n.innerHTML = '✏️ 编辑模式 <button id="cancelEditBtn">取消</button>';
    document.body.appendChild(n);
    document.getElementById('cancelEditBtn').addEventListener('click', cancelEdit);
}

function removeEditNotice() { var n = document.getElementById('editNotice'); if (n) n.remove(); }

function autoResend() {
    var chat = conversations.find(function(c) { return c.id === currentChatId; });
    if (!chat || chat.messages.length === 0) return;
    if (chat.messages[chat.messages.length - 1].role !== 'user') return;

    isWaiting = true; sendBtn.disabled = true;
    var streamEl = createStreamingMessage();

    callAPIStream(chat.messages, function(fullText) {
        finishStreaming(streamEl, fullText);
        chat.messages.push({ role: 'assistant', content: fullText });
        chat.updatedAt = new Date().toISOString();
        saveConversations(); renderChatList(); updateContextInfo();
        isWaiting = false; sendBtn.disabled = false;
    }, function(err) {
        if (streamEl) streamEl.remove();
        isWaiting = false; sendBtn.disabled = false;
        showToast('错误: ' + err);
    });
}

// ==================== 搜索与列表 ====================
function handleSearch() { renderChatList(searchInput.value.trim().toLowerCase()); }

function renderChatList(filter) {
    chatList.innerHTML = '';
    var list = filter
        ? conversations.filter(function(c) { return c.title.toLowerCase().includes(filter) || c.messages.some(function(m) { return m.content.toLowerCase().includes(filter); }); })
        : conversations;
    if (!list.length) { chatList.innerHTML = '<div class="no-results">未找到</div>'; return; }

    list.forEach(function(chat) {
        var d = document.createElement('div');
        d.className = 'chat-item' + (chat.id === currentChatId ? ' active' : '');
        var tokens = estimateContextTokens(chat);
        var title = chat.title;
        if (filter && !chat.title.toLowerCase().includes(filter)) {
            var match = chat.messages.find(function(m) { return m.content.toLowerCase().includes(filter); });
            if (match) title += ' (含:"' + match.content.substring(0, 15) + '...")';
        }

        d.innerHTML = '<div class="chat-item-info" data-chat-id="' + chat.id + '">' +
            '<div class="chat-item-title">' + (chat.summary ? '📋 ' : '') + esc(title) + '</div>' +
            '<div class="chat-item-meta">' +
            '<span>' + fmtTime(new Date(chat.updatedAt)) + '</span>' +
            '<span>' + chat.messages.length + '条</span>' +
            (tokens > 0 ? '<span>🔢' + fmtToken(tokens) + '</span>' : '') +
            (chat.parentId ? '<span class="chat-item-branch">🔀</span>' : '') +
            '</div></div>' +
            '<div class="chat-item-actions">' +
            '<button class="rename-chat" data-chat-id="' + chat.id + '">✏️</button>' +
            '<button class="delete-chat" data-chat-id="' + chat.id + '">🗑️</button></div>';

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
        chatContainer.innerHTML = '<div class="welcome-message"><div class="bot-avatar"><img src="' + AVATAR_URL + '"></div><div class="message-content">你好！我是 DeepSeek 助手</div></div>';
        renderTokenStats(); return;
    }

    var i = 0;
    while (i < messages.length) {
        if (messages[i].role === 'user') {
            var grp = document.createElement('div'); grp.className = 'message-group';
            var isEditing = (i === editingMessageIndex);
            var isCtx = messages[i].isContext;
            var ud = document.createElement('div');
            ud.className = 'message user' + (isEditing ? ' editing' : '') + (isCtx ? ' summary' : '');
            ud.innerHTML = '<div class="message-content">' + esc(messages[i].content) + '</div>';
            grp.appendChild(ud);

            if (i + 1 < messages.length && messages[i + 1].role === 'assistant') {
                var wrap = document.createElement('div'); wrap.className = 'message-collapsible';
                var reasoning = messages[i + 1].reasoning;
                var isSum = messages[i + 1].isSummary;

                var hdr = document.createElement('div'); hdr.className = 'message-collapsible-header';
                hdr.innerHTML = '<span class="toggle-icon">▼</span><span>' + (isSum ? '📋 摘要' : '助手回复') + '</span>' +
                    (reasoning ? '<span style="color:var(--warning-color);margin-left:6px;font-size:0.7rem">🧠思考</span>' : '') +
                    '<span style="flex:1"></span><span style="font-size:0.7rem;color:var(--text-muted)">折叠</span>';

                var body = document.createElement('div'); body.className = 'message-collapsible-body';
                if (reasoning) {
                    var rb = document.createElement('div'); rb.className = 'reasoning-block';
                    rb.innerHTML = '<div class="reasoning-header" onclick="this.nextElementSibling.classList.toggle(\'hidden\')">🧠 思考过程</div><div class="reasoning-content">' + fmt(reasoning) + '</div>';
                    body.appendChild(rb);
                }
                var ad = document.createElement('div');
                ad.className = 'message assistant' + (isSum ? ' summary' : '');
                ad.innerHTML = (isSum ? '' : '<div class="bot-avatar"><img src="' + AVATAR_URL + '"></div>') + '<div class="message-content">' + fmt(messages[i + 1].content) + '</div>';
                body.appendChild(ad);

                if (!isSum && !isCtx) {
                    var act = document.createElement('div'); act.className = 'message-actions';
                    act.innerHTML = '<button class="edit-msg-btn" data-edit-idx="' + i + '">✏️ 编辑</button>' +
                        '<button class="regenerate-btn" data-idx="' + i + '">🔄 重生成</button>' +
                        '<button class="branch-msg-btn" data-idx="' + i + '">🔀 分支</button>';
                    body.appendChild(act);
                }
                hdr.addEventListener('click', function() { body.classList.toggle('hidden'); });
                wrap.appendChild(hdr); wrap.appendChild(body); grp.appendChild(wrap);
                i += 2;
            } else {
                if (!isCtx) {
                    var act2 = document.createElement('div'); act2.className = 'message-actions';
                    act2.style.cssText = 'padding-left:0;justify-content:flex-end';
                    act2.innerHTML = '<button class="edit-msg-btn" data-edit-idx="' + i + '">✏️ 编辑</button>';
                    grp.appendChild(act2);
                }
                i++;
            }
            chatContainer.appendChild(grp);
        } else {
            var ad2 = document.createElement('div');
            ad2.className = 'message assistant' + (messages[i].isSummary ? ' summary' : '');
            ad2.innerHTML = (messages[i].isSummary ? '' : '<div class="bot-avatar"><img src="' + AVATAR_URL + '"></div>') + '<div class="message-content">' + fmt(messages[i].content) + '</div>';
            chatContainer.appendChild(ad2);
            i++;
        }
    }
    renderTokenStats(); updateContextInfo(); scrollBottom();
}

function renderTokenStats() {
    var old = document.getElementById('tokenStats'); if (old) old.remove();
    var chat = conversations.find(function(c) { return c.id === currentChatId; });
    if (!chat || !chat.tokenUsage || !chat.tokenUsage.total_tokens) return;
    var d = document.createElement('div'); d.id = 'tokenStats'; d.className = 'token-stats';
    var ic = (chat.tokenUsage.prompt_tokens / 1e6 * 1).toFixed(6);
    var oc = (chat.tokenUsage.completion_tokens / 1e6 * 2).toFixed(6);
    d.innerHTML = '<div class="token-stats-content">' +
        '<span class="token-item">📥 ' + fmtToken(chat.tokenUsage.prompt_tokens) + '</span>' +
        '<span class="token-item">📤 ' + fmtToken(chat.tokenUsage.completion_tokens) + '</span>' +
        '<span class="token-item">🔢 ' + fmtToken(chat.tokenUsage.total_tokens) + '</span>' +
        '<span class="token-item token-cost">💰 ¥' + (parseFloat(ic)+parseFloat(oc)).toFixed(6) + '</span></div>';
    chatContainer.appendChild(d);
}

// ==================== 发送消息 ====================
function sendMessage() {
    if (editingMessageIndex !== null) { confirmEdit(); return; }
    var content = messageInput.value.trim();
    if (!content || isWaiting) return;
    if (!apiKey) { alert('请先配置 API Key'); configBody.classList.remove('collapsed'); toggleConfig.classList.remove('collapsed'); return; }

    var chat = conversations.find(function(c) { return c.id === currentChatId; });
    if (!chat) return;

    chat.modelKey = currentModelKey;
    chat.messages.push({ role: 'user', content: content });
    renderMessages(chat.messages);
    messageInput.value = ''; autoResize(); removeFilePreview();
    chat.updatedAt = new Date().toISOString();
    if (chat.messages.length === 2 && chat.title === '新对话') {
        chat.title = content.substring(0, 20) + (content.length > 20 ? '...' : '');
    }
    saveConversations(); renderChatList();

    isWaiting = true; sendBtn.disabled = true;
    var streamEl = createStreamingMessage();

    callAPIStream(chat.messages, function(fullText) {
        finishStreaming(streamEl, fullText);
        chat.messages.push({ role: 'assistant', content: fullText });
        chat.updatedAt = new Date().toISOString();
        saveConversations(); renderChatList(); updateContextInfo();
        isWaiting = false; sendBtn.disabled = false;
    }, function(err) {
        if (streamEl) streamEl.remove();
        isWaiting = false; sendBtn.disabled = false;
        chatContainer.innerHTML += '<div class="message assistant"><div class="bot-avatar"><img src="' + AVATAR_URL + '"></div><div class="message-content">❌ ' + esc(err) + '</div></div>';
    });
}

function createStreamingMessage() {
    var div = document.createElement('div');
    div.className = 'message assistant'; div.id = 'streamingMessage';
    div.innerHTML = '<div class="bot-avatar"><img src="' + AVATAR_URL + '"></div><div class="message-content"><span class="streaming-cursor"></span></div>';
    chatContainer.appendChild(div); scrollBottom();
    return div;
}

function finishStreaming(el, text) {
    if (!el) return;
    el.querySelector('.message-content').innerHTML = fmt(text);
    el.removeAttribute('id');
}

// ==================== API 流式 ====================
function callAPIStream(messages, onDone, onError) {
    var body = {
        model: currentModel,
        messages: messages.map(function(m) { return { role: m.role, content: m.content }; }),
        stream: true
    };
    if (currentModelKey !== 'reasoner') { body.temperature = 0.7; body.max_tokens = 4096; }

    fetch('https://api.deepseek.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey },
        body: JSON.stringify(body)
    }).then(function(res) {
        if (!res.ok) {
            return res.json().then(function(e) { throw new Error(e.error?.message || 'HTTP ' + res.status); });
        }
        var reader = res.body.getReader();
        var decoder = new TextDecoder();
        var fullText = '';
        var streamEl = document.getElementById('streamingMessage');
        var contentEl = streamEl ? streamEl.querySelector('.message-content') : null;

        function process() {
            reader.read().then(function(result) {
                if (result.done) {
                    if (contentEl) contentEl.innerHTML = fmt(fullText);
                    var pt = 0;
                    messages.forEach(function(m) { pt += (m.content || '').length; });
                    addTokens({ prompt_tokens: Math.ceil(pt * 0.4), completion_tokens: Math.ceil(fullText.length * 0.5), total_tokens: Math.ceil(pt * 0.4 + fullText.length * 0.5) });
                    onDone(fullText);
                    return;
                }
                var chunk = decoder.decode(result.value, { stream: true });
                var lines = chunk.split('\n');
                for (var i = 0; i < lines.length; i++) {
                    var line = lines[i].trim();
                    if (line.startsWith('data: ') && line !== 'data: [DONE]') {
                        try {
                            var data = JSON.parse(line.substring(6));
                            var delta = data.choices && data.choices[0] && data.choices[0].delta;
                            if (delta && delta.content) {
                                fullText += delta.content;
                                if (contentEl) contentEl.innerHTML = fmt(fullText) + '<span class="streaming-cursor"></span>';
                            }
                            if (data.usage) addTokens(data.usage);
                        } catch(e) {}
                    }
                }
                scrollBottom();
                process();
            }).catch(function(err) {
                if (fullText) {
                    onDone(fullText);
                } else {
                    onError(err.message);
                }
            });
        }
        process();
    }).catch(function(err) {
        onError(err.message);
    });
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

function regenerateMessage(idx) {
    var chat = conversations.find(function(c) { return c.id === currentChatId; });
    if (!chat || isWaiting) return;
    if (idx + 1 < chat.messages.length) chat.messages.splice(idx + 1, 1);
    chat.messages = chat.messages.slice(0, idx + 1);
    saveConversations(); renderMessages(chat.messages); updateContextInfo();

    isWaiting = true; sendBtn.disabled = true;
    var streamEl = createStreamingMessage();
    callAPIStream(chat.messages, function(fullText) {
        finishStreaming(streamEl, fullText);
        chat.messages.push({ role: 'assistant', content: fullText });
        chat.updatedAt = new Date().toISOString();
        saveConversations(); renderChatList(); updateContextInfo();
        isWaiting = false; sendBtn.disabled = false;
    }, function(err) {
        if (streamEl) streamEl.remove();
        isWaiting = false; sendBtn.disabled = false;
        showToast('错误: ' + err);
    });
}

function branchFromMessage(idx) {
    if (confirm('从第 ' + (idx + 1) + ' 条消息创建分支？')) { createNewChat(currentChatId, idx); closeSidebar(); }
}

// ==================== 文件 ====================
function handleFileSelect(e) {
    var f = e.target.files[0]; if (!f) return;
    if (f.size > 10*1024*1024) { alert('文件太大'); fileInput.value = ''; return; }
    currentFile = f; showFilePreview(f); readFileContent(f);
}

function showFilePreview(f) {
    removeFilePreview();
    var p = document.createElement('div'); p.className = 'file-preview'; p.id = 'filePreview';
    p.innerHTML = '<div class="file-preview-info"><span>📄</span><span class="file-preview-name">' + esc(f.name) + '</span></div><button class="file-preview-remove" id="removeFilePreviewBtn">✕</button>';
    document.querySelector('.input-container').parentNode.insertBefore(p, document.querySelector('.input-container'));
    document.getElementById('removeFilePreviewBtn').addEventListener('click', removeFilePreview);
}

function removeFilePreview() { var p = document.getElementById('filePreview'); if (p) p.remove(); currentFile = null; fileInput.value = ''; }

function readFileContent(f) {
    var r = new FileReader();
    var ext = f.name.split('.').pop().toLowerCase();
    var ok = ['txt','md','json','csv','js','py','html','css','xml','yaml','yml','log','sh','java','c','cpp','php','rb','go','rs','ts','tsx','vue','sql','swift','kt'];
    r.onload = function(e) {
        var t = '';
        if (ok.includes(ext)) {
            var ct = e.target.result; if (ct.length > 5000) ct = ct.substring(0, 5000) + '\n...(已截断)';
            t = '\n\n--- 文件: ' + f.name + ' ---\n' + ct + '\n--- 文件结束 ---';
        } else {
            t = '\n\n[文件: ' + f.name + ']';
        }
        messageInput.value += t; messageInput.focus(); autoResize();
    };
    ok.includes(ext) ? r.readAsText(f) : (messageInput.value += '\n\n[文件: ' + f.name + ']', messageInput.focus());
}

// ==================== 导出导入 ====================
function exportData() {
    var data = { conversations: conversations, apiKey: apiKey, currentModelKey: currentModelKey, exportTime: new Date().toISOString() };
    var blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
    var a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = 'deepseek-backup-' + new Date().toISOString().slice(0, 10) + '.json';
    a.click(); showToast('✅ 已导出');
}

function importData(e) {
    var file = e.target.files[0]; if (!file) return;
    var reader = new FileReader();
    reader.onload = function(ev) {
        try {
            var data = JSON.parse(ev.target.result);
            if (confirm('导入将覆盖当前数据？')) {
                if (data.apiKey) { apiKey = data.apiKey; localStorage.setItem('deepseek_api_key', apiKey); apiKeyInput.value = apiKey; }
                if (data.conversations) { conversations = data.conversations; saveConversations(); }
                if (data.currentModelKey) { currentModelKey = data.currentModelKey; currentModel = modelList.find(function(m) { return m.key === currentModelKey; }).id; localStorage.setItem('deepseek_model_key', currentModelKey); updateModelBtnText(); renderDropdownActive(); }
                renderChatList(); if (conversations.length > 0) switchChat(conversations[0].id);
                showToast('✅ 已导入');
            }
        } catch(err) { alert('文件格式错误'); }
    };
    reader.readAsText(file); e.target.value = '';
}

// ==================== 工具 ====================
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
    var k = apiKeyInput.value.trim(); if (!k) { alert('请输入 API Key'); return; }
    apiKey = k; localStorage.setItem('deepseek_api_key', apiKey);
    alert('✅ 已保存'); configBody.classList.add('collapsed'); toggleConfig.classList.add('collapsed');
}

function toggleConfigPanel() { configBody.classList.toggle('collapsed'); toggleConfig.classList.toggle('collapsed'); }
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
    if (df < 36e5) return Math.floor(df/6e4) + '分钟前';
    if (df < 864e5) return Math.floor(df/36e5) + '小时前';
    if (df < 6048e5) return Math.floor(df/864e5) + '天前';
    return (d.getMonth()+1) + '/' + d.getDate();
}

function fmtToken(c) {
    if (c >= 1e6) return (c/1e6).toFixed(1) + 'M';
    if (c >= 1e3) return (c/1e3).toFixed(1) + 'K';
    return String(c);
}

// 启动
init();
