// 全局变量
let apiKey = localStorage.getItem('deepseek_api_key') || '';
let messages = [];
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

// 初始化
function init() {
    // 加载保存的 API Key
    if (apiKey) {
        apiKeyInput.value = apiKey;
    }
    
    // 加载历史消息
    loadMessages();
    
    // 绑定事件
    sendBtn.addEventListener('click', sendMessage);
    clearBtn.addEventListener('click', clearChat);
    saveApiKeyBtn.addEventListener('click', saveApiKey);
    toggleConfig.addEventListener('click', toggleConfigPanel);
    
    messageInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });
    
    // 自动调整输入框高度
    messageInput.addEventListener('input', autoResize);
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
    alert('API Key 已保存！');
    configBody.classList.add('collapsed');
}

// 切换配置面板
function toggleConfigPanel() {
    configBody.classList.toggle('collapsed');
    toggleConfig.classList.toggle('collapsed');
}

// 加载消息历史
function loadMessages() {
    const saved = localStorage.getItem('deepseek_messages');
    if (saved) {
        try {
            messages = JSON.parse(saved);
            renderMessages();
        } catch (e) {
            console.error('加载消息失败:', e);
        }
    }
}

// 保存消息
function saveMessages() {
    localStorage.setItem('deepseek_messages', JSON.stringify(messages));
}

// 渲染消息
function renderMessages() {
    chatContainer.innerHTML = '';
    
    if (messages.length === 0) {
        chatContainer.innerHTML = `
            <div class="welcome-message">
                <div class="bot-avatar">🤖</div>
                <div class="message-content">
                    你好！我是 DeepSeek 助手，有什么可以帮你的吗？
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
            <div class="bot-avatar">🤖</div>
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

// 格式化消息（支持代码块）
function formatMessage(content) {
    // 简单的 Markdown 解析
    let formatted = escapeHtml(content);
    
    // 代码块
    formatted = formatted.replace(/```(\w*)\n([\s\S]*?)```/g, (match, lang, code) => {
        return `<pre><code class="language-${lang}">${escapeHtml(code.trim())}</code></pre>`;
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
    
    // 添加用户消息
    messages.push({ role: 'user', content });
    addMessageToUI('user', content);
    messageInput.value = '';
    autoResize();
    
    // 显示加载状态
    isWaiting = true;
    sendBtn.disabled = true;
    showTypingIndicator();
    
    try {
        const response = await callDeepSeekAPI();
        removeTypingIndicator();
        
        if (response) {
            messages.push({ role: 'assistant', content: response });
            addMessageToUI('assistant', response);
            saveMessages();
        }
    } catch (error) {
        removeTypingIndicator();
        console.error('API 调用失败:', error);
        addMessageToUI('assistant', `错误：${error.message || '调用失败，请检查 API Key 或网络'}`);
    } finally {
        isWaiting = false;
        sendBtn.disabled = false;
    }
}

// 调用 DeepSeek API
async function callDeepSeekAPI() {
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

// 显示输入中动画
function showTypingIndicator() {
    const indicator = document.createElement('div');
    indicator.className = 'message assistant';
    indicator.id = 'typingIndicator';
    indicator.innerHTML = `
        <div class="bot-avatar">🤖</div>
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

// 清空对话
function clearChat() {
    if (confirm('确定清空所有对话记录吗？')) {
        messages = [];
        localStorage.removeItem('deepseek_messages');
        renderMessages();
    }
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

// 启动应用
init();