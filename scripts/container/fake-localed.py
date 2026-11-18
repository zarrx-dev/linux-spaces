#!/usr/bin/python3
# Minimal stand-in for org.freedesktop.locale1 on the private system bus.
# libgnome-desktop segfaults in gnome-shell when localed is not on the system bus.
import gi

gi.require_version("Gio", "2.0")
from gi.repository import Gio, GLib

XML = """
<node>
  <interface name="org.freedesktop.locale1">
    <property name="Locale" type="as" access="read"/>
    <property name="X11Layout" type="s" access="read"/>
    <property name="X11Model" type="s" access="read"/>
    <property name="X11Variant" type="s" access="read"/>
    <property name="X11Options" type="s" access="read"/>
    <property name="VConsoleKeymap" type="s" access="read"/>
    <property name="VConsoleKeymapToggle" type="s" access="read"/>
  </interface>
</node>
"""

PROPS = {
    "Locale": GLib.Variant("as", ["LANG=C.UTF-8"]),
    "X11Layout": GLib.Variant("s", "us"),
    "X11Model": GLib.Variant("s", "pc105"),
    "X11Variant": GLib.Variant("s", ""),
    "X11Options": GLib.Variant("s", ""),
    "VConsoleKeymap": GLib.Variant("s", "us"),
    "VConsoleKeymapToggle": GLib.Variant("s", ""),
}


def get_property(conn, sender, path, iface, name):
    return PROPS.get(name)


def on_bus(conn, name):
    node = Gio.DBusNodeInfo.new_for_xml(XML)
    conn.register_object(
        "/org/freedesktop/locale1", node.interfaces[0], None, get_property, None
    )


Gio.bus_own_name(
    Gio.BusType.SYSTEM,
    "org.freedesktop.locale1",
    Gio.BusNameOwnerFlags.NONE,
    on_bus,
    None,
    None,
)
GLib.MainLoop().run()
