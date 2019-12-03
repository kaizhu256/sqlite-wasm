namespace Module {
    // Generates callback indexes to pass callbacks between sqlite3_exec and
    // sqlite3_exec_callback.
    //
    // At the moment to pass JavaScript callbacks to C++ it's necessary to call
    // addFunction, but unfortunately that results in OOM when running in Google
    // Chrome (although not in Chromium).
    var callbackCounter = 1;

    // Callbacks to pass between sqlite3_exec and sqlite3_exec_callback. The
    // callbacks are only held while a query is running.
    //
    // See callbackCounter for why this exists.
    const callbackMap = new Map();

    // Callback passed to sqlite3_exec. This is the cached result of calling
    // addFunction(sqlite3_exec_callback, ...).
    var sqlite3_exec_function
        : ptr<fn<(callbackIndex: i32, numColumns: i32, pColumnTexts: ptr<arr<ptr<str>>>, pColumnNames: ptr<arr<ptr<str>>>) => number>>;

    export declare function _sqlite3_open(filename: ptr<str>, ppDb: ptr<ptr<sqlite3>>): SQLiteResult
    export declare function _sqlite3_close_v2(pDb: ptr<sqlite3>): SQLiteResult
    export declare function _sqlite3_exec<T extends ptr<any>>(
        pDb: ptr<sqlite3>,
        sql: ptr<str>,
        callback: ptr<fn<(x: T | 0, numColumns: i32, columnTexts: ptr<arr<ptr<str>>>, columnNames: ptr<arr<ptr<str>>>) => i32>> | 0,
        errmsg: ptr<sqlite3_ptr<str>> | 0
    ): SQLiteResult
    export declare function _sqlite3_free(ptr: sqlite3_ptr<any> | 0): void

    export const sqlite3_open
        : (filename: string) => { result: SQLiteResult, pDb: ptr<sqlite3> | 0 }
        = (filename) => {
            const stack = stackSave()
            const ppDb = stackAlloc<ptr<sqlite3>>(4)
            const result = Module["ccall"]<"number", ["string", "number"]>("sqlite3_open", "number", ["string", "number"], [filename, ppDb])
            const pDb = getValue<ptr<sqlite3>>(ppDb, "*")
            stackRestore(stack)
            return { result, pDb }
        }
    export const sqlite3_close_v2
        : (pDb: ptr<sqlite3>) => SQLiteResult
        = Module["cwrap"]("sqlite3_close_v2", "number", ["number"])

    const sqlite3_exec_callback
        : (callbackIndex: i32, numColumns: i32, pColumnTexts: ptr<arr<ptr<str>>>, pColumnNames: ptr<arr<ptr<str>>>) => number
        = (callbackIndex, numColumns, pColumnTexts, pColumnNames) => {
            const columnTexts = []
            const columnNames = []
            for (let i: number = pColumnTexts; i < pColumnTexts + numColumns * 4; i += 4) {
                const columnText = UTF8ToString(getValue<ptr<str>>(i as ptr<ptr<str>>, "*"))
                columnTexts.push(columnText)
            }
            for (let i: number = pColumnNames; i < pColumnNames + numColumns * 4; i += 4) {
                const columnName = UTF8ToString(getValue<ptr<str>>(i as ptr<ptr<str>>, "*"))
                columnNames.push(columnName)
            }

            var callback = callbackMap.get(callbackIndex);
            if (callback) {
                return (callback(numColumns, columnTexts, columnNames) as any) | 0 as i32;
            }

            return 0;
        }

    export const sqlite3_exec
        : (
            pDb: ptr<sqlite3>,
            sql: string,
            callback?: (numColumns: number, columnTexts: string[], columnNames: string[]) => boolean,
        ) => { result: SQLiteResult, errmsg: string | null }
        = (pDb, sql, callback) => {
            while (!sqlite3_exec_function) {
                // addFunction may return 0 which is a valid WebAssembly
                // function index but sqlite3 thinks it's a NULL and so it
                // doesn't execute the callback. For this reason, we need to
                // skip the function with index 0.
                sqlite3_exec_function = addFunction(sqlite3_exec_callback, 'iiiii');
            }

            var callbackFunction = 0;
            var callbackIndex = 0;

            if (callback) {
                callbackFunction = sqlite3_exec_function;
                callbackIndex = callbackCounter;
                callbackMap.set(callbackIndex, callback);
                ++callbackCounter;
            }

            const stack = stackSave()
            const ppErrmsg = stackAlloc<sqlite3_ptr<str>>(4)
            const result = Module["ccall"]<"number", ["number", "string", "number", "number", "number"]>("sqlite3_exec", "number",
                ["number", "string", "number", "number", "number"],
                [pDb, sql, callbackFunction, callbackIndex, ppErrmsg])
            const pErrmsg = getValue<sqlite3_ptr<str>>(ppErrmsg, "*")
            stackRestore(stack)
            const errmsg = pErrmsg === 0 ? null : UTF8ToString(pErrmsg)
            sqlite3_free(pErrmsg)

            if (callback) {
                callbackMap.delete(callbackIndex);
            }

            return { result, errmsg }
        }
    export const sqlite3_free
        : (ptr: sqlite3_ptr<any> | 0) => void
        = Module["cwrap"]("sqlite3_free", "undefined", ["number"])

    export const sqlite3_errstr
    : (code: number) => string
        = (code) => {
            const stack = stackSave()
            const errmsg = Module["ccall"]<"string", ["number"]>("sqlite3_errstr", "string", ["number"], [code])
            stackRestore(stack)
            return errmsg
        }

    export const sqlite3_exec_safe
        : (
            pDb: ptr<sqlite3>,
            sql: string,
            row_callback: (numColumns: number, columnTexts: string[], columnNames: string[]) => boolean,
            callback: (result: { result: SQLiteResult, errmsg: string | null }) => void
        ) => void
        = (pDb, sql, row_callback, callback) => {
            navigator.locks.request('sqlite_transaction', async () => {
                return sqlite3_exec(pDb, sql, row_callback);
            }).then(function(result: { result: SQLiteResult, errmsg: string | null }) {
                callback(result);
            });
        }

    export const sqlite3_exec_unsafe
        : (
            pDb: ptr<sqlite3>,
            sql: string,
            row_callback: (numColumns: number, columnTexts: string[], columnNames: string[]) => boolean,
            callback: (result: { result: SQLiteResult, errmsg: string | null }) => void
        ) => void
        = (pDb, sql, row_callback, callback) => {
            callback(sqlite3_exec(pDb, sql, row_callback));
        }
}
