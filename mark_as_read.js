// ==UserScript==
// @name         V2EX Acceleration Tools
// @namespace    http://tampermonkey.net/
// @version      0.1
// @description  Accelerate V2EX browsing experience.
// @author       tt7
// @match        https://www.v2ex.com/*
// @grant        none
// ==/UserScript==
+ function (window, document) {
    'use strict';
    var TAG = "[V2EX Acceleration Tools] ";
    var BQ_NAME_PREFIX = "v2acc_bq_";
    var IGNORE_BUTTON_NAME = "已读";
    var RUN_MODE_KEY = "v2acc_mode";
    var MODE_NORMAL = "normal";
    var MODE_PUSH = "push";
    var PUSH_INTERVAL = 500;

    var STORAGE = {

        getBQStorageKey: function (node) {
            return BQ_NAME_PREFIX + node;
        },

        saveBlockQueue: function (node) {
            var bqs;
            if (node) {
                bqs = {};
                bqs[node] = s.blockQ[node];
            } else {
                bqs = s.blockQ;
            }
            if (localStorage && bqs) {
                for (var node in bqs) {
                    localStorage.setItem(
                        STORAGE.getBQStorageKey(node),
                        JSON.stringify(bqs[node]));
                }
            }
        },

        loadBlockQueue: function (nodes) {
            if (!nodes) {
                throw TAG + "cannot loadBlockQueue with null nodes.";
            }
            if (s.blockQ == null) {
                s.blockQ = {};
            }
            if (localStorage) {
                for (var i = 0; i < nodes.length; i++) {
                    var qname = STORAGE.getBQStorageKey(nodes[i]);
                    var inStore = JSON.parse(localStorage.getItem(qname));
                    s.blockQ[nodes[i]] = inStore ? inStore : [];
                }
            }
            return s.blockQ;
        },

        getBlockQueue: function (nodeName, ignore) {
            if (s.blockQ == null) {
                throw TAG + "STORAGE not inited properly.";
            }
            if (!s.blockQ[nodeName] && !ignore) {
                STORAGE.loadBlockQueue([nodeName]);
            }
            return s.blockQ[nodeName];
        },

        setMode: function (m) {
            localStorage.setItem(RUN_MODE_KEY, m);
            s.mode = m;
        },

        getMode: function () {
            var m = localStorage.getItem(RUN_MODE_KEY);
            return m ? m : MODE_NORMAL;
        },

        getFirstNonEmptyQueue: function () {
            for (var i = 0; i < localStorage.length; i++) {
                var k = localStorage.key(i);
                if (k.indexOf(BQ_NAME_PREFIX) > -1) {
                    var node = k.replace(BQ_NAME_PREFIX, "");
                    var q = STORAGE.getBlockQueue(node);
                    if (q.length > 0) {
                        s.blockQ[node] = q;
                        return [node, q];
                    }
                }
            }
            return [];
        }
    };

    var s = {
        inited: false,
        disabled: false,
        mode: MODE_NORMAL,
        once: null,
        blockQ: null
    };

    var ANIME = {

        q: [],

        _interval: 20,

        _started: false,

        schedule: function (act) {
            ANIME.q.push(act);
        },

        add: function (act) {
            ANIME.schedule(act);
            ANIME.start();
        },

        _next: function (idx) {
            var act = ANIME.q.pop(0);
            try {
                act && act();
            } catch (ex) {
                log(ex);
            }
            if (ANIME.q.length > 0) {
                setTimeout(
                    ANIME._next.bind(this, idx + 1),
                    ANIME._interval);
            } else {
                ANIME._started = false;
            }
        },

        start: function () {
            if (ANIME._started) {
                log("ANIME already started");
                return;
            } else {
                ANIME._started = true;
                ANIME._next(1);
            }
        }
    };

    var Keyboard = {
        _mod: [],
        _on_mod_start: function (mod) {
            Keyboard._mod.push(mod);
        },
        _on_mod_end: function (mod) {
            var idx = Keyboard._mod.indexOf(mod);
            if (idx > -1) {
                Keyboard._mod.splice(idx, 1);
            }
        },
        _get_evt_key: function (e) {
            return e.keyCode ? e.keyCode : e.which;
        },
        _keymap: {},
        addShortcut: function (mods, trigger, handler) {
            var keymap = Keyboard._keymap;
            if (!keymap[mods]) {
                keymap[mods] = {}
            }
            keymap[mods][trigger] = handler;
        },
        startListening: function () {
            window.addEventListener("keydown", function (evt) {
                var mod = Keyboard._get_evt_key(evt);
                Keyboard._on_mod_start(mod);
            });
            window.addEventListener("keyup", function (evt) {
                var trigger = Keyboard._get_evt_key(evt);
                Keyboard._on_mod_end(trigger);
                try {
                    var kmap = Keyboard._keymap;
                    var _mod = Keyboard._mod;
                    if (!kmap[_mod] || !kmap[_mod][trigger]) {
                        return;
                    }
                    kmap[_mod][trigger]();
                } catch (ex) {
                    if (ex && ex.message) {
                        log(ex.message);
                    } else {
                        log(ex);
                    }
                }
            });
        }
    };

    function byClass(cls, parent) {
        if (!parent) {
            parent = document;
        }
        return parent.getElementsByClassName(cls);
    }

    function byId(id) {
        return document.getElementById(id);
    }

    function byTag(tag, parent) {
        if (!parent) {
            parent = document;
        }
        return parent.getElementsByTagName(tag);
    }

    function asArray(c) {
        return [].slice.apply(c);
    }

    function getTab() {
        var currentTab = byClass('tab_current');
        if (!currentTab) {
            return null;
        }
        var href = window.location.href;
        if (currentTab.length > 0) {
            href = currentTab[0].href;
        }
        var match = /tab=([\w\d_]+)/.exec(href);
        return match && match[1] || null;
    }

    function getNode() {
        return extractNodeNameFromUri(window.location.href);
    }

    function extractNodeNameFromUri(uri) {
        var match = /\/go\/([\w\d_ ]+)/.exec(uri);
        if (match) {
            return match[1];
        }
        return null;
    }

    function extractNodeNamesFromNodesSideBar() {
        var nodes = [];
        var preNodeName = null;
        asArray(byTag("a", byId("MyNodes"))).forEach(
            function (el, i) {
                var nodeName = extractNodeNameFromUri(el.href);
                if (nodeName != preNodeName) {
                    preNodeName = nodeName;
                    nodes.push(nodeName);
                }
            }
        );
        return nodes;
    }

    function extractNodeNamesFromTab() {
        var nodes = [];
        asArray(
            byClass("cell",
                byClass('box',
                    byId("Main"))[0])[0].children).forEach(
            function (el, i) {
                if (el.nodeName == 'A') {
                    var n = extractNodeNameFromUri(el.href);
                    n && nodes.push(n);
                }
            });
        return nodes;
    }

    function extractAllItemNodeNames() {
        var nodes = [];
        asArray(byClass("item")).forEach(function (el, idx) {
            asArray(byClass("node", el)).forEach(function (el, idx) {
                if (el.nodeName == 'A') {
                    var node = extractNodeNameFromUri(el.href);
                    node && nodes.indexOf(node) < 0 && nodes.push(node);
                }
            });
        });
        return nodes;
    }

    function getNodesOfCurrentPage() {
        var singleNode = getNode();
        if (singleNode) {
            return [singleNode];
        } else {
            var nodes = [];
            var currentTab = getTab();
            if (!currentTab) {
                throw TAG + "Unsupported Page";
            }
            if (currentTab == "nodes") {
                return extractNodeNamesFromNodesSideBar();
            } else if (currentTab == "hot" || currentTab == "all") {
                return extractAllItemNodeNames();
            } else if (currentTab == "members") {
                // We shouldn't hide posts of authors the user explicitly wants to read.
                log(TAG + "is disabled on this page by default.");
                return null;
            }
            return extractNodeNamesFromTab();
        }
    }

    function findOnce() {
        var once;
        var anchors = asArray(byTag("a", byId("Top")));
        anchors.forEach(function (a, i) {
            if (a.onclick) {
                var txt = a.onclick.toString();
                once = /\/signout\?once=(\d+)/.exec(txt)[1];
            }
        });
        s.once = once;
        return once;
    }

    function getOnce() {
        if (!s.once) {
            return findOnce();
        } else {
            return s.once;
        }
    }

    function log(msg) {
        try {
            if (console) {
                console.log(msg);
            }
        } catch (ex) {}
    }

    function findContainerDiv(span) {
        var c = span;
        while (c && c.tagName != "DIV") {
            c = c.parentNode;
        }
        return c;
    }

    function getStyleInt(el, stlname) {
        var s = window.getComputedStyle(el)[stlname].toString();
        var match = /\d+/.exec(s);
        if (!match) {
            return el.getClientRects()[0][stlname];
        } else {
            return parseInt(match[0]);
        }
    }

    function hide(el) {
        try {
            el.style.opacity = 0.99;
            var h = getStyleInt(el, "height");
            var p = getStyleInt(el, "padding");
            var spd = 10;
            var doHide = function () {
                if (el.style.opacity && el.style.opacity > 0.2) {
                    el.style.opacity -= 0.15;
                    setTimeout(doHide, spd);
                } else if (p > 2) {
                    p -= 5;
                    el.style.padding = p + 'px';
                    setTimeout(doHide, spd);
                } else if (h > 5) {
                    h -= 5;
                    el.style.height = h + "px";
                    setTimeout(doHide, spd);
                } else {
                    el.style.display = "none";
                }
            };
            setTimeout(doHide, spd);
        } catch (ignore) {}
    }

    function ignoreTopic(topicContainer, node, topicId) {
        topicId = parseInt(topicId);
        var q = STORAGE.getBlockQueue(node);
        if (q.indexOf(topicId) < 0) {
            q.push(topicId);
            log("[" + node + "]" + topicId + " ignored.");
            STORAGE.saveBlockQueue();
        }
        ANIME.add(hide.bind(this, topicContainer));
    }

    function addIgnoreButton(topicSp, node, topicId) {
        if (topicSp) {
            var ignoreSpan = document.createElement("span");
            ignoreSpan.style.float = 'right';
            var ignoreLink = document.createElement("a");
            ignoreLink.href = "javascript:void(0);";
            ignoreLink.text = "[" + IGNORE_BUTTON_NAME + "]";
            ignoreSpan.appendChild(ignoreLink);
            var link_bar = byClass('fade', topicSp.parentNode)[0];
            link_bar.appendChild(ignoreSpan);
            var topicContainer = findContainerDiv(topicSp);
            ignoreLink.addEventListener(
                "click",
                ignoreTopic.bind(this, topicContainer, node, topicId)
            );
        } else {
            log("cannot find " + id);
        }
    }

    function extractTopicId(sp) {
        if (!sp || !sp.children) {
            throw TAG + "Invalid Topic SP";
        }
        var uri = sp.children[0].toString();
        var match = /\/t\/(\d+)/.exec(uri);
        if (!match) {
            throw TAG + "Topic ID Not Found";
        } else {
            return parseInt(match[1]);
        }
    }

    function buildIgnoreReqUri(itype, id) {
        var once = getOnce();
        return "/ignore/" + itype + "/" + id + "?once=" + once;
    }

    function buildIgnoreTopicReqUri(id) {
        return buildIgnoreReqUri("topic", id);
    }

    function actHideIgnored(sp, node, tid) {
        try {
            if (STORAGE.getBlockQueue(node).indexOf(tid) > -1) {
                var title = sp.children[0].text;
                log("ignore: [" + node + "]" + title + "(" + tid + ")");
                ANIME.schedule(hide.bind(this, findContainerDiv(sp)));
            }
        } catch (ex) {
            log(ex);
        }
    }

    function actAddIgnoreButton(sp, node, tid) {
        try {
            addIgnoreButton(sp, node, tid);
        } catch (ex) {
            log(ex);
        }
    }

    function actMarkValidTid(visited, sp, node, tid) {
        if (!visited[node]) {
            visited[node] = [];
        }
        visited[node].push(tid);
    }

    function extractNodeNameForTopicSpan(tsp) {
        try {
            var singleNode = getNode();
            if (singleNode) {
                return singleNode;
            } else {
                var container = findContainerDiv(tsp);
                return extractNodeNameFromUri(
                    byClass("node", container)[0].href);
            }
        } catch (ex) {
            log(ex);
            return null;
        }

    }

    function iterTitleSpans(fns) {
        if (fns) {
            var titles = document.getElementsByClassName('item_title');
            if (!titles) {
                return;
            }
            for (var i = 0; i < titles.length; i++) {
                var s = titles[i];
                var node = extractNodeNameForTopicSpan(s);
                var tid = extractTopicId(s);
                if (!node || !tid) {
                    continue;
                }
                for (var j = 0; j < fns.length; j++) {
                    var fn = fns[j];
                    fn.call(window, s, node, tid);
                }
            }
        }
    }

    function restore(node, t) {
        var q = STORAGE.getBlockQueue(node);
        if (q) {
            if (t) {
                var tidx = q.indexOf(t);
                if (tidx > -1) {
                    q.splice(tidx, 1);
                }
                log(node + "-" + t + " removed from local ignore list.");
            }
        }
    }

    function initShortcuts() {
        // ctrl + p
        Keyboard.addShortcut([17], 80, startPush);
        // ctrl + n
        Keyboard.addShortcut([17], 78, startNormal);
        Keyboard.startListening();
    }

    function init() {
        var pageNodes = getNodesOfCurrentPage();
        if (!pageNodes) {
            s.disabled = true;
        } else {
            STORAGE.loadBlockQueue(pageNodes);
        }
        findOnce();
        s.mode = STORAGE.getMode();
        initShortcuts();
        s.inited = true;
    }

    function runNormal() {
        if (!s.disabled) {
            var tidVisited = {};
            iterTitleSpans([
                actHideIgnored,
                actAddIgnoreButton,
                actMarkValidTid.bind(this, tidVisited)
            ]);
            ANIME.start();
        }
    }

    function main(evt) {
        if (s.inited) {
            return;
        }
        log("- - - - " + TAG + "- - - -")
        init();
        if (s.mode == "normal") {
            runNormal();
        } else if (s.mode == "push") {
            startPush();
        } else {
            log("unknown mode: " + s.mode);
        }
    }

    if (document.readyState == "loading") {
        document.addEventListener("DOMContentLoaded", main);
        document.addEventListener("load", main);
    } else {
        main("readyState");
    }

    function pushOne(node, tid) {
        restore(node, tid);
        STORAGE.saveBlockQueue(node);
        var url = buildIgnoreTopicReqUri(tid);
        window.location.href = url;
    }

    function startPush() {
        log("RUN MODE: " + s.mode);
        if (s.mode != MODE_PUSH) {
            STORAGE.setMode(MODE_PUSH);
        }
        var node, q;
        [node, q] = STORAGE.getFirstNonEmptyQueue();
        if (!q || q.length == 0) {
            startNormal();
        } else {
            var tid = q.pop();
            log("Sync ignoring [" + node + "]" +
                tid + " in " + PUSH_INTERVAL / 1000.0 + "s");
            s._pushing = setTimeout(
                pushOne.bind(this, node, tid),
                PUSH_INTERVAL
            );
        }
    }

    function startNormal() {
        log("RUN MODE: " + s.mode);
        if (s._pushing) {
            clearTimeout(s._pushing);
        }
        STORAGE.setMode(MODE_NORMAL);
        runNormal()
    }

    window.v2 = {
        restore: restore,
        push: startPush,
        c: startNormal
    };
}(window, document);