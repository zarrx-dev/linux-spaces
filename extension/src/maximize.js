import GLib from 'gi://GLib';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import { isCandidate, monitorAllowed, newMutterSettings } from './filters.js';
import { SignalTracker } from './signals.js';

// Apps that open maximized fire the maximize notifications right after they are shown.
const SHOWN_GRACE_US = 1000 * 1000;
// Leaving full screen makes Mutter restore an earlier maximize; that must not loop back.
const FULLSCREEN_GRACE_US = 500 * 1000;
const KEYBOARD_WINDOW_US = 1000 * 1000;

export class MaximizeToWorkspace {
    constructor(settings, tracker) {
        this._settings = settings;
        this._tracker = tracker;
        this._mutterSettings = newMutterSettings();
        this._signals = new SignalTracker();
        this._states = new Map(); // Meta.Window -> state

        this._signals.connect(
            global.display,
            'window-created',
            this._safe((_d, win) => this._hook(win, false)),
        );
        for (const actor of global.get_window_actors()) this._hook(actor.meta_window, true);

        Main.wm.setCustomKeybindingHandler(
            'toggle-maximized',
            Shell.ActionMode.NORMAL,
            this._safe((display, win, event, binding) =>
                this._onKeyboardToggle(display, win, event, binding),
            ),
        );
    }

    destroy() {
        // Windows are left exactly as they are.
        Meta.keybindings_set_custom_handler('toggle-maximized', null);
        Main.wm.allowKeybinding('toggle-maximized', Shell.ActionMode.NORMAL);
        this._signals?.destroy();
        this._states?.clear();
        this._signals = null;
        this._states = null;
        this._settings = null;
        this._tracker = null;
        this._mutterSettings = null;
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

    _hook(win, existing) {
        if (!win || this._states.has(win)) return;
        const now = GLib.get_monotonic_time();
        this._states.set(win, {
            wasMaximized: win.get_maximized() === Meta.MaximizeFlags.BOTH,
            shownAt: existing ? now - SHOWN_GRACE_US - 1 : now,
            lastFullscreenChange: 0,
            keyboardUntil: 0,
            key: Symbol('maximize-idle'),
        });

        const s = this._signals;
        const schedule = this._safe(() => this._schedule(win));
        s.connect(win, 'notify::maximized-horizontally', schedule);
        s.connect(win, 'notify::maximized-vertically', schedule);
        s.connect(
            win,
            'notify::fullscreen',
            this._safe(() => {
                const st = this._states?.get(win);
                if (st) st.lastFullscreenChange = GLib.get_monotonic_time();
            }),
        );
        s.connect(
            win,
            'shown',
            this._safe(() => {
                const st = this._states?.get(win);
                if (st) st.shownAt = GLib.get_monotonic_time();
            }),
        );
        s.connect(
            win,
            'unmanaging',
            this._safe(() => this._onUnmanaging(win)),
        );
    }

    _schedule(win) {
        const st = this._states?.get(win);
        if (!st) return;
        this._signals.idle(
            st.key,
            this._safe(() => this._reconcile(win)),
        );
    }

    _reconcile(win) {
        const st = this._states?.get(win);
        if (!st) return;

        const isMax = win.get_maximized() === Meta.MaximizeFlags.BOTH;
        const changed = st.wasMaximized !== isMax;
        st.wasMaximized = isMax;
        if (!changed || !this._shouldConvert(win, st)) return;

        if (win.is_fullscreen()) {
            // A mouse maximize change in full screen (Settings keeps its button) leaves full screen.
            if (isMax) win.unmaximize(Meta.MaximizeFlags.BOTH);
            win.unmake_fullscreen();
            this._tracker.clearMaximized(win);
        } else if (isMax) {
            this._tracker.markMaximized(win);
        }
    }

    _shouldConvert(win, st) {
        if (!this._settings.get_boolean('enabled')) return false;
        if (!this._settings.get_boolean('maximize-button-workspace')) return false;
        if (!isCandidate(win, this._settings)) return false;
        if (!monitorAllowed(win, this._mutterSettings).allowed) return false;
        const now = GLib.get_monotonic_time();
        if (now - st.shownAt <= SHOWN_GRACE_US) return false;
        if (now - st.lastFullscreenChange <= FULLSCREEN_GRACE_US) return false;
        if (now < st.keyboardUntil) return false;
        return true;
    }

    _onKeyboardToggle(_display, win, _event, _binding) {
        if (!win?.can_maximize()) return;
        const st = this._states?.get(win);
        if (st) st.keyboardUntil = GLib.get_monotonic_time() + KEYBOARD_WINDOW_US;
        if (win.get_maximized() === Meta.MaximizeFlags.BOTH)
            win.unmaximize(Meta.MaximizeFlags.BOTH);
        else win.maximize(Meta.MaximizeFlags.BOTH);
    }

    _onUnmanaging(win) {
        const st = this._states?.get(win);
        if (!st) return;
        this._signals.cancel(st.key);
        this._signals.disconnectObject(win);
        this._states.delete(win);
    }
}
