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

import * as toolingInfoJson from "text!languageTools/ToolingInfo.json";
const ToolingInfo = JSON.parse(toolingInfoJson);
const MESSAGE_FORMAT = {
    BRACKETS: "brackets",
    LSP: "lsp"
};

function _addTypeInformation(type, params) {
    return {
        type: type,
        params: params
    };
}

function hasValidProp(obj, prop) {
    return (obj && obj[prop] !== undefined && obj[prop] !== null);
}

function hasValidProps(obj, props) {
    let retval = !!obj;
    const len = props.length;

    for (let i = 0; retval && (i < len); i++) {
        retval = (retval && obj[props[i]] !== undefined && obj[props[i]] !== null);
    }

    return retval;
}

/*
    RequestParams creator - sendNotifications/request
*/
// For unit testting
export function validateRequestParams(type, params) {
    let validatedParams: any = null;

    params = params || {};

    // Don't validate if the formatting is done by the caller
    if (params.format === MESSAGE_FORMAT.LSP) {
        return params;
    }

    switch (type) {
        case ToolingInfo.LANGUAGE_SERVICE.START: {
            if (hasValidProp(params, "rootPaths") || hasValidProp(params, "rootPath")) {
                validatedParams = params;
                validatedParams.capabilities = validatedParams.capabilities || false;
            }
            break;
        }
        case ToolingInfo.FEATURES.CODE_HINTS:
        case ToolingInfo.FEATURES.PARAMETER_HINTS:
        case ToolingInfo.FEATURES.JUMP_TO_DECLARATION:
        case ToolingInfo.FEATURES.JUMP_TO_DEFINITION:
        case ToolingInfo.FEATURES.JUMP_TO_IMPL: {
            if (hasValidProps(params, ["filePath", "cursorPos"])) {
                validatedParams = params;
            }
            break;
        }
        case ToolingInfo.FEATURES.CODE_HINT_INFO: {
            validatedParams = params;
            break;
        }
        case ToolingInfo.FEATURES.FIND_REFERENCES: {
            if (hasValidProps(params, ["filePath", "cursorPos"])) {
                validatedParams = params;
                validatedParams.includeDeclaration = validatedParams.includeDeclaration || false;
            }
            break;
        }
        case ToolingInfo.FEATURES.DOCUMENT_SYMBOLS: {
            if (hasValidProp(params, "filePath")) {
                validatedParams = params;
            }
            break;
        }
        case ToolingInfo.FEATURES.PROJECT_SYMBOLS: {
            if (hasValidProp(params, "query") && typeof params.query === "string") {
                validatedParams = params;
            }
            break;
        }
        case ToolingInfo.LANGUAGE_SERVICE.CUSTOM_REQUEST: {
            validatedParams = params;
        }
    }

    return validatedParams;
}

/*
    ReponseParams transformer - used by OnNotifications
*/
// For unit testting
export function validateNotificationParams(type, params) {
    let validatedParams = null;

    params = params || {};

    // Don't validate if the formatting is done by the caller
    if (params.format === MESSAGE_FORMAT.LSP) {
        return params;
    }

    switch (type) {
        case ToolingInfo.SYNCHRONIZE_EVENTS.DOCUMENT_OPENED: {
            if (hasValidProps(params, ["filePath", "fileContent", "languageId"])) {
                validatedParams = params;
            }
            break;
        }
        case ToolingInfo.SYNCHRONIZE_EVENTS.DOCUMENT_CHANGED: {
            if (hasValidProps(params, ["filePath", "fileContent"])) {
                validatedParams = params;
            }
            break;
        }
        case ToolingInfo.SYNCHRONIZE_EVENTS.DOCUMENT_SAVED: {
            if (hasValidProp(params, "filePath")) {
                validatedParams = params;
            }
            break;
        }
        case ToolingInfo.SYNCHRONIZE_EVENTS.DOCUMENT_CLOSED: {
            if (hasValidProp(params, "filePath")) {
                validatedParams = params;
            }
            break;
        }
        case ToolingInfo.SYNCHRONIZE_EVENTS.PROJECT_FOLDERS_CHANGED: {
            if (hasValidProps(params, ["foldersAdded", "foldersRemoved"])) {
                validatedParams = params;
            }
            break;
        }
        case ToolingInfo.LANGUAGE_SERVICE.CUSTOM_NOTIFICATION: {
            validatedParams = params;
        }
    }

    return validatedParams;
}

function validateHandler(handler) {
    let retval = false;

    if (handler && typeof handler === "function") {
        retval = true;
    } else {
        console.warn("Handler validation failed. Handler should be of type 'function'. Provided handler is of type :", typeof handler);
    }

    return retval;
}

export class LanguageClientWrapper {
    public _name;
    public _path;
    private _domainInterface;
    public _languages;
    private _startClient;
    private _stopClient;
    private _notifyClient;
    private _requestClient;
    private _onRequestHandler;
    private _onNotificationHandlers;
    private _dynamicCapabilities;
    private _serverCapabilities;
    private _onEventHandlers;

    constructor(name, path, domainInterface, languages) {
        this._name = name;
        this._path = path;
        this._domainInterface = domainInterface;
        this._languages = languages || [];
        this._startClient = null;
        this._stopClient = null;
        this._notifyClient = null;
        this._requestClient = null;
        this._onRequestHandler = {};
        this._onNotificationHandlers = {};
        this._dynamicCapabilities = {};
        this._serverCapabilities = {};

        // Initialize with keys for brackets events we want to tap into.
        this._onEventHandlers = {
            "activeEditorChange": [],
            "projectOpen": [],
            "beforeProjectClose": [],
            "dirtyFlagChange": [],
            "documentChange": [],
            "fileNameChange": [],
            "beforeAppClose": []
        };

        this._init();
    }

    private _init() {
        this._domainInterface.registerMethods([
            {
                methodName: ToolingInfo.LANGUAGE_SERVICE.REQUEST,
                methodHandle: this._onRequestDelegator.bind(this)
            },
            {
                methodName: ToolingInfo.LANGUAGE_SERVICE.NOTIFY,
                methodHandle: this._onNotificationDelegator.bind(this)
            }
        ]);

        // create function interfaces
        this._startClient = this._domainInterface.createInterface(ToolingInfo.LANGUAGE_SERVICE.START, true);
        this._stopClient = this._domainInterface.createInterface(ToolingInfo.LANGUAGE_SERVICE.STOP, true);
        this._notifyClient = this._domainInterface.createInterface(ToolingInfo.LANGUAGE_SERVICE.NOTIFY);
        this._requestClient = this._domainInterface.createInterface(ToolingInfo.LANGUAGE_SERVICE.REQUEST, true);
    }

    private _onRequestDelegator(params) {
        if (!params || !params.type) {
            console.log("Invalid server request");
            return $.Deferred().reject();
        }

        const requestHandler = this._onRequestHandler[params.type];
        if (params.type === ToolingInfo.SERVICE_REQUESTS.REGISTRATION_REQUEST) {
            return this._registrationShim(params.params, requestHandler);
        }

        if (params.type === ToolingInfo.SERVICE_REQUESTS.UNREGISTRATION_REQUEST) {
            return this._unregistrationShim(params.params, requestHandler);
        }

        if (validateHandler(requestHandler)) {
            return requestHandler.call(null, params.params);
        }
        console.log("No handler provided for server request type : ", params.type);
        return $.Deferred().reject();
    }

    private _onNotificationDelegator(params) {
        if (!params || !params.type) {
            console.log("Invalid server notification");
            return;
        }

        const notificationHandlers = this._onNotificationHandlers[params.type];
        if (notificationHandlers && Array.isArray(notificationHandlers) && notificationHandlers.length) {
            notificationHandlers.forEach(function (handler) {
                if (validateHandler(handler)) {
                    handler.call(null, params.params);
                }
            });
        } else {
            console.log("No handlers provided for server notification type : ", params.type);
        }
    }

    private _request(type, params) {
        params = validateRequestParams(type, params);
        if (params) {
            params = _addTypeInformation(type, params);
            return this._requestClient(params);
        }

        console.log("Invalid Parameters provided for request type : ", type);
        return $.Deferred().reject();
    }

    private _notify(type, params) {
        params = validateNotificationParams(type, params);
        if (params) {
            params = _addTypeInformation(type, params);
            this._notifyClient(params);
        } else {
            console.log("Invalid Parameters provided for notification type : ", type);
        }
    }

    private _addOnRequestHandler(type, handler) {
        if (validateHandler(handler)) {
            this._onRequestHandler[type] = handler;
        }
    }

    private _addOnNotificationHandler(type, handler) {
        if (validateHandler(handler)) {
            if (!this._onNotificationHandlers[type]) {
                this._onNotificationHandlers[type] = [];
            }

            this._onNotificationHandlers[type].push(handler);
        }
    }

    /**
     * Requests
     */
    // start
    public start(params) {
        params = validateRequestParams(ToolingInfo.LANGUAGE_SERVICE.START, params);
        if (params) {
            const self = this;
            return this._startClient(params)
                .then(function (result) {
                    self.setServerCapabilities(result.capabilities);
                    return $.Deferred().resolve(result);
                }, function (err) {
                    return $.Deferred().reject(err);
                });
        }

        console.log("Invalid Parameters provided for request type : start");
        return $.Deferred().reject();
    }

    // shutdown
    public stop() {
        return this._stopClient();
    }

    // restart
    public restart(params) {
        const self = this;
        return this.stop().then(function () {
            return self.start(params);
        });
    }

    /**
     * textDocument requests
     */
    // completion
    public requestHints(params) {
        return this._request(ToolingInfo.FEATURES.CODE_HINTS, params)
            .then(function (response) {
                if (response && response.items && response.items.length) {
                    logAnalyticsData("CODE_HINTS");
                }
                return $.Deferred().resolve(response);
            }, function (err) {
                return $.Deferred().reject(err);
            });
    }

    // completionItemResolve
    public getAdditionalInfoForHint(params) {
        return this._request(ToolingInfo.FEATURES.CODE_HINT_INFO, params);
    }

    // signatureHelp
    public requestParameterHints(params) {
        return this._request(ToolingInfo.FEATURES.PARAMETER_HINTS, params)
            .then(function (response) {
                if (response && response.signatures && response.signatures.length) {
                    logAnalyticsData("PARAM_HINTS");
                }
                return $.Deferred().resolve(response);
            }, function (err) {
                return $.Deferred().reject(err);
            });
    }

    // gotoDefinition
    public gotoDefinition(params) {
        return this._request(ToolingInfo.FEATURES.JUMP_TO_DEFINITION, params)
            .then(function (response) {
                if (response && response.range) {
                    logAnalyticsData("JUMP_TO_DEF");
                }
                return $.Deferred().resolve(response);
            }, function (err) {
                return $.Deferred().reject(err);
            });
    }

    // gotoDeclaration
    public gotoDeclaration(params) {
        return this._request(ToolingInfo.FEATURES.JUMP_TO_DECLARATION, params);
    }

    // gotoImplementation
    public gotoImplementation(params) {
        return this._request(ToolingInfo.FEATURES.JUMP_TO_IMPL, params);
    }

    // findReferences
    public findReferences(params) {
        return this._request(ToolingInfo.FEATURES.FIND_REFERENCES, params);
    }

    // documentSymbol
    public requestSymbolsForDocument(params) {
        return this._request(ToolingInfo.FEATURES.DOCUMENT_SYMBOLS, params);
    }

    /**
     * workspace requests
     */
    // workspaceSymbol
    public requestSymbolsForWorkspace(params) {
        return this._request(ToolingInfo.FEATURES.PROJECT_SYMBOLS, params);
    }

    // These will mostly be callbacks/[done-fail](promises)
    /**
     * Window OnNotifications
     */
    // showMessage
    public addOnShowMessage(handler) {
        this._addOnNotificationHandler(ToolingInfo.SERVICE_NOTIFICATIONS.SHOW_MESSAGE, handler);
    }

    // logMessage
    public addOnLogMessage(handler) {
        this._addOnNotificationHandler(ToolingInfo.SERVICE_NOTIFICATIONS.LOG_MESSAGE, handler);
    }

    /**
     * healthData/logging OnNotifications
     */
    // telemetry
    public addOnTelemetryEvent(handler) {
        this._addOnNotificationHandler(ToolingInfo.SERVICE_NOTIFICATIONS.TELEMETRY, handler);
    }

    /**
     * textDocument OnNotifications
     */
    // onPublishDiagnostics
    public addOnCodeInspection(handler) {
        this._addOnNotificationHandler(ToolingInfo.SERVICE_NOTIFICATIONS.DIAGNOSTICS, handler);
    }

    /**
     * Window OnRequest
     */

    // showMessageRequest - handler must return promise
    public onShowMessageWithRequest(handler) {
        this._addOnRequestHandler(ToolingInfo.SERVICE_REQUESTS.SHOW_SELECT_MESSAGE, handler);
    }

    public onProjectFoldersRequest(handler) {
        this._addOnRequestHandler(ToolingInfo.SERVICE_REQUESTS.PROJECT_FOLDERS_REQUEST, handler);
    }

    private _registrationShim(params, handler) {
        const self = this;

        const registrations = params.registrations;
        registrations.forEach(function (registration) {
            const id = registration.id;
            self._dynamicCapabilities[id] = registration;
        });
        return validateHandler(handler) ? handler(params) : $.Deferred().resolve();
    }

    public onDynamicCapabilityRegistration(handler) {
        this._addOnRequestHandler(ToolingInfo.SERVICE_REQUESTS.REGISTRATION_REQUEST, handler);
    }

    private _unregistrationShim(params, handler) {
        const self = this;

        const unregistrations = params.unregistrations;
        unregistrations.forEach(function (unregistration) {
            const id = unregistration.id;
            delete self._dynamicCapabilities[id];
        });
        return validateHandler(handler) ? handler(params) : $.Deferred().resolve();
    }

    public onDynamicCapabilityUnregistration(handler) {
        this._addOnRequestHandler(ToolingInfo.SERVICE_REQUESTS.UNREGISTRATION_REQUEST, handler);
    }

    /*
        Unimplemented OnNotifications
            workspace
                applyEdit (codeAction, codeLens)
    */

    /**
     * SendNotifications
     */

    /**
     * workspace SendNotifications
     */
    // didChangeProjectRoots
    public notifyProjectRootsChanged(params) {
        this._notify(ToolingInfo.SYNCHRONIZE_EVENTS.PROJECT_FOLDERS_CHANGED, params);
    }

    /**
     * textDocument SendNotifications
     */
    // didOpenTextDocument
    public notifyTextDocumentOpened(params) {
        this._notify(ToolingInfo.SYNCHRONIZE_EVENTS.DOCUMENT_OPENED, params);
    }

    // didCloseTextDocument
    public notifyTextDocumentClosed(params) {
        this._notify(ToolingInfo.SYNCHRONIZE_EVENTS.DOCUMENT_CLOSED, params);
    }

    // didChangeTextDocument
    public notifyTextDocumentChanged(params) {
        this._notify(ToolingInfo.SYNCHRONIZE_EVENTS.DOCUMENT_CHANGED, params);
    }

    // didSaveTextDocument
    public notifyTextDocumentSave(params) {
        this._notify(ToolingInfo.SYNCHRONIZE_EVENTS.DOCUMENT_SAVED, params);
    }

    /**
     * Custom messages
     */

    // customNotification
    public sendCustomNotification(params) {
        this._notify(ToolingInfo.LANGUAGE_SERVICE.CUSTOM_NOTIFICATION, params);
    }

    public onCustomNotification(type, handler) {
        this._addOnNotificationHandler(type, handler);
    }

    // customRequest
    public sendCustomRequest(params) {
        return this._request(ToolingInfo.LANGUAGE_SERVICE.CUSTOM_REQUEST, params);
    }

    public onCustomRequest(type, handler) {
        this._addOnRequestHandler(type, handler);
    }

    // Handling Brackets Events
    public addOnEditorChangeHandler(handler) {
        if (validateHandler(handler)) {
            this._onEventHandlers.activeEditorChange.push(handler);
        }
    }

    public addOnProjectOpenHandler(handler) {
        if (validateHandler(handler)) {
            this._onEventHandlers.projectOpen.push(handler);
        }
    }

    public addBeforeProjectCloseHandler(handler) {
        if (validateHandler(handler)) {
            this._onEventHandlers.beforeProjectClose.push(handler);
        }
    }

    public addOnDocumentDirtyFlagChangeHandler(handler) {
        if (validateHandler(handler)) {
            this._onEventHandlers.dirtyFlagChange.push(handler);
        }
    }

    public addOnDocumentChangeHandler(handler) {
        if (validateHandler(handler)) {
            this._onEventHandlers.documentChange.push(handler);
        }
    }

    public addOnFileRenameHandler(handler) {
        if (validateHandler(handler)) {
            this._onEventHandlers.fileNameChange.push(handler);
        }
    }

    public addBeforeAppClose(handler) {
        if (validateHandler(handler)) {
            this._onEventHandlers.beforeAppClose.push(handler);
        }
    }

    public addOnCustomEventHandler(eventName, handler) {
        if (validateHandler(handler)) {
            if (!this._onEventHandlers[eventName]) {
                this._onEventHandlers[eventName] = [];
            }
            this._onEventHandlers[eventName].push(handler);
        }
    }

    public triggerEvent(event) {
        const eventName = event.type;
        const eventArgs = arguments;

        if (this._onEventHandlers[eventName] && Array.isArray(this._onEventHandlers[eventName])) {
            const handlers = this._onEventHandlers[eventName];

            handlers.forEach(function (handler) {
                if (validateHandler(handler)) {
                    handler.apply(null, eventArgs);
                }
            });
        }
    }

    public getDynamicCapabilities() {
        return this._dynamicCapabilities;
    }

    public getServerCapabilities() {
        return this._serverCapabilities;
    }

    public setServerCapabilities(serverCapabilities) {
        this._serverCapabilities = serverCapabilities;
    }
}

function logAnalyticsData(typeStrKey) {
    const editor =  require("editor/EditorManager").getActiveEditor();
    const document = editor ? editor.document : null;
    const language = document ? document.language : null;
    const languageName = language ? language._name : "";
    const HealthLogger = require("utils/HealthLogger");
    const typeStr = HealthLogger.commonStrings[typeStrKey] || "";

    HealthLogger.sendAnalyticsData(
        HealthLogger.commonStrings.USAGE + HealthLogger.commonStrings.LANGUAGE_SERVER_PROTOCOL + typeStr + languageName,
        HealthLogger.commonStrings.USAGE,
        HealthLogger.commonStrings.LANGUAGE_SERVER_PROTOCOL,
        typeStr,
        languageName.toLowerCase()
    );
}
