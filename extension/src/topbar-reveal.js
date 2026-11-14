import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import { SignalTracker } from './signals.js';

const POLL_MS = 100;
const SLIDE_MS = 200;
const HIDE_DELAY_US = 300 * 1000;
const PANEL_MARGIN_PX = 2;

// TEMP debug: set LINUX_SPACES_DEBUG=1 (scripts/nested.sh does). Remove before release.
const DEBUG = GLib.getenv('LINUX_SPACES_DEBUG') === '1';
// In a nested shell the pointer leaves the window before it reaches y=0, so use a taller zone.
const EDGE_PX = DEBUG ? 20 : 1;
const dbg = (...a) => DEBUG && console.log('[linux-spaces][debug]', ...a);

export class TopBarReveal {
    constructor(tracker, settings) {
        this._tracker = tracker;
        this._settings = settings;
        this._signals = new SignalTracker();
        this._idleKey = Symbol('reveal-visible');
        this._pollId = 0;
        this._inTick = false;
        this._active = false;
        this._revealed = false; // true from reveal start until restore, including the hide slide
        this._hiding = false;
        this._edgeSince = 0;
        this._outsideSince = 0;

        const evaluate = this._safe(() => this._evaluate());
        tracker.onChange(evaluate);
        const s = this._signals;
        s.connect(global.workspace_manager, 'active-workspace-changed', evaluate);
        s.connect(Main.overview, 'showing', evaluate);
        s.connect(Main.overview, 'hidden', evaluate);
        s.connect(settings, 'changed::reveal-top-bar', evaluate);
        s.connect(global.display, 'in-fullscreen-changed', evaluate);
        s.connect(
            Main.layoutManager.panelBox,
            'notify::visible',
            this._safe(() => this._onPanelBoxVisible()),
        );

        evaluate();
    }

    destroy() {
        this._stopPoll();
        try {
            this._tracker?.onChange(null);
        } catch (e) {
            console.error('[linux-spaces]', e);
        }
        this._signals?.destroy();
        try {
            if (this._revealed) this._restore();
        } catch (e) {
            console.error('[linux-spaces]', e);
        }
        this._signals = null;
        this._tracker = null;
        this._settings = null;
    }

    _safe(fn) {
        return (...args) => {
            try {
                return fn(...args);
            } catch (e) {
                console.error('[linux-spaces]', e);
            }
            return undefined;
        };
    }

    _shouldBeActive() {
        if (!this._settings.get_boolean('reveal-top-bar')) return false;
        if (Main.overview.visible) return false;
        const win = this._tracker.getFullscreenWindowOn(
            global.workspace_manager.get_active_workspace(),
        );
        return !!win && win.get_monitor() === Main.layoutManager.primaryIndex;
    }

    _evaluate() {
        if (!this._signals) return;
        const want = this._shouldBeActive();
        dbg(
            'evaluate want=',
            want,
            'setting=',
            this._settings.get_boolean('reveal-top-bar'),
            'overview=',
            Main.overview.visible,
            'ws=',
            global.workspace_manager.get_active_workspace_index(),
            'win=',
            this._tracker
                .getFullscreenWindowOn(global.workspace_manager.get_active_workspace())
                ?.get_title(),
        );
        if (want === this._active) return;
        this._active = want;
        if (want) {
            this._startPoll();
        } else {
            this._stopPoll();
            if (this._revealed) this._restore();
        }
    }

    _startPoll() {
        if (this._pollId) return;
        this._edgeSince = 0;
        this._outsideSince = 0;
        this._pollId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, POLL_MS, () => {
            this._inTick = true;
            try {
                this._tick();
            } catch (e) {
                console.error('[linux-spaces]', e);
            }
            this._inTick = false;
            return this._pollId ? GLib.SOURCE_CONTINUE : GLib.SOURCE_REMOVE;
        });
    }

    _stopPoll() {
        const id = this._pollId;
        this._pollId = 0;
        // Inside the tick the source is removed by returning SOURCE_REMOVE.
        if (id && !this._inTick) GLib.source_remove(id);
    }

    _tick() {
        if (!this._active || this._hiding) return;
        const monitor = Main.layoutManager.primaryMonitor;
        if (!monitor) return;
        const [x, y] = global.get_pointer();
        const now = GLib.get_monotonic_time();
        if (DEBUG && y <= 20 && y !== this._dbgY) dbg('tick y=', y, 'x=', x, 'monY=', monitor.y);
        this._dbgY = y;

        if (!this._revealed) {
            const atEdge =
                y <= monitor.y + EDGE_PX && x >= monitor.x && x < monitor.x + monitor.width;
            if (!atEdge) {
                this._edgeSince = 0;
                return;
            }
            if (!this._edgeSince) this._edgeSince = now;
            if (now - this._edgeSince >= this._settings.get_int('reveal-delay-ms') * 1000) {
                this._edgeSince = 0;
                this._reveal();
            }
            return;
        }

        const outside = y > monitor.y + Main.panel.height + PANEL_MARGIN_PX;
        if (!outside || Main.panel.menuManager.activeMenu) {
            this._outsideSince = 0;
            return;
        }
        if (!this._outsideSince) this._outsideSince = now;
        if (now - this._outsideSince >= HIDE_DELAY_US) {
            this._outsideSince = 0;
            this._hide();
        }
    }

    // The slide moves Main.panel, never panelBox: LayoutManager computes struts from panelBox's
    // transformed position, and changing them would resize maximized windows on every workspace.
    _reveal() {
        const panel = Main.panel;
        dbg('reveal panelH=', panel.height, 'boxVisible=', Main.layoutManager.panelBox.visible);
        this._revealed = true;
        Main.layoutManager.panelBox.visible = true;
        panel.remove_all_transitions();
        panel.translation_y = -panel.height;
        panel.ease({
            translation_y: 0,
            duration: SLIDE_MS,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
        });
    }

    _hide() {
        const panel = Main.panel;
        dbg('hide');
        this._hiding = true;
        panel.ease({
            translation_y: -panel.height,
            duration: SLIDE_MS,
            mode: Clutter.AnimationMode.EASE_IN_QUAD,
            onComplete: this._safe(() => {
                if (this._revealed && this._hiding) this._restore();
            }),
        });
    }

    _restore() {
        dbg('restore');
        this._revealed = false;
        this._hiding = false;
        this._edgeSince = 0;
        this._outsideSince = 0;
        Main.panel.remove_all_transitions();
        Main.panel.translation_y = 0;
        Main.layoutManager.panelBox.visible = !(
            global.window_group.visible && Main.layoutManager.primaryMonitor?.inFullscreen
        );
    }

    // LayoutManager hides panelBox again on restacks; put it back, one idle at a time.
    _onPanelBoxVisible() {
        if (Main.layoutManager.panelBox.visible) return;
        if (!this._revealed || !this._active) return;
        this._signals.idle(
            this._idleKey,
            this._safe(() => {
                if (this._revealed && this._active) Main.layoutManager.panelBox.visible = true;
            }),
        );
    }
}
