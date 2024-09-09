import * as WebSocket from "ws";
import { errToMessage, errToString, getLogger } from "../utils";

export interface DomainDescription {
    domain: string;
    version: { major: number; minor: number } | null;
    commands: { [commandName: string]: DomainCommand };
    events: { [eventName: string]: DomainEvent };
}

export interface DomainModule {
    init: (domainManager: typeof DomainManager) => void;
}

export interface DomainCommand {
    commandFunction: (...args: Array<any>) => any;
    isAsync: boolean;
    description: string;
    parameters: Array<DomainCommandArgument>;
    returns: Array<DomainCommandArgument>;
}

export interface DomainEvent {
    parameters: Array<DomainCommandArgument>;
}

export interface DomainCommandArgument {
    name: string;
    type: string;
    description?: string;
}

/**
 * @private
 * @type {object}
 * Map of all the registered domains
 */
const _domains: { [domainName: string]: DomainDescription } = {};

/**
 * @private
 * @type {Array.<Module>}
 * Array of all modules we have loaded. Used for avoiding duplicate loading.
 */
const _initializedDomainModules: Array<DomainModule> = [];

/**
 * @private
 * @type {number}
 * Used for generating unique IDs for events.
 */
let _eventCount = 1;

/**
 * @constructor
 * DomainManager is a module/class that handles the loading, registration,
 * and execution of all commands and events. It is a singleton, and is passed
 * to a domain in its init() method.
 */
export const DomainManager = {
    /**
     * Returns whether a domain with the specified name exists or not.
     * @param {string} domainName The domain name.
     * @return {boolean} Whether the domain exists
     */
    hasDomain: function hasDomain(domainName: string): boolean {
        return !!_domains[domainName];
    },

    /**
     * Returns a new empty domain. Throws error if the domain already exists.
     * @param {string} domainName The domain name.
     * @param {{major: number, minor: number}} version The domain version.
     *   The version has a format like {major: 1, minor: 2}. It is reported
     *   in the API spec, but serves no other purpose on the server. The client
     *   can make use of this.
     */
    registerDomain: function registerDomain(
        domainName: string,
        version: { major: number; minor: number } | null
    ): void {
        if (!this.hasDomain(domainName)) {
            _domains[domainName] = {
                domain: domainName,
                version,
                commands: {},
                events: {},
            };
        } else {
            console.error("[DomainManager] Domain " + domainName + " already registered");
        }
    },

    /**
     * Registers a new command with the specified domain. If the domain does
     * not yet exist, it registers the domain with a null version.
     * @param {string} domainName The domain name.
     * @param {string} commandName The command name.
     * @param {Function} commandFunction The callback handler for the function.
     *    The function is called with the arguments specified by the client in the
     *    command message. Additionally, if the command is asynchronous (isAsync
     *    parameter is true), the function is called with an automatically-
     *    constructed callback function of the form cb(err, result). The function
     *    can then use this to send a response to the client asynchronously.
     * @param {boolean} isAsync See explanation for commandFunction param
     * @param {?string} description Used in the API documentation
     * @param {?Array.<{name: string, type: string, description:string}>} parameters
     *    Used in the API documentation.
     * @param {?Array.<{name: string, type: string, description:string}>} returns
     *    Used in the API documentation.
     */
    registerCommand: function registerCommand(
        domainName: string,
        commandName: string,
        commandFunction: (...args: Array<any>) => any,
        isAsync: boolean,
        description: string,
        parameters: Array<DomainCommandArgument>,
        returns: Array<DomainCommandArgument>
    ): void {
        if (!this.hasDomain(domainName)) {
            this.registerDomain(domainName, null);
        }

        if (!_domains[domainName].commands[commandName]) {
            _domains[domainName].commands[commandName] = {
                commandFunction,
                isAsync,
                description,
                parameters,
                returns,
            };
        } else {
            throw new Error("Command " + domainName + "." + commandName + " already registered");
        }
    },

    /**
     * Executes a command by domain name and command name. Called by a connection's
     * message parser. Sends response or error (possibly asynchronously) to the
     * connection.
     * @param {Connection} connection The requesting connection object.
     * @param {number} id The unique command ID.
     * @param {string} domainName The domain name.
     * @param {string} commandName The command name.
     * @param {Array} parameters The parameters to pass to the command function. If
     *    the command is asynchronous, will be augmented with a callback function.
     *    (see description in registerCommand documentation)
     */
    executeCommand: function executeCommand(
        connection: Connection,
        id: number,
        domainName: string,
        commandName: string,
        parameters: Array<any> = []
    ): void {
        if (_domains[domainName] && _domains[domainName].commands[commandName]) {
            const command = _domains[domainName].commands[commandName];
            if (command.isAsync) {
                const callback = function (err: Error, result: any): void {
                    if (err) {
                        connection.sendCommandError(id, errToMessage(err), errToString(err));
                    } else {
                        connection.sendCommandResponse(id, result);
                    }
                };
                parameters.push(callback);
                command.commandFunction.apply(connection, parameters);
            } else {
                // synchronous command
                try {
                    connection.sendCommandResponse(
                        id,
                        command.commandFunction.apply(connection, parameters)
                    );
                } catch (err) {
                    connection.sendCommandError(id, errToMessage(err), errToString(err));
                }
            }
        } else {
            connection.sendCommandError(id, "no such command: " + domainName + "." + commandName);
        }
    },

    /**
     * Registers an event domain and name.
     * @param {string} domainName The domain name.
     * @param {string} eventName The event name.
     * @param {?Array.<{name: string, type: string, description:string}>} parameters
     *    Used in the API documentation.
     */
    registerEvent: function registerEvent(
        domainName: string,
        eventName: string,
        parameters: Array<DomainCommandArgument>
    ): void {
        if (!this.hasDomain(domainName)) {
            this.registerDomain(domainName, null);
        }

        if (!_domains[domainName].events[eventName]) {
            _domains[domainName].events[eventName] = {
                parameters,
            };
        } else {
            console.error(
                "[DomainManager] Event " + domainName + "." + eventName + " already registered"
            );
        }
    },

    /**
     * Emits an event with the specified name and parameters to all connections.
     *
     * TODO: Future: Potentially allow individual connections to register
     * for which events they want to receive. Right now, we have so few events
     * that it's fine to just send all events to everyone and decide on the
     * client side if the client wants to handle them.
     *
     * @param {string} domainName The domain name.
     * @param {string} eventName The event name.
     * @param {?Array} parameters The parameters. Must be JSON.stringify-able
     */
    emitEvent: function emitEvent(
        domainName: string,
        eventName: string,
        parameters?: Array<any>
    ): void {
        if (_domains[domainName] && _domains[domainName].events[eventName]) {
            ConnectionManager.sendEventToAllConnections(
                _eventCount++,
                domainName,
                eventName,
                parameters
            );
        } else {
            console.error("[DomainManager] No such event: " + domainName + "." + eventName);
        }
    },

    /**
     * Loads and initializes domain modules using the specified paths. Checks to
     * make sure that a module is not loaded/initialized more than once.
     *
     * @param {Array.<string>} paths The paths to load. The paths can be relative
     *    to the DomainManager or absolute. However, modules that aren't in core
     *    won't know where the DomainManager module is, so in general, all paths
     *    should be absolute.
     * @return {boolean} Whether loading succeded. (Failure will throw an exception).
     */
    loadDomainModulesFromPaths: function loadDomainModulesFromPaths(paths: Array<string>): boolean {
        paths.forEach((path) => {
            const m = require(/* webpackIgnore: true */ path);
            if (m && m.init) {
                if (_initializedDomainModules.indexOf(m) < 0) {
                    m.init(this);
                    _initializedDomainModules.push(m); // don't init more than once
                }
            } else {
                throw new Error(`domain at ${path} didn't return an object with 'init' property`);
            }
        });
        return true; // if we fail, an exception will be thrown
    },

    /**
     * Returns a description of all registered domains in the format of WebKit's
     * Inspector.json. Used for sending API documentation to clients.
     *
     * @return {Array} Array describing all domains.
     */
    getDomainDescriptions: function getDomainDescriptions(): void {
        return JSON.parse(JSON.stringify(_domains));
    },
};

// Connection manager.
// Originally in its own file, but moved here to avoid a circular dependency.

export interface ConnectionMessage {
    id: number;
    domain: string;
    command?: string;
    event?: string;
    parameters?: Array<any>;
}

export interface ConnectionErrorMessage {
    message: string;
}

export interface CommandResponse {
    id: number;
    response: any;
}

export interface CommandError {
    id: number;
    message: string;
    stack: string;
}

const log = getLogger("connection-manager");

/**
 * @private
 * @type{Array.<Connection>}
 * Currently active connections
 */
const _connections: Array<Connection> = [];

class Connection {
    /**
     * @private
     * @type {WebSocket}
     * The connection's WebSocket
     */
    private _ws: WebSocket | null = null;

    /**
     * @private
     * @type {boolean}
     * Whether the connection is connected.
     */
    private _connected: boolean = false;

    /**
     * @private
     * @constructor
     * A WebSocket connection to a client. This is a private constructor.
     * Callers should use the ConnectionManager.createConnection function
     * instead.
     * @param {WebSocket} ws The WebSocket representing the client
     */
    constructor(ws: WebSocket) {
        this._ws = ws;
        this._connected = true;
        this._ws.on("message", this._receive.bind(this));
        this._ws.on("close", this.close.bind(this));
    }

    /**
     * @private
     * Sends a message over the WebSocket. Called by public sendX commands.
     * @param {string} type Message type. Currently supported types are
     *                 "event", "commandResponse", "commandError", "error"
     * @param {object} message Message body, must be JSON.stringify-able
     */
    private _send(
        type: string,
        message: ConnectionMessage | ConnectionErrorMessage | CommandResponse | CommandError
    ): void {
        if (this._ws && this._connected) {
            try {
                this._ws.send(JSON.stringify({ type, message }));
            } catch (e) {
                console.error("[Connection] Unable to stringify message: " + e.message);
            }
        }
    }

    /**
     * @private
     * Sends a binary message over the WebSocket. Implicitly interpreted as a
     * message of type "commandResponse".
     * @param {Buffer} message
     */
    private _sendBinary(message: Buffer): void {
        if (this._ws && this._connected) {
            this._ws.send(message, { binary: true, mask: false });
        }
    }

    /**
     * @private
     * Receive event handler for the WebSocket. Responsible for parsing
     * message and handing it off to the appropriate handler.
     * @param {string} message Message received by WebSocket
     */
    private _receive(message: string): void {
        let m: ConnectionMessage;
        try {
            m = JSON.parse(message);
        } catch (ignoreErr) {
            // try again with potentially missing `}`, this should be fixed when we get rid of websockets
            try {
                m = JSON.parse(message + "}");
            } catch (err) {
                log.error(`Error parsing message json: ${err.name}: ${err.message}`);
                this.sendError("Unable to parse message: " + message);
                return;
            }
        }

        const validId = m.id !== null && m.id !== undefined;
        const hasDomain = !!m.domain;
        const hasCommand = typeof m.command === "string";

        if (validId && hasDomain && hasCommand) {
            // okay if m.parameters is null/undefined
            try {
                DomainManager.executeCommand(
                    this,
                    m.id,
                    m.domain,
                    m.command as string,
                    m.parameters
                );
            } catch (executionError) {
                this.sendCommandError(
                    m.id,
                    errToMessage(executionError),
                    errToString(executionError)
                );
            }
        } else {
            this.sendError(
                `Malformed message (${validId}, ${hasDomain}, ${hasCommand}): ${message}`
            );
        }
    }

    /**
     * Closes the connection and does necessary cleanup
     */
    public close(): void {
        if (this._ws) {
            try {
                this._ws.close();
            } catch (err) {
                // ignore
            }
        }
        this._connected = false;
        _connections.splice(_connections.indexOf(this), 1);
    }

    /**
     * Sends an Error message
     * @param {object} message Error message. Must be JSON.stringify-able.
     */
    public sendError(message: string): void {
        this._send("error", { message });
    }

    /**
     * Sends a response to a command execution
     * @param {number} id unique ID of the command that was executed. ID is
     *    generated by the client when the command is issued.
     * @param {object|Buffer} response Result of the command execution. Must
     *    either be JSON.stringify-able or a raw Buffer. In the latter case,
     *    the result will be sent as a binary response.
     */
    public sendCommandResponse(id: number, response: Object | Buffer): void {
        if (Buffer.isBuffer(response)) {
            // Assume the id is an unsigned 32-bit integer, which is encoded
            // as a four-byte header
            const header = new Buffer(4);

            header.writeUInt32LE(id, 0);

            // Prepend the header to the message
            const message = Buffer.concat([header, response], response.length + 4);

            this._sendBinary(message);
        } else {
            this._send("commandResponse", { id, response });
        }
    }

    /**
     * Sends a response indicating that an error occurred during command
     * execution
     * @param {number} id unique ID of the command that was executed. ID is
     *    generated by the client when the command is issued.
     * @param {string} message Error message
     * @param {?object} stack Call stack from the exception, if possible. Must
     *    be JSON.stringify-able.
     */
    public sendCommandError(id: number, message: string, stack?: string): void {
        this._send("commandError", { id, message, stack });
    }

    /**
     * Sends an event message
     * @param {number} id unique ID for the event.
     * @param {string} domain Domain of the event.
     * @param {string} event Name of the event
     * @param {object} parameters Event parameters. Must be JSON.stringify-able.
     */
    public sendEventMessage(
        id: number,
        domain: string,
        event: string,
        parameters?: Array<any>
    ): void {
        this._send("event", { id, domain, event, parameters });
    }
}

export const ConnectionManager = {
    /**
     * Factory function for creating a new Connection
     * @param {WebSocket} ws The WebSocket connected to the client.
     */
    createConnection: function createConnection(ws: WebSocket): void {
        _connections.push(new Connection(ws));
    },

    /**
     * Closes all connections gracefully. Should be called during shutdown.
     */
    closeAllConnections: function closeAllConnections(): void {
        while (_connections.length > 0) {
            const conn = _connections.shift();
            if (conn) {
                try {
                    conn.close();
                } catch (err) {
                    // ignore
                }
            }
        }
    },

    /**
     * Sends all open connections the specified event
     * @param {number} id unique ID for the event.
     * @param {string} domain Domain of the event.
     * @param {string} event Name of the event
     * @param {object} parameters Event parameters. Must be JSON.stringify-able.
     */
    sendEventToAllConnections: function sendEventToAllConnections(
        id: number,
        domain: string,
        event: string,
        parameters?: Array<any>
    ): void {
        _connections.forEach(function (c) {
            c.sendEventMessage(id, domain, event, parameters);
        });
    },
};
