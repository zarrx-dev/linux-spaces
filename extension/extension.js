import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';
import { ToggleShortcut } from './src/keybinding.js';
import { MaximizeToFullscreen } from './src/maximize.js';
import { TopBarReveal } from './src/topbar-reveal.js';
import { Tracker } from './src/tracker.js';

export default class LinuxSpacesExtension extends Extension {
    enable() {
        this._settings = this.getSettings();
        this._tracker = new Tracker(this._settings);
        this._reveal = new TopBarReveal(this._tracker, this._settings);
        this._maximize = new MaximizeToFullscreen(this._settings);
        this._shortcut = new ToggleShortcut(this._settings);
    }

    disable() {
        this._reveal?.destroy();
        this._reveal = null;
        this._shortcut?.destroy();
        this._shortcut = null;
        this._maximize?.destroy();
        this._maximize = null;
        this._tracker?.destroy();
        this._tracker = null;
        this._settings = null;
    }
}
