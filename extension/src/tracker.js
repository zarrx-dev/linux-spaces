import Meta from 'gi://Meta';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import { isCandidate, MonitorMode, monitorAllowed, newMutterSettings } from './filters.js';
import { SignalTracker } from './signals.js';
import {
    createWorkspaceAfter,
    fallbackWorkspace,
    isAloneOn,
    workspaceStillExists,
} from './workspaces.js';

const Phase = Object.freeze({
    IDLE: 'idle',
    ENTERING: 'entering',
    IN: 'in',
    LEAVING: 'leaving',
});

const MOVE_TIMEOUT_MS = 500;

// NEVER remove a workspace here. An empty full screen workspace is removed by GNOME's dynamic
// workspaces once it is inactive. Removing one that still holds a window aborts Mutter.
export class Tracker {
    constructor(settings) {
        this._settings = settings;
        this._mutterSettings = newMutterSettings();
        this._signals = new SignalTracker();
        this._states = new Map(); // Meta.Window -> state

        const display = global.display;
        const manager = global.workspace_manager;
        this._signals.connect(
            display,
            'window-created',
            this._safe((_d, win) => this._hook(win)),
        );
        // The window being dragged by the user; its leave waits until the grab ends.
        this._grabbed = null;
        this._signals.connect(
            display,
            'grab-op-begin',
            this._safe((_d, win) => {
                this._grabbed = win ?? null;
            }),
        );
        this._signals.connect(
            display,
            'grab-op-end',
            this._safe((_d, win) => {
                const grabbed = win ?? this._grabbed;
                this._grabbed = null;
                if (grabbed) this._schedule(grabbed);
            }),
        );
        const refresh = this._safe(() => this._refreshHints());
        this._signals.connect(manager, 'workspaces-reordered', refresh);
        this._signals.connect(manager, 'workspace-removed', refresh);
        this._signals.connect(manager, 'workspace-added', refresh);

        for (const actor of global.get_window_actors()) this._hook(actor.meta_window);
    }

    destroy() {
        // Windows and workspaces are left exactly as they are (FR-24).
        this._signals?.destroy();
        this._states?.clear();
        this._signals = null;
        this._states = null;
        this._settings = null;
        this._mutterSettings = null;
        this._changeCb = null;
        this._grabbed = null;
    }

    // Maximized windows with this mark get their own workspace, like full screen windows.
    markMaximized(win) {
        const st = this._states?.get(win);
        if (!st) return;
        st.maxMark = true;
        this._schedule(win);
    }

    clearMaximized(win) {
        const st = this._states?.get(win);
        if (!st) return;
        st.maxMark = false;
        this._schedule(win);
    }

    getFullscreenWindowOn(workspace) {
        if (!this._states || !workspace) return null;
        for (const [win, st] of this._states) {
            if (st.phase === Phase.IN && st.fsWorkspace === workspace && win.is_fullscreen())
                return win;
        }
        return null;
    }

    onChange(cb) {
        this._changeCb = cb;
    }

    _notifyChange() {
        const cb = this._changeCb;
        if (!cb) return;
        try {
            cb();
        } catch (e) {
            console.error('[linux-spaces]', e);
        }
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

    _hook(win) {
        if (!win || this._states.has(win)) return;
        this._states.set(win, {
            phase: Phase.IDLE,
            origin: null,
            originIndexHint: 0,
            fsWorkspace: null,
            monitorMode: null,
            wait: null,
            maxMark: false,
            keys: { idle: Symbol('idle'), wait: Symbol('wait') },
        });

        const s = this._signals;
        s.connect(
            win,
            'notify::fullscreen',
            this._safe(() => this._schedule(win)),
        );
        s.connect(
            win,
            'notify::maximized-horizontally',
            this._safe(() => this._schedule(win)),
        );
        s.connect(
            win,
            'notify::maximized-vertically',
            this._safe(() => this._schedule(win)),
        );
        s.connect(
            win,
            'shown',
            this._safe(() => this._schedule(win)),
        );
        s.connect(
            win,
            'workspace-changed',
            this._safe(() => this._onWorkspaceChanged(win)),
        );
        s.connect(
            win,
            'monitor-changed',
            this._safe(() => this._onMonitorChanged(win)),
        );
        s.connect(
            win,
            'unmanaging',
            this._safe(() => this._onUnmanaging(win)),
        );
    }

    // Full screen notifications never act synchronously.
    _schedule(win) {
        const st = this._states?.get(win);
        if (!st) return;
        this._signals.idle(
            st.keys.idle,
            this._safe(() => this._reconcile(win)),
        );
    }

    _reconcile(win) {
        const st = this._states?.get(win);
        if (!st) return;
        if (st.phase === Phase.ENTERING || st.phase === Phase.LEAVING) return;

        // The mark only lasts while the window stays fully maximized.
        if (st.maxMark && win.get_maximized() !== Meta.MaximizeFlags.BOTH) st.maxMark = false;

        const wants = win.is_fullscreen() || st.maxMark;
        if (wants && st.phase === Phase.IDLE) {
            this._enter(win, st);
            if (st.phase === Phase.IDLE) st.maxMark = false; // not allowed, forget the mark
        } else if (!wants && st.phase === Phase.IN) {
            // Unmaximizing by dragging the title bar: wait for the grab to end.
            if (this._grabbed === win) return;
            this._leave(win, st);
        }
    }

    _enter(win, st) {
        if (!this._settings.get_boolean('enabled')) return;
        if (!isCandidate(win, this._settings)) return;
        const { allowed, mode } = monitorAllowed(win, this._mutterSettings);
        if (!allowed) return;

        const origin = win.get_workspace();
        if (!origin) return;
        if (isAloneOn(win, origin)) {
            // FR-5: already alone, so nothing is created or moved. The window is tracked in
            // place so the top bar reveal still works for it.
            st.phase = Phase.IN;
            st.origin = origin;
            st.originIndexHint = origin.index();
            st.monitorMode = mode;
            st.fsWorkspace = origin;
            this._notifyChange();
            return;
        }

        st.phase = Phase.ENTERING;
        st.origin = origin;
        st.originIndexHint = origin.index();
        st.monitorMode = mode;

        // Move right after creation so dynamic workspaces never sees the new one empty.
        const fs = createWorkspaceAfter(origin);
        st.fsWorkspace = fs;
        this._waitMove(win, st, fs, () => {
            fs.activate_with_focus(win, global.get_current_time());
            st.phase = Phase.IN;
            this._notifyChange();
            this._schedule(win);
        });
        win.change_workspace(fs);
        this._checkWait(win, st);
    }

    _leave(win, st) {
        if (win.get_workspace() !== st.fsWorkspace) {
            this._drop(st); // FR-17
            return;
        }
        const target = this._resolveOrigin(st);
        if (!target || target === st.fsWorkspace) {
            this._drop(st);
            return;
        }

        st.phase = Phase.LEAVING;
        this._waitMove(win, st, target, () => {
            target.activate_with_focus(win, global.get_current_time());
            this._drop(st);
            this._schedule(win);
        });
        win.change_workspace(target);
        this._checkWait(win, st);
    }

    _resolveOrigin(st) {
        if (st.origin && workspaceStillExists(st.origin)) return st.origin;
        return fallbackWorkspace(st.originIndexHint);
    }

    // Wait for the window's workspace-changed; one 500 ms fallback re-checks, then gives up.
    _waitMove(win, st, target, done) {
        st.wait = { target, done };
        this._signals.timeout(
            st.keys.wait,
            MOVE_TIMEOUT_MS,
            this._safe(() => {
                this._checkWait(win, st);
                if (st.wait) this._drop(st); // the move never happened
            }),
        );
    }

    _checkWait(win, st) {
        if (!st.wait || win.get_workspace() !== st.wait.target) return;
        const { done } = st.wait;
        st.wait = null;
        this._signals.cancel(st.keys.wait);
        done();
    }

    _drop(st) {
        this._signals.cancel(st.keys.wait);
        st.phase = Phase.IDLE;
        st.origin = null;
        st.fsWorkspace = null;
        st.monitorMode = null;
        st.wait = null;
        st.maxMark = false;
        this._notifyChange();
    }

    _onWorkspaceChanged(win) {
        const st = this._states?.get(win);
        if (!st) return;
        if (st.wait) {
            this._checkWait(win, st);
            return;
        }
        // A move we did not start cancels the link (FR-17).
        if (st.phase === Phase.IN && win.get_workspace() !== st.fsWorkspace) this._drop(st);
    }

    _onMonitorChanged(win) {
        const st = this._states?.get(win);
        if (!st || st.phase !== Phase.IN) return;
        if (
            st.monitorMode === MonitorMode.PRIMARY_ONLY &&
            win.get_monitor() !== Main.layoutManager.primaryIndex
        ) {
            this._drop(st);
        }
    }

    _onUnmanaging(win) {
        const st = this._states?.get(win);
        if (!st) return;

        // Never move a closing window; only bring the origin into view.
        if (
            st.phase !== Phase.IDLE &&
            st.origin !== st.fsWorkspace &&
            global.workspace_manager.get_active_workspace() === st.fsWorkspace
        ) {
            const origin = st.origin;
            const hint = st.originIndexHint;
            this._signals.idle(
                Symbol('close'),
                this._safe(() => {
                    const target =
                        origin && workspaceStillExists(origin) ? origin : fallbackWorkspace(hint);
                    target.activate(global.get_current_time());
                }),
            );
        }

        this._signals.cancel(st.keys.idle);
        this._signals.cancel(st.keys.wait);
        this._signals.disconnectObject(win);
        this._states.delete(win);
        this._notifyChange();
    }

    _refreshHints() {
        if (!this._states) return;
        for (const st of this._states.values()) {
            if (st.phase !== Phase.IDLE && st.origin && workspaceStillExists(st.origin)) {
                st.originIndexHint = st.origin.index();
            }
        }
    }
}
