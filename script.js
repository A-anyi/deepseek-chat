// ==================== 全局变量 ====================
let apiKey = localStorage.getItem('deepseek_api_key') || '';
let conversations = [];
let currentChatId = null;
let isWaiting = false;
let currentFile = null;
let collapsedGroups = new Set();

// 模型列表
const availableModels = [
    { id: 'deepseek-chat', name: '💎 V4-Pro', desc: '旗舰模型，综合最强' },
    { id: 'deepseek-reasoner', name: '🧠 V4-Reasoner', desc: '深度思考，展示推理' },
    { id: 'deepseek-chat', name: '⚡ V4-Flash', desc: '轻量快速，高性价比' }
];

const modelMap = {
    'pro': 'deepseek-chat',
    'reasoner': 'deepseek-reasoner',
    'flash': 'deepseek-chat'
};

let currentModelKey = localStorage.getItem('deepseek_model_key') || 'pro';
let currentModel = modelMap[currentModelKey];

// DOM 元素
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
const modelOptions = document.getElementById('modelOptions');

// ==================== 初始化 ====================
function init() {
    if (apiKey) apiKeyInput.value = apiKey;
    loadConversations();

    if (conversations.length === 0) {
        createNewChat();
    } else {
        switchChat(conversations[0].id);
    }

    renderModelSelector();
    updateModelIndicator();

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

    messageInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });
    messageInput.addEventListener('input', autoResize);
}

// ==================== 模型选择 ====================
function renderModelSelector() {
    modelOptions.innerHTML = availableModels.map((m, index) => {
        const key = ['pro', 'reasoner', 'flash'][index];
        const isActive = key === currentModelKey;
        return `
            <div class="model-option ${isActive ? 'active' : ''}" data-model-key="${key}">
                <span class="model-option-icon">${m.name.split(' ')[0]}</span>
                <div class="model-option-info">
                    <span class="model-option-name">${m.name.split(' ').slice(1).join(' ')}</span>
                    <span class="model-option-desc">${m.desc}</span>
                </div>
                ${isActive ? '<span class="model-check">✅</span>' : ''}
            </div>
        `;
    }).join('');

    modelOptions.querySelectorAll('.model-option').forEach(opt => {
        opt.addEventListener('click', () => switchModel(opt.dataset.modelKey));
    });
}

function switchModel(modelKey) {
    currentModelKey = modelKey;
    currentModel = modelMap[modelKey];
    localStorage.setItem('deepseek_model_key', modelKey);

    document.querySelectorAll('.model-option').forEach(opt => {
        opt.classList.toggle('active', opt.dataset.modelKey === modelKey);
    });
    renderModelSelector();
    updateModelIndicator();

    const name = availableModels[['pro', 'reasoner', 'flash'].indexOf(modelKey)].name;
    showToast(`已切换到 ${name}`);
}

function updateModelIndicator() {
    const isReasoner = currentModelKey === 'reasoner';
    messageInput.placeholder = isReasoner ? '🧠 深度思考模式...' : '输入消息...';
}

function showToast(message) {
    const existing = document.getElementById('toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.id = 'toast';
    toast.className = 'toast';
    toast.textContent = message;
    document.body.appendChild(toast);

    requestAnimationFrame(() => {
        toast.classList.add('show');
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        }, 1800);
    });
}

// ==================== 对话管理 ====================
function loadConversations() {
    const saved = localStorage.getItem('deepseek_conversations');
    if (saved) {
        try { conversations = JSON.parse(saved); } catch (e) { conversations = []; }
    }
    renderChatList();
}

function saveConversations() {
    localStorage.setItem('deepseek_conversations', JSON.stringify(conversations));
}

function createNewChat(parentChatId = null, branchPoint = null) {
    const newChat = {
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
        const parentChat = conversations.find(c => c.id === parentChatId);
        if (parentChat) {
            newChat.messages = parentChat.messages.slice(0, branchPoint + 1);
            newChat.title = parentChat.title + ' (分支)';
            newChat.modelKey = parentChat.modelKey || currentModelKey;
            if (parentChat.tokenUsage) newChat.tokenUsage = { ...parentChat.tokenUsage };
            parentChat.branches = parentChat.branches || [];
            parentChat.branches.push({ chatId: newChat.id, atMessageIndex: branchPoint });
        }
    }

    conversations.unshift(newChat);
    saveConversations();
    renderChatList();
    switchChat(newChat.id);
}

function switchChat(chatId) {
    currentChatId = chatId;
    const chat = conversations.find(c => c.id === chatId);
    if (!chat) return;

    chatTitle.textContent = chat.title;
    if (chat.modelKey && chat.modelKey !== currentModelKey) {
        currentModelKey = chat.modelKey;
        currentModel = modelMap[currentModelKey];
        renderModelSelector();
        updateModelIndicator();
    }
    renderMessages(chat.messages);
    renderChatList();
}

function branchCurrentChat() {
    const chat = conversations.find(c => c.id === currentChatId);
    if (!chat || chat.messages.length === 0) {
        alert('请先发送消息再创建分支');
        return;
    }

    let branchPoint = chat.messages.length - 1;
    for (let i = chat.messages.length - 1; i >= 0; i--) {
        if (chat.messages[i].role === 'user') { branchPoint = i; break; }
    }

    if (confirm(`从第 ${branchPoint + 1} 条消息处创建分支？`)) {
        createNewChat(currentChatId, branchPoint);
        closeSidebar();
    }
}

function deleteChat(chatId) {
    if (conversations.length <= 1) {
        alert('至少保留一个对话');
        return;
    }

    if (confirm('确定删除这个对话吗？此操作不可恢复。')) {
        conversations = conversations.filter(c => c.id !== chatId);
        saveConversations();
        renderChatList();
        if (chatId === currentChatId) switchChat(conversations[0].id);
    }
}

function renameChat(chatId) {
    const chat = conversations.find(c => c.id === chatId);
    if (!chat) return;

    const newTitle = prompt('输入新标题:', chat.title);
    if (newTitle && newTitle.trim()) {
        chat.title = newTitle.trim();
        saveConversations();
        renderChatList();
        if (chatId === currentChatId) chatTitle.textContent = chat.title;
    }
}

function clearCurrentChat() {
    if (confirm('确定清空当前对话的所有消息？')) {
        const chat = conversations.find(c => c.id === currentChatId);
        if (chat) {
            chat.messages = [];
            chat.tokenUsage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
            chat.updatedAt = new Date().toISOString();
            saveConversations();
            renderMessages([]);
            renderChatList();
        }
    }
}

// ==================== 搜索 ====================
function handleSearch() {
    renderChatList(searchInput.value.trim().toLowerCase());
}

function renderChatList(filterQuery = '') {
    chatList.innerHTML = '';

    let filtered = filterQuery
        ? conversations.filter(c =>
            c.title.toLowerCase().includes(filterQuery) ||
            c.messages.some(m => m.content.toLowerCase().includes(filterQuery))
          )
        : conversations;

    if (filtered.length === 0) {
        chatList.innerHTML = '<div class="no-results">未找到匹配的对话</div>';
        return;
    }

    filtered.forEach(chat => {
        const div = document.createElement('div');
        div.className = `chat-item ${chat.id === currentChatId ? 'active' : ''}`;

        const totalTokens = chat.tokenUsage?.total_tokens || 0;
        const isBranch = chat.parentId !== null;
        const branchCount = (chat.branches || []).length;

        let title = chat.title;
        if (filterQuery && !chat.title.toLowerCase().includes(filterQuery)) {
            const match = chat.messages.find(m => m.content.toLowerCase().includes(filterQuery));
            if (match) title += ` (含: "${match.content.substring(0, 20)}...")`;
        }

        div.innerHTML = `
            <div class="chat-item-info" data-chat-id="${chat.id}">
                <div class="chat-item-title">${escapeHtml(title)}</div>
                <div class="chat-item-meta">
                    <span>${formatTime(new Date(chat.updatedAt))}</span>
                    <span>${chat.messages.length}条</span>
                    ${totalTokens > 0 ? `<span>🔢${formatTokenCount(totalTokens)}</span>` : ''}
                    ${isBranch ? '<span class="chat-item-branch">🔀</span>' : ''}
                    ${branchCount > 0 ? `<span class="chat-item-branch">🌿${branchCount}</span>` : ''}
                </div>
            </div>
            <div class="chat-item-actions">
                <button class="rename-chat" data-chat-id="${chat.id}" title="重命名">✏️</button>
                <button class="delete-chat" data-chat-id="${chat.id}" title="删除">🗑️</button>
            </div>
        `;

        div.querySelector('.chat-item-info').addEventListener('click', () => {
            switchChat(chat.id);
            closeSidebar();
        });
        div.querySelector('.rename-chat').addEventListener('click', (e) => {
            e.stopPropagation();
            renameChat(chat.id);
        });
        div.querySelector('.delete-chat').addEventListener('click', (e) => {
            e.stopPropagation();
            deleteChat(chat.id);
        });

        chatList.appendChild(div);
    });
}

// ==================== 消息渲染 ====================
function renderMessages(messages) {
    chatContainer.innerHTML = '';
    collapsedGroups.clear();

    if (!messages || messages.length === 0) {
        const idx = { pro: 0, reasoner: 1, flash: 2 }[currentModelKey] || 0;
        const modelInfo = availableModels[idx];
        chatContainer.innerHTML = `
            <div class="welcome-message">
                <div class="bot-avatar"><img src="deepseek.png" alt="助手"></div>
                <div class="message-content">
                    当前：${modelInfo.name}<br>${modelInfo.desc}<br>
                    ☰ 对话 | 🔀 分支 | 🔄 重新生成
                </div>
            </div>
        `;
        renderTokenStats();
        return;
    }

    let i = 0;
    while (i < messages.length) {
        if (messages[i].role === 'user') {
            const groupDiv = document.createElement('div');
            groupDiv.className = 'message-group';

            groupDiv.appendChild(createMsgEl('user', messages[i].content));

            if (i + 1 < messages.length && messages[i + 1].role === 'assistant') {
                const wrap = document.createElement('div');
                wrap.className = 'message-collapsible';

                const reasoning = messages[i + 1].reasoning;

                const header = document.createElement('div');
                header.className = 'message-collapsible-header';
                header.innerHTML = `
                    <span class="toggle-icon">▼</span>
                    <span>助手回复</span>
                    ${reasoning ? '<span style="color:var(--warning-color);margin-left:8px;font-size:0.75rem">🧠思考过程</span>' : ''}
                    <span style="flex:1"></span>
                    <span style="font-size:0.75rem;color:var(--text-muted)">折叠</span>
                `;

                const body = document.createElement('div');
                body.className = 'message-collapsible-body';

                if (reasoning) {
                    const rBlock = document.createElement('div');
                    rBlock.className = 'reasoning-block';
                    rBlock.innerHTML = `
                        <div class="reasoning-header" onclick="this.nextElementSibling.classList.toggle('hidden')">
                            🧠 思考过程 <span class="toggle-icon">▼</span>
                        </div>
                        <div class="reasoning-content">${formatMsg(reasoning)}</div>
                    `;
                    body.appendChild(rBlock);
                }

                body.appendChild(createMsgEl('assistant', messages[i + 1].content));

                const actions = document.createElement('div');
                actions.className = 'message-actions';
                actions.innerHTML = `
                    <button class="regenerate-btn" data-idx="${i}">🔄 重新生成</button>
                    <button class="branch-msg-btn" data-idx="${i}">🔀 分支</button>
                `;
                body.appendChild(actions);

                header.addEventListener('click', () => {
                    body.classList.toggle('hidden');
                    header.classList.toggle('collapsed');
                });

                wrap.appendChild(header);
                wrap.appendChild(body);
                groupDiv.appendChild(wrap);

                setTimeout(() => {
                    actions.querySelector('.regenerate-btn')?.addEventListener('click', (e) => {
                        e.stopPropagation();
                        regenerateMessage(i);
                    });
                    actions.querySelector('.branch-msg-btn')?.addEventListener('click', (e) => {
                        e.stopPropagation();
                        branchFromMessage(i);
                    });
                }, 0);

                i += 2;
            } else {
                i++;
            }

            chatContainer.appendChild(groupDiv);
        } else {
            chatContainer.appendChild(createMsgEl('assistant', messages[i].content));
            i++;
        }
    }

    renderTokenStats();
    scrollToBottom();
}

function createMsgEl(role, content) {
    const div = document.createElement('div');
    div.className = `message ${role}`;
    div.innerHTML = role === 'assistant'
        ? `<div class="bot-avatar"><img src="deepseek.png" alt="助手"></div><div class="message-content">${formatMsg(content)}</div>`
        : `<div class="bot-avatar">⚫</div><div class="message-content">${escapeHtml(content)}</div>`;
    return div;
}

function renderTokenStats() {
    const old = document.getElementById('tokenStats');
    if (old) old.remove();

    const chat = conversations.find(c => c.id === currentChatId);
    if (!chat?.tokenUsage?.total_tokens) return;

    const div = document.createElement('div');
    div.id = 'tokenStats';
    div.className = 'token-stats';

    const inputCost = (chat.tokenUsage.prompt_tokens / 1000000 * 1).toFixed(4);
    const outputCost = (chat.tokenUsage.completion_tokens / 1000000 * 2).toFixed(4);
    const totalCost = (parseFloat(inputCost) + parseFloat(outputCost)).toFixed(4);

    div.innerHTML = `
        <div class="token-stats-content">
            <span class="token-item">📥 ${formatTokenCount(chat.tokenUsage.prompt_tokens)}</span>
            <span class="token-item">📤 ${formatTokenCount(chat.tokenUsage.completion_tokens)}</span>
            <span class="token-item">🔢 ${formatTokenCount(chat.tokenUsage.total_tokens)}</span>
            <span class="token-item token-cost">💰 ¥${totalCost}</span>
        </div>
    `;
    chatContainer.appendChild(div);
}

function formatTokenCount(count) {
    if (count >= 1000000) return (count / 1000000).toFixed(1) + 'M';
    if (count >= 1000) return (count / 1000).toFixed(1) + 'K';
    return String(count);
}

// ==================== 发送消息 ====================
async function sendMessage() {
    const content = messageInput.value.trim();
    if (!content || isWaiting) return;

    if (!apiKey) {
        alert('请先配置 API Key');
        configBody.classList.remove('collapsed');
        toggleConfig.classList.remove('collapsed');
        return;
    }

    const chat = conversations.find(c => c.id === currentChatId);
    if (!chat) return;

    chat.modelKey = currentModelKey;
    chat.messages.push({ role: 'user', content });
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
        const result = await callAPI(chat.messages);
        removeTyping();

        if (result) {
            chat.messages.push({
                role: 'assistant',
                content: result.content,
                reasoning: result.reasoning || null
            });
            chat.updatedAt = new Date().toISOString();
            saveConversations();
            renderMessages(chat.messages);
            renderChatList();
        }
    } catch (error) {
        removeTyping();
        chatContainer.innerHTML += `<div class="message assistant"><div class="bot-avatar"><img src="deepseek.png" alt="助手"></div><div class="message-content">❌ ${escapeHtml(error.message)}</div></div>`;
    } finally {
        isWaiting = false;
        sendBtn.disabled = false;
    }
}

async function regenerateMessage(userMsgIndex) {
    const chat = conversations.find(c => c.id === currentChatId);
    if (!chat || isWaiting) return;

    if (userMsgIndex + 1 < chat.messages.length) {
        chat.messages.splice(userMsgIndex + 1, 1);
    }
    chat.messages = chat.messages.slice(0, userMsgIndex + 1);
    saveConversations();
    renderMessages(chat.messages);

    isWaiting = true;
    sendBtn.disabled = true;
    showTyping();

    try {
        const result = await callAPI(chat.messages);
        removeTyping();

        if (result) {
            chat.messages.push({
                role: 'assistant',
                content: result.content,
                reasoning: result.reasoning || null
            });
            chat.updatedAt = new Date().toISOString();
            saveConversations();
            renderMessages(chat.messages);
            renderChatList();
        }
    } catch (error) {
        removeTyping();
        chatContainer.innerHTML += `<div class="message assistant"><div class="bot-avatar"><img src="deepseek.png" alt="助手"></div><div class="message-content">❌ ${escapeHtml(error.message)}</div></div>`;
    } finally {
        isWaiting = false;
        sendBtn.disabled = false;
    }
}

function branchFromMessage(msgIndex) {
    if (confirm(`从第 ${msgIndex + 1} 条消息处创建分支？`)) {
        createNewChat(currentChatId, msgIndex);
        closeSidebar();
    }
}

// ==================== API 调用 ====================
async function callAPI(messages) {
    const apiMessages = messages.map(msg => ({ role: msg.role, content: msg.content }));
    const isReasoner = currentModelKey === 'reasoner';

    const body = {
        model: currentModel,
        messages: apiMessages,
        stream: false
    };

    if (!isReasoner) {
        body.temperature = 0.7;
        body.max_tokens = 2000;
    }

    const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify(body)
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || '请求失败');
    }

    const data = await response.json();
    if (data.usage) addTokenUsage(data.usage);

    const choice = data.choices[0];
    return {
        content: choice.message.content,
        reasoning: choice.message.reasoning_content || null
    };
}

function addTokenUsage(usage) {
    const chat = conversations.find(c => c.id === currentChatId);
    if (chat) {
        chat.tokenUsage = chat.tokenUsage || { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
        chat.tokenUsage.prompt_tokens += usage.prompt_tokens || 0;
        chat.tokenUsage.completion_tokens += usage.completion_tokens || 0;
        chat.tokenUsage.total_tokens += usage.total_tokens || 0;
        saveConversations();
    }
}

// ==================== 文件处理 ====================
function handleFileSelect(event) {
    const file = event.target.files[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { alert('文件太大'); fileInput.value = ''; return; }
    currentFile = file;
    showFilePreview(file);
    readFileContent(file);
}

function showFilePreview(file) {
    removeFilePreview();
    const preview = document.createElement('div');
    preview.className = 'file-preview';
    preview.id = 'filePreview';
    preview.innerHTML = `
        <div class="file-preview-info">
            <span>📄</span><span class="file-preview-name">${escapeHtml(file.name)}</span><span class="file-preview-size">${formatFileSize(file.size)}</span>
        </div>
        <button class="file-preview-remove" onclick="removeFilePreview()">✕</button>
    `;
    document.querySelector('.input-container').parentNode.insertBefore(preview, document.querySelector('.input-container'));
}

function removeFilePreview() {
    const p = document.getElementById('filePreview'); if (p) p.remove();
    currentFile = null; fileInput.value = '';
}

function readFileContent(file) {
    const reader = new FileReader();
    const ext = file.name.split('.').pop().toLowerCase();
    const textTypes = ['txt','md','json','csv','js','py','html','css','xml','yaml','yml','log','sh','java','c','cpp','php','rb','go','rs','ts','tsx','vue','sql','swift','kt'];

    reader.onload = function(e) {
        let prompt = '';
        if (textTypes.includes(ext)) {
            const truncated = e.target.result.length > 5000 ? e.target.result.substring(0, 5000) + '\n...(已截断)' : e.target.result;
            prompt = `\n\n--- 文件: ${file.name} ---\n${truncated}\n--- 文件结束 ---`;
        } else {
            const hints = { pdf: 'PDF', doc: 'Word', docx: 'Word', xlsx: 'Excel', png: '图片', jpg: '图片', jpeg: '图片' };
            prompt = `\n\n[${hints[ext] || '未知'}文件: ${file.name}]`;
        }
        messageInput.value += prompt;
        messageInput.focus();
        autoResize();
    };

    textTypes.includes(ext) ? reader.readAsText(file) : (messageInput.value += `\n\n[文件: ${file.name}]`, messageInput.focus());
}

// ==================== 工具函数 ====================
function formatMsg(content) {
    if (!content) return '';
    let f = escapeHtml(content);
    f = f.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => `<pre><code>${escapeHtml(code.trim())}</code></pre>`);
    f = f.replace(/`([^`]+)`/g, '<code>$1</code>');
    f = f.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    f = f.replace(/\n/g, '<br>');
    return f;
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function saveApiKey() {
    const key = apiKeyInput.value.trim();
    if (!key) { alert('请输入 API Key'); return; }
    apiKey = key;
    localStorage.setItem('deepseek_api_key', apiKey);
    alert('✅ API Key 已保存！');
    configBody.classList.add('collapsed');
    toggleConfig.classList.add('collapsed');
}

function toggleConfigPanel() {
    configBody.classList.toggle('collapsed');
    toggleConfig.classList.toggle('collapsed');
}

function showTyping() {
    const div = document.createElement('div');
    div.className = 'message assistant';
    div.id = 'typingIndicator';
    div.innerHTML = `<div class="bot-avatar"><img src="deepseek.png" alt="助手"></div><div class="message-content"><div class="typing-indicator"><span></span><span></span><span></span></div></div>`;
    chatContainer.appendChild(div);
    scrollToBottom();
}

function removeTyping() {
    const el = document.getElementById('typingIndicator'); if (el) el.remove();
}

function openSidebar() { sidebar.classList.add('open'); overlay.classList.add('show'); }
function closeSidebar() { sidebar.classList.remove('open'); overlay.classList.remove('show'); }

function autoResize() {
    messageInput.style.height = 'auto';
    messageInput.style.height = Math.min(messageInput.scrollHeight, 120) + 'px';
}

function scrollToBottom() { chatContainer.scrollTop = chatContainer.scrollHeight; }

function formatTime(date) {
    const diff = Date.now() - date;
    if (diff < 60000) return '刚刚';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}小时前`;
    if (diff < 604800000) return `${Math.floor(diff / 86400000)}天前`;
    return `${date.getMonth() + 1}/${date.getDate()}`;
}

function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

// ==================== 启动 ====================
init();
