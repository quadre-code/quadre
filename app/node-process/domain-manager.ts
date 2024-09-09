export interface DomainDescription {
    domain: string;
    version: { major: number; minor: number };
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

interface DomainMap {
    [domainName: string]: DomainDescription;
}

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

export function errToMessage(err: Error): string {
    let message = err.message;
    if (message && err.name) {
        message = err.name + ": " + message;
    }
    return message ? message : err.toString();
}

export function errToString(err: Error): string {
    if (err.stack) {
        return err.stack;
    }
    if (err.name && err.message) {
        return err.name + ": " + err.message;
    }
    return err.toString();
}

/**
 * @private
 * @type {object}
 * Map of all the registered domains
 */
const _domains: DomainMap = {};

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
export class DomainManager {
    /**
     * Returns whether a domain with the specified name exists or not.
     * @param {string} domainName The domain name.
     * @return {boolean} Whether the domain exists
     */
    public hasDomain(domainName: string): boolean {
        return !!_domains[domainName];
    }

    /**
     * Returns a new empty domain. Throws error if the domain already exists.
     * @param {string} domainName The domain name.
     * @param {{major: number, minor: number}} version The domain version.
     *   The version has a format like {major: 1, minor: 2}. It is reported
     *   in the API spec, but serves no other purpose on the server. The client
     *   can make use of this.
     */
    public registerDomain(domainName: string, version: { major: number; minor: number }): void {
        if (!this.hasDomain(domainName)) {
            _domains[domainName] = {
                domain: domainName,
                version,
                commands: {},
                events: {},
            };
            process.send &&
                process.send({
                    type: "refreshInterface",
                    spec: this.getDomainDescriptions(),
                });
        } else {
            console.error("[DomainManager] Domain " + domainName + " already registered");
        }
    }

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
    public registerCommand(
        domainName: string,
        commandName: string,
        commandFunction: (...args: Array<any>) => any,
        isAsync: boolean,
        description: string,
        parameters: Array<DomainCommandArgument>,
        returns: Array<DomainCommandArgument>
    ): void {
        if (!this.hasDomain(domainName)) {
            throw new Error(`Domain ${domainName} doesn't exist. Call .registerDomain first!`);
        }
        if (!_domains[domainName].commands[commandName]) {
            _domains[domainName].commands[commandName] = {
                commandFunction,
                isAsync,
                description,
                parameters,
                returns,
            };
            process.send &&
                process.send({
                    type: "refreshInterface",
                    spec: this.getDomainDescriptions(),
                });
        } else {
            throw new Error("Command " + domainName + "." + commandName + " already registered");
        }
    }

    /**
     * Executes a command by domain name and command name. Called by a connection's
     * message parser. Sends response or error (possibly asynchronously) to the
     * connection.
     * @param {Connection} connection The requesting connection object.
     * @param {number} id The unique command ID.
     * @param {string} domainName The domain name.
     * @param {string} commandName The command name.
     * @param {Array} parameters The parameters to pass to the command function. If
     *    the command is asynchronous, will be augmented with a callback function
     *    and progressCallback function
     *    (see description in registerCommand documentation)
     */
    public executeCommand(
        id: number,
        domainName: string,
        commandName: string,
        parameters: Array<any> = []
    ): void {
        if (_domains[domainName] && _domains[domainName].commands[commandName]) {
            const command = _domains[domainName].commands[commandName];
            if (command.isAsync) {
                const callback = (err: Error, result: any): void => {
                    if (err) {
                        this.sendCommandError(id, errToMessage(err), errToString(err));
                    } else {
                        this.sendCommandResponse(id, result);
                    }
                };
                const progressCallback = (msg: any): void => {
                    this.sendCommandProgress(id, msg);
                };
                parameters.push(callback, progressCallback);
                command.commandFunction(...parameters);
            } else {
                // synchronous command
                try {
                    this.sendCommandResponse(id, command.commandFunction(...parameters));
                } catch (err) {
                    this.sendCommandError(id, errToMessage(err), errToString(err));
                }
            }
        } else {
            this.sendCommandError(id, "no such command: " + domainName + "." + commandName);
        }
    }

    /**
     * Registers an event domain and name.
     * @param {string} domainName The domain name.
     * @param {string} eventName The event name.
     * @param {?Array.<{name: string, type: string, description:string}>} parameters
     *    Used in the API documentation.
     */
    public registerEvent(
        domainName: string,
        eventName: string,
        parameters: Array<DomainCommandArgument>
    ): void {
        if (!this.hasDomain(domainName)) {
            throw new Error(`Domain ${domainName} doesn't exist. Call .registerDomain first!`);
        }
        if (!_domains[domainName].events[eventName]) {
            _domains[domainName].events[eventName] = {
                parameters,
            };
            process.send &&
                process.send({
                    type: "refreshInterface",
                    spec: this.getDomainDescriptions(),
                });
        } else {
            throw new Error(
                "[DomainManager] Event " + domainName + "." + eventName + " already registered"
            );
        }
    }

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
    public emitEvent(domainName: string, eventName: string, parameters?: Array<any>): void {
        if (_domains[domainName] && _domains[domainName].events[eventName]) {
            this.sendEventMessage(_eventCount++, domainName, eventName, parameters);
        } else {
            console.error("[DomainManager] No such event: " + domainName + "." + eventName);
        }
    }

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
    public loadDomainModulesFromPaths(paths: Array<string>, notify: boolean = true): boolean {
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
        if (notify) {
            this.emitEvent("base", "newDomains", paths);
        }
        return true; // if we fail, an exception will be thrown
    }

    public getDomainDescriptions(): DomainMap {
        return _domains;
    }

    public close(): void {
        process.exit(0);
    }

    public sendError(message: string): void {
        this._send("error", { message });
    }

    public sendCommandResponse(id: number, response: Object | Buffer): void {
        if (Buffer.isBuffer(response)) {
            // Assume the id is an unsigned 32-bit integer, which is encoded as a four-byte header
            const header = new Buffer(4);
            header.writeUInt32LE(id, 0);
            // Prepend the header to the message
            const message = Buffer.concat([header, response], response.length + 4);
            this._sendBinary(message);
        } else {
            this._send("commandResponse", { id, response });
        }
    }

    public sendCommandProgress(id: number, message: any): void {
        this._send("commandProgress", { id, message });
    }

    public sendCommandError(id: number, message: string, stack?: string): void {
        this._send("commandError", { id, message, stack });
    }

    public sendEventMessage(
        id: number,
        domain: string,
        event: string,
        parameters?: Array<any>
    ): void {
        this._send("event", { id, domain, event, parameters });
    }

    public _receive(message: string): void {
        let m: ConnectionMessage;
        try {
            m = JSON.parse(message);
        } catch (err) {
            console.error(
                `[DomainManager] Error parsing message json -> ${err.name}: ${err.message}`
            );
            this.sendError(`Unable to parse message: ${message}`);
            return;
        }

        const validId = m.id !== null && m.id !== undefined;
        const hasDomain = !!m.domain;
        const hasCommand = typeof m.command === "string";

        if (validId && hasDomain && hasCommand) {
            // okay if m.parameters is null/undefined
            try {
                this.executeCommand(m.id, m.domain, m.command as string, m.parameters);
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

    public _send(
        type: string,
        message: ConnectionMessage | ConnectionErrorMessage | CommandResponse | CommandError
    ): void {
        try {
            process.send &&
                process.send({
                    type: "receive",
                    msg: JSON.stringify({ type, message }),
                });
        } catch (e) {
            console.error(`[DomainManager] Unable to stringify message: ${e.message}`);
        }
    }

    public _sendBinary(message: Buffer): void {
        process.send &&
            process.send({
                type: "receive",
                msg: message,
                options: { binary: true, mask: false },
            });
    }
}

const dm = new DomainManager();
export default dm;
