import * as fs from "fs";
import * as path from "path";
import * as ESLintEmbeddedModule from "eslint";
import type * as ESLint6 from "eslint6";
import type * as ESLint8 from "eslint8";
import { CodeInspectionReport, CodeInspectionResult, CodeInspectionResultType } from "../types";

type ESLintModule = typeof ESLintEmbeddedModule | typeof ESLint6 | typeof ESLint8;

type ESLintOptions =
    | ESLintEmbeddedModule.ESLint.Options
    | ESLint6.CLIEngine.Options
    | ESLint8.ESLint.Options;

interface QuadreLintReport {
    eslintVersion?: string;
    results: Array<QuadreLintResult>;
}

interface QuadreLintResult {
    output?: string | undefined;
    messages: Array<QuadreLintMessage>;
}

interface QuadreLintMessage {
    severity: 0 | 1 | 2;
    message: string;
    ruleId: string | null;
    line: number;
    column: number;
}

const EXTENSION_NAME = "quadre-eslint";
const ESLINT_SEVERITY_ERROR = 2;
const ESLINT_SEVERITY_WARNING = 1;

let currentProjectRoot: string | null = null;
let currentProjectRootHasConfig: boolean = false;
let erroredLastTime: boolean = true;

const log = {
    info: (...args: Array<any>): void => console.log("[" + EXTENSION_NAME + "]", ...args),
    warn: (...args: Array<any>): void => console.warn("[" + EXTENSION_NAME + "]", ...args),
    error: (...args: Array<any>): void => console.error("[" + EXTENSION_NAME + "]", ...args),
};

function isELint6(value: ESLintModule): value is typeof ESLint6 {
    return !!(value as typeof ESLint6).CLIEngine;
}

function isELint8(value: ESLintModule): value is typeof ESLint8 {
    return !(value as typeof ESLint6).CLIEngine && !!(value as typeof ESLint8).ESLint;
}

function getESLintModule(eslintPath: string): ESLintModule {
    let _realPath: string;
    try {
        _realPath = require.resolve(eslintPath);
    } catch (err) {
        log.error(`Wasn't able to resolve path to eslint: ${err.stack}`);
        throw new Error("Wasn't able to resolve path to eslint.");
    }

    let _eslint: ESLintModule;
    try {
        _eslint = require(eslintPath);
    } catch (err) {
        log.error(
            `Wasn't able to load eslint from ${_realPath}, be sure to run 'npm install' properly: ${err.stack}`
        );
        throw new Error(
            `Wasn't able to load eslint from ${_realPath}, be sure to run 'npm install' properly.`
        );
    }

    if (!(_eslint as typeof ESLint6).CLIEngine && !(_eslint as typeof ESLint8).ESLint) {
        log.error(
            `No CLIEngine or ESLint classes found for eslint loaded from ${_realPath}, which version are you using?`
        );
        throw new Error(
            `No CLIEngine or ESLint classes found for eslint loaded from ${_realPath}, which version are you using?`
        );
    }

    return _eslint;
}

function uniq<T>(arr: Array<T>): Array<T> {
    return arr.reduce((result: Array<T>, item: T) => {
        if (result.indexOf(item) === -1) {
            result.push(item);
        }
        return result;
    }, []);
}

function normalizeDir(dirPath: string): string {
    if (dirPath.match(/(\\|\/)$/)) {
        dirPath = dirPath.slice(0, -1);
    }
    return process.platform === "win32" ? dirPath.replace(/\//g, "\\") : dirPath;
}

function nodeModulesInDir(dirPath: string): string {
    return path.resolve(normalizeDir(dirPath), "node_modules");
}

const eslintModuleMap = new Map<string, ESLintModule>();
const eslintOptionsMap = new Map<string, ESLintOptions>();

function prepareEslintModule(
    projectRoot: string,
    prevProjectRoot: string | null,
    useEmbeddedESLint: boolean
): ESLintModule {
    if (eslintModuleMap.has(projectRoot)) {
        return eslintModuleMap.get(projectRoot)!;
    }

    try {
        currentProjectRootHasConfig = fs.readdirSync(projectRoot).some((file: string) => {
            return /^\.eslintrc($|\.[a-z]+$)/i.test(file);
        });
    } catch (err) {
        log.warn(`Failed to read contents of ${projectRoot}: ${err}`);
        currentProjectRootHasConfig = false;
    }

    // only allow use of embedded eslint when no configuration is present in the project
    // or when the useEmbeddedESLint preference is set to true
    const allowEmbeddedEslint = !currentProjectRootHasConfig || useEmbeddedESLint;

    let eslintPath: string | null = "eslint";
    if (!allowEmbeddedEslint) {
        eslintPath = projectRoot + "node_modules/eslint";
        try {
            if (fs.statSync(eslintPath).isDirectory()) {
                // no action required
            } else {
                throw new Error("not found");
            }
        } catch (ignoreErr) {
            // Do nothing.
        }
    }

    // make sure plugins are loadable from current project directory
    const nodePath = process.env.NODE_PATH;
    let nodePaths = nodePath ? nodePath.split(path.delimiter) : [];

    // remove previous from NODE_PATH
    if (prevProjectRoot) {
        const io = nodePaths.indexOf(nodeModulesInDir(prevProjectRoot));
        if (io !== -1) {
            nodePaths.splice(io, 1);
        }
    }

    // add current to NODE_PATH
    nodePaths = [nodeModulesInDir(projectRoot)].concat(nodePaths);
    process.chdir(normalizeDir(projectRoot));

    nodePaths = uniq(nodePaths);
    process.env.NODE_PATH = nodePaths.join(path.delimiter);
    require("module").Module._initPaths();

    const eslintModule = getESLintModule(eslintPath);
    eslintModuleMap.set(projectRoot, eslintModule);
    return eslintModule;
}

function getESlintOptions(projectRoot: string): ESLintOptions {
    if (eslintOptionsMap.has(projectRoot)) {
        return eslintOptionsMap.get(projectRoot)!;
    }

    const opts: ESLintOptions = {};

    // this is critical for correct .eslintrc resolution
    opts.cwd = projectRoot;

    if (!currentProjectRootHasConfig) {
        opts.baseConfig = { extends: "eslint:recommended" };
    }

    const rulesDirPath = projectRoot + ".eslintrules";
    try {
        if (fs.statSync(rulesDirPath).isDirectory()) {
            opts.rulePaths = [rulesDirPath];
        }
    } catch (ignoreErr) {
        // no action required
    }

    const ignorePath = projectRoot + ".eslintignore";
    try {
        if (fs.statSync(ignorePath).isFile()) {
            opts.ignore = true;
            opts.ignorePath = ignorePath;
        }
    } catch (ignoreErr) {
        // no action required
    }

    return opts;
}

function mapToQuadreLintReport(eslintModule: typeof ESLint6, data: ESLint6.CLIEngine.LintReport);
function mapToQuadreLintReport(
    eslintModule: typeof ESLint8,
    data: Array<ESLint8.ESLint.LintResult>
);
function mapToQuadreLintReport(
    eslintModule: ESLintModule,
    data: ESLint6.CLIEngine.LintReport | Array<ESLint8.ESLint.LintResult>
): QuadreLintReport {
    if (isELint6(eslintModule)) {
        const lintReport = data as ESLint6.CLIEngine.LintReport;
        const result: QuadreLintReport = {
            eslintVersion: eslintModule.CLIEngine.version,
            results: lintReport.results.map(
                (r) =>
                    ({
                        output: r.output,
                        messages: r.messages.map(
                            (m) =>
                                ({
                                    severity: m.severity,
                                    message: m.message,
                                    ruleId: m.ruleId,
                                    line: m.line,
                                    column: m.column,
                                }) satisfies QuadreLintMessage
                        ),
                    }) satisfies QuadreLintResult
            ),
        };
        return result;
    }

    const lintResults = data as Array<ESLint8.ESLint.LintResult>;
    const result: QuadreLintReport = {
        eslintVersion: eslintModule.ESLint.version,
        results: lintResults.map(
            (r) =>
                ({
                    output: r.output,
                    messages: r.messages.map(
                        (m) =>
                            ({
                                severity: m.severity,
                                message: m.message,
                                ruleId: m.ruleId,
                                line: m.line,
                                column: m.column,
                            }) satisfies QuadreLintMessage
                    ),
                }) satisfies QuadreLintResult
        ),
    };
    return result;
}

function mapEslintMessage(result: QuadreLintMessage, majorVersion: number): CodeInspectionResult {
    const offset = majorVersion < 1 ? 0 : 1;

    let message: string;
    let type: CodeInspectionResultType;
    switch (result.severity) {
        case ESLINT_SEVERITY_ERROR:
            message = "ERROR: ";
            type = CodeInspectionResultType.ERROR;
            break;
        case ESLINT_SEVERITY_WARNING:
            message = "WARNING: ";
            type = CodeInspectionResultType.WARNING;
            break;
        default:
            message = "UNKNOWN: ";
            type = CodeInspectionResultType.META;
    }

    message += result.message;
    if (result.ruleId) {
        message += " [" + result.ruleId + "]";
    }

    return {
        type,
        message,
        pos: {
            line: result.line - 1,
            ch: result.column - offset,
        },
    };
}

function createCodeInspectionReport(eslintReport: QuadreLintReport): CodeInspectionReport {
    // if version is missing, assume 1
    const version = eslintReport.eslintVersion ? +eslintReport.eslintVersion.split(".")[0] : 1;
    const results = eslintReport.results ? eslintReport.results[0] : null;
    const messages = results ? results.messages : [];
    return {
        errors: messages.map((x) => mapEslintMessage(x, version)),
    };
}

function createUserError(message: string): CodeInspectionReport {
    erroredLastTime = true;
    return {
        errors: [
            {
                type: CodeInspectionResultType.ERROR,
                message,
                pos: { line: 0, ch: 0 },
            },
        ],
    };
}

export function lintFile(
    projectRoot: string,
    fullPath: string,
    text: string,
    useEmbeddedESLint: boolean,
    callback: (err: Error | null, res?: CodeInspectionReport) => void
): void {
    if (erroredLastTime) {
        eslintModuleMap.delete(projectRoot);
        eslintOptionsMap.delete(projectRoot);
        erroredLastTime = false;
    }

    if (projectRoot !== currentProjectRoot) {
        if (currentProjectRoot) {
            eslintModuleMap.delete(currentProjectRoot);
            eslintOptionsMap.delete(currentProjectRoot);
        }
        currentProjectRoot = projectRoot;
    }

    let eslintModule: ESLintModule | undefined;
    let eslintOptions: ESLintOptions;
    try {
        eslintModule = prepareEslintModule(projectRoot, currentProjectRoot, useEmbeddedESLint);
        eslintOptions = getESlintOptions(projectRoot);
    } catch (err) {
        if (!eslintModule) {
            if (currentProjectRootHasConfig) {
                return callback(
                    null,
                    createUserError(
                        "ESLintError: You need to install ESLint in your project folder with 'npm install eslint'"
                    )
                );
            }

            return callback(
                null,
                createUserError(
                    "ESLintError: No ESLint cli is available, try reinstalling the extension"
                )
            );
        }
        return callback(null, createUserError(err.message));
    }

    if (/(\.ts|\.tsx)$/.test(fullPath) && !currentProjectRootHasConfig) {
        return callback(null, { errors: [] });
    }

    if (isELint6(eslintModule)) {
        const cli = new eslintModule.CLIEngine(eslintOptions as ESLint6.CLIEngine.Options);

        const relativePath =
            fullPath.indexOf(projectRoot) === 0 ? fullPath.substring(projectRoot.length) : fullPath;
        let res: QuadreLintReport | undefined;
        let err: Error | null = null;
        try {
            const lintReport = cli.executeOnText(text, relativePath);
            res = mapToQuadreLintReport(eslintModule, lintReport);
        } catch (e) {
            log.error(`Error thrown in executeOnText: ${e.stack}`);
            err = e;
            erroredLastTime = true;
        }
        return callback(err, res ? createCodeInspectionReport(res) : void 0);
    }

    if (isELint8(eslintModule)) {
        const cli = new eslintModule.ESLint(eslintOptions as ESLint8.ESLint.Options);

        const relativePath =
            fullPath.indexOf(projectRoot) === 0 ? fullPath.substring(projectRoot.length) : fullPath;
        let res: QuadreLintReport | undefined;
        let err: Error | null = null;
        cli.lintText(text, { filePath: relativePath })
            .then((lintResult) => {
                res = mapToQuadreLintReport(eslintModule, lintResult);
                return callback(null, res ? createCodeInspectionReport(res) : void 0);
            })
            .catch((e) => {
                log.error(`Error thrown in executeOnText: ${e.stack}`);
                err = e;
                erroredLastTime = true;
                return callback(err, void 0);
            });
    }
}

export function fixFile(
    projectRoot: string,
    fullPath: string,
    text: string,
    useEmbeddedESLint: boolean,
    callback: (err: Error | null, res?: QuadreLintReport) => void
): void {
    let eslintModule: ESLintModule;
    let eslintOptions: ESLintOptions;
    try {
        eslintModule = prepareEslintModule(projectRoot, currentProjectRoot, useEmbeddedESLint);
        eslintOptions = getESlintOptions(projectRoot);
    } catch (err) {
        return callback(err);
    }

    if (isELint6(eslintModule)) {
        const cliOptions: ESLint6.CLIEngine.Options = {
            ...(eslintOptions as ESLint6.CLIEngine.Options),
            fix: true,
        };
        const cli = new eslintModule.CLIEngine(cliOptions);

        let res: QuadreLintReport | undefined;
        let err: Error | null = null;
        try {
            const lintReport = cli.executeOnText(text, fullPath);
            res = mapToQuadreLintReport(eslintModule, lintReport);
        } catch (e) {
            log.error(e.stack);
            err = e;
        }
        callback(err, res);
    } else if (isELint8(eslintModule)) {
        const cliOptions: ESLint8.ESLint.Options = {
            ...(eslintOptions as ESLint8.ESLint.Options),
            fix: true,
        };
        const cli = new eslintModule.ESLint(cliOptions);

        let res: QuadreLintReport | undefined;
        let err: Error | null = null;
        cli.lintText(text, { filePath: fullPath })
            .then((lintResult) => {
                res = mapToQuadreLintReport(eslintModule, lintResult);
            })
            .catch((e) => {
                log.error(e.stack);
                err = e;
                callback(err, res);
            });
    }
}

export function configFileModified(projectRoot: string, useEmbeddedESLint: boolean): void {
    eslintModuleMap.delete(projectRoot);
    eslintOptionsMap.delete(projectRoot);
    currentProjectRoot = projectRoot;
}
