import { supabase } from './supabase.js';

let currentRoom = null;
let currentUser = null;
let isEraser = false;
let drawing = false;
let drawingInitialized = false;
let messageChannel = null;
const messagesById = new Map();

const authScreen = document.getElementById('auth-screen');
const mainScreen = document.getElementById('main-screen');
const joinBtn = document.getElementById('join-btn');
const partnerNameInput = document.getElementById('partner-name');
const roomCodeInput = document.getElementById('room-code');
const logoutBtn = document.getElementById('logout-btn');
const roomTitle = document.getElementById('room-title');
const setupError = document.getElementById('setup-error');
const realtimeStatus = document.getElementById('realtime-status');

const canvas = document.getElementById('drawing-canvas');
const ctx = canvas.getContext('2d');
const colorPicker = document.getElementById('color-picker');
const brushSize = document.getElementById('brush-size');
const eraserBtn = document.getElementById('eraser-btn');
const clearCanvasBtn = document.getElementById('clear-canvas-btn');

const messageInput = document.getElementById('message-input');
const sendMsgBtn = document.getElementById('send-msg-btn');
const messagesList = document.getElementById('messages-list');

function setRealtimeStatus(message, state) {
    if (!realtimeStatus) return;
    realtimeStatus.textContent = message;
    realtimeStatus.dataset.state = state;
}

if (!supabase) {
    if (setupError) {
        setupError.textContent = 'تعذر الاتصال: تحقق من إعدادات Supabase في config.js.';
        setupError.hidden = false;
    }
    joinBtn.disabled = true;
}

function resizeCanvas() {
    const rect = canvas.parentElement.getBoundingClientRect();
    if (!rect.width || !rect.height) return;

    const width = Math.round(rect.width);
    const height = Math.round(rect.height);
    if (canvas.width === width && canvas.height === height) return;

    const previousCanvas = document.createElement('canvas');
    const hasPreviousDrawing = canvas.width > 0 && canvas.height > 0;
    if (hasPreviousDrawing) {
        previousCanvas.width = canvas.width;
        previousCanvas.height = canvas.height;
        previousCanvas.getContext('2d').drawImage(canvas, 0, 0);
    }

    canvas.width = width;
    canvas.height = height;
    if (hasPreviousDrawing) ctx.drawImage(previousCanvas, 0, 0, width, height);
}

async function joinRoom() {
    const name = partnerNameInput.value.trim();
    const code = roomCodeInput.value.trim();

    if (!name || !code) {
        alert('الرجاء كتابة الاسم ورمز الغرفة ❤️');
        return;
    }
    if (!supabase) return;

    joinBtn.disabled = true;
    currentUser = name;
    currentRoom = code;
    roomTitle.textContent = 'غرفة: ' + code;
    messagesById.clear();
    messagesList.replaceChildren();

    authScreen.classList.remove('active');
    mainScreen.classList.add('active');
    setRealtimeStatus('جارٍ الاتصال بالغرفة…', 'connecting');

    resizeCanvas();
    initDrawing();
    subscribeToRealtime();
    await loadMessages();
}

function initDrawing() {
    resizeCanvas();
    if (drawingInitialized) return;
    drawingInitialized = true;

    canvas.style.touchAction = 'none';
    canvas.addEventListener('pointerdown', startDrawing, { passive: false });
    canvas.addEventListener('pointermove', draw, { passive: false });
    canvas.addEventListener('pointerup', stopDrawing);
    canvas.addEventListener('pointercancel', stopDrawing);
    canvas.addEventListener('lostpointercapture', stopDrawing);
    window.addEventListener('resize', resizeCanvas, { passive: true });
}

function startDrawing(event) {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    if (event.cancelable) event.preventDefault();
    drawing = true;
    if (canvas.setPointerCapture && event.pointerId !== undefined) {
        canvas.setPointerCapture(event.pointerId);
    }
    ctx.beginPath();
    const rect = canvas.getBoundingClientRect();
    ctx.moveTo(event.clientX - rect.left, event.clientY - rect.top);
}

function draw(event) {
    if (!drawing) return;
    if (event.cancelable) event.preventDefault();
    const rect = canvas.getBoundingClientRect();
    ctx.lineWidth = Number(brushSize.value);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = isEraser ? '#ffffff' : colorPicker.value;
    ctx.lineTo(event.clientX - rect.left, event.clientY - rect.top);
    ctx.stroke();
}

function stopDrawing() {
    drawing = false;
}

eraserBtn.addEventListener('click', () => {
    isEraser = !isEraser;
    eraserBtn.setAttribute('aria-pressed', String(isEraser));
    eraserBtn.style.background = isEraser ? '#ffb3c6' : 'white';
});

clearCanvasBtn.addEventListener('click', () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
});

sendMsgBtn.addEventListener('click', sendMessage);
messageInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.isComposing) {
        event.preventDefault();
        sendMessage();
    }
});

async function sendMessage() {
    const text = messageInput.value.trim();
    if (!text || !currentRoom || !supabase || sendMsgBtn.disabled) return;

    sendMsgBtn.disabled = true;
    try {
        const { data, error } = await supabase
            .from('messages')
            .insert({ room_code: currentRoom, sender: currentUser, content: text })
            .select('*')
            .single();

        if (error) throw error;
        messageInput.value = '';
        if (data) appendMessage(data);
        else await loadMessages();
    } catch (error) {
        console.error('[Mawah] Failed to send message:', error);
        alert('فشل إرسال الرسالة، تحقق من الاتصال والصلاحيات.');
    } finally {
        sendMsgBtn.disabled = false;
        messageInput.focus();
    }
}

async function loadMessages() {
    if (!supabase || !currentRoom) return;
    const roomAtRequest = currentRoom;
    const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('room_code', roomAtRequest)
        .order('created_at', { ascending: true });

    if (roomAtRequest !== currentRoom) return;
    if (error) {
        console.error('[Mawah] Failed to load messages:', error);
        return;
    }
    mergeMessages(data || []);
}

function mergeMessages(rows) {
    for (const message of rows) {
        if (message && message.id !== undefined && message.id !== null) {
            messagesById.set(String(message.id), message);
        }
    }
    renderMessages();
}

function appendMessage(message) {
    if (!message || message.id === undefined || message.id === null) return;
    if (messagesById.has(String(message.id))) return;
    messagesById.set(String(message.id), message);
    renderMessages();
}

function renderMessages() {
    const keepAtBottom = messagesList.scrollHeight - messagesList.scrollTop - messagesList.clientHeight < 48;
    const sortedMessages = Array.from(messagesById.values()).sort((a, b) => {
        const timeDiff = new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime();
        return timeDiff || String(a.id).localeCompare(String(b.id));
    });
    const fragment = document.createDocumentFragment();

    for (const message of sortedMessages) {
        const item = document.createElement('div');
        item.dataset.id = String(message.id);
        item.className = 'message ' + (message.sender === currentUser ? 'sent' : 'received');
        item.textContent = String(message.sender || 'مجهول') + ': ' + String(message.content || '');
        fragment.appendChild(item);
    }

    messagesList.replaceChildren(fragment);
    if (keepAtBottom) messagesList.scrollTop = messagesList.scrollHeight;
}

function subscribeToRealtime() {
    if (!supabase || !currentRoom) return;
    if (messageChannel) {
        const previousChannel = messageChannel;
        messageChannel = null;
        void supabase.removeChannel(previousChannel);
    }

    const roomAtSubscribe = currentRoom;
    const channel = supabase
        .channel('mawah-messages-' + encodeURIComponent(roomAtSubscribe))
        .on(
            'postgres_changes',
            {
                event: 'INSERT',
                schema: 'public',
                table: 'messages',
                filter: 'room_code=eq.' + roomAtSubscribe
            },
            (payload) => {
                if (payload.new && payload.new.room_code === currentRoom) {
                    appendMessage(payload.new);
                }
            }
        );

    messageChannel = channel;
    channel.subscribe((status, error) => {
        if (messageChannel !== channel) return;
        if (status === 'SUBSCRIBED') {
            setRealtimeStatus('متصل — الرسائل تصل فوراً', 'connected');
            void loadMessages();
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            console.error('[Mawah Realtime] Subscription failed:', error || status);
            setRealtimeStatus('تعذر الاتصال اللحظي؛ تحقق من إعدادات Realtime في Supabase.', 'error');
        } else if (status === 'CLOSED') {
            messageChannel = null;
            setRealtimeStatus('انقطع اتصال الغرفة.', 'offline');
        }
    });
}

joinBtn.addEventListener('click', joinRoom);

window.addEventListener('online', () => {
    if (currentRoom && !messageChannel) subscribeToRealtime();
});
window.addEventListener('offline', () => {
    setRealtimeStatus('انقطع اتصال الإنترنت.', 'offline');
});

logoutBtn.addEventListener('click', () => {
    if (messageChannel && supabase) void supabase.removeChannel(messageChannel);
    messageChannel = null;
    currentRoom = null;
    messagesById.clear();
    mainScreen.classList.remove('active');
    authScreen.classList.add('active');
    joinBtn.disabled = !supabase;
});
