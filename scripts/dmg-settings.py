# dmgbuild settings for Typelite's installer DMG (see scripts/build-dmg.sh).
#
# dmgbuild writes the Finder window layout (.DS_Store) itself, so no Finder or AppleScript runs:
# it works on a CI runner and in a terminal without the Automation permission. The window shows
# the app on the left, an Applications link on the right, and the background's arrow between
# them (src-tauri/icons/dmg/background.svg, sized for this 660 × 400 window).
import os.path

# dmgbuild passes these with -D (see build-dmg.sh): the app bundle and the repository root.
app = defines["app"]  # noqa: F821
root = defines["root"]  # noqa: F821
app_name = os.path.basename(app)

format = "UDZO"
size = None
files = [app]
symlinks = {"Applications": "/Applications"}
icon = os.path.join(root, "src-tauri", "icons", "icon.icns")
background = os.path.join(root, "src-tauri", "icons", "dmg", "background.tiff")

show_status_bar = False
show_tab_view = False
show_toolbar = False
show_pathbar = False
show_sidebar = False
window_rect = ((200, 200), (660, 400))
default_view = "icon-view"
show_icon_preview = False
include_icon_view_settings = True
arrange_by = None
icon_size = 128
text_size = 13
icon_locations = {app_name: (180, 190), "Applications": (480, 190)}
