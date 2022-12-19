import xml2js = require("xml2js");

const xmlParser = new xml2js.Parser({
    trim: true,
    emptyTag: undefined,
    explicitArray: false
});

export function parseXml(xmlString: string): Promise<any> {
    if (typeof xmlString !== "string") {
        throw new Error(`parseXml -> string expected but ${typeof xmlString} received`);
    }
    return new Promise((resolve, reject) => {
        xmlParser.parseString(xmlString, (err: Error, result: any) => {
            return err ? reject(err) : resolve(result);
        });
    });
}
