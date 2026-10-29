//--------------------------------------------------------------------------------------------------------
//-- Enables working .indexOf(), .forEach(), .map(), .filter(), and .includes() functions for arrays
//-- Note on enumerability: ExtendScript has no reliable Object.defineProperty, so these methods are added
//   as enumerable properties on Array.prototype. That means `for (var k in someArray)` will now also visit
//   'indexOf', 'forEach', etc. If you iterate arrays with for...in anywhere, guard the body with
//   hasOwnProperty (or just use indexed for loops). This is the one trade-off of prototype shimming in ES3.
function enableModernArrayMethods() {

    //-- indexOf
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

    //-- forEach
    if (!Array.prototype.forEach) {
        Array.prototype.forEach = function (callback, thisArg) {
            if (this == null) throw new TypeError('Array.prototype.forEach called on null or undefined');
            if (typeof callback !== 'function') throw new TypeError(callback + ' is not a function');
            var O = Object(this);
            var len = O.length >>> 0;
            for (var i = 0; i < len; i++) {
                if (i in O) callback.call(thisArg, O[i], i, O);
            }
        };
    }

    //-- map
    if (!Array.prototype.map) {
        Array.prototype.map = function (callback, thisArg) {
            if (this == null) throw new TypeError('Array.prototype.map called on null or undefined');
            if (typeof callback !== 'function') throw new TypeError(callback + ' is not a function');
            var O = Object(this);
            var len = O.length >>> 0;
            var A = new Array(len);
            for (var i = 0; i < len; i++) {
                if (i in O) A[i] = callback.call(thisArg, O[i], i, O);
            }
            return A;
        };
    }

    //-- filter
    if (!Array.prototype.filter) {
        Array.prototype.filter = function (callback, thisArg) {
            if (this == null) throw new TypeError('Array.prototype.filter called on null or undefined');
            if (typeof callback !== 'function') throw new TypeError(callback + ' is not a function');
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

    //-- includes
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
                    return true; //-- handles NaN
                }
                k++;
            }
            return false;
        };
    }

    return true; //-- signal success
}

//--------------------------------------------------------------------------------------------------------
//-- JSON shim - gives us JSON.parse, JSON.stringify, and JSON.load(file)
//-- Versioned through JSON._shimVersion. Every script in a shared engine (#targetengine 'session')
//   uses whichever JSON was installed first, so a newer shim replaces any older or unversioned one,
//   no matter which script ran first. A native JSON implementation is never replaced.
function ensureJSONCompatibility() {
    var SHIM_VERSION = 3;

    if (typeof JSON === 'undefined' || JSON === null) {
        JSON = {};
    }

    //-- ExtendScript has no native JSON, but other hosts do: never replace a native implementation
    if (isNativeFunction(JSON.stringify) && isNativeFunction(JSON.parse)) return;

    //-- This version (or a newer one) is already installed in this engine
    if (typeof JSON._shimVersion === 'number' && JSON._shimVersion >= SHIM_VERSION) return;

    //-- Characters that must be escaped to produce valid JSON, plus format / zero-width /
    //   line-separator / non-character code points that are always \u-escaped so the output
    //   survives transport intact.
    var ESCAPABLE = /[\\\"\x00-\x1f\x7f-\x9f\u00ad\u0600-\u0604\u070f\u17b4\u17b5\u200c-\u200f\u2028-\u202f\u2060-\u206f\ufeff\ufff0-\uffff]/g;

    //-- Code points escaped before parse validation, so a line separator (U+2028) or similar
    //   can't end the eval expression early or smuggle in source.
    var CX = /[\u0000\u00ad\u0600-\u0604\u070f\u17b4\u17b5\u200c-\u200f\u2028-\u202f\u2060-\u206f\ufeff\ufff0-\uffff]/g;

    //-- Named single-character escapes
    var META = {
        '\b': '\\b',
        '\t': '\\t',
        '\n': '\\n',
        '\f': '\\f',
        '\r': '\\r',
        '"':  '\\"',
        '\\': '\\\\'
    };

    //-- Per-call stringify state: current indent, indent step, and the containers on the current path
    var gap = '';
    var indent = '';
    var stack = [];


    //-- stringify
    //-- space (indent) is supported. replacer is not: ExtendScript code rarely needs it, and it roughly
    //   doubles the size of the serializer. Add it here if you require it.
    JSON.stringify = function (value, replacer, space) {
        //-- Save outer state so a toJSON() that calls JSON.stringify can't corrupt the call in progress
        var savedGap    = gap;
        var savedIndent = indent;
        var savedStack  = stack;

        gap = '';
        indent = '';
        stack = [];

        if (typeof space === 'number') {
            var n = Math.min(10, Math.max(0, Math.floor(space)));
            for (var i = 0; i < n; i++) indent += ' ';
        } else if (typeof space === 'string') {
            indent = space.substring(0, 10);
        }

        try {
            return str('', { '': value });
        } finally {
            gap    = savedGap;
            indent = savedIndent;
            stack  = savedStack;
        }
    };


    //-- parse
    //-- Four-stage structural validation. Stage 1 collapses every valid backslash escape to '@',
    //   stage 2 collapses every simple value (string, number, true / false / null) to ']', stage 3
    //   strips opening brackets that follow a comma, colon, or the start. If only structural
    //   punctuation and whitespace survive, the text is JSON and safe to eval.
    //   This rejects comments, bare words, and function calls instead of running them.
    JSON.parse = function (text, reviver) {
        var t = String(text);

        CX.lastIndex = 0;
        if (CX.test(t)) {
            t = t.replace(CX, function (a) {
                return '\\u' + ('0000' + a.charCodeAt(0).toString(16)).slice(-4);
            });
        }

        var unescaped = t.replace(/\\(?:["\\\/bfnrt]|u[0-9a-fA-F]{4})/g, '@');

        var scrubbed = unescaped
            .replace(/"[^"\\\n\r]*"|true|false|null|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?/g, ']')
            .replace(/(?:^|:|,)(?:\s*\[)+/g, '');

        if (!/^[\],:{}\s]*$/.test(scrubbed)) {
            throw new SyntaxError('JSON.parse: malformed JSON text');
        }

        //-- The structural validation above still lets a few non-JSON forms through to eval:
        //   trailing or doubled commas ([1,] {"a":1,} [1,,2]), leading zeros (01, which eval reads
        //   as octal), and a bare trailing decimal point (1.). Native JSON.parse rejects all of
        //   them, so this does too.
        //   Strings are blanked first so commas and digits inside them are never inspected.
        var structure = unescaped.replace(/"[^"\\\n\r]*"/g, '""');

        if (/,\s*[\]}]|[\[{,:]\s*,|(?:^|[\s,:\[])-?0\d|\d\.(?!\d)/.test(structure)) {
            throw new SyntaxError('JSON.parse: malformed JSON text');
        }

        var result;
        try {
            //-- Safe: the input passed structural validation above
            result = eval('(' + t + ')');
        } catch (e) {
            throw new SyntaxError('JSON.parse: ' + e.message);
        }

        return (typeof reviver === 'function') ? walk({ '': result }, '', reviver) : result;
    };


    //-- load
    //-- Read and parse a UTF-8 JSON file
    JSON.load = function (file) {
        if (typeof file === 'string') file = File(file);

        if (!file || !file.exists) {
            throw new Error('JSON.load: file not found');
        }

        file.encoding = 'UTF-8';

        if (!file.open('r')) {
            throw new Error('JSON.load: unable to open file ' + file.fsName);
        }

        var jsonText;
        try {
            jsonText = file.read();
        } finally {
            file.close();
        }

        //-- A BOM is not valid JSON
        if (jsonText.length && jsonText.charCodeAt(0) === 0xFEFF) jsonText = jsonText.substring(1);

        try {
            return JSON.parse(jsonText);
        } catch (e) {
            throw new Error('JSON.load: parse error in ' + file.fsName + ': ' + e.message);
        }
    };

    JSON._shimVersion = SHIM_VERSION;


    //-- helpers

    //-- Serialize holder[key]. Returns undefined for values JSON skips (undefined, functions)
    function str(key, holder) {
        var value = holder[key];

        if (value && typeof value === 'object') {
            if (typeof value.toJSON === 'function') {
                value = value.toJSON(key);
            } else if (classOf(value) === 'Date') {
                //-- ES3 dates have no toJSON(): write the ISO string native JSON would
                value = dateToISO(value);
            }
        }

        //-- Unwrap Number / String / Boolean objects, as native JSON does
        if (value && typeof value === 'object') {
            var cls = classOf(value);
            if (cls === 'Number' || cls === 'String' || cls === 'Boolean') value = value.valueOf();
        }

        switch (typeof value) {
            case 'string':
                return quote(value);

            case 'number':
                //-- NaN and Infinity are not valid JSON: native serializes them as null
                return isFinite(value) ? String(value) : 'null';

            case 'boolean':
                return String(value);

            case 'object':
                if (value === null) return 'null';
                return serializeContainer(value);

            default:
                //-- undefined, function: callers skip the key (objects) or write null (arrays)
                return undefined;
        }
    }

    //-- Serialize an array or object, indenting when space was given
    function serializeContainer(value) {
        //-- Circular reference check against the current path only. An object that appears twice
        //   without containing itself is legal JSON input and must still serialize.
        for (var s = 0; s < stack.length; s++) {
            if (stack[s] === value) {
                throw new TypeError('JSON.stringify: cannot serialize a circular structure');
            }
        }

        var mind = gap;
        var partial = [];
        var result;

        stack.push(value);
        gap += indent;

        try {
            if (isArray(value)) {
                for (var i = 0; i < value.length; i++) {
                    //-- undefined / function elements become null so index positions are preserved
                    partial.push(str(i, value) || 'null');
                }

                result = (!partial.length) ? '[]'
                    : (gap) ? '[\n' + gap + partial.join(',\n' + gap) + '\n' + mind + ']'
                    : '[' + partial.join(',') + ']';
            } else {
                for (var key in value) {
                    if (!Object.prototype.hasOwnProperty.call(value, key)) continue;

                    var v = str(key, value);

                    //-- Keys whose values serialize to undefined are omitted, as native does
                    if (v !== undefined) partial.push(quote(key) + ((gap) ? ': ' : ':') + v);
                }

                result = (!partial.length) ? '{}'
                    : (gap) ? '{\n' + gap + partial.join(',\n' + gap) + '\n' + mind + '}'
                    : '{' + partial.join(',') + '}';
            }
        } finally {
            stack.pop();
            gap = mind;
        }

        return result;
    }

    //-- Quote a string in one regex pass with a lookup table. Single pass removes the ordering hazard
    //   of chained replaces, and the \u fallback covers every control character, not just \n \r \t.
    //   Backslashes are escaped too, so Windows paths like C:\Users\... serialize as valid JSON.
    function quote(s) {
        ESCAPABLE.lastIndex = 0;
        if (!ESCAPABLE.test(s)) return '"' + s + '"';

        return '"' + s.replace(ESCAPABLE, function (a) {
            var c = META[a];
            return (typeof c === 'string') ? c : '\\u' + ('0000' + a.charCodeAt(0).toString(16)).slice(-4);
        }) + '"';
    }

    //-- Apply a parse reviver bottom-up, deleting keys the reviver returns undefined for
    function walk(holder, key, reviver) {
        var value = holder[key];

        if (value && typeof value === 'object') {
            for (var k in value) {
                if (!Object.prototype.hasOwnProperty.call(value, k)) continue;

                var v = walk(value, k, reviver);

                if (v !== undefined) {
                    value[k] = v;
                } else {
                    delete value[k];
                }
            }
        }

        return reviver.call(holder, key, value);
    }

    //-- ISO 8601 UTC string matching native Date.prototype.toJSON. Invalid dates become null
    function dateToISO(d) {
        if (isNaN(d.getTime())) return null;

        return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1, 2) + '-' + pad(d.getUTCDate(), 2) +
            'T' + pad(d.getUTCHours(), 2) + ':' + pad(d.getUTCMinutes(), 2) + ':' + pad(d.getUTCSeconds(), 2) +
            '.' + pad(d.getUTCMilliseconds(), 3) + 'Z';
    }

    //-- Left-pad a number with zeros
    function pad(num, width) {
        var s = String(num);
        while (s.length < width) s = '0' + s;
        return s;
    }

    //-- Internal class name, e.g. 'Array', 'Date', 'Number'
    function classOf(v) {
        return Object.prototype.toString.call(v).slice(8, -1);
    }

    //-- Array check that also catches arrays created in another engine
    function isArray(v) {
        return (v instanceof Array) || classOf(v) === 'Array';
    }

    //-- True for a built-in function (its source text is [native code])
    function isNativeFunction(fn) {
        return typeof fn === 'function' && /\[native code\]/.test(String(fn));
    }
}
