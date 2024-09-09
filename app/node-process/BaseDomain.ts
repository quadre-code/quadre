import DomainManager from "./domain-manager";

function init(domainManager: typeof DomainManager): void {
    domainManager.registerDomain("base", { major: 0, minor: 1 });

    domainManager.registerCommand(
        "base",
        "loadDomainModulesFromPaths",
        (paths: Array<string>): boolean => {
            return domainManager.loadDomainModulesFromPaths(paths);
        },
        false,
        "Attempt to load command modules from the given paths. The paths should be absolute.",
        [{ name: "paths", type: "array<string>" }],
        [{ name: "success", type: "boolean" }]
    );

    domainManager.registerEvent("base", "newDomains", []);
}

exports.init = init;
