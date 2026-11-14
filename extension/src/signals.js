import GLib from 'gi://GLib';

export class SignalTracker {
    constructor() {
        this._connections = new Map(); // obj -> [ids]
        this._sources = new Map(); // key -> source id
    }

    connect(obj, name, cb) {
        const id = obj.connect(name, cb);
        let ids = this._connections.get(obj);
        if (!ids) {
            ids = [];
            this._connections.set(obj, ids);
        }
        ids.push(id);
    }

    disconnectObject(obj) {
        const ids = this._connections.get(obj);
        if (!ids) return;
        this._connections.delete(obj);
        for (const id of ids) {
            try {
                obj.disconnect(id);
            } catch (_e) {
                // object already finalized
            }
        }
    }

    idle(key, cb) {
        this.cancel(key);
        const id = GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
            this._sources.delete(key);
            cb();
            return GLib.SOURCE_REMOVE;
        });
        this._sources.set(key, id);
    }

    timeout(key, ms, cb) {
        this.cancel(key);
        const id = GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => {
            this._sources.delete(key);
            cb();
            return GLib.SOURCE_REMOVE;
        });
        this._sources.set(key, id);
    }

    cancel(key) {
        const id = this._sources.get(key);
        if (id === undefined) return;
        this._sources.delete(key);
        GLib.source_remove(id);
    }

    destroy() {
        for (const obj of [...this._connections.keys()]) this.disconnectObject(obj);
        for (const id of this._sources.values()) GLib.source_remove(id);
        this._sources.clear();
    }
}
