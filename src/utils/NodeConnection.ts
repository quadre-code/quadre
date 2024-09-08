/*
 * Copyright (c) 2013 - 2017 Adobe Systems Incorporated. All rights reserved.
 * Copyright (c) 2018 - present The quadre code authors. All rights reserved.
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

import * as EventDispatcher from "utils/EventDispatcher";

import * as cp from "child_process";
import { NodeConnectionRequestMessage, NodeConnectionResponseMessage } from "../types/NodeConnectionMessages";
import { NodeConnectionInterfaceSpec, NodeConnectionDomainSpec } from "../types/NodeConnectionInterfaceSpec";

const fork            = node.require("child_process").fork;
const getLogger       = node.require("./utils").getLogger;
const log             = getLogger("NodeConnection");

const SHELL_TYPE: "websocket" | "process" = appshell.shell.type;

/**
 * Connection attempts to make before failing
 * @type {number}
 */
const CONNECTION_ATTEMPTS = 10;

/**
 * Milliseconds to wait before a particular connection attempt is considered failed.
 * NOTE: It's okay for the connection timeout to be long because the
 * expected behavior of WebSockets is to send a "close" event as soon
 * as they realize they can't connect. So, we should rarely hit the
 * connection timeout even if we try to connect to a port that isn't open.
 * @type {number}
 */
const CONNECTION_TIMEOUT  = 10000; // 10 seconds

/**
 * Milliseconds to wait before retrying connecting
 * @type {number}
 */
const RETRY_DELAY         = 500;   // 1/2 second

/**
 * Maximum value of the command ID counter
 * @type  {number}
 */
const MAX_COUNTER_VALUE = 4294967295; // 2^32 - 1

/**
 * @private
 * Helper function to auto-reject a deferred after a given amount of time.
 * If the deferred is resolved/rejected manually, then the timeout is
 * automatically cleared.
 */
function setDeferredTimeout<T>(deferred: JQueryDeferred<T>, delay = CONNECTION_TIMEOUT): void {
    const timer = setTimeout(function () {
        deferred.reject("timeout");
    }, delay);
    deferred.always(function () { clearTimeout(timer); });
}

/**
 * @private
 * Helper function to attempt a single connection to the node server
 */
function attemptSingleConnect(): JQueryPromise<any> {
    const deferred = $.Deferred<any>();
    let port = null;
    let ws: WebSocket;
    setDeferredTimeout(deferred, CONNECTION_TIMEOUT);

    brackets.app.getNodeState(function (err, nodePort) {
        if (!err && nodePort && deferred.state() !== "rejected") {
            port = nodePort;
            ws = new WebSocket("ws://localhost:" + port);

            // Expect ArrayBuffer objects from Node when receiving binary
            // data instead of DOM Blobs, which are the default.
            ws.binaryType = "arraybuffer";

            // If the server port isn't open, we get a close event
            // at some point in the future (and will not get an onopen
            // event)
            ws.onclose = function (): void {
                deferred.reject("WebSocket closed");
            };

            ws.onopen = function (): void {
                // If we successfully opened, remove the old onclose
                // handler (which was present to detect failure to
                // connect at all).
                ws.onclose = null;
                deferred.resolveWith(null, [ws, port] as Array<any>);
            };
        } else {
            deferred.reject("brackets.app.getNodeState error: " + err);
        }
    });

    return deferred.promise();
}

function waitFor(condition: Function, delay = CONNECTION_TIMEOUT): JQueryPromise<void> {
    const deferred = $.Deferred<void>();
    setDeferredTimeout(deferred, delay);
    // periodically check condition
    function doCheck(): JQueryDeferred<void> | NodeJS.Timeout {
        return condition() ? deferred.resolve() : setTimeout(doCheck, 10);
    }
    doCheck();
    return deferred.promise();
}

interface NodeDomain {
    base?: any;
}

interface NodeEvent {
    [eventKey: string]: any;
}

interface NodeDomainEvent {
    [domainKey: string]: NodeEvent;
}

/**
 * Provides an interface for interacting with the node server.
 * @constructor
 */
class NodeConnection extends EventDispatcher.EventDispatcherBase {
    /**
     * @type {Object}
     * Exposes the domains registered with the server. This object will
     * have a property for each registered domain. Each of those properties
     * will be an object containing properties for all the commands in that
     * domain. So, myConnection.base.enableDebugger would point to the function
     * to call to enable the debugger.
     *
     * This object is automatically replaced every time the API changes (based
     * on the base:newDomains event from the server). Therefore, code that
     * uses this object should not keep their own pointer to the domain property.
     */
    public domains: NodeDomain;

    public domainEvents: NodeDomainEvent;

    /**
     * @private
     * @type {Array.<string>}
     * List of module pathnames that should be re-registered if there is
     * a disconnection/connection (i.e. if the server died).
     */
    private _registeredModules: Array<any>;

    /**
     * @private
     * @type {WebSocket}
     * The connection to the server
     */
    private _ws: WebSocket | null = null;

    /**
     * @private
     * @type {?number}
     * The port the WebSocket is currently connected to
     */
    private _port: number | null = null;

    /**
     * @private
     * @type {number}
     * Unique ID for commands
     */
    private _commandCount = 1;

    /**
     * @private
     * @type {boolean}
     * Whether to attempt reconnection if connection fails
     */
    private _autoReconnect = false;

    /**
     * @private
     * @type {Array.<jQuery.Deferred>}
     * List of deferred objects that should be resolved pending
     * a successful refresh of the API
     */
    private _pendingInterfaceRefreshDeferreds: Array<any>;

    private _name: string;
    private _nodeProcess: cp.ChildProcess | null;

    /**
     * @private
     * @type {Array.<jQuery.Deferred>}
     * Array (indexed on command ID) of deferred objects that should be
     * resolved/rejected with the response of commands.
     */
    private _pendingCommandDeferreds: Array<JQueryDeferred<any>>;

    private _registeredDomains: { [domainPath: string]: {
        loaded: boolean,
        autoReload: boolean
    } };

    constructor() {
        super();

        this.domains = {};
        this.domainEvents = {};
        this._registeredDomains = {};
        this._nodeProcess = null;
        this._registeredModules = [];
        this._pendingInterfaceRefreshDeferreds = [];
        this._pendingCommandDeferreds = [];
        this._name = "";
    }

    /**
     * @private
     * @return {number} The next command ID to use. Always representable as an
     * unsigned 32-bit integer.
     */
    private _getNextCommandID(): number {
        let nextID;

        if (this._commandCount > MAX_COUNTER_VALUE) {
            nextID = this._commandCount = 0;
        } else {
            nextID = this._commandCount++;
        }

        return nextID;
    }

    /**
     * @private
     * Helper function to do cleanup work when a connection fails
     */
    private _cleanup(): void {
        if (SHELL_TYPE !== "process") {
            this._cleanupSocket();
        } else {
            this._cleanupProcess();
        }
    }

    private _cleanupSocket(): void {
        // clear out the domains, since we may get different ones
        // on the next connection
        this.domains = {};

        // shut down the old connection if there is one
        if (this._ws && this._ws.readyState !== WebSocket.CLOSED) {
            try {
                this._ws.close();
            } catch (e) {
                // Do nothing
            }
        }
        const failedDeferreds = this._pendingInterfaceRefreshDeferreds
            .concat(this._pendingCommandDeferreds);
        failedDeferreds.forEach(function (d) {
            d.reject("cleanup");
        });
        this._pendingInterfaceRefreshDeferreds = [];
        this._pendingCommandDeferreds = [];

        this._ws = null;
        this._port = null;
    }

    private _cleanupProcess(): void {
        // shut down the old process if there is one
        if (this._nodeProcess) {
            try {
                this._nodeProcess.kill();
            } finally {
                this._nodeProcess = null;
            }
        }

        // clear out the domains, since we may get different ones
        // on the next connection
        this.domains = {};

        // reject all the commands that are to be resolved
        this._pendingCommandDeferreds.forEach((d) => d.reject("cleanup"));
        this._pendingCommandDeferreds = [];

        // need to call _refreshName because this.domains has been modified
        this._refreshName();
    }

    public getName(): string {
        return this._name;
    }

    /**
     * Connect to the node server. After connecting, the NodeConnection
     * object will trigger a "close" event when the underlying socket
     * is closed. If the connection is set to autoReconnect, then the
     * event will also include a jQuery promise for the connection.
     *
     * @param {boolean} autoReconnect Whether to automatically try to
     *    reconnect to the server if the connection succeeds and then
     *    later disconnects. Note if this connection fails initially, the
     *    autoReconnect flag is set to false. Future calls to connect()
     *    can reset it to true
     * @return {jQuery.Promise} Promise that resolves/rejects when the
     *    connection succeeds/fails
     */
    public connect(autoReconnect: boolean = false): JQueryPromise<void> {
        if (SHELL_TYPE !== "process") {
            return this._connectSocket(autoReconnect);
        }

        return this._connectProcess(autoReconnect);
    }

    private _connectSocket(autoReconnect: boolean): JQueryPromise<void> {
        const self = this;
        self._autoReconnect = autoReconnect;
        const deferred = $.Deferred<void>();
        let attemptCount = 0;
        let attemptTimestamp: number;

        // Called after a successful connection to do final setup steps
        function registerHandlersAndDomains(ws: WebSocket, port: number): void {
            // Called if we succeed at the final setup
            function success(): void {
                self._ws!.onclose = function (): void {
                    if (self._autoReconnect) {
                        const $promise = self.connect(true);
                        self.trigger("close", $promise);
                    } else {
                        self._cleanup();
                        self.trigger("close");
                    }
                };
                deferred.resolve();
            }
            // Called if we fail at the final setup
            function fail(err: Error): void {
                self._cleanup();
                deferred.reject(err);
            }

            self._ws = ws;
            self._port = port;
            self._ws!.onmessage = self._receive.bind(self);

            // refresh the current domains, then re-register any
            // "autoregister" modules
            self._refreshInterface().then(
                function () {
                    if (self._registeredModules.length > 0) {
                        self.loadDomains(self._registeredModules, false).then(
                            success,
                            fail
                        );
                    } else {
                        success();
                    }
                },
                fail
            );
        }

        // Repeatedly tries to connect until we succeed or until we've
        // failed CONNECTION_ATTEMPT times. After each attempt, waits
        // at least RETRY_DELAY before trying again.
        function doConnect(): void {
            attemptCount++;
            attemptTimestamp = +new Date();
            attemptSingleConnect().then(
                registerHandlersAndDomains, // succeded
                function () { // failed this attempt, possibly try again
                    if (attemptCount < CONNECTION_ATTEMPTS) { // try again
                        // Calculate how long we should wait before trying again
                        const now = +new Date();
                        const delay = Math.max(
                            RETRY_DELAY - (now - attemptTimestamp),
                            1
                        );
                        setTimeout(doConnect, delay);
                    } else { // too many attempts, give up
                        deferred.reject("Max connection attempts reached");
                    }
                }
            );
        }

        // Start the connection process
        self._cleanup();
        doConnect();

        return deferred.promise();
    }

    public _connectProcess(autoReconnect: boolean): JQueryPromise<void> {
        this._autoReconnect = autoReconnect;
        const deferred = $.Deferred<void>();

        // Start the connection process
        this._cleanup();

        // Fork the process base as a child
        const nodeProcessPath = node.requireResolve("./node-process/base.js");
        this._nodeProcess = fork(nodeProcessPath);
        if (this._nodeProcess === null || this._nodeProcess === undefined) {
            throw new Error(`Unable to fork ${nodeProcessPath}`);
        }
        this._nodeProcess.on("error", (err: Error) => {
            log.error(`[node-process-${this.getName()}] error: ${err.stack}`);
        });
        this._nodeProcess.on("exit", (code: number, signal: string) => {
            log.error(`[node-process-${this.getName()}] exit code: ${code}, signal: ${signal}`);
        });
        this._nodeProcess.on("message", (obj: any) => {

            const _type: string = obj.type;
            switch (_type) {
                case "log":
                    log[obj.level](`[node-process-${this.getName()}]`, obj.msg);
                    break;
                case "receive":
                    this._receive(obj.msg);
                    break;
                case "refreshInterface":
                    this._refreshInterfaceCallback(obj.spec);
                    break;
                default:
                    log.warn(`unhandled message: ${JSON.stringify(obj)}`);
            }

        });

        // Called if we succeed at the final setup
        const success = (): void => {
            if (this._nodeProcess === null || this._nodeProcess === undefined) {
                throw new Error(`Unable to fork ${nodeProcessPath}`);
            }
            this._nodeProcess.on("disconnect", () => {
                this._cleanup();
                if (this._autoReconnect) {
                    (this as any).trigger("close", this.connect(true));
                } else {
                    (this as any).trigger("close", ); // eslint-disable-line
                }
            });
            deferred.resolve();
        };

        // Called if we fail at the final setup
        const fail = (err: Error): void => {
            this._cleanup();
            deferred.reject(err);
        };

        // refresh the current domains, then re-register any "autoregister" modules
        waitFor(() =>
            this.connected() &&
            this.domains.base &&
            typeof this.domains.base.loadDomainModulesFromPaths === "function"
        ).then(() => {
            const toReload = Object.keys(this._registeredDomains)
                .filter((_path) => this._registeredDomains[_path].autoReload === true);
            return toReload.length > 0
                ? this._loadDomains(toReload).then(success, fail)
                : success();
        });

        return deferred.promise();
    }

    /**
     * Determines whether the NodeConnection is currently connected
     * @return {boolean} Whether the NodeConnection is connected.
     */
    public connected(): boolean {
        if (SHELL_TYPE !== "process") {
            return !!(this._ws && this._ws.readyState === WebSocket.OPEN);
        }

        return !!(this._nodeProcess && this._nodeProcess.connected);
    }

    /**
     * Explicitly disconnects from the server. Note that even if
     * autoReconnect was set to true at connection time, the connection
     * will not reconnect after this call. Reconnection can be manually done
     * by calling connect() again.
     */
    public disconnect(): void {
        this._autoReconnect = false;
        this._cleanup();
    }

    /**
     * Load domains into the server by path
     * @param {Array.<string>} List of absolute paths to load
     * @param {boolean} autoReload Whether to auto-reload the domains if the server
     *    fails and restarts. Note that the reload is initiated by the
     *    client, so it will only happen after the client reconnects.
     * @return {jQuery.Promise} Promise that resolves after the load has
     *    succeeded and the new API is availale at NodeConnection.domains,
     *    or that rejects on failure.
     */
    public loadDomains(paths: string | Array<string>, autoReload: boolean): JQueryPromise<void> {
        if (SHELL_TYPE !== "process") {
            return this._loadDomainsSocket(paths as Array<string>, autoReload);
        }

        return this._loadDomainsProcess(paths, autoReload);
    }

    private _loadDomainsSocket(paths: Array<string>, autoReload: boolean): JQueryPromise<void> {
        const deferred = $.Deferred<void>();
        setDeferredTimeout(deferred, CONNECTION_TIMEOUT);
        let pathArray = paths;
        if (!Array.isArray(paths)) {
            pathArray = [paths];
        }

        if (autoReload) {
            Array.prototype.push.apply(this._registeredModules, pathArray);
        }

        if (this.domains.base && this.domains.base.loadDomainModulesFromPaths) {
            this.domains.base.loadDomainModulesFromPaths(pathArray).then(
                function (success) { // command call succeeded
                    if (!success) {
                        // response from commmand call was "false" so we know
                        // the actual load failed.
                        deferred.reject("loadDomainModulesFromPaths failed");
                    }
                    // if the load succeeded, we wait for the API refresh to
                    // resolve the deferred.
                },
                function (reason) { // command call failed
                    deferred.reject("Unable to load one of the modules: " + pathArray + (reason ? ", reason: " + reason : ""));
                }
            );

            this._pendingInterfaceRefreshDeferreds.push(deferred);
        } else {
            deferred.reject("this.domains.base is undefined");
        }

        return deferred.promise();
    }

    private _loadDomainsProcess(paths: string | Array<string>, autoReload: boolean): JQueryPromise<void> {
        const pathArray: Array<string> = Array.isArray(paths) ? paths : [paths];

        pathArray.forEach((_path) => {
            if (this._registeredDomains[_path]) {
                throw new Error(`Domain path already registered: ${_path}`);
            }
            this._registeredDomains[_path] = {
                loaded: false,
                autoReload
            };
        });

        return this._loadDomains(pathArray);
    }

    private _refreshName(): void {
        const domainNames = Object.keys(this.domains);
        if (domainNames.length > 1) {
            // remove "base"
            const io = domainNames.indexOf("base");
            if (io !== -1) { domainNames.splice(io, 1); }
            this._name = domainNames.join(",");
            return;
        }
        if (this._nodeProcess) {
            this._name = this._nodeProcess.pid!.toString();
            return;
        }
        this._name = this._name || "";
    }

    private _loadDomains(pathArray: Array<string>): JQueryPromise<void> {
        const deferred = $.Deferred<void>();
        setDeferredTimeout(deferred, CONNECTION_TIMEOUT);

        if (this.domains.base && this.domains.base.loadDomainModulesFromPaths) {
            this.domains.base.loadDomainModulesFromPaths(pathArray).then(
                function (success: boolean) { // command call succeeded
                    if (!success) {
                        // response from commmand call was "false" so we know
                        // the actual load failed.
                        deferred.reject("loadDomainModulesFromPaths failed");
                    }
                    // if the load succeeded, we wait for the API refresh to
                    // resolve the deferred.
                },
                function (reason: string) { // command call failed
                    deferred.reject("Unable to load one of the modules: " + pathArray + (reason ? ", reason: " + reason : ""));
                }
            );
            waitFor(() => {
                const loadedCount = pathArray
                    .map((_path) => this._registeredDomains[_path].loaded)
                    .filter((x) => x === true)
                    .length;
                return loadedCount === pathArray.length;
            }).then(deferred.resolve);
        } else {
            deferred.reject("this.domains.base is undefined");
        }

        return deferred.promise();
    }

    /**
     * @private
     * Sends a message over the WebSocket. Automatically JSON.stringifys
     * the message if necessary.
     * @param {Object|string} m Object to send. Must be JSON.stringify-able.
     */
    private _send(m: NodeConnectionRequestMessage): void {
        if (SHELL_TYPE !== "process") {
            this._sendSocket(m);
        } else {
            this._sendProcess(m);
        }
    }

    private _sendSocket(m): void {
        if (this.connected()) {

            // Convert the message to a string
            let messageString: string | null = null;
            if (typeof m === "string") {
                messageString = m;
            } else {
                try {
                    messageString = JSON.stringify(m);
                } catch (stringifyError) {
                    console.error("[NodeConnection] Unable to stringify message in order to send: " + stringifyError.message);
                }
            }

            // If we succeded in making a string, try to send it
            if (messageString) {
                try {
                    this._ws!.send(messageString);
                } catch (sendError) {
                    console.error("[NodeConnection] Error sending message: " + sendError.message);
                }
            }
        } else {
            console.error("[NodeConnection] Not connected to node, unable to send.");
        }
    }

    private _sendProcess(m: NodeConnectionRequestMessage): void {
        if (this.connected()) {

            // Convert the message to a string
            let messageString: string | null = null;
            if (typeof m === "string") {
                messageString = m;
            } else {
                try {
                    messageString = JSON.stringify(m);
                } catch (stringifyError) {
                    log.error("Unable to stringify message in order to send: " + stringifyError.message);
                }
            }

            // If we succeded in making a string, try to send it
            if (messageString) {
                try {
                    this._nodeProcess!.send({ type: "message", message: messageString });
                } catch (sendError) {
                    log.error(`Error sending message: ${sendError.message}`);
                }
            }
        } else {
            log.error("Not connected to node, unable to send");
        }
    }

    /**
     * @private
     * Handler for receiving events on the WebSocket. Parses the message
     * and dispatches it appropriately.
     * @param {WebSocket.Message} message Message object from WebSocket
     */
    private _receive(message: MessageEvent | string): void {
        if (SHELL_TYPE !== "process") {
            this._receiveSocket(message as MessageEvent);
        } else {
            this._receiveProcess(message as string);
        }
    }

    private _receiveSocket(message: MessageEvent): void {
        let responseDeferred: JQueryDeferred<any> | null = null;
        const data = message.data;
        let m;

        if (message.data instanceof ArrayBuffer) {
            // The first four bytes encode the command ID as an unsigned 32-bit integer
            if (data.byteLength < 4) {
                console.error("[NodeConnection] received malformed binary message");
                return;
            }

            const header = data.slice(0, 4);
            const body = data.slice(4);
            const headerView = new Uint32Array(header);
            const id = headerView[0];

            // Unpack the binary message into a commandResponse
            m = {
                type: "commandResponse",
                message: {
                    id: id,
                    response: body
                }
            };
        } else {
            try {
                m = JSON.parse(data);
            } catch (e) {
                console.error("[NodeConnection] received malformed message", message, e.message);
                return;
            }
        }

        switch (m.type) {
            case "event":
                if (m.message.domain === "base" && m.message.event === "newDomains") {
                    this._refreshInterface();
                }

                // Event type "domain:event"
                EventDispatcher.triggerWithArray(
                    this, m.message.domain + ":" + m.message.event,
                    m.message.parameters);
                break;
            case "commandResponse":
                responseDeferred = this._pendingCommandDeferreds[m.message.id];
                if (responseDeferred) {
                    responseDeferred.resolveWith(this, [m.message.response]);
                    delete this._pendingCommandDeferreds[m.message.id];
                }
                break;
            case "commandProgress":
                responseDeferred = this._pendingCommandDeferreds[m.message.id];
                if (responseDeferred) {
                    responseDeferred.notifyWith(this, [m.message.message]);
                }
                break;
            case "commandError":
                responseDeferred = this._pendingCommandDeferreds[m.message.id];
                if (responseDeferred) {
                    responseDeferred.rejectWith(
                        this,
                        [m.message.message, m.message.stack]
                    );
                    delete this._pendingCommandDeferreds[m.message.id];
                }
                break;
            case "error":
                console.error("[NodeConnection] received error: " +
                                m.message.message);
                break;
            default:
                console.error("[NodeConnection] unknown event type: " + m.type);
        }
    }

    private _receiveProcess(messageString: string): void {
        let responseDeferred: JQueryDeferred<any> | null = null;
        let ipcMessage: any;

        try {
            ipcMessage = JSON.parse(messageString);
        } catch (err) {
            log.error(`Received malformed message: ${messageString}`, err.message);
            return;
        }

        const message: NodeConnectionResponseMessage = ipcMessage.message;

        switch (ipcMessage.type) {
            case "event":
                if (message.domain === "base" && message.event === "newDomains") {
                    const newDomainPaths: Array<string> = message.parameters;
                    newDomainPaths.forEach((newDomainPath: string) => {
                        this._registeredDomains[newDomainPath].loaded = true;
                    });
                }
                // Event type "domain:event"
                EventDispatcher.triggerWithArray(
                    this, message.domain + ":" + message.event, message.parameters
                );
                break;
            case "commandResponse":
                responseDeferred = this._pendingCommandDeferreds[message.id];
                if (responseDeferred) {
                    responseDeferred.resolveWith(this, [message.response]);
                    delete this._pendingCommandDeferreds[message.id];
                }
                break;
            case "commandProgress":
                responseDeferred = this._pendingCommandDeferreds[message.id];
                if (responseDeferred) {
                    responseDeferred.notifyWith(this, [message.message]);
                }
                break;
            case "commandError":
                responseDeferred = this._pendingCommandDeferreds[message.id];
                if (responseDeferred) {
                    responseDeferred.rejectWith(
                        this,
                        [message.message, message.stack]
                    );
                    delete this._pendingCommandDeferreds[message.id];
                }
                break;
            case "error":
                log.error(`Received error: ${message.message}`);
                break;
            default:
                log.error(`Unknown event type: ${ipcMessage.type}`);
        }
    }

    /**
     * @private
     * Helper function for refreshing the interface in the "domain" property.
     * Automatically called when the connection receives a base:newDomains
     * event from the server, and also called at connection time.
     */
    private _refreshInterface(): JQueryPromise<void> {
        const deferred = $.Deferred<void>();
        const self = this;

        const pendingDeferreds = this._pendingInterfaceRefreshDeferreds;
        this._pendingInterfaceRefreshDeferreds = [];
        deferred.then(
            function () {
                pendingDeferreds.forEach(function (d) { d.resolve(); });
            },
            function (err) {
                pendingDeferreds.forEach(function (d) { d.reject(err); });
            }
        );

        function refreshInterfaceCallback(spec): void {
            function makeCommandFunction(domainName, commandName) {
                return function () {
                    const deferred = $.Deferred();
                    const parameters = Array.prototype.slice.call(arguments, 0);
                    const id = self._getNextCommandID();
                    self._pendingCommandDeferreds[id] = deferred;
                    self._send({
                        id: id,
                        domain: domainName,
                        command: commandName,
                        parameters: parameters
                    });
                    return deferred;
                };
            }

            // TODO: Don't replace the domain object every time. Instead, merge.
            self.domains = {};
            self.domainEvents = {};
            Object.keys(spec).forEach(function (domainKey) {
                const domainSpec = spec[domainKey];
                self.domains[domainKey] = {};
                Object.keys(domainSpec.commands).forEach(function (commandKey) {
                    self.domains[domainKey][commandKey] = makeCommandFunction(domainKey, commandKey);
                });
                self.domainEvents[domainKey] = {};
                Object.keys(domainSpec.events).forEach(function (eventKey) {
                    const eventSpec = domainSpec.events[eventKey];
                    const parameters = eventSpec.parameters;
                    self.domainEvents[domainKey][eventKey] = parameters;
                });
            });
            deferred.resolve();
        }

        if (this.connected()) {
            $.getJSON("http://localhost:" + this._port + "/api")
                .done(refreshInterfaceCallback)
                .fail(function (err) { deferred.reject(err); });
        } else {
            deferred.reject("Attempted to call _refreshInterface when not connected.");
        }

        return deferred.promise();
    }

    private _refreshInterfaceCallback(spec: NodeConnectionInterfaceSpec): void {
        const self = this;
        function makeCommandFunction(domain: string, command: string) {
            return function (): JQueryDeferred<void> {
                const deferred = $.Deferred<void>();
                const parameters = Array.prototype.slice.call(arguments, 0);
                const id = self._getNextCommandID();
                self._pendingCommandDeferreds[id] = deferred;
                self._send({
                    id,
                    domain,
                    command,
                    parameters
                });
                return deferred;
            };
        }
        this.domains = {};
        this.domainEvents = {};
        Object.keys(spec).forEach(function (domainKey) {
            const domainSpec: NodeConnectionDomainSpec = spec[domainKey];
            self.domains[domainKey] = {};
            Object.keys(domainSpec.commands).forEach(function (commandKey) {
                self.domains[domainKey][commandKey] = makeCommandFunction(domainKey, commandKey);
            });
            self.domainEvents[domainKey] = {};
            Object.keys(domainSpec.events).forEach(function (eventKey) {
                const eventSpec = domainSpec.events[eventKey];
                const parameters = eventSpec.parameters;
                self.domainEvents[domainKey][eventKey] = parameters;
            });
        });
        // need to call _refreshName because this.domains has been modified
        this._refreshName();
    }

    /**
     * @private
     * Get the default timeout value.
     * @return {number} Timeout value in milliseconds
     */
    public static _getConnectionTimeout(): number {
        return CONNECTION_TIMEOUT;
    }
}

export = NodeConnection;
