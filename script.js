// ==================== 全局变量 ====================
var apiKey = localStorage.getItem('deepseek_api_key') || '';
var conversations = [];
var currentChatId = null;
var isWaiting = false;
var currentFile = null;
var editingMessageIndex = null;

var AVATAR_URL = 'deepseek.png';

// 官方最新模型列表
var modelList = [
    { key: 'pro', id: 'deepseek-v4-pro', name: 'V4-Pro', desc: '旗舰模型，最强性能' },
    { key: 'flash', id: 'deepseek-v4-flash', name: 'V4-Flash', desc: '轻量快速，高性价比' }
];

var currentModelKey = localStorage.getItem('deepseek_model_key') || 'pro';
var currentModel = modelList.find(function(m) { return m.key === currentModelKey; }).id;

// DOM
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

    // 基础事件 - 使用 onclick 确保移动端兼容
    sendBtn.onclick = sendMessage;
    clearBtn.onclick = clearCurrentChat;
    branchBtn.onclick = branchCurrentChat;
    saveApiKeyBtn.onclick = saveApiKey;
    toggleConfig.onclick = toggleConfigPanel;
    menuBtn.onclick = openSidebar;
    newChatBtn.onclick = function() { createNewChat(); closeSidebar(); };
    overlay.onclick = closeSidebar;
    attachBtn.onclick = function() { fileInput.click(); };
    fileInput.onchange = handleFileSelect;
    searchInput.oninput = handleSearch;
    exportBtn.onclick = exportData;
    importBtn.onclick = function() { importFileInput.click(); };
    importFileInput.onchange = importData;
    summarizeBtn.onclick = summarizeContext;
    newFromSummaryBtn.onclick = newFromSummary;

    // 模型切换
    modelToggleBtn.onclick = function(e) {
        e.preventDefault(); e.stopPropagation();
        modelDropdown.classList.toggle('show');
    };

    modelDropdown.querySelectorAll('.model-dropdown-item').forEach(function(item) {
        item.onclick = function(e) {
            e.preventDefault(); e.stopPropagation();
            switchModel(item.dataset.modelKey);
            modelDropdown.classList.remove('show');
        };
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

    messageInput.oninput = autoResize;

    // 事件委托
    chatContainer.addEventListener('click', handleActionClick);
    chatContainer.addEventListener('touchend', handleActionClick);
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
    } else {
        messageInput.placeholder = '输入消息...（Shift+Enter 换行）';
    }
}

// ==================== 上下文估算 ====================
function estimateContextTokens(chat) {
    if (!chat || !chat.messages || !chat.messages.length) return 0;
    var total = 0;
    chat.messages.forEach(function(msg) {
        if (!msg.content) return;
        var len = msg.content.length;
        var chineseChars = (msg.content.match(/[\u4e00-\u9fff\u3400-\u4dbf]/g) || []).length;
        var otherChars = len - chineseChars;
        total += Math.ceil(chineseChars * 0.6 + otherChars * 0.25);
    });
    return total;
}

function updateContextInfo() {
    if (!contextInfo) return;
    var chat = conversations.find(function(c) { return c.id === currentChatId; });
    if (!chat || !chat.messages || !chat.messages.length) {
        contextInfo.textContent = '📊 上下文: 0 token';
        contextInfo.className = 'context-info';
        return;
    }
    var estimated = estimateContextTokens(chat);
    var totalTokens = (chat.tokenUsage && chat.tokenUsage.total_tokens) ? chat.tokenUsage.total_tokens : 0;
    var displayTokens = totalTokens > 0 ? totalTokens : estimated;

    contextInfo.textContent = '📊 ~' + fmtToken(displayTokens) + ' tokens';

    contextInfo.className = 'context-info';
    if (displayTokens > 4000) {
        contextInfo.className = 'context-info danger';
        contextInfo.title = '上下文较长，建议摘要前文或新建对话';
    } else if (displayTokens > 2000) {
        contextInfo.className = 'context-info warning';
        contextInfo.title = '上下文中等长度';
    } else {
        contextInfo.title = '上下文较短，消耗较少';
    }
}

// ==================== 摘要功能 ====================
function summarizeContext() {
    var chat = conversations.find(function(c) { return c.id === currentChatId; });
    if (!chat || !chat.messages || chat.messages.length === 0) {
        alert('当前对话没有内容可摘要');
        return;
    }

    if (isWaiting) {
        alert('请等待当前回复完成');
        return;
    }

    if (!apiKey) {
        alert('请先配置 API Key');
        configBody.classList.remove('collapsed');
        if (toggleConfig) toggleConfig.classList.remove('collapsed');
        return;
    }

    // 构建摘要请求
    var contextText = '';
    chat.messages.forEach(function(msg) {
        var role = msg.role === 'user' ? '用户' : 'AI';
        var content = msg.content || '';
        if (content.length > 300) content = content.substring(0, 300) + '...';
        contextText += role + ': ' + content + '\n';
    });

    var summaryPrompt = '请将以下对话内容压缩为一段简短的前情提要（200字以内），只保留关键情节和设定：\n\n' + contextText;

    if (confirm('将调用 API 生成摘要，摘要后建议新建对话继续。确定？')) {
        // 保存当前模型，摘要强制用 Flash（更快更便宜）
        var savedModelKey = currentModelKey;
        var savedModel = currentModel;
        currentModelKey = 'flash';
        currentModel = 'deepseek-v4-flash';

        isWaiting = true;
        sendBtn.disabled = true;
        showTyping();

        callAPI([{ role: 'user', content: summaryPrompt }]).then(function(r) {
            // 恢复模型
            currentModelKey = savedModelKey;
            currentModel = savedModel;

            removeTyping();
            isWaiting = false;
            sendBtn.disabled = false;

            if (r && r.content) {
                chat.summary = r.content;
                chat.messages.push({
                    role: 'assistant',
                    content: '📋 **前情提要（摘要）**：\n\n' + r.content + '\n\n---\n💡 *建议点击「🆕 从摘要新建」开始新对话，可节省大量 token*',
                    isSummary: true
                });
                chat.updatedAt = new Date().toISOString();
                saveConversations();
                renderMessages(chat.messages);
                renderChatList();
                updateContextInfo();
                showToast('✅ 摘要已生成（使用 Flash）');
            }
        }).catch(function(e) {
            currentModelKey = savedModelKey;
            currentModel = savedModel;
            removeTyping();
            isWaiting = false;
            sendBtn.disabled = false;
            alert('摘要生成失败: ' + (e.message || '未知错误'));
        });
    }
}

function newFromSummary() {
    var chat = conversations.find(function(c) { return c.id === currentChatId; });
    if (!chat || !chat.summary) {
        alert('请先生成摘要（点击「📋 摘要前文」）');
        return;
    }

    if (confirm('基于摘要创建新对话？\n新对话将以摘要作为上下文开始。')) {
        var newChat = {
            id: Date.now().toString(),
            title: chat.title + ' (续)',
            messages: [],
            parentId: chat.id,
            branchPoint: null,
            branches: [],
            modelKey: currentModelKey,
            summary: chat.summary,
            tokenUsage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        newChat.messages.push({
            role: 'user',
            content: '[前情提要]\n' + chat.summary + '\n\n请基于以上前情提要，继续创作。',
            isContext: true
        });

        conversations.unshift(newChat);
        saveConversations();
        renderChatList();
        switchChat(newChat.id);
        closeSidebar();
        showToast('✅ 已创建新对话，摘要已带入上下文');
    }
}

// ==================== 对话管理 ====================
function loadConversations() {
    var saved = localStorage.getItem('deepseek_conversations');
    if (saved) {
        try { conversations = JSON.parse(saved); } catch (e) { conversations = []; }
    }
    conversations.forEach(function(chat) {
        if (!chat.tokenUsage) chat.tokenUsage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
    });
    renderChatList();
}

function saveConversations() {
    localStorage.setItem('deepseek_conversations', JSON.stringify(conversations));
}

function createNewChat(parentChatId, branchPoint) {
    var chat = {
        id: Date.now().toString(),
        title: '新对话',
        messages: [],
        parentId: parentChatId || null,
        branchPoint: branchPoint || null,
        branches: [],
        modelKey: currentModelKey,
        summary: null,
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
            chat.summary = p.summary;
            if (p.tokenUsage) {
                chat.tokenUsage = {
                    prompt_tokens: p.tokenUsage.prompt_tokens || 0,
                    completion_tokens: p.tokenUsage.completion_tokens || 0,
                    total_tokens: p.tokenUsage.total_tokens || 0
                };
            }
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
    updateContextInfo();
}

function branchCurrentChat() {
    var chat = conversations.find(function(c) { return c.id === currentChatId; });
    if (!chat || !chat.messages || chat.messages.length === 0) { alert('请先发送消息'); return; }
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
            chat.summary = null;
            chat.tokenUsage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
            chat.updatedAt = new Date().toISOString();
            cancelEdit();
            saveConversations();
            renderMessages([]);
            renderChatList();
            updateContextInfo();
        }
    }
}

// ==================== 编辑消息 ====================
function startEdit(msgIndex) {
    var chat = conversations.find(function(c) { return c.id === currentChatId; });
    if (!chat || isWaiting) return;
    var msg = chat.messages[msgIndex];
    if (!msg || msg.role !== 'user') return;
    if (msg.isContext) { showToast('摘要上下文不可编辑'); return; }

    if (editingMessageIndex !== null && editingMessageIndex !== msgIndex) cancelEditSilent();
    editingMessageIndex = msgIndex;
    messageInput.value = msg.content || '';
    messageInput.focus();
    updateInputPlaceholder();
    showEditNotice();
    renderMessages(chat.messages);
    try { messageInput.scrollIntoView({ behavior: 'smooth' }); } catch(e) {}
}

function cancelEdit() {
    editingMessageIndex = null;
    messageInput.value = '';
    updateInputPlaceholder();
    removeEditNotice();
    var chat = conversations.find(function(c) { return c.id === currentChatId; });
    if (chat) renderMessages(chat.messages);
}

function cancelEditSilent() { editingMessageIndex = null; updateInputPlaceholder(); removeEditNotice(); }

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
    updateContextInfo();
    autoResend();
}

function showEditNotice() {
    removeEditNotice();
    var notice = document.createElement('div');
    notice.id = 'editNotice';
    notice.className = 'edit-notice';
    notice.innerHTML = '✏️ 编辑模式 <button id="cancelEditBtn">取消</button>';
    document.body.appendChild(notice);
    var cancelBtn = document.getElementById('cancelEditBtn');
    if (cancelBtn) {
        cancelBtn.onclick = cancelEdit;
        cancelBtn.addEventListener('touchend', function(e) { e.preventDefault(); cancelEdit(); });
    }
}

function removeEditNotice() { var n = document.getElementById('editNotice'); if (n) n.remove(); }

async function autoResend() {
    var chat = conversations.find(function(c) { return c.id === currentChatId; });
    if (!chat || !chat.messages || chat.messages.length === 0) return;
    var lastMsg = chat.messages[chat.messages.length - 1];
    if (lastMsg.role !== 'user') return;

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
            updateContextInfo();
        }
    } catch (e) {
        removeTyping();
        chatContainer.innerHTML += '<div class="message assistant"><div class="bot-avatar"><img src="' + AVATAR_URL + '" alt="助手"></div><div class="message-content">' + esc(e.message) + '</div></div>';
    } finally { isWaiting = false; sendBtn.disabled = false; }
}

// ==================== 搜索 ====================
function handleSearch() { renderChatList(searchInput.value.trim().toLowerCase()); }

function renderChatList(filter) {
    chatList.innerHTML = '';
    var list = filter
        ? conversations.filter(function(c) {
            return (c.title || '').toLowerCase().includes(filter) ||
                (c.messages || []).some(function(m) { return (m.content || '').toLowerCase().includes(filter); });
          })
        : conversations;

    if (!list.length) { chatList.innerHTML = '<div class="no-results">未找到</div>'; return; }

    list.forEach(function(chat) {
        var d = document.createElement('div');
        d.className = 'chat-item' + (chat.id === currentChatId ? ' active' : '');
        var tokens = (chat.tokenUsage && chat.tokenUsage.total_tokens) ? chat.tokenUsage.total_tokens : 0;
        var title = chat.title || '未命名';
        if (filter && !title.toLowerCase().includes(filter)) {
            var match = (chat.messages || []).find(function(m) { return (m.content || '').toLowerCase().includes(filter); });
            if (match) title += ' (含: "' + (match.content || '').substring(0, 15) + '...")';
        }

        d.innerHTML =
            '<div class="chat-item-info" data-chat-id="' + chat.id + '">' +
            '<div class="chat-item-title">' + (chat.summary ? '📋 ' : '') + esc(title) + '</div>' +
            '<div class="chat-item-meta">' +
            '<span>' + fmtTime(new Date(chat.updatedAt)) + '</span>' +
            '<span>' + (chat.messages ? chat.messages.length : 0) + '条</span>' +
            (tokens > 0 ? '<span>🔢' + fmtToken(tokens) + '</span>' : '') +
            (chat.parentId ? '<span class="chat-item-branch">🔀</span>' : '') +
            ((chat.branches || []).length > 0 ? '<span class="chat-item-branch">🌿' + chat.branches.length + '</span>' : '') +
            '</div></div>' +
            '<div class="chat-item-actions">' +
            '<button class="rename-chat" data-chat-id="' + chat.id + '">✏️</button>' +
            '<button class="delete-chat" data-chat-id="' + chat.id + '">🗑️</button>' +
            '</div>';

        d.querySelector('.chat-item-info').onclick = function() { switchChat(chat.id); closeSidebar(); };
        d.querySelector('.chat-item-info').addEventListener('touchend', function(e) {
            e.preventDefault(); switchChat(chat.id); closeSidebar();
        });

        var renameBtn = d.querySelector('.rename-chat');
        renameBtn.onclick = function(e) { e.stopPropagation(); renameChat(chat.id); };
        renameBtn.addEventListener('touchend', function(e) { e.stopPropagation(); e.preventDefault(); renameChat(chat.id); });

        var deleteBtn = d.querySelector('.delete-chat');
        deleteBtn.onclick = function(e) { e.stopPropagation(); deleteChat(chat.id); };
        deleteBtn.addEventListener('touchend', function(e) { e.stopPropagation(); e.preventDefault(); deleteChat(chat.id); });

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
            '<div class="message-content">你好！我是 DeepSeek 助手<br>✏️ 编辑 | 🔄 重生成 | 🔀 分支 | 📋 摘要前文</div>' +
            '</div>';
        renderTokenStats();
        updateContextInfo();
        return;
    }

    var i = 0;
    while (i < messages.length) {
        if (messages[i].role === 'user') {
            var grp = document.createElement('div');
            grp.className = 'message-group';
            var isEditing = (i === editingMessageIndex);
            var isContext = messages[i].isContext;
            var userDiv = document.createElement('div');
            userDiv.className = 'message user' + (isEditing ? ' editing' : '') + (isContext ? ' summary' : '');
            userDiv.innerHTML = '<div class="message-content">' + esc(messages[i].content || '') + '</div>';
            grp.appendChild(userDiv);

            if (i + 1 < messages.length && messages[i + 1].role === 'assistant') {
                var wrap = document.createElement('div');
                wrap.className = 'message-collapsible';
                var reasoning = messages[i + 1].reasoning;
                var isSummary = messages[i + 1].isSummary;

                var hdr = document.createElement('div');
                hdr.className = 'message-collapsible-header';
                hdr.innerHTML = '<span class="toggle-icon">▼</span><span>' + (isSummary ? '📋 摘要' : '助手回复') + '</span>' +
                    (reasoning ? '<span style="color:var(--warning-color);margin-left:6px;font-size:0.7rem">🧠思考</span>' : '') +
                    '<span style="flex:1"></span><span style="font-size:0.7rem;color:var(--text-muted)">折叠</span>';

                var body = document.createElement('div');
                body.className = 'message-collapsible-body';
                if (reasoning) {
                    var rb = document.createElement('div');
                    rb.className = 'reasoning-block';
                    rb.innerHTML = '<div class="reasoning-header" onclick="this.nextElementSibling.classList.toggle(\'hidden\')">🧠 思考过程 <span class="toggle-icon">▼</span></div><div class="reasoning-content">' + fmt(reasoning) + '</div>';
                    body.appendChild(rb);
                }

                var assistantDiv = document.createElement('div');
                assistantDiv.className = 'message assistant' + (isSummary ? ' summary' : '');
                assistantDiv.innerHTML = (isSummary ? '' : '<div class="bot-avatar"><img src="' + AVATAR_URL + '" alt="助手"></div>') +
                    '<div class="message-content">' + fmt(messages[i + 1].content || '') + '</div>';
                body.appendChild(assistantDiv);

                if (!isSummary && !isContext) {
                    var act = document.createElement('div');
                    act.className = 'message-actions';
                    act.innerHTML =
                        '<button class="edit-msg-btn" data-edit-idx="' + i + '">✏️ 编辑</button>' +
                        '<button class="regenerate-btn" data-idx="' + i + '">🔄 重生成</button>' +
                        '<button class="branch-msg-btn" data-idx="' + i + '">🔀 分支</button>';
                    body.appendChild(act);
                }

                hdr.onclick = function() { body.classList.toggle('hidden'); hdr.classList.toggle('collapsed'); };
                wrap.appendChild(hdr);
                wrap.appendChild(body);
                grp.appendChild(wrap);
                i += 2;
            } else {
                if (!isContext) {
                    var act2 = document.createElement('div');
                    act2.className = 'message-actions';
                    act2.style.cssText = 'padding-left:0;justify-content:flex-end;';
                    act2.innerHTML = '<button class="edit-msg-btn" data-edit-idx="' + i + '">✏️ 编辑</button>';
                    grp.appendChild(act2);
                }
                i++;
            }
            chatContainer.appendChild(grp);
        } else {
            var aDiv = document.createElement('div');
            aDiv.className = 'message assistant' + (messages[i].isSummary ? ' summary' : '');
            aDiv.innerHTML = (messages[i].isSummary ? '' : '<div class="bot-avatar"><img src="' + AVATAR_URL + '" alt="助手"></div>') +
                '<div class="message-content">' + fmt(messages[i].content || '') + '</div>';
            chatContainer.appendChild(aDiv);
            i++;
        }
    }
    renderTokenStats();
    scrollBottom();
    updateContextInfo();
}

function renderTokenStats() {
    var old = document.getElementById('tokenStats');
    if (old) old.remove();
    var chat = conversations.find(function(c) { return c.id === currentChatId; });
    if (!chat) return;

    if (!chat.tokenUsage) chat.tokenUsage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };

    var totalTokens = chat.tokenUsage.total_tokens;
    if (totalTokens === 0 && chat.messages && chat.messages.length > 0) {
        totalTokens = estimateContextTokens(chat);
    }
    if (totalTokens === 0) return;

    var promptTokens = chat.tokenUsage.prompt_tokens || 0;
    var completionTokens = chat.tokenUsage.completion_tokens || 0;

    if (promptTokens === 0 && completionTokens === 0) {
        promptTokens = Math.floor(totalTokens * 0.7);
        completionTokens = Math.floor(totalTokens * 0.3);
    }

    var ic = (promptTokens / 1000000 * 1).toFixed(6);
    var oc = (completionTokens / 1000000 * 2).toFixed(6);
    var tc = (parseFloat(ic) + parseFloat(oc)).toFixed(6);

    var d = document.createElement('div');
    d.id = 'tokenStats';
    d.className = 'token-stats';
    d.innerHTML =
        '<div class="token-stats-content">' +
        '<span class="token-item">📥 输入 ' + fmtToken(promptTokens) + '</span>' +
        '<span class="token-item">📤 输出 ' + fmtToken(completionTokens) + '</span>' +
        '<span class="token-item">🔢 累计 ' + fmtToken(totalTokens) + '</span>' +
        '<span class="token-item token-cost">💰 ¥' + tc + '</span>' +
        '</div>';
    chatContainer.appendChild(d);
}

// ==================== 发送消息 ====================
async function sendMessage() {
    if (editingMessageIndex !== null) { confirmEdit(); return; }
    var content = messageInput.value.trim();
    if (!content || isWaiting) return;
    if (!apiKey) { alert('请先配置 API Key'); configBody.classList.remove('collapsed'); if (toggleConfig) toggleConfig.classList.remove('collapsed'); return; }

    var chat = conversations.find(function(c) { return c.id === currentChatId; });
    if (!chat) return;

    if (!chat.tokenUsage) chat.tokenUsage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };

    chat.modelKey = currentModelKey;
    chat.messages.push({ role: 'user', content: content });
    renderMessages(chat.messages);
    messageInput.value = '';
    autoResize();
    removeFilePreview();
    chat.updatedAt = new Date().toISOString();
    if (chat.messages.length === 2 && (chat.title === '新对话' || chat.title === '未命名')) {
        chat.title = content.substring(0, 20) + (content.length > 20 ? '...' : '');
    }
    saveConversations();
    renderChatList();

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
            updateContextInfo();
        }
    } catch (e) {
        removeTyping();
        chatContainer.innerHTML += '<div class="message assistant"><div class="bot-avatar"><img src="' + AVATAR_URL + '" alt="助手"></div><div class="message-content">' + esc(e.message || '请求失败') + '</div></div>';
    } finally { isWaiting = false; sendBtn.disabled = false; }
}

async function regenerateMessage(idx) {
    var chat = conversations.find(function(c) { return c.id === currentChatId; });
    if (!chat || isWaiting) return;
    if (idx + 1 < chat.messages.length) chat.messages.splice(idx + 1, 1);
    chat.messages = chat.messages.slice(0, idx + 1);
    saveConversations();
    renderMessages(chat.messages);
    updateContextInfo();

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
            updateContextInfo();
        }
    } catch (e) {
        removeTyping();
        chatContainer.innerHTML += '<div class="message assistant"><div class="bot-avatar"><img src="' + AVATAR_URL + '" alt="助手"></div><div class="message-content">' + esc(e.message || '请求失败') + '</div></div>';
    } finally { isWaiting = false; sendBtn.disabled = false; }
}

function branchFromMessage(idx) {
    if (confirm('从第 ' + (idx + 1) + ' 条消息处创建分支？')) { createNewChat(currentChatId, idx); closeSidebar(); }
}

// ==================== API ====================
async function callAPI(messages) {
    var body = {
        model: currentModel,
        messages: messages.map(function(m) { return { role: m.role, content: m.content || '' }; }),
        stream: false
    };

    var res = await fetch('https://api.deepseek.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey },
        body: JSON.stringify(body)
    });

    if (!res.ok) {
        var err = await res.json();
        throw new Error((err.error && err.error.message) || '请求失败 (状态码: ' + res.status + ')');
    }
    var data = await res.json();
    if (data.usage) addTokens(data.usage);
    var choice = data.choices[0];
    return {
        content: choice.message.content,
        reasoning: choice.message.reasoning_content || null
    };
}

function addTokens(u) {
    var chat = conversations.find(function(c) { return c.id === currentChatId; });
    if (chat) {
        if (!chat.tokenUsage) chat.tokenUsage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
        chat.tokenUsage.prompt_tokens += u.prompt_tokens || 0;
        chat.tokenUsage.completion_tokens += u.completion_tokens || 0;
        chat.tokenUsage.total_tokens += u.total_tokens || 0;
        saveConversations();
    }
}

// ==================== 文件 ====================
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
    var data = { conversations: conversations, apiKey: apiKey, currentModelKey: currentModelKey, exportTime: new Date().toISOString() };
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
            if (confirm('导入将覆盖当前所有对话，确定？\n备份时间：' + (data.exportTime || '未知') + '\n对话数：' + (data.conversations ? data.conversations.length : 0))) {
                if (data.apiKey) { apiKey = data.apiKey; localStorage.setItem('deepseek_api_key', apiKey); apiKeyInput.value = apiKey; }
                if (data.conversations) {
                    conversations = data.conversations;
                    conversations.forEach(function(c) {
                        if (!c.tokenUsage) c.tokenUsage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
                    });
                    saveConversations();
                }
                if (data.currentModelKey) {
                    currentModelKey = data.currentModelKey;
                    currentModel = modelList.find(function(m) { return m.key === currentModelKey; }).id;
                    localStorage.setItem('deepseek_model_key', currentModelKey);
                    updateModelBtnText(); renderDropdownActive();
                }
                renderChatList();
                if (conversations.length > 0) switchChat(conversations[0].id);
                showToast('✅ 已导入');
            }
        } catch (err) { alert('❌ 文件格式不正确'); }
    };
    reader.readAsText(file);
    e.target.value = '';
}

// ==================== 工具函数 ====================
function fmt(s) {
    if (!s) return '';
    var f = esc(s);
    f = f.replace(/```(\w*)\n([\s\S]*?)```/g, function(_, l, c) { return '<pre><code>' + esc((c || '').trim()) + '</code></pre>'; });
    f = f.replace(/`([^`]+)`/g, '<code>$1</code>');
    f = f.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    f = f.replace(/\n/g, '<br>');
    return f;
}

function esc(s) { if (!s && s !== 0) return ''; var d = document.createElement('div'); d.textContent = String(s); return d.innerHTML; }

function saveApiKey() {
    var k = apiKeyInput.value.trim();
    if (!k) { alert('请输入 API Key'); return; }
    apiKey = k; localStorage.setItem('deepseek_api_key', apiKey);
    alert('✅ 已保存'); configBody.classList.add('collapsed');
    if (toggleConfig) toggleConfig.classList.add('collapsed');
}

function toggleConfigPanel() { configBody.classList.toggle('collapsed'); if (toggleConfig) toggleConfig.classList.toggle('collapsed'); }

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
    requestAnimationFrame(function() {
        t.classList.add('show');
        setTimeout(function() { t.classList.remove('show'); setTimeout(function() { if (t.parentNode) t.remove(); }, 300); }, 1500);
    });
}

function fmtTime(d) {
    if (!d) return '';
    var df = Date.now() - d.getTime();
    if (df < 60000) return '刚刚';
    if (df < 3600000) return Math.floor(df / 60000) + '分钟前';
    if (df < 86400000) return Math.floor(df / 3600000) + '小时前';
    if (df < 604800000) return Math.floor(df / 86400000) + '天前';
    return (d.getMonth() + 1) + '/' + d.getDate();
}

function fmtSize(b) { if (b < 1024) return b + ' B'; if (b < 1048576) return (b / 1024).toFixed(1) + ' KB'; return (b / 1048576).toFixed(1) + ' MB'; }
function fmtToken(c) {
    if (c === undefined || c === null) return '0';
    if (c >= 1000000) return (c / 1000000).toFixed(1) + 'M';
    if (c >= 1000) return (c / 1000).toFixed(1) + 'K';
    return String(Math.floor(c));
}

// ==================== 启动 ====================
init();
