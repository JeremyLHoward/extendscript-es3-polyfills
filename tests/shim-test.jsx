//-----------------------------------------------------------------------------------------------------------
//-- Test harness for extendscript-shims.jsx
//--
//-- Setup: place this file, extendscript-shims.jsx, and shim-test-fixture.json in the SAME folder,
//--        then run this file from the ExtendScript Toolkit, the VS Code ExtendScript Debugger, or a
//--        host app's Scripts panel. Results print to the console, get written to shim-test-results.txt
//--        next to this script, and a pass/fail summary shows in an alert (when a host app is available).
//-----------------------------------------------------------------------------------------------------------

#include "../extendscript-polyfills.jsx"

(function () {
    enableModernArrayMethods();
    ensureJSONCompatibility();

    var passed = 0, failed = 0;
    var log = [];

    function check(name, condition) {
        if (condition) { passed++; log.push("PASS  " + name); }
        else { failed++; log.push("FAIL  " + name); }
    }

    // element-wise equality for flat arrays
    function flatEqual(a, b) {
        if (a.length !== b.length) return false;
        for (var i = 0; i < a.length; i++) { if (a[i] !== b[i]) return false; }
        return true;
    }

    // returns true if fn throws
    function expectThrow(fn) {
        try { fn(); return false; } catch (e) { return true; }
    }

    //=== Load the JSON fixture ===========================================
    var here = File($.fileName).parent;
    var fixtureFile = File(here.fsName + "/shim-test-fixture.json");
    if (!fixtureFile.exists) { fixtureFile = File.openDialog("Select shim-test-fixture.json"); }
    if (!fixtureFile) { alert("No fixture file selected. Aborting."); return; }
    fixtureFile.encoding = "UTF-8";
    fixtureFile.open("r");
    var raw = fixtureFile.read();
    fixtureFile.close();

    //=== Array.prototype.indexOf =========================================
    var fruits = ["apple", "banana", "cherry", "date", "banana"];
    check("indexOf finds element", fruits.indexOf("cherry") === 2);
    check("indexOf returns -1 when absent", fruits.indexOf("kiwi") === -1);
    check("indexOf returns first match", fruits.indexOf("banana") === 1);
    check("indexOf respects fromIndex", fruits.indexOf("banana", 2) === 4);
    check("indexOf handles negative fromIndex", fruits.indexOf("banana", -1) === 4);

    //=== Array.prototype.includes ========================================
    check("includes true when present", fruits.includes("date") === true);
    check("includes false when absent", fruits.includes("kiwi") === false);
    check("includes matches null", [1, null, 2].includes(null) === true);
    check("includes matches NaN", [NaN].includes(NaN) === true);

    //=== Array.prototype.forEach =========================================
    var scores = [88, 92, 75];
    var sum = 0, sawIndex = true, sawArray = true;
    scores.forEach(function (v, i, arr) {
        sum += v;
        if (typeof i !== "number") sawIndex = false;
        if (arr !== scores) sawArray = false;
    });
    check("forEach visits every element", sum === 255);
    check("forEach passes index", sawIndex);
    check("forEach passes source array", sawArray);

    //=== Array.prototype.map =============================================
    check("map transforms elements", flatEqual([1, 2, 3].map(function (v) { return v * 2; }), [2, 4, 6]));
    check("map passes index", flatEqual([10, 20].map(function (v, i) { return v + i; }), [10, 21]));

    //=== Array.prototype.filter ==========================================
    check("filter keeps matching elements",
        flatEqual([88, 92, 75, 60, 95].filter(function (v) { return v >= 80; }), [88, 92, 95]));
    check("filter can return empty", [1, 2, 3].filter(function (v) { return v > 100; }).length === 0);

    //=== JSON.parse ======================================================
    var data = JSON.parse(raw);
    check("parse reads numbers", data.meta.version === 1);
    check("parse reads booleans", data.meta.active === true);
    check("parse reads null", data.meta.released === null);
    check("parse decodes tab escape", data.strings.withTab === "col1\tcol2");
    check("parse decodes newline escape", data.strings.withNewline === "line1\nline2");
    check("parse decodes quote escape", data.strings.withQuote === 'she said "hi"');
    check("parse decodes backslash (Windows path)", data.strings.windowsPath === "C:\\Users\\jeremy\\Documents");
    check("parse decodes \\u unicode", data.strings.unicode === "caf\u00e9 na\u00efve r\u00e9sum\u00e9");
    check("parse reads nested array", data.matrix[1][1] === 4);
    check("parse reads array of objects", data.people[2].roles.length === 3);
    check("parse reads empty array", data.emptyArray.length === 0);
    check("parse rejects malformed input", expectThrow(function () { return JSON.parse("{ not: valid }"); }));
    check("parse rejects code injection", expectThrow(function () { return JSON.parse("(function(){return 1})()"); }));
    check("parse rejects non-string", expectThrow(function () { return JSON.parse(42); }));

    //=== JSON.stringify ==================================================
    check("stringify number", JSON.stringify(42) === "42");
    check("stringify string", JSON.stringify("hi") === '"hi"');
    check("stringify boolean", JSON.stringify(true) === "true");
    check("stringify null", JSON.stringify(null) === "null");
    check("stringify NaN as null", JSON.stringify(NaN) === "null");
    check("stringify Infinity as null", JSON.stringify(Infinity) === "null");
    check("stringify -Infinity as null", JSON.stringify(-Infinity) === "null");
    check("stringify undefined is undefined", JSON.stringify(undefined) === undefined);
    check("stringify function is undefined", JSON.stringify(function () {}) === undefined);
    check("stringify escapes tab", JSON.stringify("a\tb") === '"a\\tb"');
    check("stringify escapes newline", JSON.stringify("a\nb") === '"a\\nb"');
    check("stringify escapes backspace", JSON.stringify("a\bb") === '"a\\bb"');
    check("stringify escapes formfeed", JSON.stringify("a\fb") === '"a\\fb"');
    check("stringify escapes backslash", JSON.stringify("C:\\Users") === '"C:\\\\Users"');
    check("stringify escapes raw control char", JSON.stringify("\x01") === '"\\u0001"');
    check("stringify array", JSON.stringify([1, 2, 3]) === "[1,2,3]");
    check("stringify nulls undefined/function array slots",
        JSON.stringify([1, undefined, function () {}, 2]) === "[1,null,null,2]");
    check("stringify object", JSON.stringify({ a: 1, b: "x" }) === '{"a":1,"b":"x"}');
    check("stringify omits undefined-valued keys", JSON.stringify({ a: 1, b: undefined }) === '{"a":1}');
    check("stringify escapes keys", JSON.stringify({ "a\tb": 1 }) === '{"a\\tb":1}');
    check("stringify honors toJSON", JSON.stringify({ toJSON: function () { return "custom"; } }) === '"custom"');

    //=== Round-trip ======================================================
    var roundTrip = JSON.parse(JSON.stringify(data));
    check("round-trip preserves nested value", roundTrip.people[0].name === "Ada");
    check("round-trip preserves Windows path", roundTrip.strings.windowsPath === "C:\\Users\\jeremy\\Documents");

    //=== Init contract ===================================================
    check("enableModernArrayMethods returns true", enableModernArrayMethods() === true);

    //=== Report ==========================================================
    log.push("");
    log.push("-----------------------------------------");
    log.push(passed + " passed, " + failed + " failed, " + (passed + failed) + " total");
    var report = log.join("\n");

    $.writeln(report);

    try {
        var out = File(here.fsName + "/shim-test-results.txt");
        out.encoding = "UTF-8";
        out.open("w");
        out.write(report);
        out.close();
    } catch (e) {}

    try {
        alert((failed === 0 ? "All tests passed\n\n" : "Some tests FAILED\n\n") +
              passed + " passed, " + failed + " failed");
    } catch (e) {}
})();
