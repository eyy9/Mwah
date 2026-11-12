import { SUPABASE_CONFIG } from './config.js';

const supabaseLib = window.supabase;
const supabase = supabaseLib ? supabaseLib.createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.publishableKey || SUPABASE_CONFIG.anonKey) : null;

let currentRoom = null;
let currentUser = null;
let currentUserId = null; // مُعرّف فريد للمستخدم لتوافق جدول sender_id
let isEraser = false;
let roomChannel = null;

const authScreen = document.getElementById('auth-screen');
const mainScreen = document.getElementById('main-screen');
const joinBtn = document.getElementById('join-btn');
const partnerNameInput = document.getElementById('partner-name');
const roomCodeInput = document.getElementById('room-code');
const logoutBtn = document.getElementById('logout-btn');
const roomTitle = document.getElementById('room-title');
const statusBanner = document.getElementById('connection-status') || document.querySelector('.status-banner');

const canvas = document.getElementById('drawing-canvas');
const ctx = canvas.getContext('2d');
const colorPicker = document.getElementById('color-picker');
const brushSize = document.getElementById('brush-size');
const eraserBtn = document.getElementById('eraser-btn');
const clearCanvasBtn = document.getElementById('clear-canvas-btn');

const messageInput = document.getElementById('message-input');
const sendMsgBtn = document.getElementById('send-msg-btn');
const messagesList = document.getElementById('messages-list');

function resizeCanvas() {
    const rect = canvas.parentElement.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;

    let tempImage = null;
    if (canvas.width > 0 && canvas.height > 0) {
        tempImage = ctx.getImageData(0, 0, canvas.width, canvas.height);
    }

    canvas.width = rect.width;
    canvas.height = rect.height;

    if (tempImage) {
        ctx.putImageData(tempImage, 0, 0);
    }
}

window.addEventListener('resize', resizeCanvas);

joinBtn.addEventListener('click', () => {
    const name = partnerNameInput.value.trim();
    const code = roomCodeInput.value.trim();

    if (!name || !code) {
        alert('الرجاء كتابة الاسم ورمز الغرفة ❤️');
        return;
    }

    currentUser = name;
    // إنشاؤه مرة واحدة للمستخدم الحالي لتعبئة sender_id
    if (!currentUserId) {
        currentUserId = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }

    currentRoom = code;
    roomTitle.textContent = `غرفة: ${code}`;

    authScreen.classList.remove('active');
    mainScreen.classList.add('active');

    setTimeout(() => {
        resizeCanvas();
        initDrawing();
    }, 150);

    if (!supabase) {
        alert('خطأ: مكتبة Supabase لم تُحمّل بعد، حدّث الصفحة.');
        return;
    }

    loadMessages();
    setupRoomChannel();
});

// ==========================================
// 1. إعدادات الرسم المحلي والتشاركي (Broadcast)
// ==========================================
let drawing = false;
let lastX = 0;
let lastY = 0;
let drawingInitialized = false;

function initDrawing() {
    if (drawingInitialized) return;
    drawingInitialized = true;

    canvas.addEventListener('mousedown', startDrawing);
    canvas.addEventListener('mousemove', draw);
    canvas.addEventListener('mouseup', stopDrawing);
    canvas.addEventListener('mouseleave', stopDrawing);

    canvas.addEventListener('touchstart', (e) => {
        e.preventDefault();
        startDrawing(e.touches[0]);
    }, { passive: false });

    canvas.addEventListener('touchmove', (e) => {
        e.preventDefault();
        draw(e.touches[0]);
    }, { passive: false });

    canvas.addEventListener('touchend', stopDrawing);
}

function getCoordinates(e) {
    const rect = canvas.getBoundingClientRect();
    return {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top
    };
}

function startDrawing(e) {
    if (canvas.width === 0) resizeCanvas();
    drawing = true;
    const coords = getCoordinates(e);
    lastX = coords.x;
    lastY = coords.y;
}

function draw(e) {
    if (!drawing) return;
    const coords = getCoordinates(e);
    const strokeColor = isEraser ? '#ffffff' : colorPicker.value;
    const strokeWidth = brushSize.value;

    drawLineOnCanvas(lastX, lastY, coords.x, coords.y, strokeColor, strokeWidth);

    if (roomChannel) {
        roomChannel.send({
            type: 'broadcast',
            event: 'draw-stroke',
            payload: {
                x0: lastX / canvas.width,
                y0: lastY / canvas.height,
                x1: coords.x / canvas.width,
                y1: coords.y / canvas.height,
                color: strokeColor,
                width: strokeWidth
            }
        });
    }

    lastX = coords.x;
    lastY = coords.y;
}

function stopDrawing() {
    drawing = false;
}

function drawLineOnCanvas(x0, y0, x1, y1, color, width) {
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    ctx.stroke();
    ctx.closePath();
}

eraserBtn.addEventListener('click', () => {
    isEraser = !isEraser;
    eraserBtn.style.background = isEraser ? '#ffb3c6' : 'white';
});

clearCanvasBtn.addEventListener('click', () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (roomChannel) {
        roomChannel.send({
            type: 'broadcast',
            event: 'clear-canvas',
            payload: {}
        });
    }
});

// ==========================================
// 2. الدردشة والمزامنة الفورية (تطابق الأعمِدة الستة)
// ==========================================
sendMsgBtn.addEventListener('click', sendMessage);
messageInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendMessage();
});

async function sendMessage() {
    const text = messageInput.value.trim();
    if (!text) return;

    // إرسال القيم متوافقة مع الأعمدة الستة بالكامل
    const { data, error } = await supabase
        .from('messages')
        .insert([{
            room_id: currentRoom,
            sender_id: currentUserId,
            sender_name: currentUser,
            content: text
        }])
        .select();

    if (error) {
        console.error('Supabase Insert Error:', error);
        alert(`خطأ في الإرسال: ${error.message}`);
    } else {
        messageInput.value = '';
        if (data && data[0]) appendMessage(data[0]);
    }
}

async function loadMessages() {
    const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('room_id', currentRoom)
        .order('created_at', { ascending: true });

    if (error) {
        console.error('Supabase Select Error:', error);
        return;
    }

    if (data) {
        messagesList.innerHTML = '';
        data.forEach(appendMessage);
        messagesList.scrollTop = messagesList.scrollHeight;
    }
}

function appendMessage(msg) {
    const existingMessages = messagesList.children;
    for (let child of existingMessages) {
        if (child.dataset.id === String(msg.id)) return;
    }

    const div = document.createElement('div');
    div.dataset.id = msg.id || Date.now();
    const senderName = msg.sender_name || 'مجهول';
    div.className = `message ${senderName === currentUser ? 'sent' : 'received'}`;
    div.textContent = `${senderName}: ${msg.content}`;
    messagesList.appendChild(div);
    messagesList.scrollTop = messagesList.scrollHeight;
}

function setupRoomChannel() {
    if (roomChannel) {
        supabase.removeChannel(roomChannel);
    }

    roomChannel = supabase
        .channel(`mawah-room-${currentRoom}`, {
            config: { broadcast: { self: false } }
        })
        .on(
            'postgres_changes',
            {
                event: 'INSERT',
                schema: 'public',
                table: 'messages',
                filter: `room_id=eq.${currentRoom}`
            },
            (payload) => {
                appendMessage(payload.new);
            }
        )
        .on(
            'broadcast',
            { event: 'draw-stroke' },
            ({ payload }) => {
                drawLineOnCanvas(
                    payload.x0 * canvas.width,
                    payload.y0 * canvas.height,
                    payload.x1 * canvas.width,
                    payload.y1 * canvas.height,
                    payload.color,
                    payload.width
                );
            }
        )
        .on(
            'broadcast',
            { event: 'clear-canvas' },
            () => {
                ctx.clearRect(0, 0, canvas.width, canvas.height);
            }
        )
        .subscribe((status) => {
            if (statusBanner) {
                if (status === 'SUBSCRIBED') {
                    statusBanner.textContent = 'متصل بالغرفة لحظياً ✅';
                    statusBanner.style.background = '#d4edda';
                    statusBanner.style.color = '#155724';
                } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
                    statusBanner.textContent = 'تعذر الاتصال اللحظي، تحقق من الإنترنت';
                }
            }
        });
}

logoutBtn.addEventListener('click', () => {
    if (roomChannel) supabase.removeChannel(roomChannel);
    location.reload();
});
