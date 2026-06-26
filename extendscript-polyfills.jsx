//-----------------------------------------------------------------------------------------------------------
//-- Enables working .indexOf(), .forEach(), .map(), .filter(), and .includes() functions for arrays
//
//   Note on enumerability: ExtendScript has no reliable Object.defineProperty, so these methods are added
//   as enumerable properties on Array.prototype. That means `for (var k in someArray)` will now also visit
//   "indexOf", "forEach", etc. If you iterate arrays with for...in anywhere, guard the body with
//   hasOwnProperty (or just use indexed for loops). This is the one trade-off of prototype shimming in ES3.
function enableModernArrayMethods() {

    //--- indexOf ---
    if (!Array.prototype.indexOf) {
        Array.prototype.indexOf = function (searchElement, fromIndex) {
            if (this == null) throw new TypeError('"this" is null or not defined');
            var O = Object(this);
            var len = O.length >>> 0;
            if (len === 0) return -1;
            var n = +fromIndex || 0;
            if (Math.abs(n) === Infinity) n = 0;
            if (n >= len) return -1;
            var k = Math.max(n >= 0 ? n : len - Math.abs(n), 0);
            while (k < len) {
                if (k in O && O[k] === searchElement) return k;
                k++;
            }
            return -1;
        };
    }

    //--- forEach ---
    if (!Array.prototype.forEach) {
        Array.prototype.forEach = function (callback, thisArg) {
            if (this == null) throw new TypeError('Array.prototype.forEach called on null or undefined');
            if (typeof callback !== "function") throw new TypeError(callback + ' is not a function');
            var O = Object(this);
            var len = O.length >>> 0;
            for (var i = 0; i < len; i++) {
                if (i in O) callback.call(thisArg, O[i], i, O);
            }
        };
    }

    //--- map ---
    if (!Array.prototype.map) {
        Array.prototype.map = function (callback, thisArg) {
            if (this == null) throw new TypeError('Array.prototype.map called on null or undefined');
            if (typeof callback !== "function") throw new TypeError(callback + ' is not a function');
            var O = Object(this);
            var len = O.length >>> 0;
            var A = new Array(len);
            for (var i = 0; i < len; i++) {
                if (i in O) A[i] = callback.call(thisArg, O[i], i, O);
            }
            return A;
        };
    }

    //--- filter ---
    if (!Array.prototype.filter) {
        Array.prototype.filter = function (callback, thisArg) {
            if (this == null) throw new TypeError('Array.prototype.filter called on null or undefined');
            if (typeof callback !== "function") throw new TypeError(callback + ' is not a function');
            var O = Object(this);
            var len = O.length >>> 0;
            var res = [];
            for (var i = 0; i < len; i++) {
                if (i in O) {
                    var val = O[i];
                    if (callback.call(thisArg, val, i, O)) res.push(val);
                }
            }
            return res;
        };
    }

    //--- includes ---
    if (!Array.prototype.includes) {
        Array.prototype.includes = function (searchElement, fromIndex) {
            if (this == null) throw new TypeError('"this" is null or not defined');
            var O = Object(this);
            var len = O.length >>> 0;
            if (len === 0) return false;
            var n = +fromIndex || 0;
            if (Math.abs(n) === Infinity) n = 0;
            var k = Math.max(n >= 0 ? n : len - Math.abs(n), 0);
            while (k < len) {
                var currentElement = O[k];
                if (searchElement === currentElement || (searchElement !== searchElement && currentElement !== currentElement)) {
                    return true; // handles NaN
                }
                k++;
            }
            return false;
        };
    }

    return true; // signal success
}

//-----------------------------------------------------------------------------------------------------------
//-- JSON shim - gives us JSON reading and parsing capabilities
function ensureJSONCompatibility() {
    // Only patch if JSON isn't already defined
    if (typeof JSON === "undefined") {
        JSON = {};
    }

    // Characters that are legal inside a JS string but must be escaped to produce
    // valid JSON, plus a range of format / zero-width / line-separator code points
    // that should always be \u-escaped so the output survives transport intact.
    // (Same character class json2.js uses.)
    var ESCAPABLE = /[\\\"\x00-\x1f\x7f-\x9f\u00ad\u0600-\u0604\u070f\u17b4\u17b5\u200c-\u200f\u2028-\u2029\u2060-\u2064\u206a-\u206f\ufeff\ufff0-\uffff]/g;

    // Lookup for the named single-character escapes.
    var META = {
        "\b": "\\b",
        "\t": "\\t",
        "\n": "\\n",
        "\f": "\\f",
        "\r": "\\r",
        '"': '\\"',
        "\\": "\\\\"
    };

    // Quote a string: wrap in double quotes and escape every character that needs it.
    //
    // This replaces the original chained .replace() approach. Doing it in one regex
    // pass with a lookup table fixes two things:
    //   1. Coverage - the hand-rolled version only escaped \n \r \t plus quote and
    //      backslash. Anything else below 0x20 (\b, \f, vertical tab, etc.) leaked
    //      through verbatim and produced invalid JSON. The \uXXXX fallback below now
    //      catches all of those.
    //   2. Ordering - chaining replaces means you must escape backslashes before
    //      quotes (or vice versa) or you double-escape the wrong character. A single
    //      pass removes that hazard entirely.
    //
    // Backslashes are still handled (META maps "\\" -> "\\\\"), so Windows file paths
    // like C:\Users\... serialize correctly. That was the original bug: forward-slash
    // macOS paths happened to need no escaping, so boot worked there but the unescaped
    // Windows paths produced invalid \U / \A sequences that broke the panel-side parse.
    function quote(s) {
        ESCAPABLE.lastIndex = 0;
        if (!ESCAPABLE.test(s)) return '"' + s + '"';
        return '"' + s.replace(ESCAPABLE, function (a) {
            var c = META[a];
            return typeof c === "string"
                ? c
                : "\\u" + ("0000" + a.charCodeAt(0).toString(16)).slice(-4);
        }) + '"';
    }

    // --- JSON.parse ---
    if (typeof JSON.parse !== "function") {
        // Code points that must be escaped before the text reaches eval, otherwise a
        // line separator (U+2028) or similar can terminate the expression early or
        // smuggle in source. Escaped up front so the validator below sees clean text.
        var CX = /[\u0000\u00ad\u0600-\u0604\u070f\u17b4\u17b5\u200c-\u200f\u2028-\u2029\u2060-\u2064\u206a-\u206f\ufeff\ufff0-\uffff]/g;

        JSON.parse = function (text) {
            if (typeof text !== "string") throw new Error("JSON.parse: input is not a string");

            var t = text;
            CX.lastIndex = 0;
            if (CX.test(t)) {
                t = t.replace(CX, function (a) {
                    return "\\u" + ("0000" + a.charCodeAt(0).toString(16)).slice(-4);
                });
            }

            // Four-stage structural validation from Douglas Crockford's json2.js. We
            // only fall back to eval if the text contains nothing but well-formed JSON
            // tokens. Stage 1 replaces every valid backslash escape with '@', stage 2
            // replaces every simple value (string, number, true/false/null) with ']',
            // stage 3 strips opening brackets that follow a comma/colon/start. If what
            // survives is only structural punctuation and whitespace, the text is JSON
            // and safe to eval. This is what makes an eval-based parser defensible for
            // arbitrary input rather than trusted input only.
            if (/^[\],:{}\s]*$/.test(
                    t.replace(/\\(?:["\\\/bfnrt]|u[0-9a-fA-F]{4})/g, "@")
                     .replace(/"[^"\\\n\r]*"|true|false|null|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?/g, "]")
                     .replace(/(?:^|:|,)(?:\s*\[)+/g, ""))) {
                try {
                    // Safe: the input passed structural validation above.
                    return eval("(" + t + ")");
                } catch (e) {
                    throw new Error("JSON.parse error: " + e.message);
                }
            }
            throw new SyntaxError("JSON.parse: malformed JSON text");
        };
    }

    // --- JSON.stringify ---
    if (typeof JSON.stringify !== "function") {
        JSON.stringify = function (obj) {
            // Honor a toJSON() method if present (Date and custom types) so the output
            // matches native behavior instead of serializing the object as {}.
            if (obj && typeof obj.toJSON === "function") {
                obj = obj.toJSON();
            }

            var type = typeof obj;

            if (obj === null) return "null";

            // Native JSON.stringify drops functions and undefined at the top level
            // (returns undefined). The array/object branches below depend on this
            // signal to decide between emitting "null" and omitting a key.
            if (type === "undefined" || type === "function") return undefined;

            if (type === "boolean") return String(obj);

            // Non-finite numbers (NaN, Infinity, -Infinity) are not valid JSON; native
            // serializes them as null rather than emitting the literal words.
            if (type === "number") return isFinite(obj) ? String(obj) : "null";

            if (type === "string") return quote(obj);

            if (obj instanceof Array) {
                var arr = [];
                for (var i = 0; i < obj.length; i++) {
                    var item = JSON.stringify(obj[i]);
                    // In arrays, undefined / function elements become null so index
                    // positions are preserved (matches native output).
                    arr.push(typeof item === "undefined" ? "null" : item);
                }
                return "[" + arr.join(",") + "]";
            }

            if (type === "object") {
                var props = [];
                for (var key in obj) {
                    if (obj.hasOwnProperty(key)) {
                        var val = JSON.stringify(obj[key]);
                        // Keys whose values serialize to undefined are omitted, exactly
                        // as native JSON.stringify does. Keys are quoted through the same
                        // escaper so special characters in key names stay valid.
                        if (typeof val !== "undefined") {
                            props.push(quote(key) + ":" + val);
                        }
                    }
                }
                return "{" + props.join(",") + "}";
            }

            throw new Error("JSON.stringify: unsupported type " + type);
        };
    }
}
