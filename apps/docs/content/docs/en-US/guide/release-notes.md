---
title: Release log
description: Maintain release notes per version and locale. Clients query published ranges through a public API.
---

Each version can have multiple release notes, one locale each, authored in Markdown. The feature is per-app and off by default.

## Configuration

Step 3 of the create-app wizard, or the “Release log” section on the app settings page: enable switch, locale list, and fallback locale (default `en-US`).

## Writing and editing

After Release log is enabled for an app, version history rows on the Channels tab have an edit entry that opens a dedicated editor:

- WYSIWYG editor; you can paste Word content or Markdown source.
- Switch locale while editing.
- Drafts and published versions can both be edited.
- Save generates HTML and plain-text versions.
- Delete a note with the delete button in the editor.

## Public query

Published release notes are readable without auth. Drafts do not appear. See the [API Reference](/en-US/api).
