# Quadre

Windows, Mac, Linux: [![Build Status](https://github.com/quadre-code/quadre/actions/workflows/ci.yml/badge.svg)](https://github.com/quadre-code/quadre/actions)

This project is based on a fork of [Brackets-Electron][brackets-electron] which was a fork of [Adobe Brackets][brackets].<br />
It was started with the idea to experiment and try new things.<br />
If you are looking for the successor of [Adobe Brackets][brackets] after its sunset on 1 spetember 2021, you should go to [Brackets][brackets-cont].

## How did Brackets-Electron differ to regular Brackets?

Brackets-Electron `x.y.z` will follow `x.y` of Brackets releases, with `z` being reserved for patches and merges of latest features which are available in brackets master repository and planned to be released in the next version. This way you can preview the upcoming features without running brackets from source.

- CEF shell is gone, improves experience mainly to Linux users
- shell websocket server is gone, improves performance and stability for node domain code
- node domains run in their own processes, improves perfomance as they don't block each other

## How does Quadre differ?

Quadre will probably make many breaking changes along the road.

## How to hack

run `npm run dev` in one terminal, `npm start` in the other, be sure to do the usual updates (git pull, git submodule update, npm install, etc) before.

## How to build from master

```
git clone https://github.com/quadre-code/quadre
cd quadre
git submodule update --init
npm install
npm run dist
```

You'll find runnable Quadre in `dist-build` directory.


---

Please note that this project is released with a [Contributor Code of Conduct][code-conduct]. By participating in this project you agree to abide by its terms.

[brackets]: https://github.com/adobe/brackets
[brackets-electron]: https://github.com/brackets-userland/brackets-electron
[brackets-cont]: https://github.com/brackets-cont/brackets
[code-conduct]: https://github.com/quadre-code/quadre/blob/master/.github/CODE_OF_CONDUCT.md
