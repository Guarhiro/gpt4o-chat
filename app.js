const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const defaultSettings = {
  apiKey: '',
  systemPrompt: 'You are a helpful assistant.',
  temperature: 0.7,
  maxTokens: 4096,
  model: 'openai/gpt-4o',
  memoryEnabled: true,
  globalMemory: '',
  contextMode: 'recent',
  contextMessageLimit: 20,
  contextCharLimit: 60000,
  includeImageHistory: false
};

function parseStoredJson(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback));
  } catch {
    return fallback;
  }
}

function loadConversations() {
  const conversations = parseStoredJson('conversations', []);
  return Array.isArray(conversations) ? conversations : [];
}

function loadSettings() {
  const stored = parseStoredJson('chatSettings', {});
  return { ...defaultSettings, ...(stored && typeof stored === 'object' ? stored : {}) };
}

const state = {
  conversations: loadConversations(),
  currentConvId: null,
  attachments: [],
  isStreaming: false,
  abortController: null,
  settings: loadSettings()
};

const renderer = new marked.Renderer();
renderer.code = function(codeObj) {
  const text = typeof codeObj === 'object' ? codeObj.text : codeObj;
  const lang = typeof codeObj === 'object' ? (codeObj.lang || '') : (arguments[1] || '');
  const langLabel = lang || 'code';
  let highlighted;
  try {
    highlighted = lang && hljs.getLanguage(lang)
      ? hljs.highlight(text, { language: lang }).value
      : hljs.highlightAuto(text).value;
  } catch {
    highlighted = escapeHtml(text);
  }
  return `<pre><div class="code-header"><span>${escapeHtml(langLabel)}</span><button type="button" class="copy-code-btn">コピー</button></div><code class="hljs">${highlighted}</code></pre>`;
};

marked.setOptions({ renderer, breaks: true, gfm: true });

function escapeHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function escapeAttr(str) {
  return escapeHtml(str).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function renderMarkdown(text) {
  const html = marked.parse(text || '');
  if (!window.DOMPurify) {
    return escapeHtml(text || '').replace(/\n/g, '<br>');
  }
  return DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
    ADD_TAGS: ['button'],
    ADD_ATTR: ['type', 'class']
  });
}

function copyCode(btn) {
  const code = btn.closest('pre').querySelector('code').textContent;
  navigator.clipboard.writeText(code).then(() => {
    btn.textContent = 'コピー済み';
    setTimeout(() => btn.textContent = 'コピー', 2000);
  });
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

function showError(msg) {
  const toast = document.createElement('div');
  toast.className = 'error-toast';
  toast.textContent = msg;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 4000);
}

function saveConversations() {
  try {
    localStorage.setItem('conversations', JSON.stringify(state.conversations));
  } catch {
    showError('会話の保存に失敗しました。画像履歴が大きすぎる可能性があります');
  }
}

function saveSettings() {
  localStorage.setItem('chatSettings', JSON.stringify(state.settings));
}

// Conversation management
function createConversation() {
  const conv = {
    id: generateId(),
    title: '新しいチャット',
    messages: [],
    summary: '',
    createdAt: Date.now()
  };
  state.conversations.unshift(conv);
  state.currentConvId = conv.id;
  saveConversations();
  renderConversationList();
  renderMessages();
  $('#welcomeScreen').classList.remove('hidden');
  $('#messages').innerHTML = '';
  if (isMobileLayout()) closeSidebar();
}

function switchConversation(id) {
  state.currentConvId = id;
  renderConversationList();
  renderMessages();
  if (isMobileLayout()) closeSidebar();
}

function deleteConversation(id, e) {
  e.stopPropagation();
  state.conversations = state.conversations.filter(c => c.id !== id);
  if (state.currentConvId === id) {
    state.currentConvId = state.conversations[0]?.id || null;
    if (!state.currentConvId) createConversation();
  }
  saveConversations();
  renderConversationList();
  renderMessages();
}

function getCurrentConversation() {
  return state.conversations.find(c => c.id === state.currentConvId);
}

function renderConversationList() {
  const list = $('#conversationList');
  list.innerHTML = '';
  state.conversations.forEach(conv => {
    const item = document.createElement('div');
    item.className = `conversation-item${conv.id === state.currentConvId ? ' active' : ''}`;
    item.innerHTML = `<span class="conv-title">${escapeHtml(conv.title)}</span><button class="delete-conv" title="削除">&times;</button>`;
    item.querySelector('.conv-title').addEventListener('click', () => switchConversation(conv.id));
    item.querySelector('.delete-conv').addEventListener('click', (e) => deleteConversation(conv.id, e));
    list.appendChild(item);
  });
}

function renderMessages() {
  const conv = getCurrentConversation();
  if (!conv) return;

  const welcome = $('#welcomeScreen');
  const messagesEl = $('#messages');

  if (conv.messages.length === 0) {
    welcome.classList.remove('hidden');
    messagesEl.innerHTML = '';
    return;
  }

  welcome.classList.add('hidden');
  messagesEl.innerHTML = '';

  conv.messages.forEach(msg => {
    if (msg.role === 'system') return;
    appendMessageToDOM(msg);
  });

  scrollToBottom();
}

function appendMessageToDOM(msg) {
  const messagesEl = $('#messages');
  const div = document.createElement('div');
  div.className = 'message';
  div.dataset.role = msg.role;

  const isUser = msg.role === 'user';
  const avatar = isUser ? 'あ' : 'G';
  const roleName = isUser ? 'あなた' : 'GPT-4o';

  let imagesHtml = '';
  if (msg.images && msg.images.length > 0) {
    imagesHtml = `<div class="message-images">${msg.images.map(src =>
      `<img src="${escapeAttr(src)}" alt="添付画像" class="message-image">`
    ).join('')}</div>`;
  }

  const contentHtml = msg.role === 'assistant'
    ? renderMarkdown(msg.content || '')
    : escapeHtml(msg.content || '');

  div.innerHTML = `
    <div class="message-header">
      <div class="message-avatar ${msg.role}">${avatar}</div>
      <span class="message-role">${roleName}</span>
    </div>
    ${imagesHtml}
    <div class="message-content">${contentHtml}</div>
  `;

  messagesEl.appendChild(div);
  return div;
}

function scrollToBottom() {
  const container = $('#chatContainer');
  container.scrollTop = container.scrollHeight;
}

function openLightbox(src) {
  const lb = document.createElement('div');
  lb.className = 'lightbox';
  const img = document.createElement('img');
  img.src = src;
  lb.appendChild(img);
  lb.addEventListener('click', () => lb.remove());
  document.body.appendChild(lb);
}

// Attachments
function handleFiles(files) {
  Array.from(files).forEach(file => {
    if (!file.type.startsWith('image/')) {
      showError('画像ファイルのみ対応しています');
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      showError('ファイルサイズは20MB以下にしてください');
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      state.attachments.push({
        dataUrl: e.target.result,
        type: file.type
      });
      renderAttachments();
    };
    reader.readAsDataURL(file);
  });
}

function renderAttachments() {
  const preview = $('#attachmentsPreview');
  preview.innerHTML = '';
  state.attachments.forEach((att, i) => {
    const thumb = document.createElement('div');
    thumb.className = 'attachment-thumb';
    thumb.innerHTML = `
      <img src="${escapeAttr(att.dataUrl)}" alt="添付">
      <button class="remove-attachment" data-index="${i}">&times;</button>
    `;
    thumb.querySelector('.remove-attachment').addEventListener('click', () => {
      state.attachments.splice(i, 1);
      renderAttachments();
    });
    preview.appendChild(thumb);
  });
  updateSendBtn();
}

function updateSendBtn() {
  const input = $('#messageInput');
  const sendBtn = $('#sendBtn');
  const hasContent = input.value.trim().length > 0 || state.attachments.length > 0;
  sendBtn.disabled = !hasContent;
}

function clampNumber(value, fallback, min, max) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.min(Math.max(num, min), max);
}

function estimateMessageCharacters(msg) {
  const textLength = typeof msg.content === 'string' ? msg.content.length : 0;
  const imageCost = (msg.images?.length || 0) * 4000;
  return textLength + imageCost;
}

function limitMessagesByCharacters(messages, charLimit) {
  const limit = Number(charLimit);
  if (!Number.isFinite(limit) || limit <= 0) return messages;

  const kept = [];
  let total = 0;
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    const size = estimateMessageCharacters(msg);
    if (kept.length > 0 && total + size > limit) break;
    kept.unshift(msg);
    total += size;
  }
  return kept;
}

function messageToApiMessage(msg, latestUserMessage) {
  if (msg.role === 'assistant') {
    return { role: 'assistant', content: msg.content || '' };
  }

  const shouldSendImages = msg.images?.length > 0
    && (state.settings.includeImageHistory || msg === latestUserMessage);

  if (!shouldSendImages) {
    const omitted = msg.images?.length > 0 ? '\n[過去の画像はコンテキスト節約のため省略されています]' : '';
    return { role: 'user', content: `${msg.content || ''}${omitted}`.trim() || '[画像は省略されています]' };
  }

  const parts = msg.images.map(img => ({
    type: 'image_url',
    image_url: { url: img }
  }));
  if (msg.content) parts.push({ type: 'text', text: msg.content });
  return { role: 'user', content: parts };
}

function buildApiMessages(conv) {
  const apiMessages = [];
  const systemParts = [];
  const memory = state.settings.globalMemory?.trim();
  const summary = conv.summary?.trim();

  if (state.settings.systemPrompt?.trim()) {
    systemParts.push(state.settings.systemPrompt.trim());
  }
  if (state.settings.memoryEnabled && memory) {
    systemParts.push(`Persistent memory for this user:\n${memory}`);
  }
  if (state.settings.contextMode === 'summary' && summary) {
    systemParts.push(`Summary of earlier conversation:\n${summary}`);
  }
  if (systemParts.length > 0) {
    apiMessages.push({ role: 'system', content: systemParts.join('\n\n') });
  }

  const conversationMessages = conv.messages.filter(m => m.role === 'user' || m.role === 'assistant');
  const latestUserMessage = [...conversationMessages].reverse().find(m => m.role === 'user');
  const messageLimit = clampNumber(state.settings.contextMessageLimit, defaultSettings.contextMessageLimit, 2, 200);
  const contextMode = state.settings.contextMode || defaultSettings.contextMode;

  let selectedMessages = contextMode === 'all'
    ? conversationMessages
    : conversationMessages.slice(-messageLimit);

  selectedMessages = limitMessagesByCharacters(selectedMessages, state.settings.contextCharLimit);
  selectedMessages.forEach(msg => apiMessages.push(messageToApiMessage(msg, latestUserMessage)));

  return apiMessages;
}

// API call
async function sendMessage() {
  const input = $('#messageInput');
  const text = input.value.trim();
  const images = [...state.attachments];

  if (!text && images.length === 0) return;
  if (!state.settings.apiKey) {
    showError('設定からAPIキーを入力してください');
    return;
  }

  const conv = getCurrentConversation();
  if (!conv) return;

  const userMsg = {
    role: 'user',
    content: text,
    images: images.map(i => i.dataUrl)
  };
  conv.messages.push(userMsg);

  // Clear input
  input.value = '';
  input.style.height = 'auto';
  state.attachments = [];
  renderAttachments();
  updateSendBtn();

  // Show welcome -> messages
  $('#welcomeScreen').classList.add('hidden');
  appendMessageToDOM(userMsg);
  scrollToBottom();

  // Auto title
  if (conv.messages.filter(m => m.role === 'user').length === 1) {
    conv.title = text.slice(0, 40) || '画像について';
    renderConversationList();
  }
  saveConversations();

  const apiMessages = buildApiMessages(conv);

  // Show typing
  const assistantMsg = { role: 'assistant', content: '' };
  const msgDiv = appendMessageToDOM(assistantMsg);
  const contentEl = msgDiv.querySelector('.message-content');
  contentEl.innerHTML = '<div class="typing-indicator"><span></span><span></span><span></span></div>';
  scrollToBottom();

  // Toggle buttons
  $('#sendBtn').classList.add('hidden');
  $('#stopBtn').classList.remove('hidden');
  state.isStreaming = true;

  state.abortController = new AbortController();

  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${state.settings.apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': location.origin,
      },
      body: JSON.stringify({
        model: state.settings.model,
        messages: apiMessages,
        temperature: clampNumber(state.settings.temperature, defaultSettings.temperature, 0, 2),
        max_completion_tokens: clampNumber(state.settings.maxTokens, defaultSettings.maxTokens, 1, 128000),
        stream: true,
        session_id: conv.id
      }),
      signal: state.abortController.signal
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error?.message || `API Error: ${response.status}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let fullText = '';
    let buffer = '';
    let finishReason = null;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data: ')) continue;
        const data = trimmed.slice(6);
        if (data === '[DONE]') continue;

        try {
          const json = JSON.parse(data);
          const choice = json.choices?.[0];
          const delta = choice?.delta?.content;
          if (choice?.finish_reason) {
            finishReason = choice.finish_reason;
          }
          if (delta) {
            fullText += delta;
            contentEl.innerHTML = renderMarkdown(fullText);
            scrollToBottom();
          }
        } catch {}
      }
    }

    assistantMsg.content = fullText;
    assistantMsg.finishReason = finishReason;
    conv.messages.push(assistantMsg);
    saveConversations();
    if (finishReason === 'length') {
      showError('出力上限に達したため、回答が途中で止まった可能性があります');
    }

  } catch (err) {
    if (err.name === 'AbortError') {
      assistantMsg.content = contentEl.textContent || '';
      if (assistantMsg.content) {
        conv.messages.push(assistantMsg);
        saveConversations();
      }
    } else {
      contentEl.innerHTML = `<p style="color: var(--danger)">エラー: ${escapeHtml(err.message)}</p>`;
      showError(err.message);
    }
  } finally {
    state.isStreaming = false;
    state.abortController = null;
    $('#sendBtn').classList.remove('hidden');
    $('#stopBtn').classList.add('hidden');
    updateSendBtn();
  }
}

// Event listeners
document.addEventListener('click', (e) => {
  const copyBtn = e.target.closest('.copy-code-btn');
  if (copyBtn) {
    copyCode(copyBtn);
    return;
  }

  const image = e.target.closest('.message-image');
  if (image) {
    openLightbox(image.src);
  }
});

$('#messageInput').addEventListener('input', function() {
  this.style.height = 'auto';
  this.style.height = Math.min(this.scrollHeight, 200) + 'px';
  updateSendBtn();
});

$('#messageInput').addEventListener('keydown', function(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    if (!state.isStreaming && (this.value.trim() || state.attachments.length > 0)) {
      sendMessage();
    }
  }
});

$('#sendBtn').addEventListener('click', () => {
  if (!state.isStreaming) sendMessage();
});

$('#stopBtn').addEventListener('click', () => {
  if (state.abortController) state.abortController.abort();
});

$('#newChatBtn').addEventListener('click', createConversation);

$('#attachBtn').addEventListener('click', () => $('#fileInput').click());

$('#fileInput').addEventListener('change', function() {
  handleFiles(this.files);
  this.value = '';
});

function closeSidebar() {
  const sidebar = $('#sidebar');
  const overlay = $('#sidebarOverlay');
  sidebar.classList.remove('open');
  overlay.classList.remove('active');
  if (!isMobileLayout()) {
    sidebar.classList.add('collapsed');
  }
}

function isMobileLayout() {
  return window.innerWidth <= 768;
}

function openSidebar() {
  const sidebar = $('#sidebar');
  const overlay = $('#sidebarOverlay');
  if (isMobileLayout()) {
    sidebar.classList.add('open');
    overlay.classList.add('active');
  } else {
    sidebar.classList.remove('collapsed');
  }
}

$('#sidebarToggle').addEventListener('click', () => {
  const sidebar = $('#sidebar');
  if (isMobileLayout()) {
    if (sidebar.classList.contains('open')) {
      closeSidebar();
    } else {
      openSidebar();
    }
  } else {
    if (sidebar.classList.contains('collapsed')) {
      openSidebar();
    } else {
      closeSidebar();
    }
  }
});

$('#sidebarOverlay').addEventListener('click', closeSidebar);

// Model selector
$('#modelSelect').addEventListener('change', function() {
  state.settings.model = this.value;
  $('.model-name').textContent = this.options[this.selectedIndex].text;
  saveSettings();
});

// Settings modal
$('#settingsBtn').addEventListener('click', () => {
  const conv = getCurrentConversation();
  $('#settingsModal').classList.remove('hidden');
  $('#apiKeyInput').value = state.settings.apiKey;
  $('#systemPromptInput').value = state.settings.systemPrompt;
  $('#memoryEnabledInput').checked = Boolean(state.settings.memoryEnabled);
  $('#globalMemoryInput').value = state.settings.globalMemory || '';
  $('#conversationSummaryInput').value = conv?.summary || '';
  $('#contextModeSelect').value = state.settings.contextMode || defaultSettings.contextMode;
  $('#contextMessageLimitInput').value = state.settings.contextMessageLimit;
  $('#contextCharLimitInput').value = state.settings.contextCharLimit;
  $('#includeImageHistoryInput').checked = Boolean(state.settings.includeImageHistory);
  $('#tempSlider').value = state.settings.temperature;
  $('#tempValue').textContent = state.settings.temperature;
  $('#maxTokensInput').value = state.settings.maxTokens;
});

$('#modalClose').addEventListener('click', () => $('#settingsModal').classList.add('hidden'));
$('#modalOverlay').addEventListener('click', () => $('#settingsModal').classList.add('hidden'));

$('#tempSlider').addEventListener('input', function() {
  $('#tempValue').textContent = this.value;
});

$('#toggleApiKey').addEventListener('click', () => {
  const input = $('#apiKeyInput');
  input.type = input.type === 'password' ? 'text' : 'password';
});

$('#saveSettingsBtn').addEventListener('click', () => {
  const conv = getCurrentConversation();
  const contextMode = $('#contextModeSelect').value;
  state.settings.apiKey = $('#apiKeyInput').value.trim();
  state.settings.systemPrompt = $('#systemPromptInput').value.trim();
  state.settings.memoryEnabled = $('#memoryEnabledInput').checked;
  state.settings.globalMemory = $('#globalMemoryInput').value.trim();
  state.settings.contextMode = ['recent', 'summary', 'all'].includes(contextMode) ? contextMode : defaultSettings.contextMode;
  state.settings.contextMessageLimit = clampNumber($('#contextMessageLimitInput').value, defaultSettings.contextMessageLimit, 2, 200);
  state.settings.contextCharLimit = clampNumber($('#contextCharLimitInput').value, defaultSettings.contextCharLimit, 0, 500000);
  state.settings.includeImageHistory = $('#includeImageHistoryInput').checked;
  state.settings.temperature = clampNumber($('#tempSlider').value, defaultSettings.temperature, 0, 2);
  state.settings.maxTokens = clampNumber($('#maxTokensInput').value, defaultSettings.maxTokens, 1, 128000);
  if (conv) {
    conv.summary = $('#conversationSummaryInput').value.trim();
    saveConversations();
  }
  saveSettings();
  $('#settingsModal').classList.add('hidden');
});

// Suggestions
$$('.suggestion').forEach(btn => {
  btn.addEventListener('click', () => {
    $('#messageInput').value = btn.dataset.prompt;
    updateSendBtn();
    $('#messageInput').focus();
  });
});

// Drag & drop
const inputArea = $('.input-area');
inputArea.addEventListener('dragover', (e) => {
  e.preventDefault();
  inputArea.style.borderColor = 'var(--accent)';
});
inputArea.addEventListener('dragleave', () => {
  inputArea.style.borderColor = '';
});
inputArea.addEventListener('drop', (e) => {
  e.preventDefault();
  inputArea.style.borderColor = '';
  handleFiles(e.dataTransfer.files);
});

// Init
$('#modelSelect').value = state.settings.model;
$('.model-name').textContent = $('#modelSelect').options[$('#modelSelect').selectedIndex].text;

if (state.conversations.length === 0) {
  createConversation();
} else {
  state.currentConvId = state.conversations[0].id;
  renderConversationList();
  renderMessages();
}

// Global lightbox function
window.openLightbox = openLightbox;
window.copyCode = copyCode;
