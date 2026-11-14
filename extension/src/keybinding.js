import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

export class ToggleShortcut {
    constructor(settings) {
        this._settings = settings;
        Main.wm.addKeybinding(
            'toggle-shortcut',
            settings,
            Meta.KeyBindingFlags.NONE,
            Shell.ActionMode.NORMAL,
            () => {
                try {
                    const win = global.display.focus_window;
                    if (!win) return;
                    if (win.is_fullscreen()) win.unmake_fullscreen();
                    else win.make_fullscreen();
                } catch (e) {
                    console.error('[linux-spaces]', e);
                }
            },
        );
    }

    destroy() {
        Main.wm.removeKeybinding('toggle-shortcut');
        this._settings = null;
    }
}
