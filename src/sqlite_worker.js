// Switch to false if your browser doesn't support IOFS
var enableIOFS = false;

// Switch to false if your browser doesn't support NativeIOFS
var enableNativeIOFS = true;

// Switch to false if your browser doesn't support IndexedDB.
var enableIDB = false;

function loadIndexedDB() {
  return new Promise(function(resolve, reject) {
    // console.log('Load IndexedDB');
    FS.syncfs(true, function(err) {
      if (err === null) {
        resolve();
      } else {
        reject(err);
      }
    });
  });
}

function storeIndexedDB() {
  return new Promise(function(resolve, reject) {
    // console.log('Store IndexedDB');
    FS.syncfs(false, function(err) {
      if (err === null) {
        resolve();
      } else {
        reject(err);
      }
    });
  });
}

var indexedDBLoaded = false;

function loadIndexedDBOnce() {
  if (indexedDBLoaded) {
    return Promise.resolve();
  }
  indexedDBLoaded = true;
  return loadIndexedDB();
}

function sqliteError(description, code) {
  var message = Module.sqlite3_errstr(code);
  return `${description}: ${message} (${code})`
}

function sqliteErrorMessage(description, code, message) {
  return `${description}: ${message} (${code})`
}

function sqliteOpen(file) {
  return Module.sqlite3_open(file).then(result => {
    if (result.result != 0) {
      return Promise.reject(sqliteError('failed to open database', result.result));
    }
    return result;
  })
 }

function sqliteClose(connection) {
  return Module.sqlite3_close_v2(connection.pDb).then((result) => {
    if (connection.indexedDB) {
      return storeIndexedDB().then(() => {
        if (result != 0) {
          throw sqliteError('failed to close database', result);
        }
        return result;
      });
    }
    if (result != 0) {
      return Promise.reject(sqliteError('failed to close database', result));
    }
    return Promise.resolve(result);
  });
  }

function sqliteExec(connection, query, row_callback) {
  return new Promise(function(resolve, reject) {
    Module.sqlite3_exec_safe(connection.pDb, query, function(columns, values, names) {
      row_callback({
        columns: columns,
        values: values,
        names: names,
      });
    }, function(result) {
      if (result.result != 0) {
        reject(sqliteErrorMessage('failed to query database', result.result, result.errmsg));
      } else {
        resolve(result);
      }
    });
  });
}

function handler(port, data) {
  switch (data.command) {
    case 'sqliteOpen':
      // console.log('Received sqliteOpen', data.request);
      sqliteOpen(data.request.file)
        .then(connection => port.postMessage({connection: connection}))
        .catch(err => port.postMessage({error: err}));
      break;
    case 'sqliteClose':
      // console.log('Received sqliteClose', data.request);
      sqliteClose(data.request.connection)
        .then(result => port.postMessage({result: result}))
        .catch(err => port.postMessage({error: err}));
      break;
    case 'sqliteExec':
      // console.log('Received sqliteExec', data.request);
      sqliteExec(data.request.connection, data.request.query, row => port.postMessage({row: row}))
        .then(result => port.postMessage({result: result}))
        .catch(err => port.postMessage({error: err}));
      break;
    case 'fsUnlink':
      try {
        FS.unlink(data.request.file);
        port.postMessage({});
      } catch (e) {
        port.postMessage({error: {
          errno: e.errno,
          code: e.code,
          message: e.message,
        }});
      }
      break;
    case 'profile':
      console.log('Profile', CHROMEFS.profileData);
      if (enableIOFS) {
        console.log('Profile', IOFS.profileData);
      }
      if (enableNativeIOFS) {
        console.log('Profile', NATIVEIOFS.profileData);
      }
      break;
    default:
      port.postMessage({error: 'Unknown command ', data});
      break;
  }
}

function handlerInitialized(port, data) {
  if (ready) {
    handler(port, data);
  } else {
    closures.push(function() { handler(port, data); });
  }
}

// Channel for Web worker.
onmessage = function(event) {
  handlerInitialized(event.ports[0], event.data);
};

// Channel for Shared worker.
onconnect = function(e) {
  e.ports.forEach(function(port) {
    port.onmessage = function(event) {
      handlerInitialized(event.ports[0], event.data);
    };
  });
}

var ready = false;
var closures = [];

Module.onRuntimeInitialized = function() {
  console.log('SQLite worker on runtime initialized');
  FS.mkdir('/chrome');
  FS.mount(CHROMEFS, { root: '.' }, '/chrome');

  if (enableIOFS) {
    FS.mkdir('/io');
    FS.mount(IOFS, { root: '.' }, '/io');
  }

  if (enableNativeIOFS) {
    FS.mkdir('/nativeio');
    FS.mount(NATIVEIOFS, { root: '.' }, '/nativeio');
  }

  if (enableIDB) {
    // Emscripten's IDB support is not included by default in the LLVM backend.
    FS.mkdir('/idb');
    FS.mount(IDBFS, { root: '.' }, '/idb');
  }

  var callbacks = closures;
  closures = null;
  ready = true;
  callbacks.forEach(callback => callback());
}
