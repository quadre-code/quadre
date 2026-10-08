/// <amd-dependency path="module" name="module"/>

import { CodeInspectionReport } from "./types";

// imports
const CodeInspection = brackets.getModule("language/CodeInspection");
const ProjectManager = brackets.getModule("project/ProjectManager");
const ExtensionUtils = brackets.getModule("utils/ExtensionUtils");
const NodeDomain = brackets.getModule("utils/NodeDomain");
const CommandManager = brackets.getModule("command/CommandManager");
const Menus = brackets.getModule("command/Menus");
const DocumentManager = brackets.getModule("document/DocumentManager");
const EditorManager = brackets.getModule("editor/EditorManager");
const PreferencesManager = brackets.getModule("preferences/PreferencesManager");
const FileSystem = brackets.getModule("filesystem/FileSystem");
const EXTENSION_NAME = "quadre-eslint";
const AUTOFIX_COMMAND_ID = EXTENSION_NAME + ".autofix";
const AUTOFIX_COMMAND_NAME = "Auto-fix with ESLint";
import * as log from "./log";

const supportedLanguageIds = ["javascript", "jsx", "typescript", "tsx", "vue"];

// Load extension modules that are not included by core
const preferences = PreferencesManager.getExtensionPrefs(EXTENSION_NAME);

// Setup preferences used by the extension
preferences.definePreference("gutterMarks", "boolean", true);
preferences.set("gutterMarks", preferences.get("gutterMarks"));

preferences.definePreference("useEmbeddedESLint", "boolean", false);
preferences.set("useEmbeddedESLint", preferences.get("useEmbeddedESLint"));

// Constants
const LINTER_NAME = "ESLint";
const nodeDomain = new NodeDomain(
    EXTENSION_NAME,
    ExtensionUtils.getModulePath(module, "./node/domain")
);

function handleLintSync(text: string, fullPath: string): never {
    throw new Error("ESLint sync is not available, use async for " + fullPath);
}

function handleLintAsync(text: string, fullPath: string): JQueryPromise<CodeInspectionReport> {
    const deferred: JQueryDeferred<CodeInspectionReport> = $.Deferred();
    const projectRoot = ProjectManager.getProjectRoot().fullPath;
    const useEmbeddedESLint = preferences.get("useEmbeddedESLint");
    nodeDomain.exec("lintFile", projectRoot, fullPath, text, useEmbeddedESLint).then(
        (report: CodeInspectionReport) => {
            // set gutter marks using brackets-inspection-gutters module
            const w = window as any;
            if (w.bracketsInspectionGutters) {
                w.bracketsInspectionGutters.set(
                    EXTENSION_NAME,
                    fullPath,
                    report,
                    preferences.get("gutterMarks", projectRoot)
                );
            } else {
                log.error("No bracketsInspectionGutters found on window, gutters disabled.");
            }
            deferred.resolve(report);
        },
        (err) => {
            deferred.reject(err);
        }
    );
    return deferred.promise();
}

function handleAutoFix(): void {
    const doc = DocumentManager.getCurrentDocument();
    const language = doc.getLanguage();
    const fileType = language.getId();
    const fullPath = doc.file.fullPath;
    const editor = EditorManager.getCurrentFullEditor();
    const cursor = editor.getCursorPos();
    const scroll = editor.getScrollPos();

    // Do nothing unless it's a file with a supported language.
    if (supportedLanguageIds.indexOf(fileType) === -1) {
        return;
    }

    const projectRoot = ProjectManager.getProjectRoot().fullPath;
    const useEmbeddedESLint = preferences.get("useEmbeddedESLint");
    nodeDomain.exec("fixFile", projectRoot, fullPath, doc.getText(), useEmbeddedESLint).then(
        (response) => {
            const text = response && response.results[0] ? response.results[0].output : "";
            if (text) {
                doc.setText(text);
            }

            // Reset editor back to previous cursor position
            editor.setCursorPos(cursor);
            editor.setScrollPos(scroll.x, scroll.y);
        },
        (err) => {
            log.error(`fixFile -> error: ${err}`);
        }
    );
}

// =================================================================================

// Register the auto-fix command
CommandManager.register(AUTOFIX_COMMAND_NAME, AUTOFIX_COMMAND_ID, handleAutoFix);

// Add to Edit menu
const editMenu = Menus.getMenu(Menus.AppMenuBar.EDIT_MENU);
editMenu.addMenuDivider();
editMenu.addMenuItem(AUTOFIX_COMMAND_ID);

// Add context-menu option (only for Javascript files)
const contextMenu = Menus.getContextMenu(Menus.ContextMenuIds.EDITOR_MENU);
contextMenu.addMenuItem(AUTOFIX_COMMAND_ID);

FileSystem.on("change", (event, entry) => {
    if (!entry || /^\.eslintrc(\.(js|yaml|yml|json))?$/.test(entry.name)) {
        const projectRoot = ProjectManager.getProjectRoot().fullPath;
        const useEmbeddedESLint = preferences.get("useEmbeddedESLint");
        nodeDomain.exec("configFileModified", projectRoot, useEmbeddedESLint);
    }
});

// register a linter with CodeInspection
supportedLanguageIds.forEach((langId) => {
    CodeInspection.register(langId, {
        name: LINTER_NAME,
        scanFile: handleLintSync,
        scanFileAsync: handleLintAsync,
    });
});
