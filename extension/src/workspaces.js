import Meta from 'gi://Meta';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

// Activates ws (focusing win when given). With animate off, the shell's slide is skipped by
// answering false to _shouldAnimate for this call only (the switch runs synchronously inside it).
export function activateWorkspace(ws, win, animate) {
    const time = global.get_current_time();
    const run = () => (win ? ws.activate_with_focus(win, time) : ws.activate(time));
    const wm = Main.wm;
    if (animate || typeof wm?._shouldAnimate !== 'function') {
        run();
        return;
    }
    const hadOwn = Object.hasOwn(wm, '_shouldAnimate');
    const original = wm._shouldAnimate;
    wm._shouldAnimate = () => false;
    try {
        run();
    } finally {
        if (hadOwn) wm._shouldAnimate = original;
        else delete wm._shouldAnimate;
    }
}

// append + reorder instead of Main.wm.insertWorkspace: insertWorkspace moves every later
// window one workspace up, which Tiling Shell reacts to.
export function createWorkspaceAfter(origin) {
    const manager = global.workspace_manager;
    const ws = manager.append_new_workspace(false, global.get_current_time());
    manager.reorder_workspace(ws, origin.index() + 1);
    return ws;
}

export function workspaceStillExists(ws) {
    const manager = global.workspace_manager;
    for (let i = 0; i < manager.get_n_workspaces(); i++) {
        if (manager.get_workspace_by_index(i) === ws) return true;
    }
    return false;
}

export function fallbackWorkspace(indexHint) {
    const manager = global.workspace_manager;
    const n = manager.get_n_workspaces();
    const index = Math.min(Math.max(indexHint - 1, 0), n - 1);
    return manager.get_workspace_by_index(index);
}

export function isAloneOn(win, ws) {
    return !ws
        .list_windows()
        .some(
            (w) =>
                w !== win &&
                !w.is_on_all_workspaces() &&
                w.get_window_type() === Meta.WindowType.NORMAL,
        );
}
