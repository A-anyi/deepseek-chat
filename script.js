// 全局变量
let apiKey = localStorage.getItem('deepseek_api_key') || '';
let conversations = [];
let currentChatId = null;
let isWaiting = false;

// DOM 元素
const chatContainer = document.getElementById('chatContainer');
const messageInput = document.getElementById('messageInput');
const sendBtn = document.getElementById('sendBtn');
const clearBtn = document.getElementById('clearBtn');
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

// 初始化
function init() {
    // 加载 API Key
    if (apiKey) {
        apiKeyInput.value = apiKey;
    }
    
    // 加载对话列表
    loadConversations();
    
    // 如果没有对话，创建默认对话
    if (conversations.length === 0) {
        createNewChat();
    } else {
        switchChat(conversations[0].id);
    }
    
    // 绑定事件
    sendBtn.addEventListener('click', sendMessage);
    clearBtn.addEventListener('click', clearCurrentChat);
    saveApiKeyBtn.addEventListener('click', saveApiKey);
    toggleConfig.addEventListener('click', toggleConfigPanel);
    menuBtn.addEventListener('click', openSidebar);
    newChatBtn.addEventListener('click', () => {
        createNewChat();
        closeSidebar();
    });
    overlay.addEventListener('click', closeSidebar);
    
    messageInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });
    
    messageInput.addEventListener('input', autoResize);
}

// 加载对话列表
function loadConversations() {
    const saved = localStorage.getItem('deepseek_conversations');
    if (saved) {
        try {
            conversations = JSON.parse(saved);
        } catch (e) {
            console.error('加载对话失败:', e);
            conversations = [];
        }
    }
    renderChatList();
}

// 保存对话列表
function saveConversations() {
    localStorage.setItem('deepseek_conversations', JSON.stringify(conversations));
}

// 创建新对话
function createNewChat() {
    const newChat = {
        id: Date.now().toString(),
        title: '新对话',
        messages: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };
    
    conversations.unshift(newChat);
    saveConversations();
    renderChatList();
    switchChat(newChat.id);
}

// 切换对话
function switchChat(chatId) {
    currentChatId = chatId;
    const chat = conversations.find(c => c.id === chatId);
    
    if (chat) {
        chatTitle.textContent = chat.title;
        renderMessages(chat.messages);
    }
    
    renderChatList();
}

// 渲染对话列表
function renderChatList() {
    chatList.innerHTML = '';
    
    if (conversations.length === 0) return;
    
    conversations.forEach(chat => {
        const chatItem = document.createElement('div');
        chatItem.className = `chat-item ${chat.id === currentChatId ? 'active' : ''}`;
        
        const date = new Date(chat.updatedAt);
        const timeStr = formatTime(date);
        
        chatItem.innerHTML = `
            <div class="chat-item-info" data-chat-id="${chat.id}">
                <div class="chat-item-title">${escapeHtml(chat.title)}</div>
                <div class="chat-item-time">${timeStr}</div>
            </div>
            <div class="chat-item-actions">
                <button class="rename-chat" data-chat-id="${chat.id}" title="重命名">✏️</button>
                <button class="delete-chat" data-chat-id="${chat.id}" title="删除">🗑️</button>
            </div>
        `;
        
        // 点击切换对话
        chatItem.querySelector('.chat-item-info').addEventListener('click', () => {
            switchChat(chat.id);
            closeSidebar();
        });
        
        // 重命名
        chatItem.querySelector('.rename-chat').addEventListener('click', (e) => {
            e.stopPropagation();
            renameChat(chat.id);
        });
        
        // 删除
        chatItem.querySelector('.delete-chat').addEventListener('click', (e) => {
            e.stopPropagation();
            deleteChat(chat.id);
        });
        
        chatList.appendChild(chatItem);
    });
}

// 重命名对话
function renameChat(chatId) {
    const chat = conversations.find(c => c.id === chatId);
    if (!chat) return;
    
    const newTitle = prompt('输入新标题:', chat.title);
    if (newTitle && newTitle.trim()) {
        chat.title = newTitle.trim();
        saveConversations();
        renderChatList();
        
        if (chatId === currentChatId) {
            chatTitle.textContent = chat.title;
        }
    }
}

// 删除对话
function deleteChat(chatId) {
    if (conversations.length <= 1) {
        alert('至少保留一个对话');
        return;
    }
    
    if (confirm('确定删除这个对话吗？')) {
        const index = conversations.findIndex(c => c.id === chatId);
        conversations.splice(index, 1);
        saveConversations();
        renderChatList();
        
        if (chatId === currentChatId) {
            switchChat(conversations[0].id);
        }
    }
}

// 清空当前对话
function clearCurrentChat() {
    if (confirm('确定清空当前对话的所有消息吗？')) {
        const chat = conversations.find(c => c.id === currentChatId);
        if (chat) {
            chat.messages = [];
            chat.updatedAt = new Date().toISOString();
            saveConversations();
            renderMessages([]);
            renderChatList();
        }
    }
}

// 渲染消息
function renderMessages(messages) {
    chatContainer.innerHTML = '';
    
    if (!messages || messages.length === 0) {
        chatContainer.innerHTML = `
            <div class="welcome-message">
                <div class="bot-avatar">✨</div>
                <div class="message-content">
                    你好！我是 DeepSeek 助手，有什么可以帮你的吗？<br>
                    点击左上角菜单可以管理多个对话哦~
                </div>
            </div>
        `;
        return;
    }
    
    messages.forEach(msg => {
        addMessageToUI(msg.role, msg.content);
    });
    
    scrollToBottom();
}

// 添加消息到界面
function addMessageToUI(role, content) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${role}`;
    
    if (role === 'assistant') {
        messageDiv.innerHTML = `
            <div class="bot-avatar">✨</div>
            <div class="message-content">${formatMessage(content)}</div>
        `;
    } else {
        messageDiv.innerHTML = `
            <div class="bot-avatar">👤</div>
            <div class="message-content">${escapeHtml(content)}</div>
        `;
    }
    
    chatContainer.appendChild(messageDiv);
    scrollToBottom();
}

// 格式化消息
function formatMessage(content) {
    let formatted = escapeHtml(content);
    
    // 代码块
    formatted = formatted.replace(/```(\w*)\n([\s\S]*?)```/g, (match, lang, code) => {
        return `<pre><code>${escapeHtml(code.trim())}</code></pre>`;
    });
    
    // 行内代码
    formatted = formatted.replace(/`([^`]+)`/g, '<code>$1</code>');
    
    // 粗体
    formatted = formatted.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    
    // 换行
    formatted = formatted.replace(/\n/g, '<br>');
    
    return formatted;
}

// HTML 转义
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// 发送消息
async function sendMessage() {
    const content = messageInput.value.trim();
    
    if (!content || isWaiting) return;
    
    if (!apiKey) {
        alert('请先配置 API Key');
        configBody.classList.remove('collapsed');
        return;
    }
    
    const chat = conversations.find(c => c.id === currentChatId);
    if (!chat) return;
    
    // 添加用户消息
    chat.messages.push({ role: 'user', content });
    addMessageToUI('user', content);
    messageInput.value = '';
    autoResize();
    
    // 更新对话时间
    chat.updatedAt = new Date().toISOString();
    
    // 自动设置标题（如果是第一条消息）
    if (chat.messages.length === 1) {
        chat.title = content.substring(0, 20) + (content.length > 20 ? '...' : '');
    }
    
    saveConversations();
    renderChatList();
    
    // 显示加载状态
    isWaiting = true;
    sendBtn.disabled = true;
    showTypingIndicator();
    
    try {
        const response = await callDeepSeekAPI(chat.messages);
        removeTypingIndicator();
        
        if (response) {
            chat.messages.push({ role: 'assistant', content: response });
            addMessageToUI('assistant', response);
            chat.updatedAt = new Date().toISOString();
            saveConversations();
            renderChatList();
        }
    } catch (error) {
        removeTypingIndicator();
        console.error('API 调用失败:', error);
        addMessageToUI('assistant', `❌ 错误：${error.message || '调用失败，请检查 API Key 或网络'}`);
    } finally {
        isWaiting = false;
        sendBtn.disabled = false;
    }
}

// 调用 DeepSeek API
async function callDeepSeekAPI(messages) {
    const apiMessages = messages.map(msg => ({
        role: msg.role,
        content: msg.content
    }));
    
    const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
            model: 'deepseek-chat',
            messages: apiMessages,
            stream: false,
            temperature: 0.7,
            max_tokens: 2000
        })
    });
    
    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || '请求失败');
    }
    
    const data = await response.json();
    return data.choices[0].message.content;
}

// 保存 API Key
function saveApiKey() {
    const key = apiKeyInput.value.trim();
    if (!key) {
        alert('请输入 API Key');
        return;
    }
    
    apiKey = key;
    localStorage.setItem('deepseek_api_key', apiKey);
    alert('✅ API Key 已保存！');
    configBody.classList.add('collapsed');
    toggleConfig.classList.add('collapsed');
}

// 切换配置面板
function toggleConfigPanel() {
    configBody.classList.toggle('collapsed');
    toggleConfig.classList.toggle('collapsed');
}

// 显示输入中动画
function showTypingIndicator() {
    const indicator = document.createElement('div');
    indicator.className = 'message assistant';
    indicator.id = 'typingIndicator';
    indicator.innerHTML = `
        <div class="bot-avatar">✨</div>
        <div class="message-content">
            <div class="typing-indicator">
                <span></span>
                <span></span>
                <span></span>
            </div>
        </div>
    `;
    chatContainer.appendChild(indicator);
    scrollToBottom();
}

// 移除输入中动画
function removeTypingIndicator() {
    const indicator = document.getElementById('typingIndicator');
    if (indicator) {
        indicator.remove();
    }
}

// 打开侧边栏
function openSidebar() {
    sidebar.classList.add('open');
    overlay.classList.add('show');
}

// 关闭侧边栏
function closeSidebar() {
    sidebar.classList.remove('open');
    overlay.classList.remove('show');
}

// 自动调整输入框高度
function autoResize() {
    messageInput.style.height = 'auto';
    messageInput.style.height = Math.min(messageInput.scrollHeight, 120) + 'px';
}

// 滚动到底部
function scrollToBottom() {
    chatContainer.scrollTop = chatContainer.scrollHeight;
}

// 格式化时间
function formatTime(date) {
    const now = new Date();
    const diff = now - date;
    
    if (diff < 60000) return '刚刚';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}小时前`;
    if (diff < 604800000) return `${Math.floor(diff / 86400000)}天前`;
    
    return `${date.getMonth() + 1}/${date.getDate()}`;
}

// 启动应用
init();
