declare module "text!*" {
    const text: string;
    export = text;
}

declare module "i18n!*" {
    const text: any;
    export = text;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
interface RequireConfig {
    locale?: string;
}
