# ExtendScript ES3 Polyfill Shims

Two small polyfills that add modern array methods and `JSON` support to Adobe ExtendScript.

The ExtendScript engine used by InDesign, Illustrator, Photoshop, After Effects, and the other Creative Cloud apps is ES3-era. That means no `Array.prototype.indexOf`, `forEach`, `map`, `filter`, or `includes`, and in older hosts no `JSON` object at all. This file fills both gaps so you can write scripts the way you would anywhere else.

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
var config = JSON.parse(File.read(configFile));
var out = JSON.stringify({ updated: new Date(), count: names.length });
```

Both functions are idempotent. They only install a method if the host does not already provide it, so calling them on a newer engine that already has these built in is a no-op and will not clobber the native versions.

## What you get

`enableModernArrayMethods()` installs `indexOf`, `forEach`, `map`, `filter`, and `includes` on `Array.prototype`, following the ES5 semantics (sparse arrays are respected, `includes` matches `NaN`, the callbacks receive `(value, index, array)`).

`ensureJSONCompatibility()` installs `JSON.parse` and `JSON.stringify`:

- `JSON.parse` validates the input structure before evaluating it, so it rejects anything that is not well-formed JSON instead of running it. It is based on the validation logic in Douglas Crockford's json2.js.
- `JSON.stringify` escapes the full set of control characters, serializes `NaN` and `Infinity` as `null`, honors a `toJSON()` method when one is present (so `Date` and custom types serialize sensibly), and handles backslashes correctly so Windows paths like `C:\Users\...` come out as valid JSON.

## Two things worth knowing

**Array methods are enumerable.** ExtendScript has no reliable `Object.defineProperty`, so the array methods are added as ordinary enumerable properties on `Array.prototype`. A `for (var k in someArray)` loop will therefore also visit `indexOf`, `forEach`, and the rest. If you iterate arrays with `for...in` anywhere, guard the body with `hasOwnProperty`, or just use an indexed `for` loop. Indexed loops and the new methods themselves are unaffected.

**`JSON.parse` is strict.** It throws on malformed input rather than attempting to evaluate it. That is the point, but if you are migrating from a looser parser that tolerated slightly off strings, expect those calls to start throwing.

## Tests

The `tests/` folder contains a harness that asserts every function the shims provide:

- `tests/shim-test.jsx` runs the checks and reports results.
- `tests/shim-test-fixture.json` is the sample data the parse and array tests read from.

Keep the harness and fixture together in `tests/`, with `extendscript-polyfills.jsx` in the repo root one level up. The harness includes it with `../extendscript-polyfills.jsx`. Run the harness from the ExtendScript Toolkit, the VS Code ExtendScript Debugger, or a host app's Scripts panel. It prints a `PASS` or `FAIL` line per check to the console, writes a `shim-test-results.txt` log next to the script, and shows a pass/fail summary in an alert when a host app is available. Run it from a saved file rather than a pasted console snippet, since it uses `$.fileName` to locate the fixture (there is a file picker fallback if that comes up empty).

The tests cover the array methods (including the `null` and `NaN` cases for `includes`), the full range of `JSON.parse` decoding and its rejection of malformed and non-string input, the `JSON.stringify` edge cases that plain JSON cannot express (`NaN`, `Infinity`, `undefined`, functions, raw control characters, the `toJSON` hook), and a parse/stringify round-trip.

These are manual tests meant to be run inside an Adobe scripting environment. There is no headless ExtendScript runner, so they do not run in CI. That is normal for ExtendScript projects.

## License

MIT. See [LICENSE](LICENSE).
