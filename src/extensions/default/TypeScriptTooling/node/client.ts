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

const LanguageClient = require((global as any).LanguageClientInfo.languageClientPath).LanguageClient;
// import * as net from "net";
import * as cp from "child_process";
// import * as execa from "execa";
// import * as semver from "semver";
// @ts-ignore
// import * as tsServer from "typescript-language-server";

const clientName = "TypeScriptClient";
const executablePath = __dirname + "/node_modules/.bin/typescript-language-server" +
    (process.platform === "win32" ? ".cmd" : "");
// let memoryLimit = "";

function validateTypeScriptExecutable(confParams: any): Promise<void> {
    // TODO: find a way to check the --tsserver-path param?
    // executablePath = confParams.executablePath ||
    //     (process.platform === "win32" ? "php.exe" : "php");

    // memoryLimit = confParams.memoryLimit || "4095M";

    return new Promise<void>(function (resolve, reject) {
        // if (memoryLimit !== "-1" && !/^\d+[KMG]?$/.exec(memoryLimit)) {
        //     reject("TYPESCRIPT_SERVER_MEMORY_LIMIT_INVALID");
        //     return;
        // }

        // execa(executablePath, ["--version"]).then(function (output) {
        //     const matchStr = output.stdout.match(/^PHP ([^\s]+)/m);
        //     if (!matchStr) {
        //         reject("TYPESCRIPT_VERSION_INVALID");
        //         return;
        //     }
        //     let version = matchStr[1].split("-")[0];
        //     if (!/^\d+.\d+.\d+$/.test(version)) {
        //         version = version.replace(/(\d+.\d+.\d+)/, "$1-");
        //     }
        //     if (semver.lt(version, "7.0.0")) {
        //         reject(["TYPESCRIPT_UNSUPPORTED_VERSION", version]);
        //         return;
        //     }
        //     resolve();
        // }).catch(function (err: any) {
        //     if (err.code === "ENOENT") {
        //         reject("TYPESCRIPT_EXECUTABLE_NOT_FOUND");
        //     } else {
        //         reject(["TYPESCRIPT_PROCESS_SPAWN_ERROR", err.code]);
        //         console.error(err);
        //     }
        //     return;
        // });
        resolve();
    });
}

const serverOptions = function (): Promise<any> {
    return new Promise(function (resolve, reject) {
        // const server = net.createServer(function (socket) {
        //     console.log("TypeScript process connected");
        //     socket.on("end", function () {
        //         console.log("TypeScript process disconnected");
        //     });
        //     server.close();
        //     resolve({
        //         reader: socket,
        //         writer: socket
        //     });
        // });
        // server.listen(0, "127.0.0.1", function () {
        //     // const pathToTypeScript = __dirname + "/node_modules/.bin/typescript-language-server";
        //     // executablePath = ;
        //     const address = server!.address() as net.AddressInfo;
        //     const childProcess = cp.spawn(executablePath, [
        //         // pathToTypeScript,
        //         "--stdio",
        //         "--tcp=127.0.0.1:" + address.port,
        //         "--memory-limit=" + memoryLimit
        //     ]);
        //     childProcess.stderr.on("data", function (chunk) {
        //         const str = chunk.toString();
        //         console.log("TypeScript Language Server:", str);
        //     });
        //     childProcess.on("exit", function (code, signal) {
        //         console.log(
        //             "Language server exited " + (signal ? "from signal " + signal : "with exit code " + code)
        //         );
        //     });
        //     return childProcess;
        // });

        const serverProcess = cp.spawn(executablePath, [
            "--stdio"
        ], {
            cwd: __dirname + "/node_modules/.bin/"
        });

        if (serverProcess && serverProcess.pid) {
            resolve({
                process: serverProcess,
                communication: "stdio"
            });
        } else {
            reject("Couldn't create server process");
        }
    });
};
const options = {
    serverOptions: serverOptions
};


export function init(domainManager: any): void {
    const client = new LanguageClient(clientName, domainManager, options);
    client.addOnRequestHandler("validateTypeScriptExecutable", validateTypeScriptExecutable);
}
