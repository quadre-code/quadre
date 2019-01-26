/// <amd-dependency path="module" name="module"/>

const PreferencesManager = brackets.getModule("preferences/PreferencesManager");
const EditorManager = brackets.getModule("editor/EditorManager");
const ExtensionUtils = brackets.getModule("utils/ExtensionUtils");
const prefs = PreferencesManager.getExtensionPrefs("whitespaces");
const styleNodes = {
    showTabs: null,
    showTrailingSpace: null,
    showNoBreakSpace: null
};

brackets.getModule(["thirdparty/CodeMirror/addon/edit/trailingspace"]);
import "nobreakspace";

prefs.definePreference("showTabs", "boolean", true, {
    description: "Show tabs characters"
});
prefs.set("showTabs", prefs.get("showTabs"));

prefs.definePreference("showTrailingSpace", "boolean", true, {
    description: "Show trailing whitespaces"
});
prefs.set("showTrailingSpace", prefs.get("showTrailingSpace"));

prefs.definePreference("showNoBreakSpace", "boolean", true, {
    description: "Show non-breakable spaces"
});
prefs.set("showNoBreakSpace", prefs.get("showNoBreakSpace"));

enum SpaceOption {
    showTrailingSpace = "showTrailingSpace",
    showNoBreakSpace = "showNoBreakSpace",
}

function updateEditors(spaceOption: SpaceOption, includeEditor?) {
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
        instance._codeMirror.setOption(spaceOption, prefs.get(spaceOption));
        instance._codeMirror.refresh();
    });
}

function loadEditorSync(spaceOption: SpaceOption) {
    updateEditors(spaceOption);
    EditorManager.on("activeEditorChange", (e, editor) => {
        updateEditors(spaceOption, editor);
    });
}

function unloadEditorSync(spaceOption: SpaceOption) {
    updateEditors(spaceOption);
    EditorManager.off("activeEditorChange", (e, editor) => {
        updateEditors(spaceOption, editor);
    });
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
    prefUpdate(
        "showTrailingSpace",
        loadEditorSync.call(null, "showTrailingSpace"),
        unloadEditorSync.call(null, "showTrailingSpace"));
    prefUpdate("showNoBreakSpace",
        loadEditorSync.call(null, "showNoBreakSpace"),
        unloadEditorSync.call(null, "showNoBreakSpace"));
}

prefs.on("change", prefChangeHandler);

// See https://github.com/Microsoft/TypeScript/issues/20943
export {};
