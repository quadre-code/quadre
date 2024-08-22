import type { DomainManager } from "./domain-manager";

/**
 * @private
 * @type {DomainManager}
 * DomainManager provided at initialization time
 */
let _domainManager: typeof DomainManager | null = null;

/**
 * @private
 * Implementation of base.enableDebugger commnad.
 * In the future, process._debugProcess may go away. In that case
 * we will probably have to implement re-launching of the Node process
 * with the --debug command line switch.
 */
function cmdEnableDebugger(): void {
    // Unfortunately, there's no indication of whether this succeeded
    // This is the case for _all_ of the methods for enabling the debugger.
    (process as any)._debugProcess(process.pid);
}

/**
 * @private
 * Implementation of base.restartNode command.
 */
function cmdRestartNode(): void {
    // TODO:
}

/**
 * @private
 * Implementation of base.loadDomainModulesFromPaths
 * @param {Array.<string>} paths Paths to load
 * @return {boolean} Whether the load succeeded
 */
function cmdLoadDomainModulesFromPaths(paths: Array<string>): boolean {
    if (_domainManager) {
        const success = _domainManager.loadDomainModulesFromPaths(paths);
        if (success) {
            _domainManager.emitEvent("base", "newDomains");
        }
        return success;
    }

    return false;
}

/**
 *
 * Registers commands with the DomainManager
 * @param {DomainManager} domainManager The DomainManager to use
 */
function init(domainManager: typeof DomainManager): void {
    _domainManager = domainManager;

    _domainManager.registerDomain("base", {major: 0, minor: 1});
    _domainManager.registerCommand(
        "base",
        "enableDebugger",
        cmdEnableDebugger,
        false,
        "Attempt to enable the debugger",
        [], // no parameters
        []  // no return type
    );
    _domainManager.registerCommand(
        "base",
        "restartNode",
        cmdRestartNode,
        false,
        "Attempt to restart the Node server",
        [], // no parameters
        []  // no return type
    );
    _domainManager.registerCommand(
        "base",
        "loadDomainModulesFromPaths",
        cmdLoadDomainModulesFromPaths,
        false,
        "Attempt to load command modules from the given paths. " +
            "The paths should be absolute.",
        [{name: "paths", type: "array<string>"}],
        [{name: "success", type: "boolean"}]
    );

    _domainManager.registerEvent(
        "base",
        "log",
        [{name: "level", type: "string"},
            {name: "timestamp", type: "Date"},
            {name: "message", type: "string"}]
    );

    _domainManager.registerEvent("base", "newDomains", []);
}

exports.init = init;
