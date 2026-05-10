const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const state = {
  conversations: JSON.parse(localStorage.getItem('conversations') || '[]'),
  currentConvId: null,
  attachments: [],
  isStreaming: false,
  abortController: null,
  settings: JSON.parse(localStorage.getItem('chatSettings') || JSON.stringify({
    apiKey: '',
    systemPrompt: 'You are a helpful assistant.',
    temperature: 0.7,
    maxTokens: 4096,
    model: 'openai/gpt-4o'
  }))
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
  return `<pre><div class="code-header"><span>${langLabel}</span><button class="copy-code-btn" onclick="copyCode(this)">コピー</button></div><code class="hljs">${highlighted}</code></pre>`;
};

marked.setOptions({ renderer, breaks: true, gfm: true });

function escapeHtml(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
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
  localStorage.setItem('conversations', JSON.stringify(state.conversations));
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
    createdAt: Date.now()
  };
  state.conversations.unshift(conv);
  state.currentConvId = conv.id;
  saveConversations();
  renderConversationList();
  renderMessages();
  $('#welcomeScreen').classList.remove('hidden');
  $('#messages').innerHTML = '';
}

function switchConversation(id) {
  state.currentConvId = id;
  renderConversationList();
  renderMessages();
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
      `<img src="${src}" alt="添付画像" onclick="openLightbox(this.src)">`
    ).join('')}</div>`;
  }

  const contentHtml = msg.role === 'assistant'
    ? marked.parse(msg.content || '')
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
  lb.innerHTML = `<img src="${src}">`;
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
      <img src="${att.dataUrl}" alt="添付">
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

  // Build user message content
  let userContent;
  if (images.length > 0) {
    userContent = [];
    images.forEach(img => {
      userContent.push({
        type: 'image_url',
        image_url: { url: img.dataUrl }
      });
    });
    if (text) {
      userContent.push({ type: 'text', text });
    }
  } else {
    userContent = text;
  }

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

  // Build API messages
  const apiMessages = [];
  if (state.settings.systemPrompt) {
    apiMessages.push({ role: 'system', content: state.settings.systemPrompt });
  }
  conv.messages.forEach(m => {
    if (m.role === 'user') {
      if (m.images && m.images.length > 0) {
        const parts = [];
        m.images.forEach(img => {
          parts.push({ type: 'image_url', image_url: { url: img } });
        });
        if (m.content) parts.push({ type: 'text', text: m.content });
        apiMessages.push({ role: 'user', content: parts });
      } else {
        apiMessages.push({ role: 'user', content: m.content });
      }
    } else if (m.role === 'assistant') {
      apiMessages.push({ role: 'assistant', content: m.content });
    }
  });

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
        temperature: state.settings.temperature,
        max_tokens: state.settings.maxTokens,
        stream: true
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
          const delta = json.choices?.[0]?.delta?.content;
          if (delta) {
            fullText += delta;
            contentEl.innerHTML = marked.parse(fullText);
            scrollToBottom();
          }
        } catch {}
      }
    }

    assistantMsg.content = fullText;
    conv.messages.push(assistantMsg);
    saveConversations();

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
  if (window.innerWidth > 768) {
    sidebar.classList.add('collapsed');
  }
}

function openSidebar() {
  const sidebar = $('#sidebar');
  const overlay = $('#sidebarOverlay');
  if (window.innerWidth <= 768) {
    sidebar.classList.add('open');
    overlay.classList.add('active');
  } else {
    sidebar.classList.remove('collapsed');
  }
}

$('#sidebarToggle').addEventListener('click', () => {
  const sidebar = $('#sidebar');
  if (window.innerWidth <= 768) {
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
  $('#settingsModal').classList.remove('hidden');
  $('#apiKeyInput').value = state.settings.apiKey;
  $('#systemPromptInput').value = state.settings.systemPrompt;
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
  state.settings.apiKey = $('#apiKeyInput').value.trim();
  state.settings.systemPrompt = $('#systemPromptInput').value.trim();
  state.settings.temperature = parseFloat($('#tempSlider').value);
  state.settings.maxTokens = parseInt($('#maxTokensInput').value) || 4096;
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
