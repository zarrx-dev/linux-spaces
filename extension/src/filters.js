import Gio from 'gi://Gio';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

export const MonitorMode = Object.freeze({
    PRIMARY_ONLY: 'primary-only',
    ALL: 'all',
});

export function isCandidate(win, settings) {
    if (win.get_window_type() !== Meta.WindowType.NORMAL) return false;
    if (win.get_transient_for()) return false;
    if (win.is_on_all_workspaces()) return false;
    if (win.is_skip_taskbar()) return false;
    if (win.is_override_redirect()) return false;

    const appId = Shell.WindowTracker.get_default().get_window_app(win)?.get_id();
    if (appId && settings.get_strv('excluded-apps').includes(appId)) return false;
    return true;
}

// Returns { allowed, mode }. mode is stored on the window state (FR-21).
export function monitorAllowed(win, mutterSettings) {
    const primaryOnly = mutterSettings.get_boolean('workspaces-only-on-primary');
    const mode = primaryOnly ? MonitorMode.PRIMARY_ONLY : MonitorMode.ALL;
    const allowed = !primaryOnly || win.get_monitor() === Main.layoutManager.primaryIndex;
    return { allowed, mode };
}

export function newMutterSettings() {
    return new Gio.Settings({ schema_id: 'org.gnome.mutter' });
}
