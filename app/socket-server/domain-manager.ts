import * as ConnectionManager from "./connection-manager";
import { errToMessage, errToString } from "../utils";

export interface DomainDescription {
    domain: string;
    version: { major: number, minor: number } | null;
    commands: { [commandName: string]: DomainCommand };
    events: { [eventName: string]: DomainEvent };
}

export interface DomainModule {
    init: (domainManager: typeof DomainManager) => void;
}

export interface DomainCommand {
    commandFunction: (...args: any[]) => any;
    isAsync: boolean;
    description: string;
    parameters: DomainCommandArgument[];
    returns: DomainCommandArgument[];
}

export interface DomainEvent {
    parameters: DomainCommandArgument[];
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
const _initializedDomainModules: DomainModule[] = [];

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
    registerDomain: function registerDomain(domainName: string, version: { major: number, minor: number } | null) {
        if (!this.hasDomain(domainName)) {
            _domains[domainName] = {
                domain: domainName,
                version,
                commands: {},
                events: {}
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
        commandFunction: (...args: any[]) => any,
        isAsync: boolean,
        description: string,
        parameters: DomainCommandArgument[],
        returns: DomainCommandArgument[]
    ) {
        if (!this.hasDomain(domainName)) {
            this.registerDomain(domainName, null);
        }

        if (!_domains[domainName].commands[commandName]) {
            _domains[domainName].commands[commandName] = {
                commandFunction,
                isAsync,
                description,
                parameters,
                returns
            };
        } else {
            throw new Error("Command " + domainName + "." +
                commandName + " already registered");
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
        connection: ConnectionManager.Connection,
        id: number,
        domainName: string,
        commandName: string,
        parameters: any[] = []
    ) {
        if (_domains[domainName] &&
                _domains[domainName].commands[commandName]) {
            const command = _domains[domainName].commands[commandName];
            if (command.isAsync) {
                const callback = function (err: Error, result: any) {
                    if (err) {
                        connection.sendCommandError(id, errToMessage(err), errToString(err));
                    } else {
                        connection.sendCommandResponse(id, result);
                    }
                };
                parameters.push(callback);
                command.commandFunction.apply(connection, parameters);
            } else { // synchronous command
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
    registerEvent: function registerEvent(domainName: string, eventName: string, parameters: DomainCommandArgument[]) {
        if (!this.hasDomain(domainName)) {
            this.registerDomain(domainName, null);
        }

        if (!_domains[domainName].events[eventName]) {
            _domains[domainName].events[eventName] = {
                parameters
            };
        } else {
            console.error("[DomainManager] Event " + domainName + "." +
                eventName + " already registered");
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
    emitEvent: function emitEvent(domainName: string, eventName: string, parameters?: any[]) {
        if (_domains[domainName] && _domains[domainName].events[eventName]) {
            ConnectionManager.sendEventToAllConnections(
                _eventCount++,
                domainName,
                eventName,
                parameters
            );
        } else {
            console.error("[DomainManager] No such event: " + domainName +
                "." + eventName);
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
    loadDomainModulesFromPaths: function loadDomainModulesFromPaths(paths: string[]): boolean {
        paths.forEach((path) => {
            const m = require(path);
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
    getDomainDescriptions: function getDomainDescriptions() {
        return JSON.parse(JSON.stringify(_domains));
    }

};

export default DomainManager;
