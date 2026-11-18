import Adw from 'gi://Adw';
import Gdk from 'gi://Gdk';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Gtk from 'gi://Gtk';
import { ExtensionPreferences } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

const BIND = Gio.SettingsBindFlags.DEFAULT;
const SHORTCUT_KEY = 'toggle-shortcut';
const EXCLUDED_KEY = 'excluded-apps';

const MODIFIER_KEYS = new Set([
    Gdk.KEY_Shift_L,
    Gdk.KEY_Shift_R,
    Gdk.KEY_Control_L,
    Gdk.KEY_Control_R,
    Gdk.KEY_Alt_L,
    Gdk.KEY_Alt_R,
    Gdk.KEY_Meta_L,
    Gdk.KEY_Meta_R,
    Gdk.KEY_Super_L,
    Gdk.KEY_Super_R,
    Gdk.KEY_Hyper_L,
    Gdk.KEY_Hyper_R,
    Gdk.KEY_ISO_Level3_Shift,
    Gdk.KEY_Caps_Lock,
    Gdk.KEY_Num_Lock,
]);

// A switch row with a title, a subtitle and a setting bound to it.
function switchRow(settings, key, title, subtitle) {
    const row = new Adw.SwitchRow({ title, subtitle });
    settings.bind(key, row, 'active', BIND);
    return row;
}

// Modal Adw.Window helper shared by both dialogs. Esc closes it.
function makeDialog(parent, title, width, height) {
    const dialog = new Adw.Window({
        title,
        modal: true,
        transient_for: parent,
        default_width: width,
        default_height: height,
    });
    const header = new Adw.HeaderBar({
        show_start_title_buttons: false,
        show_end_title_buttons: false,
    });
    const view = new Adw.ToolbarView();
    view.add_top_bar(header);
    dialog.set_content(view);
    return { dialog, header, view };
}

function appRow(app) {
    const icon = new Gtk.Image({
        gicon: app?.get_icon() ?? null,
        icon_name: app ? null : 'application-x-executable-symbolic',
        pixel_size: 32,
    });
    return icon;
}

function dialogEscape(dialog) {
    const keys = new Gtk.EventControllerKey();
    keys.connect('key-pressed', (_c, keyval) => {
        if (keyval !== Gdk.KEY_Escape) return Gdk.EVENT_PROPAGATE;
        dialog.close();
        return Gdk.EVENT_STOP;
    });
    dialog.add_controller(keys);
}

// Dialog to pick an installed app and add it to the exclude list.
function openAddAppDialog(parent, settings) {
    const { dialog, header, view } = makeDialog(parent, 'Add App', 400, 480);
    dialogEscape(dialog);

    const cancel = new Gtk.Button({ label: 'Cancel' });
    cancel.connect('clicked', () => dialog.close());
    const add = new Gtk.Button({
        label: 'Add',
        css_classes: ['suggested-action'],
        sensitive: false,
    });
    header.pack_start(cancel);
    header.pack_end(add);

    const excluded = new Set(settings.get_strv(EXCLUDED_KEY));
    const apps = Gio.AppInfo.get_all()
        .filter((app) => app.should_show())
        .sort((a, b) => a.get_display_name().localeCompare(b.get_display_name()));

    const search = new Gtk.SearchEntry({
        placeholder_text: 'Search apps',
        margin_start: 12,
        margin_end: 12,
        margin_bottom: 12,
    });
    const list = new Gtk.ListBox({
        selection_mode: Gtk.SelectionMode.SINGLE,
        activate_on_single_click: false,
        css_classes: ['boxed-list'],
        margin_start: 12,
        margin_end: 12,
        margin_bottom: 12,
        valign: Gtk.Align.START,
    });

    const rowInfo = new Map();
    for (const app of apps) {
        const id = app.get_id();
        if (!id) continue;
        const row = new Adw.ActionRow({
            title: GLib.markup_escape_text(app.get_display_name(), -1),
            sensitive: !excluded.has(id),
            activatable: true,
        });
        row.add_prefix(appRow(app));
        if (excluded.has(id))
            row.add_suffix(new Gtk.Image({ icon_name: 'object-select-symbolic' }));
        rowInfo.set(row, {
            id,
            text: `${app.get_display_name()} ${id}`.toLowerCase(),
        });
        list.append(row);
    }

    list.set_filter_func((row) => {
        const info = rowInfo.get(row);
        const query = search.get_text().trim().toLowerCase();
        return !!info && (query === '' || info.text.includes(query));
    });
    search.connect('search-changed', () => list.invalidate_filter());
    list.connect('row-selected', (_l, row) => {
        add.sensitive = !!row;
    });

    const confirm = (row) => {
        const info = row && rowInfo.get(row);
        if (!info) return;
        const ids = settings.get_strv(EXCLUDED_KEY);
        if (!ids.includes(info.id)) settings.set_strv(EXCLUDED_KEY, [...ids, info.id]);
        dialog.close();
    };
    add.connect('clicked', () => confirm(list.get_selected_row()));
    list.connect('row-activated', (_l, row) => confirm(row));

    const scroll = new Gtk.ScrolledWindow({
        hscrollbar_policy: Gtk.PolicyType.NEVER,
        vexpand: true,
        child: list,
    });
    const body = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL });
    body.append(search);
    body.append(scroll);
    view.set_content(body);

    dialog.present();
    search.grab_focus();
}

// Dialog that captures a key combination for the toggle shortcut.
function openShortcutDialog(parent, settings) {
    const { dialog, header, view } = makeDialog(parent, 'Set Shortcut', 420, 440);
    const save = (accels) => {
        settings.set_strv(SHORTCUT_KEY, accels);
        dialog.close();
    };

    const cancel = new Gtk.Button({ label: 'Cancel' });
    cancel.connect('clicked', () => dialog.close());
    const disable = new Gtk.Button({
        label: 'Disable',
        css_classes: ['flat', 'destructive-action'],
    });
    disable.connect('clicked', () => save([]));
    header.pack_start(cancel);
    header.pack_end(disable);

    const body = new Gtk.Box({
        orientation: Gtk.Orientation.VERTICAL,
        spacing: 12,
        valign: Gtk.Align.CENTER,
        vexpand: true,
        margin_start: 24,
        margin_end: 24,
        margin_bottom: 24,
    });
    body.append(
        new Gtk.Image({
            icon_name: 'input-keyboard-symbolic',
            pixel_size: 96,
            css_classes: ['dim-label'],
        }),
    );
    body.append(
        new Gtk.Label({
            label: 'Press a new shortcut for Toggle full screen',
            css_classes: ['title-2'],
            wrap: true,
            justify: Gtk.Justification.CENTER,
        }),
    );
    body.append(
        new Gtk.Label({
            label: 'Esc to cancel, Backspace to disable',
            css_classes: ['dim-label'],
        }),
    );
    body.append(
        new Gtk.ShortcutLabel({
            accelerator: settings.get_strv(SHORTCUT_KEY).join(' '),
            disabled_text: 'Disabled',
            halign: Gtk.Align.CENTER,
        }),
    );
    view.set_content(body);

    const keys = new Gtk.EventControllerKey({
        propagation_phase: Gtk.PropagationPhase.CAPTURE,
    });
    keys.connect('key-pressed', (_c, keyval, keycode, state) => {
        if (MODIFIER_KEYS.has(keyval)) return Gdk.EVENT_STOP;
        const mask = state & Gtk.accelerator_get_default_mod_mask();
        if (mask === 0 && keyval === Gdk.KEY_Escape) {
            dialog.close();
            return Gdk.EVENT_STOP;
        }
        if (mask === 0 && keyval === Gdk.KEY_BackSpace) {
            save([]);
            return Gdk.EVENT_STOP;
        }
        const isFunctionKey = keyval >= Gdk.KEY_F1 && keyval <= Gdk.KEY_F12;
        if ((mask !== 0 || isFunctionKey) && Gtk.accelerator_valid(keyval, mask)) {
            const accel = Gtk.accelerator_name_with_keycode(null, keyval, keycode, mask);
            if (accel) save([accel]);
        }
        return Gdk.EVENT_STOP;
    });
    dialog.add_controller(keys);

    dialog.present();
}

export default class LinuxSpacesPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();
        window.set_default_size(640, 720);
        window.set_search_enabled(false);
        window.add(this._generalPage(window, settings));
        window.add(this._excludedPage(window, settings));
    }

    _generalPage(window, settings) {
        const page = new Adw.PreferencesPage({
            title: 'General',
            icon_name: 'preferences-system-symbolic',
        });

        const fullScreen = new Adw.PreferencesGroup({ title: 'Full Screen' });
        fullScreen.add(
            switchRow(
                settings,
                'enabled',
                'Full screen in a new workspace',
                'F11 and Ctrl+Super+F move the window to its own workspace',
            ),
        );
        fullScreen.add(
            switchRow(
                settings,
                'animate',
                'Workspace slide animation',
                'Slide to the new workspace and back',
            ),
        );
        page.add(fullScreen);

        const maximize = new Adw.PreferencesGroup({ title: 'Maximize' });
        const buttonRow = switchRow(
            settings,
            'maximize-button-workspace',
            'Maximize button uses a new workspace',
            'Title bar button and double-click. The window stays maximized with its controls visible',
        );
        const everyRow = switchRow(
            settings,
            'maximize-uses-workspace',
            'Every maximize uses a new workspace',
            'Also Alt+F10, Super+Up and apps that maximize themselves',
        );
        maximize.add(buttonRow);
        maximize.add(everyRow);
        page.add(maximize);

        // When "every maximize" is on, the button row only looks on and
        // locked. The binding is dropped so maximize-button-workspace is
        // never written; it is bound again (and re-read) when that turns off.
        let bound = true;
        const syncImplied = () => {
            const implied = settings.get_boolean('maximize-uses-workspace');
            if (implied && bound) {
                Gio.Settings.unbind(buttonRow, 'active');
                bound = false;
            }
            if (implied) {
                buttonRow.active = true;
            } else if (!bound) {
                settings.bind('maximize-button-workspace', buttonRow, 'active', BIND);
                bound = true;
            }
            buttonRow.sensitive = !implied;
        };
        syncImplied();
        settings.connect('changed::maximize-uses-workspace', syncImplied);

        const topBar = new Adw.PreferencesGroup({ title: 'Top Bar' });
        topBar.add(
            switchRow(
                settings,
                'reveal-top-bar',
                'Show top bar on hover',
                'In full screen, rest the pointer at the top edge',
            ),
        );
        const delayRow = new Adw.SpinRow({
            title: 'Hover delay',
            subtitle: 'Milliseconds before the top bar appears',
            adjustment: new Gtk.Adjustment({
                lower: 0,
                upper: 3000,
                step_increment: 100,
                page_increment: 500,
            }),
        });
        settings.bind('reveal-delay-ms', delayRow, 'value', BIND);
        settings.bind('reveal-top-bar', delayRow, 'sensitive', Gio.SettingsBindFlags.GET);
        topBar.add(delayRow);
        page.add(topBar);

        page.add(this._shortcutGroup(window, settings));

        const meta = this.metadata;
        const version = meta['version-name'] ?? meta.version;
        const footer = new Adw.PreferencesGroup();
        footer.add(
            new Gtk.Label({
                label: `Linux Spaces ${version} · Designed & developed by Zarrx Technologies`,
                css_classes: ['dim-label', 'caption'],
                halign: Gtk.Align.CENTER,
                wrap: true,
                justify: Gtk.Justification.CENTER,
            }),
        );
        page.add(footer);

        return page;
    }

    _shortcutGroup(window, settings) {
        const group = new Adw.PreferencesGroup({ title: 'Shortcut' });
        const row = new Adw.ActionRow({
            title: 'Toggle full screen',
            activatable: true,
        });
        const label = new Gtk.ShortcutLabel({
            accelerator: '',
            disabled_text: 'Disabled',
            valign: Gtk.Align.CENTER,
        });
        const reset = new Gtk.Button({
            icon_name: 'edit-undo-symbolic',
            tooltip_text: 'Reset to default',
            valign: Gtk.Align.CENTER,
            css_classes: ['flat'],
        });
        reset.connect('clicked', () => settings.reset(SHORTCUT_KEY));
        row.add_suffix(label);
        row.add_suffix(reset);
        row.connect('activated', () => openShortcutDialog(window, settings));

        const sync = () => {
            label.accelerator = settings.get_strv(SHORTCUT_KEY).join(' ');
            const user = settings.get_user_value(SHORTCUT_KEY);
            reset.sensitive =
                user !== null && !user.equal(settings.get_default_value(SHORTCUT_KEY));
        };
        sync();
        settings.connect(`changed::${SHORTCUT_KEY}`, sync);

        group.add(row);
        return group;
    }

    _excludedPage(window, settings) {
        const page = new Adw.PreferencesPage({
            title: 'Excluded Apps',
            icon_name: 'action-unavailable-symbolic',
        });

        const listGroup = new Adw.PreferencesGroup({
            title: 'Excluded Apps',
            description:
                'These apps keep normal GNOME full screen and maximize, with no new workspace.',
        });
        const addGroup = new Adw.PreferencesGroup();
        addGroup.add(this._addButton(window, settings));
        const emptyGroup = new Adw.PreferencesGroup();
        emptyGroup.add(
            new Adw.StatusPage({
                icon_name: 'view-list-symbolic',
                title: 'No Excluded Apps',
                description: 'Every app gets its own workspace in full screen.',
                child: this._addButton(window, settings),
            }),
        );
        page.add(listGroup);
        page.add(addGroup);
        page.add(emptyGroup);

        let rows = [];
        const rebuild = () => {
            for (const row of rows) listGroup.remove(row);
            rows = [];
            const ids = settings.get_strv(EXCLUDED_KEY);
            for (const id of ids) {
                const row = this._excludedRow(settings, id);
                listGroup.add(row);
                rows.push(row);
            }
            listGroup.visible = ids.length > 0;
            addGroup.visible = ids.length > 0;
            emptyGroup.visible = ids.length === 0;
        };
        rebuild();
        settings.connect(`changed::${EXCLUDED_KEY}`, rebuild);

        return page;
    }

    _addButton(window, settings) {
        const button = new Gtk.Button({
            label: 'Add App…',
            halign: Gtk.Align.CENTER,
            css_classes: ['pill'],
        });
        button.connect('clicked', () => openAddAppDialog(window, settings));
        return button;
    }

    _excludedRow(settings, id) {
        const app = Gio.DesktopAppInfo.new(id);
        const row = new Adw.ActionRow({
            title: GLib.markup_escape_text(app ? app.get_display_name() : id, -1),
            subtitle: GLib.markup_escape_text(id, -1),
        });
        row.add_prefix(appRow(app));
        const remove = new Gtk.Button({
            icon_name: 'user-trash-symbolic',
            tooltip_text: 'Remove',
            valign: Gtk.Align.CENTER,
            css_classes: ['flat'],
        });
        remove.connect('clicked', () =>
            settings.set_strv(
                EXCLUDED_KEY,
                settings.get_strv(EXCLUDED_KEY).filter((x) => x !== id),
            ),
        );
        row.add_suffix(remove);
        return row;
    }
}
