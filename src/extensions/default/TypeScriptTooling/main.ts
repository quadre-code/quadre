/*
 * Copyright (c) 2019 - 2021 Adobe. All rights reserved.
 * Copyright (c) 2022 - present The quadre code authors. All rights reserved.
 *
 * Permission is hereby granted, free of charge, to any person obtaining a
 * copy of this software and associated documentation files (the "Software"),
 * to deal in the Software without restriction, including without limitation
 * the rights to use, copy, modify, merge, publish, distribute, sublicense,
 * and/or sell copies of the Software, and to permit persons to whom the
 * Software is furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
 * FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
 * DEALINGS IN THE SOFTWARE.
 *
 */

/// <amd-dependency path="module" name="module"/>

import type { Editor } from "editor/Editor";
import type { Language } from "language/LanguageManager";
import type { LanguageClientWrapper } from "languageTools/LanguageClientWrapper";
import type { JumpToDefProvider, LintingProvider, ParameterHintsProvider, ReferencesProvider } from "languageTools/DefaultProviders";
import Directory = require("filesystem/Directory");

const LanguageTools = brackets.getModule("languageTools/LanguageTools");
const ClientLoader = brackets.getModule("languageTools/ClientLoader");
const AppInit = brackets.getModule("utils/AppInit");
const ExtensionUtils = brackets.getModule("utils/ExtensionUtils");
const ProjectManager = brackets.getModule("project/ProjectManager");
const EditorManager =  brackets.getModule("editor/EditorManager");
const LanguageManager =  brackets.getModule("language/LanguageManager");
const CodeHintManager = brackets.getModule("editor/CodeHintManager");
const QuickOpen = brackets.getModule("search/QuickOpen");
const ParameterHintManager = brackets.getModule("features/ParameterHintsManager");
const JumpToDefManager = brackets.getModule("features/JumpToDefManager");
const FindReferencesManager = brackets.getModule("features/FindReferencesManager");
const CodeInspection = brackets.getModule("language/CodeInspection");
const DefaultProviders = brackets.getModule("languageTools/DefaultProviders");
import { CodeHintsProvider } from "CodeHintsProvider";
import { DocumentSymbolsProvider, ProjectSymbolsProvider } from "TypeScriptSymbolProviders";
const DefaultEventHandlers = brackets.getModule("languageTools/DefaultEventHandlers");
const PreferencesManager  = brackets.getModule("preferences/PreferencesManager");
const Strings             = brackets.getModule("strings");
const Dialogs             = brackets.getModule("widgets/Dialogs");
const DefaultDialogs      = brackets.getModule("widgets/DefaultDialogs");
const Commands               = brackets.getModule("command/Commands");
const CommandManager         = brackets.getModule("command/CommandManager");
const StringUtils             = brackets.getModule("utils/StringUtils");

const clientFilePath = ExtensionUtils.getModulePath(module, "node/client.js");
const clientName = "TypeScriptClient";
let _client: LanguageClientWrapper;
let evtHandler;
let tsConfig = {
    enableTypeScriptTooling: true,
    executablePath: "php",
    memoryLimit: "4095M",
    validateOnType: "false"
};
const DEBUG_OPEN_PREFERENCES_IN_SPLIT_VIEW  = "debug.openPrefsInSplitView";
let tsServerRunning = false;
let serverCapabilities;
let currentRootPath;
let chProvider: CodeHintsProvider | null = null;
let phProvider: ParameterHintsProvider | null = null;
let lProvider: LintingProvider | null = null;
let jdProvider: JumpToDefProvider | null = null;
let dSymProvider: DocumentSymbolsProvider | null = null;
let pSymProvider: ProjectSymbolsProvider | null = null;
let refProvider: ReferencesProvider | null = null;
let providersRegistered = false;

PreferencesManager.definePreference("typescript", "object", tsConfig, {
    description: Strings.DESCRIPTION_TYPESCRIPT_TOOLING_CONFIGURATION
});

PreferencesManager.on("change", "typescript", function () {
    const newTsConfig = PreferencesManager.get("typescript");

    if (lProvider && newTsConfig.validateOnType !== tsConfig.validateOnType) {
        lProvider._validateOnType = !(newTsConfig.validateOnType === "false");
    }
    if ((newTsConfig.executablePath !== tsConfig.executablePath) ||
        (newTsConfig.enableTypeScriptTooling !== tsConfig.enableTypeScriptTooling)) {
        tsConfig = newTsConfig;
        runTypeScriptServer();
        return;
    }
    tsConfig = newTsConfig;
});

function handleProjectOpen(event, directory: Directory): void {
    lProvider!.clearExistingResults();
    if (serverCapabilities.workspace && serverCapabilities.workspace.workspaceFolders) {
        _client.notifyProjectRootsChanged({
            foldersAdded: [directory.fullPath],
            foldersRemoved: [currentRootPath]
        });
        currentRootPath = directory.fullPath;
    } else {
        _client.restart({
            rootPath: directory.fullPath
        }).done(handlePostTypeScriptServerStart);
    }
}

function resetClientInProviders(): void {
    const logErr = "TypeScriptTooling: Can't reset client for : ";
    chProvider ? chProvider.setClient(_client) : console.log(logErr, "CodeHintsProvider");
    phProvider ? phProvider.setClient(_client) : console.log(logErr, "ParameterHintsProvider");
    jdProvider ? jdProvider.setClient(_client) : console.log(logErr, "JumpToDefProvider");
    dSymProvider ? dSymProvider.setClient(_client) : console.log(logErr, "DocumentSymbolsProvider");
    pSymProvider ? pSymProvider.setClient(_client) : console.log(logErr, "ProjectSymbolsProvider");
    refProvider ? refProvider.setClient(_client) : console.log(logErr, "FindReferencesProvider");
    lProvider ? lProvider.setClient(_client) : console.log(logErr, "LintingProvider");
    _client.addOnCodeInspection(lProvider!.setInspectionResults.bind(lProvider));
}

function registerToolingProviders(): void {
    chProvider = new CodeHintsProvider(_client);
    phProvider = new DefaultProviders.ParameterHintsProvider(_client);
    lProvider = new DefaultProviders.LintingProvider(_client);
    jdProvider = new DefaultProviders.JumpToDefProvider(_client);
    dSymProvider = new DocumentSymbolsProvider(_client);
    pSymProvider = new ProjectSymbolsProvider(_client);
    refProvider = new DefaultProviders.ReferencesProvider(_client);

    JumpToDefManager.registerJumpToDefProvider(jdProvider, ["typescript", "tsx"], 0);
    CodeHintManager.registerHintProvider(chProvider, ["typescript", "tsx"], 0);
    ParameterHintManager.registerHintProvider(phProvider, ["typescript", "tsx"], 0);
    FindReferencesManager.registerFindReferencesProvider(refProvider, ["typescript", "tsx"], 0);
    FindReferencesManager.setMenuItemStateForLanguage();
    CodeInspection.register(["typescript", "tsx"], {
        name: "",
        scanFileAsync: lProvider.getInspectionResultsAsync.bind(lProvider)
    });
    // Attach plugin for Document Symbols
    QuickOpen.addQuickOpenPlugin({
        name: "TypeScript Document Symbols",
        label: Strings.CMD_FIND_DOCUMENT_SYMBOLS + "\u2026",
        languageIds: ["typescript", "tsx"],
        search: dSymProvider.search.bind(dSymProvider),
        match: dSymProvider.match.bind(dSymProvider),
        itemFocus: dSymProvider.itemFocus.bind(dSymProvider),
        itemSelect: dSymProvider.itemSelect.bind(dSymProvider),
        resultsFormatter: dSymProvider.resultsFormatter.bind(dSymProvider)
    });
    CommandManager.get(Commands.NAVIGATE_GOTO_DEFINITION).setEnabled(true);
    // Attach plugin for Project Symbols
    QuickOpen.addQuickOpenPlugin({
        name: "TypeScript Project Symbols",
        label: Strings.CMD_FIND_PROJECT_SYMBOLS + "\u2026",
        languageIds: ["typescript", "tsx"],
        search: pSymProvider.search.bind(pSymProvider),
        match: pSymProvider.match.bind(pSymProvider),
        itemFocus: pSymProvider.itemFocus.bind(pSymProvider),
        itemSelect: pSymProvider.itemSelect.bind(pSymProvider),
        resultsFormatter: pSymProvider.resultsFormatter.bind(pSymProvider)
    });
    CommandManager.get(Commands.NAVIGATE_GOTO_DEFINITION_PROJECT).setEnabled(true);

    _client.addOnCodeInspection(lProvider.setInspectionResults.bind(lProvider));

    providersRegistered = true;
}

function addEventHandlers(): void {
    _client.addOnLogMessage(function () { /* Do nothing */ });
    _client.addOnShowMessage(function () { /* Do nothing */ });
    evtHandler = new DefaultEventHandlers.EventPropagationProvider(_client);
    evtHandler.registerClientForEditorEvent();


    if (tsConfig.validateOnType !== "false") {
        lProvider!._validateOnType = true;
    }

    _client.addOnProjectOpenHandler(handleProjectOpen);
}

function validateTypeScriptExecutable(): JQueryDeferred<any> {
    const result = $.Deferred<any>();

    _client.sendCustomRequest({
        messageType: "brackets",
        type: "validateTypeScriptExecutable",
        params: tsConfig
    }).done(result.resolve).fail(result.reject);

    return result;
}

function showErrorPopUp(err): void {
    if (!err) {
        return;
    }
    let localizedErrStr = "";
    if (typeof (err) === "string") {
        localizedErrStr = Strings[err];
    } else {
        localizedErrStr = StringUtils.format(Strings[err[0]], err[1]);
    }
    if (!localizedErrStr) {
        console.error("TypeScript Tooling Error: " + err);
        return;
    }
    const Buttons = [
        { className: Dialogs.DIALOG_BTN_CLASS_NORMAL, id: Dialogs.DIALOG_BTN_CANCEL,
            text: Strings.CANCEL },
        { className: Dialogs.DIALOG_BTN_CLASS_PRIMARY, id: Dialogs.DIALOG_BTN_DOWNLOAD,
            text: Strings.OPEN_PREFERENNCES}
    ];
    Dialogs.showModalDialog(
        DefaultDialogs.DIALOG_ID_ERROR,
        Strings.TYPESCRIPT_SERVER_ERROR_TITLE,
        localizedErrStr,
        Buttons
    ).done(function (id) {
        if (id === Dialogs.DIALOG_BTN_DOWNLOAD) {
            if (CommandManager.get(DEBUG_OPEN_PREFERENCES_IN_SPLIT_VIEW)) {
                CommandManager.execute(DEBUG_OPEN_PREFERENCES_IN_SPLIT_VIEW);
            } else {
                CommandManager.execute(Commands.FILE_OPEN_PREFERENCES);
            }
        }
    });
}

function handlePostTypeScriptServerStart(): void {
    if (!tsServerRunning) {
        tsServerRunning = true;

        if (providersRegistered) {
            resetClientInProviders();
        } else {
            registerToolingProviders();
        }

        addEventHandlers();
        EditorManager.off("activeEditorChange.ts");
        LanguageManager.off("languageModified.ts");
    }
    evtHandler.handleActiveEditorChange(null, EditorManager.getActiveEditor());
    currentRootPath = ProjectManager.getProjectRoot()!._path;
}

function runTypeScriptServer(): void {
    if (_client && tsConfig.enableTypeScriptTooling) {
        validateTypeScriptExecutable()
            .done(function () {
                let startFunc = _client.start.bind(_client);
                if (tsServerRunning) {
                    startFunc = _client.restart.bind(_client);
                }
                currentRootPath = ProjectManager.getProjectRoot()!._path;
                startFunc({
                    rootPath: currentRootPath
                }).done(function (result) {
                    console.log("TypeScript Language Server started");
                    serverCapabilities = result.capabilities;
                    handlePostTypeScriptServerStart();
                });
            }).fail(showErrorPopUp);
    }
}

function activeEditorChangeHandler(event, current: Editor | null): void {
    if (current) {
        const language = current.document.getLanguage();
        if (language.getId() === "typescript" || language.getId() === "tsx") {
            runTypeScriptServer();
            EditorManager.off("activeEditorChange.ts");
            LanguageManager.off("languageModified.ts");
        }
    }
}

function languageModifiedHandler(event: string, language: Language): void {
    if (language && (language.getId() === "typescript" || language.getId() === "tsx")) {
        runTypeScriptServer();
        EditorManager.off("activeEditorChange.ts");
        LanguageManager.off("languageModified.ts");
    }
}

function initiateService(evt: string | null, onAppReady: boolean): void {
    if (onAppReady) {
        console.log("TypeScript tooling: Starting the service");
    } else {
        console.log("TypeScript tooling: Something went wrong. Restarting the service");
    }

    tsServerRunning = false;
    LanguageTools.initiateToolingService(clientName, clientFilePath, ["typescript", "tsx"]).done(function (client) {
        _client = client!;
        // Attach only once
        EditorManager.off("activeEditorChange.ts");
        EditorManager.on("activeEditorChange.ts", activeEditorChangeHandler);
        // Attach only once
        LanguageManager.off("languageModified.ts");
        LanguageManager.on("languageModified.ts", languageModifiedHandler);
        activeEditorChangeHandler(null, EditorManager.getActiveEditor());
    });
}

AppInit.appReady(function () {
    initiateService(null, true);
    ClientLoader.on("languageClientModuleInitialized", initiateService);
});

// Only for Unit testing
export function getClient(): LanguageClientWrapper {
    return _client;
}
