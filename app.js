import { SUPABASE_CONFIG } from './config.js';

const supabase = window.supabase.createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.publishableKey);

let currentRoom = null;
let currentUser = null;
let isEraser = false;

const authScreen = document.getElementById('auth-screen');
const mainScreen = document.getElementById('main-screen');
const joinBtn = document.getElementById('join-btn');
const joinCodeBtn = document.getElementById('join-code-btn');
const partnerNameInput = document.getElementById('partner-name');
const roomCodeInput = document.getElementById('room-code');
const logoutBtn = document.getElementById('logout-btn');
const roomTitle = document.getElementById('room-title');

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
    canvas.width = rect.width;
    canvas.height = rect.height;
}
window.addEventListener('resize', resizeCanvas);

function handleJoin() {
    const name = partnerNameInput.value.trim();
    const code = roomCodeInput.value.trim();

    if (!name || !code) {
        alert('الرجاء إدخال الاسم ورمز الغرفة ❤️');
        return;
    }

    currentUser = name;
    currentRoom = code;
    roomTitle.textContent = `غرفة: ${code}`;

    authScreen.classList.remove('active');
    mainScreen.classList.add('active');

    setTimeout(resizeCanvas, 100);
    initDrawing();
    loadMessages();
    subscribeToRealtime();
}

joinBtn.addEventListener('click', handleJoin);
if (joinCodeBtn) joinCodeBtn.addEventListener('click', handleJoin);

let drawing = false;

function initDrawing() {
    resizeCanvas();
    canvas.addEventListener('mousedown', startDrawing);
    canvas.addEventListener('mousemove', draw);
    canvas.addEventListener('mouseup', stopDrawing);
    canvas.addEventListener('mouseleave', stopDrawing);

    canvas.addEventListener('touchstart', (e) => { e.preventDefault(); startDrawing(e.touches[0]); });
    canvas.addEventListener('touchmove', (e) => { e.preventDefault(); draw(e.touches[0]); });
    canvas.addEventListener('touchend', stopDrawing);
}

function startDrawing(e) {
    drawing = true;
    ctx.beginPath();
    const rect = canvas.getBoundingClientRect();
    ctx.moveTo(e.clientX - rect.left, e.clientY - rect.top);
}

function draw(e) {
    if (!drawing) return;
    const rect = canvas.getBoundingClientRect();
    ctx.lineWidth = brushSize.value;
    ctx.lineCap = 'round';
    ctx.strokeStyle = isEraser ? '#ffffff' : colorPicker.value;
    ctx.lineTo(e.clientX - rect.left, e.clientY - rect.top);
    ctx.stroke();
}

function stopDrawing() {
    drawing = false;
}

eraserBtn.addEventListener('click', () => {
    isEraser = !isEraser;
    eraserBtn.style.background = isEraser ? '#ffb3c6' : 'white';
});

clearCanvasBtn.addEventListener('click', () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
});

sendMsgBtn.addEventListener('click', sendMessage);
messageInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendMessage();
});

async function sendMessage() {
    const text = messageInput.value.trim();
    if (!text) return;

    const { error } = await supabase.from('messages').insert([
        { room_code: currentRoom, sender: currentUser, content: text }
    ]);

    if (error) {
        console.error(error);
        alert('فشل إرسال الرسالة، تأكد من الاتصال');
    } else {
        messageInput.value = '';
    }
}

async function loadMessages() {
    const { data } = await supabase
        .from('messages')
        .select('*')
        .eq('room_code', currentRoom)
        .order('created_at', { ascending: true });

    if (data) {
        messagesList.innerHTML = '';
        data.forEach(appendMessage);
        messagesList.scrollTop = messagesList.scrollHeight;
    }
}

function appendMessage(msg) {
    const div = document.createElement('div');
    div.className = `message ${msg.sender === currentUser ? 'sent' : 'received'}`;
    div.textContent = `${msg.sender}: ${msg.content}`;
    messagesList.appendChild(div);
    messagesList.scrollTop = messagesList.scrollHeight;
}

function subscribeToRealtime() {
    supabase
        .channel('room-channel')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `room_code=eq.${currentRoom}` }, payload => {
            appendMessage(payload.new);
        })
        .subscribe();
}

logoutBtn.addEventListener('click', () => {
    location.reload();
});
// التحديث اللحظي (Realtime) المباشر
function subscribeToRealtime() {
    supabase
        .channel('public:messages')
        .on('postgres_changes', { 
            event: 'INSERT', 
            schema: 'public', 
            table: 'messages', 
            filter: `room_code=eq.${currentRoom}` 
        }, payload => {
            appendMessage(payload.new);
        })
        .subscribe();
}
