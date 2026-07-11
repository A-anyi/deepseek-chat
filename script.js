// ==================== 全局变量 ====================
var apiKey = localStorage.getItem('deepseek_api_key') || '';
var conversations = [];
var currentChatId = null;
var isWaiting = false;
var currentFile = null;
var editingMessageIndex = null;
var abortController = null;
var streamBuffer = '';
var streamTimer = null;

var AVATAR_URL = 'deepseek.png';

var modelList = [
    { key: 'pro', id: 'deepseek-v4-pro', name: 'V4-Pro', desc: '旗舰模型' },
    { key: 'flash', id: 'deepseek-v4-flash', name: 'V4-Flash', desc: '极速响应' }
];

var currentModelKey = localStorage.getItem('deepseek_model_key') || 'pro';
var currentModel = modelList.find(function(m) { return m.key === currentModelKey; }).id;

var chatContainer = document.getElementById('chatContainer');
var messageInput = document.getElementById('messageInput');
var sendBtn = document.getElementById('sendBtn');
var stopBtn = document.getElementById('stopBtn');
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

    sendBtn.addEventListener('click', sendMessage);
    stopBtn.addEventListener('click', stopGeneration);
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
    chatContainer.addEventListener('touchend', handleActionClick);
      // 初始化系统设定
    loadSavedSystemPrompt();
    var sp = document.getElementById('systemPrompt');
    if (sp) {
        sp.addEventListener('input', autoSaveSystemPrompt);
    }
}

function handleActionClick(e) {
    var target = e.target;
    while (target && target !== chatContainer) {
        // 复制按钮
        if (target.classList.contains('copy-btn')) {
            e.preventDefault(); e.stopPropagation();
            var content = target.getAttribute('data-copy-content');
            if (content) copyToClipboard(content, target);
            return;
        }
        if (target.classList.contains('edit-msg-btn')) {
            e.preventDefault(); e.stopPropagation();
            var idx = parseInt(target.getAttribute('data-edit-idx'));
            if (!isNaN(idx)) startEdit(idx); return;
        }
        if (target.classList.contains('regenerate-btn')) {
            e.preventDefault(); e.stopPropagation();
            var idx = parseInt(target.getAttribute('data-idx'));
            if (!isNaN(idx)) regenerateMessage(idx); return;
        }
        if (target.classList.contains('branch-msg-btn')) {
            e.preventDefault(); e.stopPropagation();
            var idx = parseInt(target.getAttribute('data-idx'));
            if (!isNaN(idx)) branchFromMessage(idx); return;
        }
        target = target.parentElement;
    }
}

// 复制到剪贴板
function copyToClipboard(text, btn) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function() {
            showCopySuccess(btn);
        }).catch(function() {
            fallbackCopy(text, btn);
        });
    } else {
        fallbackCopy(text, btn);
    }
}

function fallbackCopy(text, btn) {
    var textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    textarea.style.top = '-9999px';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    try {
        document.execCommand('copy');
        showCopySuccess(btn);
    } catch (e) {
        showToast('❌ 复制失败');
    }
    document.body.removeChild(textarea);
}

function showCopySuccess(btn) {
    var originalText = btn.textContent;
    btn.textContent = '✅ 已复制';
    btn.classList.add('copied');
    setTimeout(function() {
        btn.textContent = originalText;
        btn.classList.remove('copied');
    }, 1500);
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

// ==================== 停止 ====================
function stopGeneration() {
    if (abortController) { abortController.abort(); abortController = null; }
    if (streamTimer) { cancelAnimationFrame(streamTimer); streamTimer = null; }
    streamBuffer = '';
    isWaiting = false; sendBtn.disabled = false; stopBtn.style.display = 'none';
    var c = document.querySelector('.streaming-cursor');
    if (c) c.classList.remove('streaming-cursor');
    showToast('⏹ 已停止');
}

// ==================== 对话管理 ====================
function loadConversations() {
    var saved = localStorage.getItem('deepseek_conversations');
    if (saved) { try { conversations = JSON.parse(saved); } catch (e) { conversations = []; } }
    renderChatList();
}

function saveConversations() { localStorage.setItem('deepseek_conversations', JSON.stringify(conversations)); }

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
    currentChatId = chatId; cancelEdit();
    var chat = conversations.find(function(c) { return c.id === chatId; });
    if (!chat) return;
    chatTitle.textContent = chat.title;
    if (chat.modelKey && chat.modelKey !== currentModelKey) {
        currentModelKey = chat.modelKey;
        currentModel = modelList.find(function(m) { return m.key === currentModelKey; }).id;
        updateModelBtnText(); renderDropdownActive();
    }
    renderMessages(chat.messages); renderChatList();
}

function branchCurrentChat() {
    var chat = conversations.find(function(c) { return c.id === currentChatId; });
    if (!chat || chat.messages.length === 0) { alert('请先发送消息'); return; }
    var bp = chat.messages.length - 1;
    for (var i = bp; i >= 0; i--) { if (chat.messages[i].role === 'user') { bp = i; break; } }
    if (confirm('从第 ' + (bp + 1) + ' 条消息处创建分支？')) { createNewChat(currentChatId, bp); closeSidebar(); }
}

function deleteChat(chatId) {
    if (conversations.length <= 1) { alert('至少保留一个对话'); return; }
    if (confirm('确定删除这个对话吗？')) {
        conversations = conversations.filter(function(c) { return c.id !== chatId; });
        saveConversations(); renderChatList();
        if (chatId === currentChatId) switchChat(conversations[0].id);
    }
}

function renameChat(chatId) {
    var chat = conversations.find(function(c) { return c.id === chatId; });
    if (!chat) return;
    var t = prompt('输入新标题:', chat.title);
    if (t && t.trim()) { chat.title = t.trim(); saveConversations(); renderChatList(); if (chatId === currentChatId) chatTitle.textContent = chat.title; }
}

function clearCurrentChat() {
    if (confirm('确定清空当前对话？')) {
        var chat = conversations.find(function(c) { return c.id === currentChatId; });
        if (chat) {
            chat.messages = [];
            chat.tokenUsage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
            chat.updatedAt = new Date().toISOString();
            cancelEdit(); saveConversations(); renderMessages([]); renderChatList();
        }
    }
}

// ==================== 编辑 ====================
function startEdit(msgIndex) {
    var chat = conversations.find(function(c) { return c.id === currentChatId; });
    if (!chat || isWaiting) return;
    var msg = chat.messages[msgIndex];
    if (!msg || msg.role !== 'user') return;
    if (editingMessageIndex !== null && editingMessageIndex !== msgIndex) cancelEditSilent();
    editingMessageIndex = msgIndex;
    messageInput.value = msg.content; messageInput.focus();
    showEditNotice(); renderMessages(chat.messages);
    messageInput.scrollIntoView({ behavior: 'smooth' });
}

function cancelEdit() { editingMessageIndex = null; messageInput.value = ''; removeEditNotice(); var c = conversations.find(function(c) { return c.id === currentChatId; }); if (c) renderMessages(c.messages); }
function cancelEditSilent() { editingMessageIndex = null; removeEditNotice(); }

function confirmEdit() {
    var chat = conversations.find(function(c) { return c.id === currentChatId; });
    if (!chat || editingMessageIndex === null) return;
    var nc = messageInput.value.trim();
    if (!nc) { cancelEdit(); return; }
    chat.messages[editingMessageIndex].content = nc;
    chat.messages = chat.messages.slice(0, editingMessageIndex + 1);
    editingMessageIndex = null; messageInput.value = ''; removeEditNotice();
    chat.updatedAt = new Date().toISOString();
    saveConversations(); renderMessages(chat.messages); renderChatList();
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

async function autoResend() { doStreamRequest(); }

// ==================== 搜索 ====================
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
        var tokens = (chat.tokenUsage && chat.tokenUsage.total_tokens) || 0;
        var title = chat.title;
        if (filter && !chat.title.toLowerCase().includes(filter)) {
            var m = chat.messages.find(function(m) { return m.content.toLowerCase().includes(filter); });
            if (m) title += ' (含: "' + m.content.substring(0, 15) + '...")';
        }
        d.innerHTML =
            '<div class="chat-item-info" data-chat-id="' + chat.id + '">' +
            '<div class="chat-item-title">' + esc(title) + '</div>' +
            '<div class="chat-item-meta"><span>' + fmtTime(new Date(chat.updatedAt)) + '</span><span>' + chat.messages.length + '条</span>' +
            (tokens > 0 ? '<span>🔢' + fmtToken(tokens) + '</span>' : '') +
            (chat.parentId ? '<span class="chat-item-branch">🔀</span>' : '') +
            ((chat.branches || []).length > 0 ? '<span class="chat-item-branch">🌿' + chat.branches.length + '</span>' : '') +
            '</div></div>' +
            '<div class="chat-item-actions"><button class="rename-chat" data-chat-id="' + chat.id + '">✏️</button><button class="delete-chat" data-chat-id="' + chat.id + '">🗑️</button></div>';
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
        chatContainer.innerHTML = '<div class="welcome-message"><div class="bot-avatar"><img src="' + AVATAR_URL + '"></div><div class="message-content">你好！我是 DeepSeek 助手<br>流式输出 | ✏️ 编辑 | 📋 复制 | 🔄 重新生成</div></div>';
        renderTokenStats(); return;
    }
    var i = 0;
    while (i < messages.length) {
        if (messages[i].role === 'user') {
            var grp = document.createElement('div'); grp.className = 'message-group';
            var isEdit = (i === editingMessageIndex);
            var ud = document.createElement('div');
            ud.className = 'message user' + (isEdit ? ' editing' : '');
            ud.innerHTML = '<div class="message-content">' + esc(messages[i].content) + '</div>';
            grp.appendChild(ud);
            
            // 用户消息的操作按钮（复制 + 编辑）
            var userAct = document.createElement('div');
            userAct.className = 'message-actions';
            userAct.style.cssText = 'padding-left:0;justify-content:flex-end;';
            userAct.innerHTML = '<button class="copy-btn" data-copy-content="' + escAttr(messages[i].content) + '">📋 复制</button>' +
                '<button class="edit-msg-btn" data-edit-idx="' + i + '">✏️ 编辑</button>';
            grp.appendChild(userAct);
            
            if (i + 1 < messages.length && messages[i + 1].role === 'assistant') {
                var wrap = document.createElement('div'); wrap.className = 'message-collapsible';
                var hdr = document.createElement('div'); hdr.className = 'message-collapsible-header';
                hdr.innerHTML = '<span class="toggle-icon">▼</span><span>助手回复</span><span style="flex:1"></span><span style="font-size:0.7rem;color:var(--text-muted)">折叠</span>';
                var body = document.createElement('div'); body.className = 'message-collapsible-body';
                body.appendChild(msgEl('assistant', messages[i + 1].content));
                
                // 助手消息的操作按钮（复制 + 重新生成 + 分支）
                var act = document.createElement('div'); act.className = 'message-actions';
                act.innerHTML = '<button class="copy-btn" data-copy-content="' + escAttr(messages[i + 1].content) + '">📋 复制</button>' +
                    '<button class="regenerate-btn" data-idx="' + i + '">🔄 重新生成</button>' +
                    '<button class="branch-msg-btn" data-idx="' + i + '">🔀 分支</button>';
                body.appendChild(act);
                hdr.addEventListener('click', function() { body.classList.toggle('hidden'); hdr.classList.toggle('collapsed'); });
                wrap.appendChild(hdr); wrap.appendChild(body); grp.appendChild(wrap);
                i += 2;
            } else {
                i++;
            }
            chatContainer.appendChild(grp);
        } else {
            // 孤立的助手消息
            var assistantGrp = document.createElement('div'); assistantGrp.className = 'message-group';
            assistantGrp.appendChild(msgEl('assistant', messages[i].content));
            var aAct = document.createElement('div'); aAct.className = 'message-actions';
            aAct.innerHTML = '<button class="copy-btn" data-copy-content="' + escAttr(messages[i].content) + '">📋 复制</button>';
            assistantGrp.appendChild(aAct);
            chatContainer.appendChild(assistantGrp);
            i++;
        }
    }
    renderTokenStats(); scrollBottom();
}

function msgEl(role, content) {
    var d = document.createElement('div'); d.className = 'message ' + role;
    d.innerHTML = role === 'assistant'
        ? '<div class="bot-avatar"><img src="' + AVATAR_URL + '"></div><div class="message-content">' + fmt(content) + '</div>'
        : '<div class="message-content">' + esc(content) + '</div>';
    return d;
}

function renderTokenStats() {
    var old = document.getElementById('tokenStats'); if (old) old.remove();
    var chat = conversations.find(function(c) { return c.id === currentChatId; });
    if (!chat || !chat.tokenUsage || !chat.tokenUsage.total_tokens) return;
    var d = document.createElement('div'); d.id = 'tokenStats'; d.className = 'token-stats';
    var ic = (chat.tokenUsage.prompt_tokens / 1000000 * 1).toFixed(4);
    var oc = (chat.tokenUsage.completion_tokens / 1000000 * 2).toFixed(4);
    d.innerHTML = '<div class="token-stats-content"><span class="token-item">📥 输入 ' + fmtToken(chat.tokenUsage.prompt_tokens) + '</span><span class="token-item">📤 输出 ' + fmtToken(chat.tokenUsage.completion_tokens) + '</span><span class="token-item">🔢 总计 ' + fmtToken(chat.tokenUsage.total_tokens) + '</span><span class="token-item token-cost">💰 ¥' + (parseFloat(ic) + parseFloat(oc)).toFixed(4) + '</span></div>';
    chatContainer.appendChild(d);
}

// ==================== 发送 ====================
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
    messageInput.value = ''; autoResize(); removeFilePreview();
    chat.updatedAt = new Date().toISOString();
    if (chat.messages.length === 2 && chat.title === '新对话') chat.title = content.substring(0, 20) + (content.length > 20 ? '...' : '');
    saveConversations(); renderChatList();

    doStreamRequest();
}

async function regenerateMessage(idx) {
    var chat = conversations.find(function(c) { return c.id === currentChatId; });
    if (!chat || isWaiting) return;
    if (idx + 1 < chat.messages.length) chat.messages.splice(idx + 1, 1);
    chat.messages = chat.messages.slice(0, idx + 1);
    saveConversations(); renderMessages(chat.messages);
    doStreamRequest();
}

function branchFromMessage(idx) {
    if (confirm('从第 ' + (idx + 1) + ' 条消息处创建分支？')) { createNewChat(currentChatId, idx); closeSidebar(); }
}

// ==================== 流式请求 ====================
function doStreamRequest() {
    var chat = conversations.find(function(c) { return c.id === currentChatId; });
    if (!chat || !chat.messages.length) return;
    var lm = chat.messages[chat.messages.length - 1];
    if (lm.role !== 'user') return;

    isWaiting = true;
    sendBtn.disabled = true;
    stopBtn.style.display = 'inline-block';

    chat.messages.push({ role: 'assistant', content: '', reasoning: null });
    renderMessages(chat.messages);

    var contentEl = chatContainer.querySelector('.message.assistant:last-of-type .message-content');
    if (contentEl) contentEl.classList.add('streaming-cursor');

    streamBuffer = '';
    abortController = new AbortController();
    var finalUsage = null;

    callAPIStream(buildMessagesWithSystemPrompt(chat.messages.slice(0, -1)), function(chunk) {
        streamBuffer += chunk;
        if (!streamTimer) {
            streamTimer = requestAnimationFrame(function() {
                flushStreamBuffer(chat, contentEl);
            });
        }
    }, function(usage) {
        finalUsage = usage;
    }, abortController.signal).then(function() {
        flushStreamBufferFinal(chat, contentEl);
        if (contentEl) contentEl.classList.remove('streaming-cursor');

        if (finalUsage) {
            chat.tokenUsage = chat.tokenUsage || { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
            chat.tokenUsage.prompt_tokens += finalUsage.prompt_tokens || 0;
            chat.tokenUsage.completion_tokens += finalUsage.completion_tokens || 0;
            chat.tokenUsage.total_tokens += finalUsage.total_tokens || 0;
        }

        chat.updatedAt = new Date().toISOString();
        saveConversations();
        renderMessages(chat.messages);
        renderChatList();
        isWaiting = false;
        sendBtn.disabled = false;
        stopBtn.style.display = 'none';
        abortController = null;
    }).catch(function(e) {
        if (streamTimer) { cancelAnimationFrame(streamTimer); streamTimer = null; }
        if (contentEl) contentEl.classList.remove('streaming-cursor');
        if (e.name === 'AbortError') {
            flushStreamBufferFinal(chat, contentEl);
            if (finalUsage) {
                chat.tokenUsage = chat.tokenUsage || { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
                chat.tokenUsage.prompt_tokens += finalUsage.prompt_tokens || 0;
                chat.tokenUsage.completion_tokens += finalUsage.completion_tokens || 0;
                chat.tokenUsage.total_tokens += finalUsage.total_tokens || 0;
            }
            chat.updatedAt = new Date().toISOString();
            saveConversations();
            renderMessages(chat.messages);
            renderChatList();
        } else {
            chat.messages.pop();
            chatContainer.innerHTML += '<div class="message assistant"><div class="bot-avatar"><img src="' + AVATAR_URL + '"></div><div class="message-content">❌ ' + esc(e.message) + '</div></div>';
        }
        isWaiting = false;
        sendBtn.disabled = false;
        stopBtn.style.display = 'none';
        abortController = null;
    });
}

function flushStreamBuffer(chat, contentEl) {
    streamTimer = null;
    if (!streamBuffer) return;
    var chunk = streamBuffer;
    streamBuffer = '';
    var lastMsg = chat.messages[chat.messages.length - 1];
    if (lastMsg && lastMsg.role === 'assistant') lastMsg.content += chunk;
    if (contentEl) contentEl.innerHTML = fmt(lastMsg.content);
    smoothScrollToBottom();
}

function flushStreamBufferFinal(chat, contentEl) {
    if (streamTimer) { cancelAnimationFrame(streamTimer); streamTimer = null; }
    if (streamBuffer) {
        var lastMsg = chat.messages[chat.messages.length - 1];
        if (lastMsg && lastMsg.role === 'assistant') lastMsg.content += streamBuffer;
        streamBuffer = '';
    }
    if (contentEl) {
        var lastMsg = chat.messages[chat.messages.length - 1];
        contentEl.innerHTML = fmt(lastMsg ? lastMsg.content : '');
    }
}

var scrollRAF = null;
function smoothScrollToBottom() {
    if (scrollRAF) return;
    scrollRAF = requestAnimationFrame(function() {
        scrollRAF = null;
        var threshold = 200;
        var isNearBottom = chatContainer.scrollHeight - chatContainer.scrollTop - chatContainer.clientHeight < threshold;
        if (isNearBottom) chatContainer.scrollTop = chatContainer.scrollHeight;
    });
}

// ==================== API 流式 ====================
async function callAPIStream(messages, onChunk, onUsage, signal) {
    var body = {
        model: currentModel,
        messages: messages.map(function(m) { return { role: m.role, content: m.content }; }),
        stream: true,
        temperature: 0.7,
        max_tokens: 4096
    };

    var res = await fetch('https://api.deepseek.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey },
        body: JSON.stringify(body),
        signal: signal
    });

    if (!res.ok) {
        var errText = '';
        try { var err = await res.json(); errText = err.error?.message || ''; } catch (e) {}
        throw new Error(errText || '请求失败 (' + res.status + ')');
    }

    var reader = res.body.getReader();
    var decoder = new TextDecoder();
    var buffer = '';

    while (true) {
        var chunk = await reader.read();
        if (chunk.done) break;

        buffer += decoder.decode(chunk.value, { stream: true });
        var lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (var i = 0; i < lines.length; i++) {
            var line = lines[i].trim();
            if (!line || !line.startsWith('data: ')) continue;
            var dataStr = line.slice(6);

            if (dataStr === '[DONE]') {
                if (i > 0) {
                    var prevLine = lines[i - 1].trim();
                    if (prevLine.startsWith('data: ')) {
                        try {
                            var prevData = JSON.parse(prevLine.slice(6));
                            if (prevData.usage) onUsage(prevData.usage);
                        } catch (e) {}
                    }
                }
                continue;
            }

            try {
                var parsed = JSON.parse(dataStr);
                var delta = parsed.choices && parsed.choices[0] && parsed.choices[0].delta;
                if (delta && delta.content) onChunk(delta.content);
                if (parsed.usage) onUsage(parsed.usage);
            } catch (e) {}
        }
    }

    if (buffer.trim() && buffer.trim().startsWith('data: ') && buffer.trim() !== 'data: [DONE]') {
        try {
            var ds = buffer.trim().slice(6);
            var parsed = JSON.parse(ds);
            var delta = parsed.choices && parsed.choices[0] && parsed.choices[0].delta;
            if (delta && delta.content) onChunk(delta.content);
            if (parsed.usage) onUsage(parsed.usage);
        } catch (e) {}
    }
}

// ==================== 文件处理 ====================
function handleFileSelect(e) {
    var f = e.target.files[0]; if (!f) return;
    if (f.size > 10 * 1024 * 1024) { alert('文件太大'); fileInput.value = ''; return; }
    currentFile = f; showFilePreview(f); readFileContent(f);
}

function showFilePreview(f) {
    removeFilePreview();
    var p = document.createElement('div'); p.className = 'file-preview'; p.id = 'filePreview';
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
            var ct = e.target.result; if (ct.length > 5000) ct = ct.substring(0, 5000) + '\n...(已截断)';
            t = '\n\n--- 文件: ' + f.name + ' ---\n' + ct + '\n--- 文件结束 ---';
        } else {
            var hints = { pdf:'PDF', doc:'Word', docx:'Word', xlsx:'Excel', png:'图片', jpg:'图片', jpeg:'图片' };
            t = '\n\n[' + (hints[ext] || '未知') + '文件: ' + f.name + ']';
        }
        messageInput.value += t; messageInput.focus(); autoResize();
    };
    ok.includes(ext) ? r.readAsText(f) : (messageInput.value += '\n\n[文件: ' + f.name + ']', messageInput.focus());
}

// ==================== 导入导出 ====================
function exportData() {
    var data = { conversations: conversations, apiKey: apiKey, currentModelKey: currentModelKey, exportTime: new Date().toISOString() };
    var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a'); a.href = url; a.download = 'deepseek-backup-' + new Date().toISOString().slice(0, 10) + '.json'; a.click();
    URL.revokeObjectURL(url);
    showToast('✅ 数据已导出');
}

function importData(e) {
    var file = e.target.files[0]; if (!file) return;
    var reader = new FileReader();
    reader.onload = function(ev) {
        try {
            var data = JSON.parse(ev.target.result);
            var importCount = data.conversations ? data.conversations.length : 0;
            showImportDialog(data, importCount);
        } catch (err) { alert('❌ 导入失败：文件格式不正确'); }
    };
    reader.readAsText(file);
    e.target.value = '';
}

function showImportDialog(data, importCount) {
    var oldDialog = document.getElementById('importDialog');
    if (oldDialog) oldDialog.remove();

    var dialog = document.createElement('div');
    dialog.id = 'importDialog';
    dialog.className = 'import-dialog-overlay';
    dialog.innerHTML =
        '<div class="import-dialog">' +
        '<h3>📥 导入数据</h3>' +
        '<div class="import-dialog-info">' +
        '<p>备份时间：<strong>' + (data.exportTime || '未知') + '</strong></p>' +
        '<p>对话数量：<strong>' + importCount + ' 个</strong></p>' +
        '<p>当前对话：<strong>' + conversations.length + ' 个</strong></p>' +
        '</div>' +
        '<div class="import-dialog-options">' +
        '<label class="import-option"><input type="radio" name="importMode" value="replace" checked>' +
        '<div class="import-option-content"><span class="import-option-title">🔄 覆盖导入</span><span class="import-option-desc">清空当前所有对话，替换为导入的数据</span></div></label>' +
        '<label class="import-option"><input type="radio" name="importMode" value="merge">' +
        '<div class="import-option-content"><span class="import-option-title">➕ 合并导入</span><span class="import-option-desc">保留现有对话，将导入的对话添加到列表中</span></div></label>' +
        '<label class="import-option"><input type="radio" name="importMode" value="apiOnly">' +
        '<div class="import-option-content"><span class="import-option-title">🔑 仅导入 API Key</span><span class="import-option-desc">只更新 API Key 和模型设置</span></div></label>' +
        '</div>' +
        '<div class="import-dialog-actions">' +
        '<button class="import-dialog-btn cancel" id="importCancelBtn">取消</button>' +
        '<button class="import-dialog-btn confirm" id="importConfirmBtn">确认导入</button>' +
        '</div></div>';

    document.body.appendChild(dialog);

    document.getElementById('importCancelBtn').addEventListener('click', function() { dialog.remove(); });
    dialog.addEventListener('click', function(e) { if (e.target === dialog) dialog.remove(); });
    document.getElementById('importConfirmBtn').addEventListener('click', function() {
        var mode = dialog.querySelector('input[name="importMode"]:checked').value;
        dialog.remove();
        executeImport(data, mode);
    });
}

function executeImport(data, mode) {
    if (mode === 'replace') {
        if (!confirm('覆盖导入将清空当前所有 ' + conversations.length + ' 个对话，确定继续？')) return;
        if (data.apiKey) { apiKey = data.apiKey; localStorage.setItem('deepseek_api_key', apiKey); apiKeyInput.value = apiKey; }
        if (data.conversations) { conversations = data.conversations; saveConversations(); }
        if (data.currentModelKey) {
            currentModelKey = data.currentModelKey;
            currentModel = modelList.find(function(m) { return m.key === currentModelKey; }).id;
            localStorage.setItem('deepseek_model_key', currentModelKey);
            updateModelBtnText(); renderDropdownActive();
        }
        renderChatList();
        if (conversations.length > 0) switchChat(conversations[0].id);
        showToast('✅ 已覆盖导入 ' + conversations.length + ' 个对话');
    } else if (mode === 'merge') {
        var addedCount = 0;
        var skippedCount = 0;
        if (data.conversations && data.conversations.length > 0) {
            var existingIds = {};
            conversations.forEach(function(c) { existingIds[c.id] = true; });
            data.conversations.forEach(function(importedChat) {
                if (existingIds[importedChat.id]) {
                    skippedCount++;
                } else {
                    importedChat.id = Date.now().toString() + '_' + Math.random().toString(36).substr(2, 9);
                    importedChat.parentId = null;
                    importedChat.branchPoint = null;
                    importedChat.branches = [];
                    conversations.unshift(importedChat);
                    addedCount++;
                }
            });
            saveConversations();
        }
        if (data.apiKey && data.apiKey !== apiKey) {
            apiKey = data.apiKey;
            localStorage.setItem('deepseek_api_key', apiKey);
            apiKeyInput.value = apiKey;
        }
        renderChatList();
        if (addedCount > 0) switchChat(conversations[0].id);
        showToast('✅ 新增 ' + addedCount + ' 个对话' + (skippedCount > 0 ? '，跳过 ' + skippedCount + ' 个重复' : ''));
    } else if (mode === 'apiOnly') {
        if (data.apiKey) {
            apiKey = data.apiKey;
            localStorage.setItem('deepseek_api_key', apiKey);
            apiKeyInput.value = apiKey;
        }
        if (data.currentModelKey) {
            currentModelKey = data.currentModelKey;
            currentModel = modelList.find(function(m) { return m.key === currentModelKey; }).id;
            localStorage.setItem('deepseek_model_key', currentModelKey);
            updateModelBtnText(); renderDropdownActive();
        }
        showToast('✅ API Key 已更新');
    }
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

// HTML 属性转义（用于 data-copy-content）
function escAttr(s) {
    if (!s) return '';
    return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function saveApiKey() {
    var k = apiKeyInput.value.trim();
    if (!k) { alert('请输入 API Key'); return; }
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
    if (df < 36e5) return Math.floor(df / 6e4) + '分钟前';
    if (df < 864e5) return Math.floor(df / 36e5) + '小时前';
    if (df < 6048e5) return Math.floor(df / 864e5) + '天前';
    return (d.getMonth() + 1) + '/' + d.getDate();
}

function fmtSize(b) { if (b < 1024) return b + ' B'; if (b < 1048576) return (b / 1024).toFixed(1) + ' KB'; return (b / 1048576).toFixed(1) + ' MB'; }
function fmtToken(c) { if (c >= 1e6) return (c / 1e6).toFixed(1) + 'M'; if (c >= 1e3) return (c / 1e3).toFixed(1) + 'K'; return String(c); }

// ==================== 系统设定 ====================
function buildMessagesWithSystemPrompt(messages) {
    var sp = document.getElementById('systemPrompt');
    var content = sp ? sp.value.trim() : '';
    if (!content) return messages;
    return [{ role: 'system', content: content }].concat(messages);
}

function loadSystemFile() {
    var input = document.createElement('input');
    input.type = 'file'; input.accept = '.txt,.md';
    input.onchange = function(e) {
        var f = e.target.files[0];
        if (!f) return;
        if (f.size > 50 * 1024 * 1024) { showToast('⚠️ 文件太大'); return; }
        var reader = new FileReader();
        reader.onload = function(ev) {
            document.getElementById('systemPrompt').value = ev.target.result;
            updateSystemCharCount();
            showToast('✅ 已加载：' + f.name + ' (' + fmtSize(f.size) + ')');
        };
        reader.readAsText(f, 'UTF-8');
    };
    input.click();
}

function clearSystemPrompt() {
    if (confirm('确定清空系统设定？')) {
        document.getElementById('systemPrompt').value = '';
        updateSystemCharCount();
    }
}

function updateSystemCharCount() {
    var el = document.getElementById('charCount');
    if (!el) return;
    var n = (document.getElementById('systemPrompt').value || '').length;
    el.textContent = n === 0 ? '未设置' : n < 1000 ? n + ' 字' : n < 10000 ? (n/1000).toFixed(1) + 'K 字' : (n/10000).toFixed(1) + 'W 字';
}

function loadSavedSystemPrompt() {
    var s = localStorage.getItem('deepseek_system_prompt');
    if (s) { var el = document.getElementById('systemPrompt'); if (el) el.value = s; updateSystemCharCount(); }
}

var _saveTimer;
function autoSaveSystemPrompt() {
    clearTimeout(_saveTimer);
    _saveTimer = setTimeout(function() {
        var c = document.getElementById('systemPrompt').value;
        if (c) try { localStorage.setItem('deepseek_system_prompt', c); } catch(e) {}
        updateSystemCharCount();
    }, 500);
}

init();
