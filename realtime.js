import { supabase } from './supabase.js';

export class MawahRealtime {
    constructor(roomId, userId, userName, handlers) {
        this.roomId = roomId;
        this.userId = userId;
        this.userName = userName;
        this.handlers = handlers;
        this.channel = null;
    }

    connect() {
        this.channel = supabase.channel(`mawah-room-${this.roomId}`, {
            config: {
                presence: { key: this.userId },
                broadcast: { self: false }
            }
        });

        this.channel.on('presence', { event: 'sync' }, () => {
            const state = this.channel.presenceState();
            const otherUsers = Object.entries(state)
                .filter(([uid]) => uid !== this.userId)
                .map(([, metas]) => metas[0]);
            this.handlers.onPresenceChange?.(otherUsers);
        });

        this.channel.on('broadcast', { event: 'live_stroke' }, ({ payload }) => {
            this.handlers.onLiveStroke?.(payload);
        });

        this.channel
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'canvas_events', filter: `room_id=eq.${this.roomId}` },
                (payload) => this.handlers.onCanvasEventChange?.(payload)
            )
            .on(
                'postgres_changes',
                { event: 'INSERT', schema: 'public', table: 'messages', filter: `room_id=eq.${this.roomId}` },
                (payload) => this.handlers.onNewMessage?.(payload.new)
            )
            .on(
                'postgres_changes',
                { event: 'INSERT', schema: 'public', table: 'reactions', filter: `room_id=eq.${this.roomId}` },
                (payload) => this.handlers.onNewReaction?.(payload.new)
            )
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'drawings', filter: `room_id=eq.${this.roomId}` },
                () => this.handlers.onDrawingsUpdated?.()
            )
            .on(
                'postgres_changes',
                { event: 'UPDATE', schema: 'public', table: 'rooms', filter: `id=eq.${this.roomId}` },
                (payload) => this.handlers.onRoomUpdated?.(payload.new)
            );

        this.channel.subscribe(async (status) => {
            if (status === 'SUBSCRIBED') {
                await this.channel.track({
                    user_id: this.userId,
                    name: this.userName,
                    online_at: new Date().toISOString()
                });
            }
        });
    }

    sendLiveStroke(strokeData) {
        if (!this.channel) return;
        this.channel.send({
            type: 'broadcast',
            event: 'live_stroke',
            payload: { userId: this.userId, userName: this.userName, stroke: strokeData }
        });
    }

    disconnect() {
        if (this.channel) {
            supabase.removeChannel(this.channel);
            this.channel = null;
        }
    }
}
