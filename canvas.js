export class SharedCanvasManager {
    constructor(canvasEl, onStrokeCommit, onLiveBroadcast) {
        this.canvas = canvasEl;
        this.ctx = canvasEl.getContext('2d');
        this.onStrokeCommit = onStrokeCommit;
        this.onLiveBroadcast = onLiveBroadcast;

        this.tool = 'pen';
        this.color = '#E85B98';
        this.size = 5;
        this.bgColor = '#FFFFFF';
        this.selectedEmoji = '❤️';

        this.isDrawing = false;
        this.currentPoints = [];
        this.events = [];
        this.liveStrokes = new Map();

        this.setupResolution();
        this.bindEvents();
    }

    setupResolution() {
        const rect = this.canvas.parentElement.getBoundingClientRect();
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        this.logicalWidth = Math.max(300, Math.floor(rect.width));
        this.logicalHeight = Math.max(310, Math.floor(rect.height));

        this.canvas.width = this.logicalWidth * dpr;
        this.canvas.height = this.logicalHeight * dpr;
        this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        this.redrawAll();
    }

    getNormalizedPoint(e) {
        const rect = this.canvas.getBoundingClientRect();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        return {
            x: Number(((clientX - rect.left) / rect.width).toFixed(4)),
            y: Number(((clientY - rect.top) / rect.height).toFixed(4))
        };
    }

    bindEvents() {
        const start = (e) => {
            if (e.cancelable) e.preventDefault();
            const pt = this.getNormalizedPoint(e);

            if (this.tool === 'heart' || this.tool === 'emoji') {
                const symbol = this.tool === 'heart' ? '❤️' : this.selectedEmoji;
                this.onStrokeCommit({
                    type: 'stamp',
                    symbol,
                    x: pt.x,
                    y: pt.y,
                    size: Math.max(24, this.size * 4)
                });
                return;
            }

            if (this.tool === 'text') {
                window.dispatchEvent(new CustomEvent('mawah:requestTextStamp', { detail: pt }));
                return;
            }

            this.isDrawing = true;
            this.currentPoints = [pt];
        };

        const move = (e) => {
            if (!this.isDrawing) return;
            if (e.cancelable) e.preventDefault();
            const pt = this.getNormalizedPoint(e);
            this.currentPoints.push(pt);

            this.redrawAll();
            this.renderStroke({
                tool: this.tool,
                color: this.color,
                size: this.size,
                points: this.currentPoints
            });

            if (this.currentPoints.length % 3 === 0 && this.onLiveBroadcast) {
                this.onLiveBroadcast({
                    tool: this.tool,
                    color: this.color,
                    size: this.size,
                    points: this.currentPoints.slice(-6)
                });
            }
        };

        const end = () => {
            if (!this.isDrawing) return;
            this.isDrawing = false;
            if (this.currentPoints.length > 0) {
                this.onStrokeCommit({
                    type: 'stroke',
                    tool: this.tool,
                    color: this.color,
                    size: this.size,
                    points: this.currentPoints
                });
            }
            this.currentPoints = [];
        };

        this.canvas.addEventListener('pointerdown', start, { passive: false });
        this.canvas.addEventListener('pointermove', move, { passive: false });
        window.addEventListener('pointerup', end);
        window.addEventListener('resize', () => this.setupResolution());
    }

    setEvents(dbEvents) {
        let lastClearIdx = -1;
        for (let i = dbEvents.length - 1; i >= 0; i--) {
            if (!dbEvents[i].is_undone && dbEvents[i].event_data?.type === 'clear') {
                lastClearIdx = i;
                this.bgColor = dbEvents[i].event_data.bgColor || '#FFFFFF';
                break;
            }
        }
        this.events = dbEvents.slice(lastClearIdx + 1).filter((ev) => !ev.is_undone);

        for (let i = this.events.length - 1; i >= 0; i--) {
            if (this.events[i].event_data?.type === 'bg') {
                this.bgColor = this.events[i].event_data.bgColor || '#FFFFFF';
                break;
            }
        }
        this.redrawAll();
    }

    redrawAll() {
        const w = this.logicalWidth;
        const h = this.logicalHeight;
        this.ctx.save();
        this.ctx.fillStyle = this.bgColor;
        this.ctx.fillRect(0, 0, w, h);
        this.ctx.restore();

        for (const ev of this.events) {
            const d = ev.event_data;
            if (!d) continue;
            if (d.type === 'stroke') this.renderStroke(d);
            else if (d.type === 'stamp') this.renderStamp(d);
            else if (d.type === 'text') this.renderText(d);
        }

        for (const stroke of this.liveStrokes.values()) {
            this.renderStroke(stroke);
        }
    }

    renderStroke(d) {
        const pts = d.points || [];
        if (pts.length === 0) return;

        this.ctx.save();
        this.ctx.lineCap = 'round';
        this.ctx.lineJoin = 'round';

        const isEraser = d.tool === 'eraser';
        this.ctx.strokeStyle = isEraser ? this.bgColor : d.color;

        if (d.tool === 'soft') {
            this.ctx.globalAlpha = 0.45;
            this.ctx.shadowColor = d.color;
            this.ctx.shadowBlur = d.size * 1.4;
            this.ctx.lineWidth = d.size * 1.5;
        } else if (d.tool === 'marker') {
            this.ctx.globalAlpha = 0.78;
            this.ctx.lineWidth = d.size * 2.2;
        } else if (isEraser) {
            this.ctx.lineWidth = d.size * 2.5;
        } else {
            this.ctx.lineWidth = d.size;
        }

        this.ctx.beginPath();
        const first = pts[0];
        this.ctx.moveTo(first.x * this.logicalWidth, first.y * this.logicalHeight);

        if (pts.length === 1) {
            this.ctx.lineTo(first.x * this.logicalWidth + 0.1, first.y * this.logicalHeight + 0.1);
        } else {
            for (let i = 1; i < pts.length; i++) {
                this.ctx.lineTo(pts[i].x * this.logicalWidth, pts[i].y * this.logicalHeight);
            }
        }
        this.ctx.stroke();
        this.ctx.restore();
    }

    renderStamp(d) {
        this.ctx.save();
        this.ctx.font = `${d.size || 32}px "Apple Color Emoji", "Segoe UI Emoji", sans-serif`;
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        this.ctx.fillText(d.symbol || '❤️', d.x * this.logicalWidth, d.y * this.logicalHeight);
        this.ctx.restore();
    }

    renderText(d) {
        this.ctx.save();
        this.ctx.fillStyle = d.color || '#3D2937';
        this.ctx.font = `700 ${Math.max(18, (d.size || 5) * 3)}px "Tajawal", sans-serif`;
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        this.ctx.fillText(d.text || '', d.x * this.logicalWidth, d.y * this.logicalHeight);
        this.ctx.restore();
    }

    exportToBlob() {
        return new Promise((resolve) => this.canvas.toBlob(resolve, 'image/png', 0.95));
    }

    exportToDataURL() {
        return this.canvas.toDataURL('image/png');
    }
}
