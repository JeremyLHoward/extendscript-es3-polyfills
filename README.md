# ExtendScript ES3 Polyfill Shims

Two small polyfills that add modern array methods and `JSON` support to Adobe ExtendScript.

The ExtendScript engine used by InDesign, Illustrator, Photoshop, After Effects, and the other Creative Cloud apps is ES3-era. That means no `Array.prototype.indexOf`, `forEach`, `map`, `filter`, or `includes`, and no `JSON` object. This file fills both gaps so you can write scripts the way you would anywhere else.

There are no dependencies and nothing to build. It is a single `.jsx` file you include and call.

## Usage

Include the file once near the top of your script, then call both initializers before you use anything they provide:

```javascript
#include "extendscript-polyfills.jsx"

enableModernArrayMethods();
ensureJSONCompatibility();

// from here on, these work:
var names = products.map(function (p) { return p.name; });
var active = products.filter(function (p) { return p.inStock; });
var config = JSON.load(configFile);
var out = JSON.stringify({ updated: new Date(), count: names.length }, null, 2);
```

Both functions are safe to call more than once. `enableModernArrayMethods()` only installs a method the host does not already provide. `ensureJSONCompatibility()` never replaces a native `JSON`, and it only replaces an existing shim when that shim is older (see "Shared engines" below).

## What you get

`enableModernArrayMethods()` installs `indexOf`, `forEach`, `map`, `filter`, and `includes` on `Array.prototype`, following the ES5 semantics (sparse arrays are respected, `includes` matches `NaN`, the callbacks receive `(value, index, array)`).

`ensureJSONCompatibility()` installs `JSON.parse`, `JSON.stringify`, and `JSON.load`:

- `JSON.parse` validates the input structure before evaluating it, so it rejects anything that is not well-formed JSON instead of running it. It also rejects the forms that slip past structural validation but that native `JSON.parse` refuses: trailing or doubled commas (`[1,]`, `{"a":1,}`, `[1,,2]`), leading zeros (`01`), and a bare decimal point (`1.`). The optional `reviver` argument is supported. A non-string argument is converted to a string first, as native does, so `JSON.parse(42)` returns `42`. Malformed input throws a `SyntaxError`.
- `JSON.stringify` escapes the full set of control characters, serializes `NaN` and `Infinity` as `null`, and handles backslashes correctly so Windows paths like `C:\Users\...` come out as valid JSON. It honors a `toJSON(key)` method when one is present. ES3 dates have no `toJSON`, so `Date` objects are written as ISO 8601 strings in UTC (`"2026-10-29T04:05:06.007Z"`), the same output native `JSON` produces, and invalid dates become `null`. `Number`, `String`, and `Boolean` wrapper objects are written as their plain values. The optional `space` argument pretty-prints the output. A circular reference throws a `TypeError` instead of recursing until the engine runs out of stack, while an object that simply appears twice still serializes normally.
- `JSON.load(file)` reads a UTF-8 JSON file and parses it. It takes a `File` object or a path string and strips a byte order mark if the file has one.

## Things worth knowing

**Array methods are enumerable.** ExtendScript has no reliable `Object.defineProperty`, so the array methods are added as ordinary enumerable properties on `Array.prototype`. A `for (var k in someArray)` loop will therefore also visit `indexOf`, `forEach`, and the rest. If you iterate arrays with `for...in` anywhere, guard the body with `hasOwnProperty`, or just use an indexed `for` loop. Indexed loops and the new methods themselves are unaffected.

**`JSON.parse` is strict.** It throws on malformed input rather than attempting to evaluate it. If you are migrating from a looser parser, or loading JSON files that were edited by hand, expect calls that used to succeed on slightly off text (a trailing comma is the usual one) to start throwing.

**Shared engines.** Scripts that run in a persistent engine, such as `#targetengine 'session'`, share one `JSON` object until the host app restarts. Whichever script installs a shim first supplies `JSON` for every other script in that engine. To keep that predictable, the shim stamps itself with `JSON._shimVersion` (currently `3`). Calling `ensureJSONCompatibility()` replaces any older or unversioned shim already loaded, and leaves an equal or newer one alone, regardless of which script ran first. When you test a new version of the shim in a persistent engine, restart the host app first so an older copy is not still in place.

**`replacer` is not supported.** `JSON.stringify(value, replacer, space)` accepts the argument but ignores it. ExtendScript code rarely needs it, and it roughly doubles the size of the serializer.

## Tests

The `tests/` folder contains a harness that asserts every function the shims provide:

- `tests/shim-test.jsx` runs the checks and reports results.
- `tests/shim-test-fixture.json` is the sample data the parse and array tests read from.

The harness includes `../extendscript-polyfills.jsx`, so keep the repo layout as it is: the polyfills file at the root and both test files in `tests/`. Run `shim-test.jsx` from the VS Code ExtendScript Debugger, the ExtendScript Toolkit, or a host app's Scripts panel. It prints a `PASS` or `FAIL` line per check to the console, writes a `shim-test-results.txt` log next to the script, and shows a pass/fail summary in an alert when a host app is available. Run it from a saved file rather than a pasted console snippet, since it uses `$.fileName` to locate the fixture (there is a file picker fallback if that comes up empty).

The 89 checks cover:

- the array methods, including the `null` and `NaN` cases for `includes`
- shim versioning: an older unversioned `JSON` is replaced and a newer one is left alone
- the full range of `JSON.parse` decoding, the strict rejections (malformed input, code injection, trailing and doubled commas, leading zeros, bare decimal points, empty input), conversion of non-string input, and the `reviver` argument
- the `JSON.stringify` edge cases that plain JSON cannot express (`NaN`, `Infinity`, `undefined`, functions, raw control characters, the `toJSON` hook), plus dates, wrapper objects, circular references, and the `space` argument
- `JSON.load` with a `File` object, a path string, a missing file, and a file that starts with a byte order mark (the harness writes a temporary file to `Folder.temp` and removes it afterward)
- parse/stringify round-trips, compact and pretty-printed

These are manual tests meant to be run inside an Adobe scripting environment. There is no headless ExtendScript runner, so they do not run in CI. That is normal for ExtendScript projects.

## License

MIT. See [LICENSE](LICENSE).
