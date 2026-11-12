import { supabase, isSupabaseConfigured, mapArabicError } from './supabase.js';
import { ensureSignedIn, getSavedDisplayName, saveDisplayName } from './auth.js';
import { createRoom, joinRoomByCode, fetchRoomDetails, updateRelationshipStartDate, updateMemberDisplayName } from './rooms.js';
import { SharedCanvasManager } from './canvas.js';
import { MawahRealtime } from './realtime.js';
import { saveDrawingMemory, fetchRoomDrawings, deleteDrawingMemory } from './gallery.js';
import { requestMawahNotificationPermission, triggerLocalNotification } from './notifications.js';

const state = {
    user: null,
    displayName: getSavedDisplayName(),
    room: null,
    members: [],
    canvasManager: null,
    realtime: null,
    pendingTextPoint: null,
    counterTimer: null
};

const QUOTES = [
    '«كل يوم يمر معك هو أجمل سطر في حكايتنا.»',
    '«المسافات مجرد أرقام حين يكون القلب في نفس المكان.»',
    '«رسمة منك ورسمة مني… وتكتمل لوحتنا.»',
    '«وجودك هو الموطن الذي أعود إليه دائمًا.»'
];

function showToast(msg) {
    const container = document.getElementById('toastContainer');
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = msg;
    container.appendChild(el);
    setTimeout(() => el.remove(), 3600);
}

function showConfirm(title, message) {
    return new Promise((resolve) => {
        const modal = document.getElementById('confirmModal');
        document.getElementById('confirmModalTitle').textContent = title;
        document.getElementById('confirmModalMessage').textContent = message;
        modal.classList.remove('hidden');

        const cleanup = (ans) => {
            modal.classList.add('hidden');
            resolve(ans);
        };
        document.getElementById('confirmOkBtn').onclick = () => cleanup(true);
        document.getElementById('confirmCancelBtn').onclick = () => cleanup(false);
    });
}

function spawnReactionBurst(type) {
    const map = { heart: '❤️', kiss: '😘', miss_you: '🥺💗', im_here: 'أنا هون ❤️' };
    const stage = document.getElementById('reactionStage');
    for (let i = 0; i < 6; i++) {
        const item = document.createElement('div');
        item.className = 'floating-burst';
        item.textContent = map[type] || '💗';
        item.style.left = `${15 + Math.random() * 70}%`;
        item.style.animationDelay = `${i * 0.14}s`;
        stage.appendChild(item);
        setTimeout(() => item.remove(), 3000);
    }
}

async function init() {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('./service-worker.js').catch(() => {});
    }

    const nameInput = document.getElementById('userNameInput');
    if (state.displayName) nameInput.value = state.displayName;

    if (!isSupabaseConfigured()) {
        const warn = document.getElementById('configWarningBox');
        warn.classList.remove('hidden');
        warn.textContent = 'تنبيه: يرجى وضع Project URL و Publishable Key في ملف config.js أولاً.';
        return;
    }

    const lastCode = localStorage.getItem('mawah_last_invite_code');
    if (lastCode) {
        document.getElementById('resumeRoomWrapper').classList.remove('hidden');
        document.getElementById('resumeRoomCode').textContent = lastCode;
    }

    window.addEventListener('offline', () => document.getElementById('connectionBanner').classList.remove('hidden'));
    window.addEventListener('online', () => {
        document.getElementById('connectionBanner').classList.add('hidden');
        if (state.room) reloadCanvasEvents();
    });

    bindLandingEvents();
    bindWorkspaceEvents();
}

function bindLandingEvents() {
    document.getElementById('createRoomBtn').addEventListener('click', async (e) => {
        const btn = e.currentTarget;
        try {
            btn.disabled = true;
            state.user = await ensureSignedIn();
            state.displayName = saveDisplayName(document.getElementById('userNameInput').value || 'حبيبي');
            const created = await createRoom(state.displayName);

            document.getElementById('generatedInviteCode').textContent = created.invite_code;
            document.getElementById('createdInviteBox').classList.remove('hidden');
            showToast('تم إنشاء مساحتنا بنجاح 💗');

            document.getElementById('enterCreatedRoomBtn').onclick = () => enterWorkspace(created.room_id);
        } catch (err) {
            showToast(mapArabicError(err));
        } finally {
            btn.disabled = false;
        }
    });

    document.getElementById('copyInviteBtn').addEventListener('click', async () => {
        const code = document.getElementById('generatedInviteCode').textContent;
        await navigator.clipboard.writeText(code);
        showToast('تم نسخ رمز الدعوة 📋');
    });

    document.getElementById('shareInviteBtn').addEventListener('click', async () => {
        const code = document.getElementById('generatedInviteCode').textContent;
        const text = `تعال نرسم ونحكي في مساحتنا الخاصة على Mawah – مواح 💗\nرمز الدعوة: ${code}\n${window.location.origin}`;
        if (navigator.share) {
            await navigator.share({ title: 'Mawah – مواح', text }).catch(() => {});
        } else {
            await navigator.clipboard.writeText(text);
            showToast('تم نسخ رسالة الدعوة لمشاركتها 💌');
        }
    });

    document.getElementById('joinRoomForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const code = document.getElementById('inviteCodeInput').value.trim();
        if (!code) return showToast('أدخل رمز الدعوة أولاً');

        const btn = document.getElementById('joinRoomBtn');
        try {
            btn.disabled = true;
            state.user = await ensureSignedIn();
            state.displayName = saveDisplayName(document.getElementById('userNameInput').value || 'جوري');
            const joined = await joinRoomByCode(code, state.displayName);
            await enterWorkspace(joined.room_id);
        } catch (err) {
            showToast(mapArabicError(err));
        } finally {
            btn.disabled = false;
        }
    });

    document.getElementById('resumeRoomBtn').addEventListener('click', async () => {
        const savedRoomId = localStorage.getItem('mawah_last_room_id');
        if (!savedRoomId) return;
        try {
            state.user = await ensureSignedIn();
            await enterWorkspace(savedRoomId);
        } catch (err) {
            showToast(mapArabicError(err));
        }
    });
}

async function enterWorkspace(roomId) {
    const details = await fetchRoomDetails(roomId);
    state.room = details.room;
    state.members = details.members;

    document.getElementById('landingView').classList.add('hidden');
    document.getElementById('workspaceView').classList.remove('hidden');

    document.getElementById('headerRoomCode').textContent = state.room.invite_code;
    document.getElementById('settingsRoomCode').textContent = state.room.invite_code;
    document.getElementById('settingsNameInput').value = state.displayName;
    if (state.room.relationship_start_date) {
        document.getElementById('relationshipDateInput').value = state.room.relationship_start_date;
    }

    updateMembersUI();
    startLoveCounter();

    state.canvasManager = new SharedCanvasManager(
        document.getElementById('sharedCanvas'),
        async (eventData) => {
            try {
                await supabase.from('canvas_events').insert({
                    room_id: state.room.id,
                    user_id: state.user.id,
                    user_name: state.displayName,
                    event_data: eventData
                });
            } catch (err) {
                showToast(mapArabicError(err));
            }
        },
        (stroke) => state.realtime?.sendLiveStroke(stroke)
    );

    await reloadCanvasEvents();
    await loadGallery();
    await loadRecentMessages();

    state.realtime = new MawahRealtime(state.room.id, state.user.id, state.displayName, {
        onPresenceChange: (others) => {
            const dot = document.getElementById('partnerStatusDot');
            const label = document.getElementById('partnerNameStatus');
            if (others.length > 0) {
                dot.className = 'status-dot online';
                label.textContent = `${others[0].name} متصل الآن 💗`;
                triggerLocalNotification('Mawah – مواح', `${others[0].name} دخل إلى مساحتكما الآن 💗`);
            } else {
                dot.className = 'status-dot offline';
                label.textContent = 'الشريك غير متصل حالياً';
            }
        },
        onLiveStroke: ({ userName, stroke }) => {
            document.getElementById('lastDrawerBadge').textContent = `يرسم الآن: ${userName} 🎨`;
            state.canvasManager.liveStrokes.set(userName, stroke);
            state.canvasManager.redrawAll();
        },
        onCanvasEventChange: async (payload) => {
            if (payload.new?.user_name) {
                state.canvasManager.liveStrokes.delete(payload.new.user_name);
                document.getElementById('lastDrawerBadge').textContent = `آخر لمسة: ${payload.new.user_name} ✨`;
            }
            await reloadCanvasEvents();
            if (payload.eventType === 'INSERT' && payload.new.user_id !== state.user.id) {
                triggerLocalNotification('لوحتنا المشتركة 🎨', `${payload.new.user_name} أضاف لمسة جديدة على اللوحة`);
            }
        },
        onNewMessage: (msg) => {
            appendMessageBubble(msg);
            if (msg.sender_id !== state.user.id) {
                showToast(`💌 ${msg.sender_name}: ${msg.content}`);
                triggerLocalNotification(`رسالة من ${msg.sender_name} 💌`, msg.content);
            }
        },
        onNewReaction: (rec) => {
            spawnReactionBurst(rec.reaction_type);
            if (rec.sender_id !== state.user.id) {
                const labels = { heart: 'أرسل لك قلباً ❤️', kiss: 'أرسل لك قبلة 😘', miss_you: 'يقول لك: اشتقتلك 🥺', im_here: 'يقول لك: أنا هون ❤️' };
                showToast(`${rec.sender_name} ${labels[rec.reaction_type] || 'تفاعل معك'}`);
                triggerLocalNotification('Mawah – مواح', `${rec.sender_name} ${labels[rec.reaction_type]}`);
            }
        },
        onDrawingsUpdated: () => loadGallery(),
        onRoomUpdated: (updatedRoom) => {
            state.room = updatedRoom;
            startLoveCounter();
        }
    });
    state.realtime.connect();
}

async function reloadCanvasEvents() {
    const { data, error } = await supabase
        .from('canvas_events')
        .select('*')
        .eq('room_id', state.room.id)
        .order('created_at', { ascending: true });
    if (!error && state.canvasManager) {
        state.canvasManager.setEvents(data || []);
    }
}

function bindWorkspaceEvents() {
    document.querySelectorAll('.nav-item').forEach((btn) => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.nav-item').forEach((b) => b.classList.remove('active'));
            document.querySelectorAll('.tab-panel').forEach((p) => { p.classList.add('hidden'); p.classList.remove('active'); });
            btn.classList.add('active');
            const target = document.getElementById(btn.dataset.target);
            target.classList.remove('hidden');
            target.classList.add('active');
            if (btn.dataset.target === 'tabCanvas') state.canvasManager?.setupResolution();
        });
    });

    document.querySelectorAll('.tool-btn[data-tool]').forEach((btn) => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.tool-btn[data-tool]').forEach((b) => b.classList.remove('active'));
            btn.classList.add('active');
            state.canvasManager.tool = btn.dataset.tool;
            document.getElementById('emojiPickerStrip').classList.toggle('hidden', btn.dataset.tool !== 'emoji');
        });
    });

    document.querySelectorAll('.emoji-choice').forEach((btn) => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.emoji-choice').forEach((b) => b.classList.remove('active'));
            btn.classList.add('active');
            state.canvasManager.selectedEmoji = btn.dataset.emoji;
        });
    });

    document.querySelectorAll('.color-swatch').forEach((btn) => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.color-swatch').forEach((b) => b.classList.remove('active'));
            btn.classList.add('active');
            state.canvasManager.color = btn.dataset.color;
        });
    });

    document.getElementById('customColorPicker').addEventListener('input', (e) => {
        state.canvasManager.color = e.target.value;
    });

    document.getElementById('brushSizeRange').addEventListener('input', (e) => {
        state.canvasManager.size = Number(e.target.value);
        document.getElementById('brushSizeLabel').textContent = e.target.value;
    });

    document.querySelectorAll('.bg-swatch').forEach((btn) => {
        btn.addEventListener('click', async () => {
            document.querySelectorAll('.bg-swatch').forEach((b) => b.classList.remove('active'));
            btn.classList.add('active');
            const bgColor = btn.dataset.bg;
            state.canvasManager.bgColor = bgColor;
            state.canvasManager.redrawAll();
            await supabase.from('canvas_events').insert({
                room_id: state.room.id,
                user_id: state.user.id,
                user_name: state.displayName,
                event_data: { type: 'bg', bgColor }
            });
        });
    });

    window.addEventListener('mawah:requestTextStamp', (e) => {
        state.pendingTextPoint = e.detail;
        document.getElementById('canvasTextInput').value = '';
        document.getElementById('textStampModal').classList.remove('hidden');
    });

    document.getElementById('textStampCancelBtn').onclick = () => document.getElementById('textStampModal').classList.add('hidden');
    document.getElementById('textStampOkBtn').onclick = async () => {
        const text = document.getElementById('canvasTextInput').value.trim();
        document.getElementById('textStampModal').classList.add('hidden');
        if (!text || !state.pendingTextPoint) return;
        await supabase.from('canvas_events').insert({
            room_id: state.room.id,
            user_id: state.user.id,
            user_name: state.displayName,
            event_data: {
                type: 'text',
                text,
                color: state.canvasManager.color,
                size: state.canvasManager.size,
                ...state.pendingTextPoint
            }
        });
    };

    document.getElementById('undoBtn').onclick = async () => {
        await supabase.rpc('undo_last_canvas_event', { p_room_id: state.room.id });
    };
    document.getElementById('redoBtn').onclick = async () => {
        await supabase.rpc('redo_last_canvas_event', { p_room_id: state.room.id });
    };
    document.getElementById('clearCanvasBtn').onclick = async () => {
        const ok = await showConfirm('مسح اللوحة', 'هل تريد مسح اللوحة الحالية للجميع؟');
        if (!ok) return;
        await supabase.from('canvas_events').insert({
            room_id: state.room.id,
            user_id: state.user.id,
            user_name: state.displayName,
            event_data: { type: 'clear', bgColor: state.canvasManager.bgColor }
        });
    };

    document.getElementById('saveMemoryBtn').onclick = async () => {
        try {
            const blob = await state.canvasManager.exportToBlob();
            await saveDrawingMemory(state.room.id, state.user.id, state.displayName, blob);
            showToast('تم حفظ الرسمة في ذكرياتنا 🖼️💗');
            await loadGallery();
        } catch (err) {
            showToast(mapArabicError(err));
        }
    };

    document.getElementById('downloadPngBtn').onclick = () => {
        const link = document.createElement('a');
        link.download = `mawah-${Date.now()}.png`;
        link.href = state.canvasManager.exportToDataURL();
        link.click();
    };

    document.querySelectorAll('.react-btn').forEach((btn) => {
        btn.addEventListener('click', async () => {
            const reaction_type = btn.dataset.reaction;
            spawnReactionBurst(reaction_type);
            await supabase.from('reactions').insert({
                room_id: state.room.id,
                sender_id: state.user.id,
                sender_name: state.displayName,
                reaction_type
            });
        });
    });

    document.getElementById('quickMessageForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const input = document.getElementById('quickMessageInput');
        const content = input.value.trim();
        if (!content) return;
        input.value = '';
        await supabase.from('messages').insert({
            room_id: state.room.id,
            sender_id: state.user.id,
            sender_name: state.displayName,
            content
        });
    });

    document.getElementById('notifPermBtn').onclick = async () => {
        const res = await requestMawahNotificationPermission();
        showToast(res.ok ? 'تم تفعيل الإشعارات بنجاح 🔔' : res.reason);
    };

    document.getElementById('headerInviteBtn').onclick = async () => {
        await navigator.clipboard.writeText(state.room.invite_code);
        showToast(`تم نسخ رمز المساحة: ${state.room.invite_code}`);
    };

    document.getElementById('saveRelationshipDateBtn').onclick = async () => {
        const val = document.getElementById('relationshipDateInput').value;
        await updateRelationshipStartDate(state.room.id, val);
        state.room.relationship_start_date = val;
        startLoveCounter();
        showToast('تم تحديث تاريخ بداية علاقتنا 💗');
    };

    document.getElementById('updateNameBtn').onclick = async () => {
        const newName = saveDisplayName(document.getElementById('settingsNameInput').value);
        state.displayName = newName;
        await updateMemberDisplayName(state.room.id, state.user.id, newName);
        showToast('تم تحديث اسمك بنجاح ✨');
    };

    document.getElementById('leaveRoomBtn').onclick = () => {
        state.realtime?.disconnect();
        document.getElementById('workspaceView').classList.add('hidden');
        document.getElementById('landingView').classList.remove('hidden');
    };
}

function updateMembersUI() {
    const names = state.members.map((m) => m.display_name).join(' و ');
    document.getElementById('settingsMembersList').textContent = names || state.displayName;
}

async function loadRecentMessages() {
    const { data } = await supabase
        .from('messages')
        .select('*')
        .eq('room_id', state.room.id)
        .order('created_at', { ascending: false })
        .limit(8);
    const feed = document.getElementById('latestMessagesFeed');
    feed.innerHTML = '';
    (data || []).reverse().forEach(appendMessageBubble);
}

function appendMessageBubble(msg) {
    const feed = document.getElementById('latestMessagesFeed');
    const div = document.createElement('div');
    div.className = 'msg-bubble';
    div.textContent = `${msg.sender_name}: ${msg.content}`;
    feed.appendChild(div);
    feed.scrollTop = feed.scrollHeight;
}

async function loadGallery() {
    const grid = document.getElementById('galleryGrid');
    const items = await fetchRoomDrawings(state.room.id);
    if (items.length === 0) {
        grid.innerHTML = '<div class="empty-state">لا توجد رسومات محفوظة بعد… ارسموا أول ذكرى الآن 💗</div>';
        return;
    }
    grid.innerHTML = '';
    for (const item of items) {
        const card = document.createElement('div');
        card.className = 'memory-card';
        const dateStr = new Date(item.created_at).toLocaleDateString('ar-EG', { year: 'numeric', month: 'short', day: 'numeric' });
        card.innerHTML = `
            <img src="${item.image_url}" alt="ذكرى" loading="lazy" />
            <div class="memory-info">
                <div><strong>بواسطة:</strong> ${item.creator_name}</div>
                <div>${dateStr}</div>
                <div style="display:flex;gap:6px;margin-top:8px;">
                    <a href="${item.image_url}" download="mawah-memory.png" class="btn btn-soft" style="padding:6px 10px;font-size:0.78rem;flex:1;">تنزيل</a>
                    <button type="button" class="btn btn-outline del-mem-btn" style="padding:6px 10px;font-size:0.78rem;color:#DC2626;">حذف</button>
                </div>
            </div>
        `;
        card.querySelector('img').onclick = () => {
            document.getElementById('viewerImage').src = item.image_url;
            document.getElementById('viewerCaption').textContent = `حفظها ${item.creator_name} • ${dateStr}`;
            document.getElementById('viewerDownloadLink').href = item.image_url;
            document.getElementById('imageViewerModal').classList.remove('hidden');
        };
        card.querySelector('.del-mem-btn').onclick = async () => {
            if (await showConfirm('حذف الذكرى', 'هل أنت متأكد من حذف هذه الرسمة من ذكرياتنا؟')) {
                await deleteDrawingMemory(item);
                await loadGallery();
                showToast('تم حذف الرسمة');
            }
        };
        grid.appendChild(card);
    }
    document.getElementById('closeViewerBtn').onclick = () => document.getElementById('imageViewerModal').classList.add('hidden');
}

function startLoveCounter() {
    if (state.counterTimer) clearInterval(state.counterTimer);
    const startStr = state.room?.relationship_start_date;
    const prompt = document.getElementById('counterNotSetPrompt');
    const display = document.getElementById('counterDisplay');

    if (!startStr) {
        prompt.classList.remove('hidden');
        display.classList.add('hidden');
        return;
    }

    prompt.classList.add('hidden');
    display.classList.remove('hidden');
    const startDate = new Date(`${startStr}T00:00:00`);
    document.getElementById('startDateSummary').textContent = `بدأت حكايتنا في: ${startDate.toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric' })}`;

    const update = () => {
        const diffMs = Math.max(0, Date.now() - startDate.getTime());
        const totalMinutes = Math.floor(diffMs / 60000);
        const totalHours = Math.floor(totalMinutes / 60);
        const totalDays = Math.floor(totalHours / 24);
        const approxMonths = Math.floor(totalDays / 30.4375);

        document.getElementById('countMonths').textContent = approxMonths;
        document.getElementById('countDays').textContent = totalDays;
        document.getElementById('countHours').textContent = totalHours % 24;
        document.getElementById('countMinutes').textContent = totalMinutes % 60;
    };
    update();
    state.counterTimer = setInterval(update, 30000);
    document.getElementById('romanticRotatingQuote').textContent = QUOTES[Math.floor(Date.now() / 86400000) % QUOTES.length];
}

init();
