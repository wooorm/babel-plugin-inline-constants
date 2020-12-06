# babel-plugin-inline-constants

[![Build][build-badge]][build]
[![Downloads][downloads-badge]][downloads]

[Babel][] plugin to inline constants in code.
This is useful because gzip likes repeated patterns (such as using magic numbers
or strings multiple times), whereas looking things up in objects is easier to
develop with.
“Constants” here are specific files that are imported or required which contain
primitives (numbers, strings, booleans, null).

## Install

[npm][]:

```sh
npm install babel-plugin-inline-constants
```

## Use

First, this plugin must be configured with a `pattern`, so in a `.babelrc`, do:

```json
{
  "plugins": [["babel-plugin-inline-constants", {"modules": "./math"}]]
}
```

Then, a CJS example is as follows, `math.js`:

```js
exports.pi = 3.14
```

`example.js`:

```js
var math = require('./math')

console.log('one pi:', math.pi)
console.log('two pi:', 2 * math.pi)
console.log('pi pi:', math.pi * math.pi)
```

Now running Babel (with `@babel/cli` and `@babel/core` installed):

```sh
babel example.js
```

Yields:

```js
console.log('one pi:', 3.14);
console.log('two pi:', 2 * 3.14);
console.log('pi pi:', 3.14 * 3.14);
```

***

Or with ESM (which requires extensions):

```json
{
  "plugins": [["babel-plugin-inline-constants", {"modules": "./math.mjs"}]]
}
```

`math.mjs`:

```js
export const pi = 3.14
```

`example.mjs`:

```js
import {pi} from './math.mjs'

console.log('one pi:', pi)
console.log('two pi:', 2 * pi)
console.log('pi pi:', pi * pi)
```

Then running Babel:

```sh
babel example.mjs
```

Yields the same as above.

## API

### `babel-plugin-inline-constants`

This is a [Babel][] plugin.
See [its documentation][babel-plugins] on how to use Babel plugins.

This plugin must be configured with a `modules` array.
Values in this array are the same as the `x` in `require(x)` or `import y
from x`, and resolve from the CWD (current working directory) that babel is
running in.
When these modules are then used, their values are then inlined.

So, if you are going to inline a file from `node_modules` such as
[`charcodes`][charcodes], you can use `modules: ['charcodes']`.

Modules to be inlined are evaluated with Node, so only use this plugin if you
completely trust your code.

To ignore the error when modules cannot be found, set `ignoreModuleNotFound` to
`true`.

###### Notes

*   ESM (`import`) and CJS (`require`) are supported
*   Modules to be inlined must be defined in `modules`
*   PRs welcome to make this rather experimental project better!

## Related

*   [`babel-plugin-undebug`](https://github.com/wooorm/babel-plugin-undebug)
    — Remove `debug`

## License

[MIT][license] © [Titus Wormer][author]

<!-- Definitions -->

[build-badge]: https://github.com/wooorm/babel-plugin-inline-constants/workflows/main/badge.svg

[build]: https://github.com/wooorm/babel-plugin-inline-constants/actions

[downloads-badge]: https://img.shields.io/npm/dm/babel-plugin-inline-constants.svg

[downloads]: https://www.npmjs.com/package/babel-plugin-inline-constants

[npm]: https://docs.npmjs.com/cli/install

[license]: license

[author]: https://wooorm.com

[babel]: https://babeljs.io

[babel-plugins]: https://babeljs.io/docs/plugins

[charcodes]: https://github.com/xtuc/charcodes
