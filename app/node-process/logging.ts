export const log = {
    info: (msg: string): void => {
        process.send && process.send({ type: "log", level: "info", msg });
    },
    warn: (msg: string): void => {
        process.send && process.send({ type: "log", level: "warn", msg });
    },
    error: (msg: string): void => {
        process.send && process.send({ type: "log", level: "error", msg });
    }
};
console.log = (...args: Array<any>): void => log.info(args.join(" "));
console.info = (...args: Array<any>): void => log.info(args.join(" "));
console.warn = (...args: Array<any>): void => log.warn(args.join(" "));
console.error = (...args: Array<any>): void => log.error(args.join(" "));
