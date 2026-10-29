//--------------------------------------------------------------------------------------------------------
//-- Test harness for extendscript-polyfills.jsx
//-- Setup: keep this file and shim-test-fixture.json in the tests/ folder, with extendscript-polyfills.jsx
//   one level up (the repo root). Run this file from the VS Code ExtendScript Debugger, the ExtendScript
//   Toolkit, or a host app's Scripts panel. Results print to the console, get written to
//   shim-test-results.txt next to this script, and a pass/fail summary shows in an alert (when a host app
//   is available).
//--------------------------------------------------------------------------------------------------------

#include '../extendscript-polyfills.jsx'

(function () {
    enableModernArrayMethods();
    ensureJSONCompatibility();

    var passed = 0;
    var failed = 0;
    var log = [];

    //-- Record one assertion
    function check(name, condition) {
        if (condition) {
            passed++;
            log.push('PASS  ' + name);
        } else {
            failed++;
            log.push('FAIL  ' + name);
        }
    }

    //-- Element-wise equality for flat arrays
    function flatEqual(a, b) {
        if (a.length !== b.length) return false;

        for (var i = 0; i < a.length; i++) {
            if (a[i] !== b[i]) return false;
        }

        return true;
    }

    //-- True if fn throws
    function expectThrow(fn) {
        try {
            fn();
            return false;
        } catch (_) {
            return true;
        }
    }

    //-- True if fn throws an error with the given name ('SyntaxError', 'TypeError', ...)
    function expectThrowType(fn, errorName) {
        try {
            fn();
            return false;
        } catch (e) {
            return e.name === errorName;
        }
    }


    //----------------------------------------------------------------------------------------------------
    //-- Load the JSON fixture
    var here = File($.fileName).parent;
    var fixtureFile = File(here.fsName + '/shim-test-fixture.json');

    if (!fixtureFile.exists) fixtureFile = File.openDialog('Select shim-test-fixture.json');

    if (!fixtureFile) {
        alert('No fixture file selected. Aborting.');
        return;
    }

    fixtureFile.encoding = 'UTF-8';
    fixtureFile.open('r');
    var raw = fixtureFile.read();
    fixtureFile.close();


    //----------------------------------------------------------------------------------------------------
    //-- Array.prototype.indexOf
    var fruits = ['apple', 'banana', 'cherry', 'date', 'banana'];
    check('indexOf finds element', fruits.indexOf('cherry') === 2);
    check('indexOf returns -1 when absent', fruits.indexOf('kiwi') === -1);
    check('indexOf returns first match', fruits.indexOf('banana') === 1);
    check('indexOf respects fromIndex', fruits.indexOf('banana', 2) === 4);
    check('indexOf handles negative fromIndex', fruits.indexOf('banana', -1) === 4);


    //----------------------------------------------------------------------------------------------------
    //-- Array.prototype.includes
    check('includes true when present', fruits.includes('date') === true);
    check('includes false when absent', fruits.includes('kiwi') === false);
    check('includes matches null', [1, null, 2].includes(null) === true);
    check('includes matches NaN', [NaN].includes(NaN) === true);


    //----------------------------------------------------------------------------------------------------
    //-- Array.prototype.forEach
    var scores = [88, 92, 75];
    var sum = 0;
    var sawIndex = true;
    var sawArray = true;

    scores.forEach(function (v, i, arr) {
        sum += v;
        if (typeof i !== 'number') sawIndex = false;
        if (arr !== scores) sawArray = false;
    });

    check('forEach visits every element', sum === 255);
    check('forEach passes index', sawIndex);
    check('forEach passes source array', sawArray);


    //----------------------------------------------------------------------------------------------------
    //-- Array.prototype.map
    check('map transforms elements', flatEqual([1, 2, 3].map(function (v) { return v * 2; }), [2, 4, 6]));
    check('map passes index', flatEqual([10, 20].map(function (v, i) { return v + i; }), [10, 21]));


    //----------------------------------------------------------------------------------------------------
    //-- Array.prototype.filter
    check('filter keeps matching elements',
        flatEqual([88, 92, 75, 60, 95].filter(function (v) { return v >= 80; }), [88, 92, 95]));
    check('filter can return empty', [1, 2, 3].filter(function (v) { return v > 100; }).length === 0);


    //----------------------------------------------------------------------------------------------------
    //-- JSON shim install and versioning
    check('shim installed (JSON._shimVersion is 3)', JSON._shimVersion === 3);

    var installedJSON = JSON;

    JSON = {
        stringify: function () { return 'old'; },
        parse: function () { return 'old'; }
    };
    ensureJSONCompatibility();
    check('shim replaces an older unversioned JSON', JSON.stringify(1) === '1' && JSON._shimVersion === 3);

    JSON = {
        stringify: function () { return 'newer'; },
        parse: function () { return 'newer'; },
        _shimVersion: 4
    };
    ensureJSONCompatibility();
    check('shim leaves a newer versioned JSON alone', JSON.stringify(1) === 'newer');

    JSON = installedJSON;


    //----------------------------------------------------------------------------------------------------
    //-- JSON.parse
    var data = JSON.parse(raw);
    check('parse reads numbers', data.meta.version === 1);
    check('parse reads booleans', data.meta.active === true);
    check('parse reads null', data.meta.released === null);
    check('parse reads exponents', data.numbers.exponent === 6.022e23 && data.numbers.negExponent === -1.6e-19);
    check('parse reads zero', data.numbers.zero === 0);
    check('parse decodes tab escape', data.strings.withTab === 'col1\tcol2');
    check('parse decodes newline escape', data.strings.withNewline === 'line1\nline2');
    check('parse decodes quote escape', data.strings.withQuote === 'she said "hi"');
    check('parse decodes backslash (Windows path)', data.strings.windowsPath === 'C:\\Users\\jeremy\\Documents');
    check('parse decodes \\u unicode', data.strings.unicode === 'caf\u00e9 na\u00efve r\u00e9sum\u00e9');
    check('parse reads nested array', data.matrix[1][1] === 4);
    check('parse reads array of objects', data.people[2].roles.length === 3);
    check('parse reads empty array', data.emptyArray.length === 0);
    check('parse reads decimals', flatEqual(JSON.parse('[0.5, -0.25, 100.01, 0e0]'), [0.5, -0.25, 100.01, 0]));
    check('parse ignores commas and digits inside strings', JSON.parse('{"s":"a,] 01 1. {,} [,"}').s === 'a,] 01 1. {,} [,');
    check('parse converts a non-string argument (matches native)', JSON.parse(42) === 42);
    check('parse rejects malformed input', expectThrow(function () { return JSON.parse('{ not: valid }'); }));
    check('parse rejects code injection', expectThrow(function () { return JSON.parse('(function(){return 1})()'); }));
    check('parse rejects trailing comma in array', expectThrowType(function () { return JSON.parse('[1,]'); }, 'SyntaxError'));
    check('parse rejects trailing comma in object', expectThrowType(function () { return JSON.parse('{"a":1,}'); }, 'SyntaxError'));
    check('parse rejects doubled comma', expectThrowType(function () { return JSON.parse('[1,,2]'); }, 'SyntaxError'));
    check('parse rejects leading zero', expectThrowType(function () { return JSON.parse('{"a":01}'); }, 'SyntaxError'));
    check('parse rejects bare decimal point', expectThrowType(function () { return JSON.parse('[1.]'); }, 'SyntaxError'));
    check('parse rejects empty input', expectThrowType(function () { return JSON.parse(''); }, 'SyntaxError'));

    var revived = JSON.parse('{"a":1,"b":{"c":2,"drop":3}}', function (key, value) {
        if (key === 'drop') return undefined;
        return (typeof value === 'number') ? value * 10 : value;
    });
    check('parse reviver transforms values', revived.a === 10 && revived.b.c === 20);
    check('parse reviver deletes keys it returns undefined for', !('drop' in revived.b));


    //----------------------------------------------------------------------------------------------------
    //-- JSON.stringify
    check('stringify number', JSON.stringify(42) === '42');
    check('stringify string', JSON.stringify('hi') === '"hi"');
    check('stringify boolean', JSON.stringify(true) === 'true');
    check('stringify null', JSON.stringify(null) === 'null');
    check('stringify NaN as null', JSON.stringify(NaN) === 'null');
    check('stringify Infinity as null', JSON.stringify(Infinity) === 'null');
    check('stringify -Infinity as null', JSON.stringify(-Infinity) === 'null');
    check('stringify undefined is undefined', JSON.stringify(undefined) === undefined);
    check('stringify function is undefined', JSON.stringify(function () {}) === undefined);
    check('stringify escapes tab', JSON.stringify('a\tb') === '"a\\tb"');
    check('stringify escapes newline', JSON.stringify('a\nb') === '"a\\nb"');
    check('stringify escapes backspace', JSON.stringify('a\bb') === '"a\\bb"');
    check('stringify escapes formfeed', JSON.stringify('a\fb') === '"a\\fb"');
    check('stringify escapes backslash', JSON.stringify('C:\\Users') === '"C:\\\\Users"');
    check('stringify escapes raw control char', JSON.stringify('\x01') === '"\\u0001"');
    check('stringify escapes line separator U+2028', JSON.stringify('a\u2028b') === '"a\\u2028b"');
    check('stringify array', JSON.stringify([1, 2, 3]) === '[1,2,3]');
    check('stringify nulls undefined/function array slots',
        JSON.stringify([1, undefined, function () {}, 2]) === '[1,null,null,2]');
    check('stringify object', JSON.stringify({ a: 1, b: 'x' }) === '{"a":1,"b":"x"}');
    check('stringify omits undefined-valued keys', JSON.stringify({ a: 1, b: undefined }) === '{"a":1}');
    check('stringify escapes keys', JSON.stringify({ 'a\tb': 1 }) === '{"a\\tb":1}');
    check('stringify handles a key named hasOwnProperty', JSON.stringify({ hasOwnProperty: 1, k: 2 }) === '{"hasOwnProperty":1,"k":2}');
    check('stringify honors toJSON', JSON.stringify({ toJSON: function () { return 'custom'; } }) === '"custom"');
    check('stringify passes the key to toJSON',
        JSON.stringify({ k: { toJSON: function (key) { return 'key:' + key; } } }) === '{"k":"key:k"}');
    check('stringify unwraps Number / String / Boolean objects',
        JSON.stringify([new Number(5), new String('s'), new Boolean(false)]) === '[5,"s",false]');

    //-- Dates
    check('stringify Date as ISO string (UTC)',
        JSON.stringify({ d: new Date(Date.UTC(2026, 9, 29, 4, 5, 6, 7)) }) === '{"d":"2026-10-29T04:05:06.007Z"}');
    check('stringify invalid Date as null', JSON.stringify([new Date(NaN)]) === '[null]');

    //-- Circular references
    var shared = { v: 1 };
    check('stringify allows the same object twice',
        JSON.stringify({ a: shared, b: shared, c: [shared] }) === '{"a":{"v":1},"b":{"v":1},"c":[{"v":1}]}');

    var loop = {};
    loop.self = loop;
    check('stringify throws TypeError on a circular reference', expectThrowType(function () { return JSON.stringify(loop); }, 'TypeError'));

    var deepLoop = { a: [{}] };
    deepLoop.a[0].back = deepLoop;
    check('stringify throws TypeError on a nested circular reference', expectThrowType(function () { return JSON.stringify(deepLoop); }, 'TypeError'));
    check('stringify works normally after a circular-reference error', JSON.stringify({ a: [1] }) === '{"a":[1]}');

    //-- space (indent)
    check('stringify space as number', JSON.stringify({ a: [1, 2] }, null, 2) === '{\n  "a": [\n    1,\n    2\n  ]\n}');
    check('stringify space as string', JSON.stringify([1], null, '\t') === '[\n\t1\n]');
    check('stringify space caps at 10', JSON.stringify([1], null, 12) === '[\n          1\n]');
    check('stringify space keeps empty containers compact', JSON.stringify({ e: [], o: {} }, null, 2) === '{\n  "e": [],\n  "o": {}\n}');
    check('stringify space 0 is compact', JSON.stringify({ a: 1 }, null, 0) === '{"a":1}');


    //----------------------------------------------------------------------------------------------------
    //-- Round-trip
    var roundTrip = JSON.parse(JSON.stringify(data));
    check('round-trip preserves nested value', roundTrip.people[0].name === 'Ada');
    check('round-trip preserves Windows path', roundTrip.strings.windowsPath === 'C:\\Users\\jeremy\\Documents');
    check('round-trip preserves pretty-printed output', JSON.stringify(JSON.parse(JSON.stringify(data, null, 4))) === JSON.stringify(data));


    //----------------------------------------------------------------------------------------------------
    //-- JSON.load
    check('load reads a File object', JSON.load(fixtureFile).meta.version === 1);
    check('load reads a path string', JSON.load(fixtureFile.fsName).fruits.length === 5);
    check('load throws on a missing file', expectThrow(function () { return JSON.load(here.fsName + '/does-not-exist.json'); }));

    var bomFile = File(Folder.temp.fsName + '/shim-test-bom.json');
    bomFile.encoding = 'UTF-8';
    bomFile.open('w');
    bomFile.write('\uFEFF{"bom":true}');
    bomFile.close();
    check('load strips a BOM', JSON.load(bomFile).bom === true);
    bomFile.remove();


    //----------------------------------------------------------------------------------------------------
    //-- Init contract
    check('enableModernArrayMethods returns true', enableModernArrayMethods() === true);


    //----------------------------------------------------------------------------------------------------
    //-- Report
    log.push('');
    log.push('-----------------------------------------');
    log.push(passed + ' passed, ' + failed + ' failed, ' + (passed + failed) + ' total');
    var report = log.join('\n');

    $.writeln(report);

    try {
        var out = File(here.fsName + '/shim-test-results.txt');
        out.encoding = 'UTF-8';
        out.open('w');
        out.write(report);
        out.close();
    } catch (_) {}

    try {
        alert(((failed === 0) ? 'All tests passed\n\n' : 'Some tests FAILED\n\n') + passed + ' passed, ' + failed + ' failed');
    } catch (_) {}
})();
