---
title: "Obsidian Plugin Sample - Dataview"
tags:
  - obsidian
  - plugin
  - dataview
---

# Dataview (community plugin)

Inline fields for Dataview:
dv_status:: active
dv_score:: 9

```dataview
table file.name, dv_status, dv_score
from "Projects"
where dv_status = "active"
sort dv_score desc
```

```dataviewjs
const pages = dv.pages("Projects").where(p => p.dv_status === "active");
dv.list(pages.map(p => p.file.name));
```
