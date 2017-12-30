define(function (require, exports, module) {
    "use strict";

    const PreferencesManager = brackets.getModule("preferences/PreferencesManager");
    const EditorManager = brackets.getModule("editor/EditorManager");
    const ExtensionUtils = brackets.getModule("utils/ExtensionUtils");
    const prefs = PreferencesManager.getExtensionPrefs("whitespaces");
    const styleNodes = {
        showTabs: null,
        showTrailing: null
    };

    brackets.getModule(["thirdparty/CodeMirror/addon/edit/trailingspace"]);

    prefs.definePreference("showTabs", "boolean", true, {
        description: "Show tabs characters"
    });
    prefs.set("showTabs", prefs.get("showTabs"));

    prefs.definePreference("showTrailing", "boolean", true, {
        description: "Show trailing whitespaces"
    });
    prefs.set("showTrailing", prefs.get("showTrailing"));

    function updateEditors(includeEditor?) {
        const fullEditor = EditorManager.getCurrentFullEditor();
        if (!fullEditor) {
            return;
        }

        const editors = [fullEditor].concat(EditorManager.getInlineEditors(fullEditor));

        // activeEditorChange fires before a just opened inline editor would be listed by getInlineEditors
        // So we include it manually
        if (includeEditor && editors.indexOf(includeEditor) === -1) {
            editors.push(includeEditor);
        }

        editors.forEach((instance) => {
            instance._codeMirror.setOption("showTrailingSpace", prefs.get("showTrailing"));
            instance._codeMirror.refresh();
        });
    }

    function onActiveEditorChange(e, editor) {
        updateEditors(editor);
    }

    function loadEditorSync() {
        updateEditors();
        EditorManager.on("activeEditorChange", onActiveEditorChange);
    }

    function unloadEditorSync() {
        updateEditors();
        EditorManager.off("activeEditorChange", onActiveEditorChange);
    }

    function prefUpdate(prefName, loadFn?, unloadFn?) {
        const value = prefs.get(prefName);
        if (!styleNodes[prefName] && value === true) {
            ExtensionUtils.loadStyleSheet(module, prefName + ".css").done((node) => {
                styleNodes[prefName] = node;
                if (loadFn) {
                    loadFn();
                }
            });
        } else if (styleNodes[prefName] && !value) {
            $(styleNodes[prefName]).remove();
            styleNodes[prefName] = null;
            if (unloadFn) {
                unloadFn();
            }
        }
    }

    function prefChangeHandler() {
        prefUpdate("showTabs");
        prefUpdate("showTrailing", loadEditorSync, unloadEditorSync);
    }

    prefs.on("change", prefChangeHandler);
});
