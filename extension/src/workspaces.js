import Meta from 'gi://Meta';

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
