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

import type { LanguageToolsPrefs } from "languageTools/LanguageTools";

import NodeDomain = require("utils/NodeDomain");
import * as FileUtils from "file/FileUtils";
import * as EventDispatcher from "utils/EventDispatcher";
import { BracketsToNodeInterface } from "languageTools/BracketsToNodeInterface";
import * as toolingInfoJson from "text!languageTools/ToolingInfo.json";
const ToolingInfo = JSON.parse(toolingInfoJson);

interface PendingClient {
    load(): void;
}

interface LanguageClient {
    name: string;
    interface: BracketsToNodeInterface;
}

EventDispatcher.makeEventDispatcher(exports);
// Register paths required for Language Client and also register default brackets capabilities.
let _bracketsPath = FileUtils.getNativeBracketsDirectoryPath();
// The native directory path ends with either "test" or "src".
_bracketsPath = _bracketsPath.replace(/\/test$/, "/www"); // convert from "test" to "www"

const _modulePath = FileUtils.getNativeModuleDirectoryPath(module);
const _nodePath = "node/RegisterLanguageClientInfo";
const _domainPath = [_bracketsPath, _modulePath, _nodePath].join("/");
let clientInfoDomain: NodeDomain | null = null;
let clientInfoLoadedPromise: JQueryPromise<any> | null = null;
// Clients that have to be loaded once the LanguageClient info is successfully loaded on the
// node side.
let pendingClientsToBeLoaded: Array<PendingClient> | null = [];

export function syncPrefsWithDomain(languageToolsPrefs: LanguageToolsPrefs): void {
    if (clientInfoDomain) {
        clientInfoDomain.exec("syncPreferences", languageToolsPrefs);
    }
}

function _createNodeDomain(domainName: string, domainPath: string): NodeDomain {
    return new NodeDomain(domainName, domainPath);
}

function loadLanguageClientDomain(clientName: string, domainPath: string): JQueryDeferred<NodeDomain> {
    // generate a random hash name for the domain, this is the client id
    const domainName = clientName;
    const result = $.Deferred<NodeDomain>();
    const languageClientDomain = _createNodeDomain(domainName, domainPath);

    if (languageClientDomain) {
        languageClientDomain.promise()
            .done(function () {
                console.log(domainPath + " domain successfully created");
                result.resolve(languageClientDomain);
            })
            .fail(function (err) {
                console.error(domainPath + " domain could not be created.");
                result.reject();
            });
    } else {
        console.error(domainPath + " domain could not be created.");
        result.reject();
    }

    return result;
}

function createNodeInterfaceForDomain(languageClientDomain: NodeDomain): BracketsToNodeInterface {
    const nodeInterface = new BracketsToNodeInterface(languageClientDomain);

    return nodeInterface;
}

function _clientLoader(clientName: string, clientFilePath: string, clientPromise: JQueryDeferred<LanguageClient>): void {
    loadLanguageClientDomain(clientName, clientFilePath)
        .then(function (languageClientDomain) {
            const languageClientInterface = createNodeInterfaceForDomain(languageClientDomain!);

            clientPromise.resolve({
                name: clientName,
                interface: languageClientInterface
            });
        }, clientPromise.reject);
}

export function initiateLanguageClient(clientName: string, clientFilePath: string): JQueryDeferred<LanguageClient> {
    const result = $.Deferred<LanguageClient>();

    // Only load clients after the LanguageClient Info has been initialized
    if (!clientInfoLoadedPromise || clientInfoLoadedPromise.state() === "pending") {
        const pendingClient: PendingClient = {
            load: _clientLoader.bind(null, clientName, clientFilePath, result)
        };
        pendingClientsToBeLoaded!.push(pendingClient);
    } else {
        _clientLoader(clientName, clientFilePath, result);
    }

    return result;
}

/**
 * This function passes Brackets's native directory path as well as the tooling commands
 * required by the LanguageClient node module. This information is then maintained in memory
 * in the node process server for succesfully loading and functioning of all language clients
 * since it is a direct dependency.
 */
function sendLanguageClientInfo(): void {
    // Init node with Information required by Language Client
    clientInfoLoadedPromise = clientInfoDomain!.exec("initialize", _bracketsPath, ToolingInfo);

    function logInitializationError(): void {
        console.error("Failed to Initialize LanguageClient Module Information.");
    }

    // Attach success and failure function for the clientInfoLoadedPromise
    clientInfoLoadedPromise.then(function (success) {
        if (!success) {
            logInitializationError();
            return;
        }

        if (Array.isArray(pendingClientsToBeLoaded)) {
            pendingClientsToBeLoaded.forEach(function (pendingClient) {
                pendingClient.load();
            });
        } else {
            exports.trigger("languageClientModuleInitialized");
        }
        pendingClientsToBeLoaded = null;
    }, function () {
        logInitializationError();
    });
}

/**
 * This function starts a domain which initializes the LanguageClient node module
 * required by the Language Server Protocol framework in Brackets. All the LSP clients
 * can only be successfully initiated once this domain has been successfully loaded and
 * the LanguageClient info initialized. Refer to sendLanguageClientInfo for more.
 */
function initDomainAndHandleNodeCrash(): void {
    clientInfoDomain = new NodeDomain("LanguageClientInfo", _domainPath);
    // Initialize LanguageClientInfo once the domain has successfully loaded.
    clientInfoDomain.promise().done(function () {
        sendLanguageClientInfo();
        // This is to handle the node failure. If the node process dies, we get an on close
        // event on the websocket connection object. Brackets then spawns another process and
        // restablishes the connection. Once the connection is restablished we send reinitialize
        // the LanguageClient info.
        clientInfoDomain!.connection.on("close", function (event, reconnectedPromise) {
            reconnectedPromise.done(sendLanguageClientInfo);
        });
    }).fail(function (err) {
        console.error("ClientInfo domain could not be loaded: ", err);
    });
}
initDomainAndHandleNodeCrash();
