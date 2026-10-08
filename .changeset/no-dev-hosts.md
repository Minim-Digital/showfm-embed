---
'@showfm/embed': patch
---

No development hostnames in the bundle. The built-in media hosts are production only, so `isShowfmMediaUrl()` without a `hosts` argument no longer accepts staging media URLs. A staging or development page can add its media host at runtime with `window.showfmMediaHosts`, set before the elements load.
