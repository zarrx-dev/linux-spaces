import Meta from 'gi://Meta';

// Mutter 49 replaced get_maximized() with is_maximized() and dropped the flags argument of
// maximize() / unmaximize(). Feature detection keeps one build for GNOME 45 to 49.
export function isMaximized(win) {
    if (typeof win.is_maximized === 'function') return win.is_maximized();
    return win.get_maximized() === Meta.MaximizeFlags.BOTH;
}

export function maximize(win) {
    if (typeof win.is_maximized === 'function') win.maximize();
    else win.maximize(Meta.MaximizeFlags.BOTH);
}

export function unmaximize(win) {
    if (typeof win.is_maximized === 'function') win.unmaximize();
    else win.unmaximize(Meta.MaximizeFlags.BOTH);
}
