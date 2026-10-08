const EXTENSION_NAME = "quadre-eslint";

function log(level, msgs): void {
    console[level].apply(console, ["[" + EXTENSION_NAME + "]"].concat(msgs));
}

export function info(...msgs): void {
    log("log", msgs);
}

export function error(...msgs): void {
    log("error", msgs);
}
