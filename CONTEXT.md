# ZCode Plugin Store

Domain vocabulary for the plugin settings page and its marketplace browse/install experience.
This file defines store-related terms uniformly for pages, services, and documentation.

## Language

### Marketplace and sources

**Official Marketplace**:
The single distribution channel operated by ZCode officially, with marketplace id
`zcode-plugins-official`; its content = builtin plugins + CDN plugins. It is a "distribution
channel", not an "authorship attribution" — plugins by community authors may be included.
_Avoid_: using "official" loosely for any trusted marketplace

**Builtin Plugin**:
A plugin distributed with the app package and seeded into the Official Marketplace at startup.
A subset of official plugins.
_Avoid_: preinstalled plugin; "bundled plugin" (OK colloquially, docs use "builtin")

**CDN Plugin**:
A plugin in the Official Marketplace distributed as a sha256-verified zip via the official CDN,
downloaded and installed on demand.
_Avoid_: network plugin, online plugin

**Personal Source**:
Any plugin source added by the user: git/GitHub/URL/local-directory marketplaces, inline
plugins.
_Avoid_: —

**Catalog Auto-Refresh**:
The throttled background refresh of the Official Marketplace catalog when entering the store
page, invisible to the user; it covers the official marketplace only.
_Avoid_: conflating with Manual Refresh; calling it "check for updates" (the update badge is
only a side effect of refresh)

**Manual Refresh**:
The all-marketplace refresh triggered by the refresh button in the store page's top bar; not
subject to auto-refresh throttling.
_Avoid_: bare "refresh", "check for updates" (OK colloquially, docs use "manual refresh")

### Store page structure

**Public Segment (public)**:
One segment of the store list page, showing exactly the Official Marketplace catalog
(Featured + category blocks).
_Avoid_: official tab, store tab

**Personal Segment (personal)**:
The other segment of the store list page, showing the catalogs of all personal sources,
grouped by marketplace.
_Avoid_: third-party tab, my tab

**Featured**:
The curation area at the top of the Public Segment; its list is remotely controlled by the
`featured` field of the official CDN catalog. Exists only in the Public Segment.
_Avoid_: conflating with Recommended

**Installed Strip**:
A row of installed plugin icons at the top of the list page; clicking an icon opens its detail
page.
_Avoid_: installed list (that belongs to the Manage Installed view)

**Manage Installed View**:
The management screen reached via the gear to the right of the Installed Strip; hosts
per-plugin enable/disable toggles, updates, uninstall, and enabled-state filtering.
_Avoid_: Installed tab (old IA term, deprecated)

### Metadata

**Store Listing**:
Presentational metadata carried by catalog entries: display name, icon, category, developer,
website/privacy policy/terms links, hero image, example prompts. Describes "how the plugin is
presented in the store"; it does not affect plugin functionality.
_Avoid_: plugin metadata (ambiguous; may be read as the manifest)

**Plugin Manifest**:
The functional definition in `plugin.json` inside the plugin package
(commands/agents/skills/hooks/mcpServers/userConfig…). Describes "what the plugin is and does".
_Avoid_: marketplace.json (that is the catalog, not the manifest)

**Example Prompt**:
A clickable prompt provided by the Store Listing; clicking it creates a new session and
pre-fills it (never auto-sends). It is the detail page's only "new session" entry point.
_Avoid_: shortcut, prompt template, try now

### Lifecycle states

**Plugin Lifecycle**:
The full product path from discovering a plugin through viewing, installing, configuring,
enabling/disabling, using, checking for updates, upgrading, and persistent restore, all the way
to uninstalling or restoring a builtin plugin. Every stage must verify both the visible UI
state and the corresponding persisted or runtime result.
_Avoid_: calling "install succeeded" the complete lifecycle

**Restorable Builtin**:
A Builtin Plugin the user uninstalled that has entered the persisted suppression state. The
app must not re-seed it automatically on restart; it remains visible in the Public Segment and
is cleanly restored through the "install" entry point.
_Avoid_: uninstalled CDN plugin, temporarily disabled builtin

**Orphaned Installed Plugin**:
A plugin whose Personal Source was deleted but whose install directory and user data are kept.
It can still be used, configured, enabled/disabled, and uninstalled; it cannot be updated until
the source is re-added, and re-adding the same source restores the catalog association.
_Avoid_: broken install, missing manifest, uninstalled plugin
