import { Configuration } from "electron-builder";

const options: Configuration = {
    "appId": "com.squirrel.quadre.Quadre",
    "generateUpdatesFilesForAllChannels": true,
    "asar": false,
    "files": [
        "**/*",
        "!**/node_modules/*/{CHANGELOG.md,README.md,README,readme.md,readme}",
        "!**/node_modules/*/{test,__tests__,tests,powered-test,example,examples}",
        "!**/node_modules/*.d.ts",
        "!**/node_modules/.bin",
        "!**/*.{iml,o,hprof,orig,pyc,pyo,rbc,swp,csproj,sln,xproj}",
        "!.editorconfig",
        "!**/._*",
        "!**/{.DS_Store,.git,.hg,.svn,CVS,RCS,SCCS,.gitignore,.gitattributes}",
        "!**/{__pycache__,thumbs.db,.flowconfig,.idea,.vs,.nyc_output}",
        "!**/{appveyor.yml,.travis.yml,circle.yml}",
        "!**/{npm-debug.log,yarn.lock,.yarn-integrity,.yarn-metadata.json}",
        {
            "from": "www/extensions/default/quadre-git/node_modules",
            "to": "www/extensions/default/quadre-git/node_modules",
            "filter": [
                "*/**",
                "!.bin/**"
            ]
        },
        {
            "from": "www/extensions/default/quadre-eslint/node_modules",
            "to": "www/extensions/default/quadre-eslint/node_modules",
            "filter": [
                "*/**",
                "!.bin/**"
            ]
        },
        {
            "from": "www/extensions/default/JavaScriptCodeHints/node_modules",
            "to": "www/extensions/default/JavaScriptCodeHints/node_modules",
            "filter": [
                "*/**",
                "!.bin/**"
            ]
        },
        {
            "from": "www/extensions/default/StaticServer/node/node_modules",
            "to": "www/extensions/default/StaticServer/node/node_modules",
            "filter": [
                "*/**",
                "!.bin/**"
            ]
        }
    ],
    "npmRebuild": true,
    "directories": {
        "buildResources": "build",
        "app": "dist",
        "output": "dist-build"
    },
    "win": {
        "target": [
            "nsis"
        ]
    },
    "msi": {
        "warningsAsErrors": false
    },
    "mac": {
        "category": "public.app-category.developer-tools"
    },
    "linux": {
        "category": "Utility;TextEditor;Development;IDE;",
        "target": [
            "AppImage",
            "deb",
            "rpm"
        ]
    }
};

export default options;
