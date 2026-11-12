// Compatibility shim for BIR's HTA form pages (docs/analysis/web-layer.md §1.3).
// Loaded first in every legacy page by the legacy host. Provides what mshta gave them:
//   ActiveXObject(Scripting.FileSystemObject | WScript.Shell | Microsoft.XMLDOM | Shell.Application | *XMLHTTP),
//   JScript Enumerator, the live VBScript helpers (RenameAndSendFile, EncryptFile, ValidateTinWChkDgt …),
//   and window.close → quit (the packaged app) or back to the main screen (dev).
// The forms are synchronous end to end, so every filesystem call is a synchronous POST to /__vfs.
(function () {
  "use strict";
  // Install once. Forms pull other pages in through jQuery, which re-evaluates the injected shim tag
  // with no currentScript — a second, tokenless copy must not replace the first.
  if (window.__ebfShim) return;
  var script = document.currentScript;
  var TOKEN = script && script.getAttribute("data-token");
  // whether this build can send a return to BIR at all (host.rs data-submit; the downloads and the dev server say 0)
  var CAN_SUBMIT = !!script && script.getAttribute("data-submit") === "1";
  if (!TOKEN) return;
  window.__ebfShim = true;
  /** The install root the forms believe they run from (they call GetAbsolutePathName('cFTPSend.exe')). */
  var ROOT = "C:\\eBIRForms\\";

  function vfs(req) {
    return vfsPost("/__vfs", req);
  }
  function vfsPost(path, req) {
    var xhr = new XMLHttpRequest();
    xhr.open("POST", path, false);
    xhr.setRequestHeader("content-type", "application/json");
    xhr.setRequestHeader("x-ebf-token", TOKEN || "");
    xhr.send(JSON.stringify(req));
    if (xhr.status !== 200) throw comError("Permission denied (" + xhr.status + ")");
    return JSON.parse(xhr.responseText);
  }

  function comError(message) {
    var e = new Error(message);
    e.description = message;
    return e;
  }

  // ── paths: CWD-relative, backslashes, the fake root, or a Windows path outside the install (→ sandbox) ──
  function norm(path) {
    var p = String(path == null ? "" : path).replace(/\\/g, "/");
    var root = ROOT.replace(/\\/g, "/");
    if (p.toLowerCase().indexOf(root.toLowerCase()) === 0) p = p.slice(root.length);
    if (/^[A-Za-z]:/.test(p) || p.indexOf("//") === 0) return { outside: true, rel: p };
    p = p.replace(/^(\.\/)+/, "").replace(/^\/+/, "");
    var part = [];
    p.split("/").forEach(function (s) {
      if (s === "" || s === ".") return;
      if (s === "..") part.pop();
      else part.push(s);
    });
    return { outside: false, rel: part.join("/"), is_dir_hint: /\/$/.test(p) };
  }
  function winPath(rel) {
    return ROOT + rel.replace(/\//g, "\\");
  }
  function baseName(p) {
    var s = String(p).replace(/\\/g, "/").replace(/\/+$/, "");
    return s.slice(s.lastIndexOf("/") + 1);
  }

  // ── COM objects are case-insensitive in JScript: obj.Write === obj.write === obj.WRITE ──
  function com(target) {
    return new Proxy(target, {
      get: function (t, prop) {
        if (typeof prop !== "string" || prop in t) return t[prop];
        var lower = prop.toLowerCase();
        for (var k in t) if (k.toLowerCase() === lower) return t[k];
        // Object.keys misses prototype getters; walk the prototype chain too
        for (var o = Object.getPrototypeOf(t); o && o !== Object.prototype; o = Object.getPrototypeOf(o)) {
          var names = Object.getOwnPropertyNames(o);
          for (var i = 0; i < names.length; i++) if (names[i].toLowerCase() === lower) return t[names[i]];
        }
        return undefined;
      },
      set: function (t, prop, value) {
        if (typeof prop === "string" && !(prop in t)) {
          var lower = prop.toLowerCase();
          for (var k in t)
            if (k.toLowerCase() === lower) {
              t[k] = value;
              return true;
            }
        }
        t[prop] = value;
        return true;
      },
    });
  }

  // ── Enumerator (JScript-only) over our collections or plain arrays ──
  function Enumerator(collection) {
    this._item = collection == null ? [] : Array.isArray(collection) ? collection : collection._item || [];
    this._at = 0;
  }
  Enumerator.prototype.atEnd = function () { return this._at >= this._item.length; };
  Enumerator.prototype.moveNext = function () { this._at++; };
  Enumerator.prototype.moveFirst = function () { this._at = 0; };
  Enumerator.prototype.item = function () { return this._item[this._at]; };
  window.Enumerator = Enumerator;

  // ── JScript Date#getYear: IE returns the full year outside 1900–1999; WebKit returns year − 1900 (126 in 2026).
  //    Forms derive the tax year from it (1702RT family: getYear().toString().substring(2) − 1, so they ran the
  //    pre-2020 branches) and 16 clamp the return period with `if (year > new Date().getYear()) year = getYear()`
  //    (1604Ev2018 validateYear rewrote every year to "126"). Here, not per form, so both hosts and every form agree. ──
  Date.prototype.getYear = function () {
    var y = this.getFullYear();
    return y >= 1900 && y < 2000 ? y - 1900 : y;
  };

  function collection(item, keyOf) {
    var c = { _item: item, Count: item.length };
    c.Item = function (k) {
      if (typeof k === "number") return item[k];
      for (var i = 0; i < item.length; i++) if (String(keyOf(item[i])).toLowerCase() === String(k).toLowerCase()) return item[i];
      throw comError("File not found");
    };
    return com(c);
  }

  // ── Scripting.FileSystemObject ──
  function FileObj(rel, entry) {
    var self = { Name: entry.name, Path: winPath(rel), Size: entry.size, Type: "File" };
    self.DateLastModified = new Date(entry.modified_ms);
    self.DateCreated = self.DateLastModified;
    Object.defineProperty(self, "ParentFolder", { get: function () { return FolderObj(rel.slice(0, rel.lastIndexOf("/"))); } });
    self.Copy = function (to, overwrite) { fso.CopyFile(rel, to, overwrite); };
    self.Move = function (to) { fso.MoveFile(rel, to); };
    self.Delete = function () { fso.DeleteFile(rel); };
    self.OpenAsTextStream = function (mode) { return fso.OpenTextFile(rel, mode || 1); };
    // IE: a File's default property is Path, so "" + file is its path. The main screen builds each saved
    // return's radio id that way and Delete passes that id to DeleteFile — "[object Object]" deleted nothing.
    self.toString = function () { return self.Path; };
    return com(self);
  }

  function FolderObj(rel, outside) {
    var listing = null;
    var load = function () {
      if (!listing) listing = outside ? { file: [], folder: [] } : vfs({ op: "list", path: rel });
      return listing;
    };
    var self = { Name: baseName(rel), Path: outside ? rel : winPath(rel), IsRootFolder: rel === "" };
    self.toString = function () { return self.Path; }; // default property, as for File
    Object.defineProperty(self, "Files", {
      get: function () {
        return collection(load().file.map(function (e) { return FileObj((rel ? rel + "/" : "") + e.name, e); }), function (f) { return f.Name; });
      },
    });
    Object.defineProperty(self, "SubFolders", {
      get: function () {
        return collection(load().folder.map(function (n) { return FolderObj((rel ? rel + "/" : "") + n); }), function (f) { return f.Name; });
      },
    });
    Object.defineProperty(self, "Size", { get: function () { return load().file.reduce(function (s, e) { return s + e.size; }, 0); } });
    self.DateLastModified = new Date();
    self.Delete = function () { fso.DeleteFolder(rel); };
    return com(self);
  }

  function TextStream(rel, mode, initial) {
    var text = initial || "";
    var pos = 0;
    var self = {
      Line: 1,
      Column: 1,
      ReadAll: function () { var r = text.slice(pos); pos = text.length; return r; },
      ReadLine: function () {
        var nl = text.indexOf("\n", pos);
        var end = nl < 0 ? text.length : nl;
        var r = text.slice(pos, end).replace(/\r$/, "");
        pos = nl < 0 ? text.length : nl + 1;
        self.Line++;
        return r;
      },
      Read: function (n) { var r = text.slice(pos, pos + n); pos += r.length; return r; },
      Skip: function (n) { pos += n; },
      SkipLine: function () { self.ReadLine(); },
      Write: function (s) {
        if (mode === 1) throw comError("Bad file mode");
        vfs({ op: "write", path: rel, text: String(s), append: true });
      },
      WriteLine: function (s) { self.Write((s == null ? "" : String(s)) + "\r\n"); },
      WriteBlankLines: function (n) { for (var i = 0; i < n; i++) self.Write("\r\n"); },
      Close: function () {},
    };
    Object.defineProperty(self, "AtEndOfStream", { get: function () { return pos >= text.length; } });
    Object.defineProperty(self, "AtEndOfLine", { get: function () { return pos >= text.length || text[pos] === "\n" || text[pos] === "\r"; } });
    return com(self);
  }

  var fso = {
    FileExists: function (p) { var n = norm(p); return !n.outside && vfs({ op: "stat", path: n.rel }).kind === "file"; },
    FolderExists: function (p) {
      var n = norm(p);
      if (n.outside) return true; // e.g. %TEMP%: an empty sandbox folder
      return n.rel === "" || vfs({ op: "stat", path: n.rel }).kind === "folder";
    },
    DriveExists: function () { return false; },
    CreateFolder: function (p) {
      var n = norm(p);
      if (n.outside) throw comError("Permission denied");
      vfs({ op: "mkdir", path: n.rel });
      return FolderObj(n.rel);
    },
    CreateTextFile: function (p, overwrite, unicode) {
      var n = norm(p);
      if (n.outside) throw comError("Permission denied");
      if (overwrite === false && fso.FileExists(n.rel)) throw comError("File already exists");
      vfs({ op: "write", path: n.rel, text: "" });
      return TextStream(n.rel, 2);
    },
    OpenTextFile: function (p, mode, create) {
      var n = norm(p);
      mode = mode || 1;
      if (n.outside) throw comError("File not found");
      if (mode === 1) {
        var r = vfs({ op: "read", path: n.rel });
        if (!r.ok) throw comError(r.error || "File not found");
        return TextStream(n.rel, 1, r.text);
      }
      if (mode === 2) vfs({ op: "write", path: n.rel, text: "" });
      else if (!fso.FileExists(n.rel)) {
        if (create === false) throw comError("File not found");
        vfs({ op: "write", path: n.rel, text: "" });
      }
      return TextStream(n.rel, mode);
    },
    GetFile: function (p) {
      var n = norm(p);
      var s = n.outside ? { kind: "none" } : vfs({ op: "stat", path: n.rel });
      if (s.kind !== "file") throw comError("File not found");
      return FileObj(n.rel, { name: baseName(n.rel), size: s.size, modified_ms: s.modified_ms });
    },
    GetFolder: function (p) {
      var n = norm(p);
      if (!n.outside && n.rel !== "" && vfs({ op: "stat", path: n.rel }).kind !== "folder") throw comError("Path not found");
      return FolderObj(n.rel, n.outside);
    },
    CopyFile: function (from, to, overwrite) {
      var a = norm(from), b = norm(to);
      if (a.outside || b.outside) throw comError("Permission denied");
      var r = vfs({ op: "copy", from: a.rel, to: b.rel + (/[\\/]$/.test(String(to)) ? "/" : ""), overwrite: overwrite !== false });
      if (!r.ok) throw comError(r.error);
    },
    MoveFile: function (from, to) {
      var a = norm(from), b = norm(to);
      if (a.outside || b.outside) throw comError("Permission denied");
      var r = vfs({ op: "move", from: a.rel, to: b.rel });
      if (!r.ok) throw comError(r.error);
    },
    DeleteFile: function (p) { var n = norm(p); if (!n.outside) vfs({ op: "delete", path: n.rel }); },
    DeleteFolder: function (p) { var n = norm(p); if (!n.outside) vfs({ op: "rmdir", path: n.rel }); },
    GetAbsolutePathName: function (p) { var n = norm(p); return n.outside ? String(p) : winPath(n.rel); },
    GetParentFolderName: function (p) { var s = String(p).replace(/[\\/]+$/, ""); var i = Math.max(s.lastIndexOf("\\"), s.lastIndexOf("/")); return i < 0 ? "" : s.slice(0, i); },
    GetFileName: function (p) { return baseName(p); },
    GetBaseName: function (p) { var b = baseName(p); var i = b.lastIndexOf("."); return i < 0 ? b : b.slice(0, i); },
    GetExtensionName: function (p) { var b = baseName(p); var i = b.lastIndexOf("."); return i < 0 ? "" : b.slice(i + 1); },
    BuildPath: function (a, b) { return String(a).replace(/[\\/]+$/, "") + "\\" + String(b).replace(/^[\\/]+/, ""); },
    GetDrive: function (d) { return com({ DriveLetter: String(d).charAt(0), IsReady: false, DriveType: 0, Path: String(d) }); },
    GetDriveName: function (p) { var m = /^([A-Za-z]:)/.exec(String(p)); return m ? m[1] : ""; },
    GetTempName: function () { return "rad" + Math.random().toString(36).slice(2, 7) + ".tmp"; },
  };
  // no removable drives: USB/CD export paths find nothing (the app offers its own Export instead)
  Object.defineProperty(fso, "Drives", { get: function () { return collection([], function (d) { return d.DriveLetter; }); } });

  // ── WScript.Shell ──
  function splitCommand(cmd) {
    var out = [], re = /"([^"]*)"|(\S+)/g, m;
    while ((m = re.exec(cmd))) out.push(m[1] != null ? m[1] : m[2]);
    return out;
  }
  var shell = {
    Run: function (cmd) {
      var s = String(cmd).trim();
      if (/^https?:\/\//i.test(s)) {
        window.open(s, "_blank", "noopener");
        return 0;
      }
      var part = splitCommand(s);
      var r = vfs({ op: "run", command: part[0] || "", argument: part.slice(1) });
      if (r.note) console.warn("[ebirforms] " + r.note);
      return r.exit_code;
    },
    Exec: function () { throw comError("Exec is not supported"); },
    ExpandEnvironmentStrings: function (s) {
      return String(s)
        .replace(/%username%/gi, "user")
        .replace(/%(temp|tmp)%/gi, "C:\\Users\\user\\AppData\\Local\\Temp")
        .replace(/%userprofile%/gi, "C:\\Users\\user");
    },
    RegRead: function () { throw comError("Registry is not available"); },
    Popup: function (text) { alert(text); return 1; },
  };

  // ── Microsoft.XMLDOM (MSXML): synchronous load, .text, parseError, selectNodes ──
  function XmlDom() {
    var self = { async: false, validateOnParse: false, resolveExternals: false, documentElement: null, parseError: { errorCode: 0, reason: "" } };
    var adopt = function (text) {
      // BIR ships taxRate.xml with a comment before the declaration; MSXML-tolerant parse
      var t = String(text).replace(/^\uFEFF/, "");
      var decl = t.indexOf("<?xml");
      if (decl > 0) t = t.slice(decl);
      var doc = new DOMParser().parseFromString(t, "text/xml");
      var err = doc.getElementsByTagName("parsererror")[0];
      self._doc = doc;
      self.documentElement = err ? null : doc.documentElement;
      self.parseError = err ? { errorCode: 1, reason: err.textContent } : { errorCode: 0, reason: "" };
      return !err;
    };
    self.load = function (url) {
      var xhr = new XMLHttpRequest();
      xhr.open("GET", new URL(String(url).replace(/\\/g, "/"), document.baseURI).href, false);
      xhr.send();
      if (xhr.status !== 200) {
        self.parseError = { errorCode: xhr.status || 1, reason: "load failed" };
        return false;
      }
      return adopt(xhr.responseText);
    };
    self.loadXML = adopt;
    self.getElementsByTagName = function (n) { return self._doc ? self._doc.getElementsByTagName(n) : []; };
    self.selectNodes = function (xpath) { return selectNodes(self._doc, xpath); };
    self.selectSingleNode = function (xpath) { return selectNodes(self._doc, xpath)[0] || null; };
    Object.defineProperty(self, "xml", { get: function () { return self._doc ? new XMLSerializer().serializeToString(self._doc) : ""; } });
    self.setProperty = function () {};
    return com(self);
  }
  function selectNodes(doc, xpath) {
    if (!doc) return [];
    var r = doc.evaluate(xpath, doc, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
    var out = [];
    for (var i = 0; i < r.snapshotLength; i++) out.push(r.snapshotItem(i));
    return out;
  }
  // MSXML nodes expose .text; give XML elements the same (HTML elements with their own .text are untouched)
  if (!("text" in Element.prototype)) {
    Object.defineProperty(Element.prototype, "text", { configurable: true, get: function () { return this.textContent; }, set: function (v) { this.textContent = v; } });
  }
  if (!("xml" in Node.prototype)) {
    Object.defineProperty(Node.prototype, "xml", { configurable: true, get: function () { return new XMLSerializer().serializeToString(this); } });
  }

  window.ActiveXObject = function ActiveXObject(progid) {
    var id = String(progid).toLowerCase();
    if (id === "scripting.filesystemobject") return com(fso);
    if (id === "wscript.shell") return com(shell);
    if (/^(microsoft|msxml2)\.(xmldom|domdocument)/.test(id)) return XmlDom();
    if (/xmlhttp/.test(id)) return new XMLHttpRequest();
    if (id === "shell.application") return com({ NameSpace: function () { return null; } });
    throw comError("Automation server can't create object: " + progid);
  };

  // ── the VBScript helpers from js/eBIRTools.vbs, re-expressed in JS ──
  window.ValidateTinWChkDgt = function (tin) { return shell.Run('"' + ROOT + 'chkt.exe" "' + tin + '"'); };
  window.EncryptFile = function (file) { return shell.Run('"' + ROOT + 'Encrypt.exe" "' + file + '"'); };
  // RenameAndSendFile(file, email, folder, mode, srv, sslport, port, usr, pass) — eBIRTools.vbs + ebfSFTP.exe.
  // The page used to carry BIR's dispatcher login through here; the host now holds it and does the upload
  // (host.rs send_op), so only the file, email and folder cross. Returns 0 = sent, as the VBS did.
  window.RenameAndSendFile = function (file, email, folder) {
    var where = norm(file);
    if (where.outside || !submitTarget.tin) return 1;
    if (submitTarget.mode === null) dispatchNow(); // a resend (txtFinalFlag=2) skips checkNetConnection()
    if (submitTarget.mode === "0") return 1;
    var req = {
      op: "send",
      path: where.rel,
      email: String(email || ""),
      folder: String(folder || ""),
      tin: submitTarget.tin,
      form_code: submitTarget.form_code,
    };
    for (var attempt = 0; attempt < 2; attempt++) {
      var r = vfs(req);
      if (r.note) console.warn("[ebirforms] submit: " + r.note);
      if (r.exit_code === 0 || !r.host_key_changed || attempt > 0) return r.exit_code;
      var k = r.host_key_changed;
      var accept = nativeConfirm(
        "WARNING: BIR's upload server " + k.host + " presented a different SSH key from the one this app trusted before.\n\n" +
          "Trusted: " + k.pinned + "\nNow: " + k.seen + "\n\n" +
          "BIR may have changed servers — or someone may be intercepting your connection. " +
          "Send your return to this server anyway?"
      );
      if (!accept) return 1;
      vfsPost("/__repin", { host: k.host, fingerprint: k.seen });
    }
    return 1;
  };
  window.RenameAndSendFile_original = window.RenameAndSendFile;
  window.ZipFile = window.ZipAndSendFile = window.CopyFile = function () { return 0; };

  // ── network: BIR's pages never reach the internet from this app ──
  // The original phoned BIR's dispatcher over plain HTTP with the TIN in the query string and eval'd the
  // reply (WL security 1). Every cross-origin request is redirected to a local 404, which the forms
  // already treat as "offline". IE also allowed `timeout` on synchronous XHR; modern engines throw.
  var XHR = XMLHttpRequest.prototype;
  var nativeOpen = XHR.open;
  XHR.open = function (method, url, async) {
    this.__ebfSync = async === false;
    var target;
    try { target = new URL(String(url), document.baseURI); } catch (e) { target = null; }
    var arg = Array.prototype.slice.call(arguments);
    if (target && target.origin !== location.origin) {
      console.warn("[ebirforms] blocked network request from a BIR page: " + target.origin + target.pathname);
      arg[1] = "/__offline";
    }
    return nativeOpen.apply(this, arg);
  };
  var timeoutProp = Object.getOwnPropertyDescriptor(XHR, "timeout");
  if (timeoutProp && timeoutProp.set) {
    Object.defineProperty(XHR, "timeout", {
      configurable: true,
      get: function () { return timeoutProp.get.call(this); },
      set: function (v) { if (!this.__ebfSync) timeoutProp.set.call(this, v); },
    });
  }

  // ── Submit / Final Copy: BIR's own flow; the host asks BIR's dispatcher ──
  // BIR's conService phoned its SFTP dispatcher endpoint from the page over plain HTTP with the TIN in the query
  // string and eval'd the reply (WL security 1), before the user had even confirmed; and checkNetConnection()
  // was hard-wired to true, so the offline final-copy branch (txtFinalFlag=3) was unreachable. Here the host
  // asks the dispatcher (no eval; the login never reaches the page), only after the user confirms "Are you
  // sure you want to submit?". Mode "0" (no answer, or online filing closed) takes BIR's offline branch.
  // canSendToEFPS stays false: BIR commented out its eFPS (Rollbase) branch in every form.
  var submitTarget = { tin: "", form_code: "", mode: null, available: true };
  function dispatchNow() {
    var r = null;
    try { r = vfs({ op: "dispatch", tin: submitTarget.tin, form_code: submitTarget.form_code }); } catch (e) { r = null; }
    submitTarget.mode = r && r.mode ? String(r.mode) : "0";
    // the download build has no online submission at all: say so, never "try again when online" (issue #1)
    submitTarget.available = !(r && r.available === false);
    if (r && r.note) console.warn("[ebirforms] dispatcher: " + r.note);
    return submitTarget.mode;
  }
  var shimConService = {
    initConConfig: function (tin, form_code) {
      submitTarget = { tin: String(tin || ""), form_code: String(form_code || ""), mode: null, available: true };
    },
    getConConfig: function () {
      return { mode: submitTarget.mode === null ? undefined : submitTarget.mode, srv: "", sslport: "", port: "", usr: "", pass: "" };
    },
    canSendToEFPS: function () { return false; },
  };
  // string-util.js declares both at parse time; replace them once it has run.
  document.addEventListener("DOMContentLoaded", function () {
    window.conService = shimConService;
    window.checkNetConnection = function () {
      return submitTarget.tin ? dispatchNow() !== "0" : false;
    };
  });
  var OFFLINE_NOTICE =
    "BIR's submission server could not be reached, or online filing is not open for this return.\n\n" +
    "Your return will be saved as a FINAL COPY (locked for editing). Open it again and click Submit to " +
    "send it once you are online, or Print it to file on paper.";
  // one plain answer to "what did Submit do?" (a user read the old wording's "eBIRForms online" as part of this app)
  var NOT_FILED_NOTICE =
    "Nothing was sent to BIR. Your return is NOT filed yet.\n\n" +
    "It is saved on this computer as a final copy, which can no longer be changed.\n\n" +
    "To file it, do one of these:\n" +
    "1. Print it, and file and pay at your bank or RDO.\n" +
    "2. Use BIR's own eBIRForms app on a Windows computer: copy the saved file (Go > Show Saved Returns) " +
    "into C:\\eBIRForms\\savefile, open the return there and click Submit.";
  var nativeAlert = window.alert.bind(window);
  var nativeConfirm = window.confirm.bind(window);
  window.confirm = function (message) {
    var m = String(message);
    if (!CAN_SUBMIT && m.indexOf("Please ensure that you have INTERNET access") === 0) {
      // BIR's Submit asks this before sending; this build sends nothing, so ask the honest question
      return nativeConfirm(
        "Make a final copy of this return?\n\n" +
          "This app does NOT send returns to BIR. A final copy is only locked so it can't be changed, and saved on this computer."
      );
    }
    if (m.indexOf("File saved and encrypted.") === 0) {
      // no USB/CD export: the copy lives in the app's data folder, and the notice before this already said so
      return false;
    }
    return nativeConfirm(message);
  };
  window.alert = function (message) {
    var m = String(message);
    if (m.indexOf("The system detected that you have no internet connection") === 0) return nativeAlert(submitTarget.available ? OFFLINE_NOTICE : NOT_FILED_NOTICE);
    return nativeAlert(message);
  };

  // IE gave every element a `disabled` property (default false); modern engines only give it to form
  // controls. Forms test `link.disabled == false` before opening the ATC / Tax Type pickers — with
  // `undefined` there, those pickers never open. Reflect the attribute, and render it like IE did.
  if (!("disabled" in HTMLElement.prototype)) {
    Object.defineProperty(HTMLElement.prototype, "disabled", {
      configurable: true,
      get: function () { return this.hasAttribute("disabled"); },
      set: function (v) { if (v) this.setAttribute("disabled", ""); else this.removeAttribute("disabled"); },
    });
    var style = document.createElement("style");
    style.textContent = "a[disabled],span[disabled],div[disabled],td[disabled],img[disabled]{color:graytext!important;pointer-events:none;cursor:default}";
    (document.head || document.documentElement).appendChild(style);
  }

  // Look: BIR drew these pages in IE on Windows XP, whose form controls were Luna-themed — square 1 px #7F9DB9
  // fields, cream gradient buttons, a blue combo arrow — where WebKit draws rounded macOS controls. Restyle
  // the controls only, at zero specificity (:where), so any rule BIR's own CSS sets still wins.
  (function () {
    var arrow = "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='17' height='19'%3E" +
      "%3Cdefs%3E%3ClinearGradient id='g' x1='0' y1='0' x2='1' y2='1'%3E%3Cstop offset='0' stop-color='%23c3d3fd'/%3E" +
      "%3Cstop offset='1' stop-color='%23a6bdf6'/%3E%3C/linearGradient%3E%3C/defs%3E" +
      "%3Crect x='.5' y='.5' width='16' height='18' rx='2' fill='url(%23g)' stroke='%23b6c7f4'/%3E" +
      "%3Cpath d='M5 8l3.5 3.5L12 8' fill='none' stroke='%234d6185' stroke-width='2'/%3E%3C/svg%3E\")";
    var field = ":where(input:not([type]),input[type=text],input[type=password],input[type=email],input[type=tel]," +
      "input[type=number],input[type=search],input[type=date],textarea)";
    var button = ":where(input[type=button],input[type=submit],input[type=reset],button)";
    var css =
      field + "{-webkit-appearance:none;appearance:none;border:1px solid #7f9db9;border-radius:0;background-color:#fff;" +
        "font-family:Tahoma,Verdana,sans-serif}" +
      field + ":where(:disabled,[readonly]){background-color:#ebebe4;color:#6d6d6d}" +
      // the combo button sat inside the control on XP: reserve its room and keep it drawn even where BIR's CSS
      // sets padding:0 or a `background:` shorthand (border-box, so a width BIR set is unchanged)
      ":where(select){-webkit-appearance:none;appearance:none;border:1px solid #7f9db9;border-radius:0;" +
        "background-color:#fff;padding-left:2px;font-family:Tahoma,Verdana,sans-serif}" +
      "select:not([multiple]):not([size]),select[size='1']{background-image:" + arrow + "!important;" +
        "background-repeat:no-repeat!important;background-position:right 1px center!important;padding-right:19px!important}" +
      ":where(select:disabled){background-color:#ebebe4;color:#6d6d6d}" +
      button + "{-webkit-appearance:none;appearance:none;border:1px solid #003c74;border-radius:3px;" +
        "background:linear-gradient(#fff 0%,#f6f6f3 40%,#ecebe6 85%,#d6d0c5 100%);color:#000;" +
        "font-family:Tahoma,Verdana,sans-serif;padding:2px 8px}" +
      button + ":where(:hover:not(:disabled)){box-shadow:inset 0 -2px #f8b33b,inset 0 2px #ffe8a5}" +
      button + ":where(:active:not(:disabled)){background:linear-gradient(#e5e4de,#e3e2da 50%,#f2f1ec)}" +
      button + ":where(:focus-visible){outline:1px dotted #000;outline-offset:-4px}" +
      button + ":where(:disabled){border-color:#c9c7ba;color:#aca899;background:#f5f4ea}";
    var style = document.createElement("style");
    style.setAttribute("data-ebf", "xp-controls");
    style.textContent = css;
    (document.head || document.documentElement).appendChild(style);
  })();

  // Speed: BIR's reference loaders re-read `response.innerHTML` (serializing the whole 150 KB+ ATC/RDO DOM)
  // once PER record — `for i in 1..atcCount: String(response.innerHTML).split('atc'+i+':')` — which is
  // O(N × filesize). Memoize innerHTML per element for the current synchronous tick; a microtask clears it,
  // so a later `innerHTML = …` is seen fresh. Only the read-only `.split()` loads are routed here (form-patch).
  (function () {
    var cache = new WeakMap();
    var scheduled = false;
    window.__ebfInnerHTML = function (el) {
      if (cache.has(el)) return cache.get(el);
      var v = el.innerHTML;
      cache.set(el, v);
      if (!scheduled) {
        scheduled = true;
        Promise.resolve().then(function () {
          cache = new WeakMap();
          scheduled = false;
        });
      }
      return v;
    };
  })();

  // IE (≤ IE7 document mode) serialized an input's CURRENT value/checked state and an option's current selection
  // into innerHTML (attribute and property were one). WebKit serializes only the markup attributes. Forms that
  // copy a pop-up's rows with `$(main).html($(temp).html())` (1700's "add more" modals) rely on IE's behaviour;
  // form-patch routes exactly those copies here. Sync the attributes from the live state, then serialize.
  window.__ebfLiveHtml = function (el) {
    var input = el.getElementsByTagName("input");
    for (var i = 0; i < input.length; i++) {
      var e = input[i];
      if (e.type === "checkbox" || e.type === "radio") {
        if (e.checked) e.setAttribute("checked", "checked");
        else e.removeAttribute("checked");
      } else if (e.type !== "button") e.setAttribute("value", e.value);
    }
    var option = el.getElementsByTagName("option");
    for (var j = 0; j < option.length; j++) {
      if (option[j].selected) option[j].setAttribute("selected", "selected");
      else option[j].removeAttribute("selected");
    }
    return el.innerHTML;
  };

  // IE (≤ IE7 document mode, which 76 forms run in) let getElementById match a `name` attribute and
  // ignore case. Forms depend on it (e.g. 1702Q asks for 'frm1702q:txtTIN1' where the markup says frm1702Q).
  var nativeById = Document.prototype.getElementById;
  Document.prototype.getElementById = function (id) {
    var el = nativeById.call(this, id);
    if (el || id == null) return el;
    var named = this.getElementsByName(id);
    if (named.length) return named[0];
    var lower = String(id).toLowerCase();
    var all = this.querySelectorAll("[id],[name]");
    for (var i = 0; i < all.length; i++) {
      if ((all[i].id && all[i].id.toLowerCase() === lower) || String(all[i].getAttribute("name") || "").toLowerCase() === lower) return all[i];
    }
    return null;
  };

  // Printing: the packaged app prints natively through the host (WKWebView's window.print() is unreliable);
  // in a plain browser the host says no and the browser's own print runs.
  var nativePrint = window.print.bind(window);
  var printSheetOpen = false;
  window.print = function () {
    try {
      var r = vfsPost("/__print", {});
      if (r && r.ok) {
        printSheetOpen = true;
        return;
      }
    } catch (e) {
      /* fall through */
    }
    nativePrint();
  };
  // IE's window.print() returned only after printing, so 3 forms (1701MS, 1702Qv2018C, 2200Pv2020) undo their print
  // layout on the very next line. The packaged app's print is a non-blocking sheet (wry), which would print the undone
  // layout — page 1 only. form-patch routes that next line here: it runs on the first click/keypress in the page,
  // which the modal sheet holds off until printing is finished or cancelled. A browser's print blocks: run it now.
  window.__ebfAfterPrint = function (restore) {
    if (!printSheetOpen) return restore();
    printSheetOpen = false;
    var once = function () {
      document.removeEventListener("pointerdown", once, true);
      document.removeEventListener("keydown", once, true);
      restore();
    };
    document.addEventListener("pointerdown", once, true);
    document.addEventListener("keydown", once, true);
  };
  document.execCommand = (function (exec) {
    return function (command) {
      if (String(command).toLowerCase() === "print") return window.print(), true; // 2200S / 2200T
      return exec.apply(document, arguments);
    };
  })(document.execCommand);

  // BIR bug: 1601FQ (and some others) call dropdown-populator functions on schedule reload but never define
  // them (1601F/1602 do), so reopening a saved return throws "Can't find variable" and the schedule breaks.
  // Provide safe fallbacks; a form that defines its own (a hoisted declaration in its inline script) overrides
  // this at parse time. Re-stubbed on DOMContentLoaded too, in case the form's missing one is only discovered then.
  ["addTreatyCodeInDropDown", "addATCCodeInDropDown"].forEach(function (name) {
    if (typeof window[name] === "undefined") window[name] = function () {};
  });

  // JScript 5.x (mshta's engine) has no ECMA-402: Number#toLocaleString IGNORES its arguments and formats with the
  // Windows number format — "1,234.00" for en-US/en-PH. WebKit honours them, so 1702Qv2018C's
  // `toLocaleString('en-US', {style:'currency', currency:'USD', minimumFractionDigits:0})` became "$1,234", which
  // NumWithComma then read as NaN (Part II item 17/18 → 0). Restore mshta's output.
  Number.prototype.toLocaleString = function () {
    var n = Number(this);
    if (!isFinite(n)) return String(n);
    var fixed = Math.abs(n).toFixed(2).split(".");
    var whole = fixed[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    return (n < 0 && Number(fixed.join(".")) !== 0 ? "-" : "") + whole + "." + fixed[1];
  };

  // In an HTA, window.close() quit eBIRForms (BIR's Exit buttons). The packaged app closes its window; a dev
  // browser can't, so it goes back to BIR's main screen. Forms call window.close(); self.close() — once is enough.
  var closing = false;
  window.close = function () {
    if (closing) return;
    closing = true;
    var r = null;
    try { r = vfsPost("/__close", {}); } catch (e) { r = null; }
    if (!r || !r.ok) {
      closing = false;
      window.location.href = "/legacy/BIRForms.hta";
    }
  };
})();
