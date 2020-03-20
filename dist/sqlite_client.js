console.log('SQLite client');

var worker = null;

function sqlite_call(command, request, callback) {
  var channel = new MessageChannel();
  channel.port1.onmessage = function(event) {
    callback(event.data);
  };
  if (worker.postMessage !== undefined) {
    worker.postMessage({command: command, request: request}, [channel.port2]);
  } else if (worker.port.postMessage !== undefined) {
    worker.port.postMessage({command: command, request: request}, [channel.port2]);
  } else {
    throw new Error('Failed to call postMessage');
  }
}

// Initialize WebSQL as a Web worker.
function websql_init() {
  if (worker != null) {
    return;
  }
  worker = new Worker('sqlite3.js');
  worker.onerror = function(err) { console.log(err); };
  worker.onmessage = function(event) {
    console.log('SQLite web worker message received', event);
  };
}

// Initialize WebSQL as a Shared worker.
function websql_init_shared() {
  worker = new SharedWorker('sqlite3.js');
  worker.onerror = function(err) {
    console.log('SQLite share worker error', err);
  };
  worker.port.onmessage = function(event) {
    console.log('SQLite shared worker message received', event);
  };
}

function websql_open(file) {
  return new Promise(function(resolve, reject) {
    sqlite_call('sqliteOpen', {file: file}, function(response) {
      if (response.error) {
        reject(response.error);
      } else {
        resolve(response.connection);
      }
    });
  });
}

function websql_close(connection) {
  return new Promise(function(resolve, reject) {
    sqlite_call('sqliteClose', {connection: connection}, function(response) {
      if (response.error) {
        reject(response.error);
      } else {
        resolve(response.connection);
      }
    });
  });
}

function websql_exec(connection, query, row_callback) {
  return new Promise(function(resolve, reject) {
    sqlite_call('sqliteExec', {connection: connection, query: query}, function(response) {
      if (response.error) {
        reject(response.error);
      } else if (response.row !== undefined) {
        row_callback(response.row);
      } else if (response.result !== undefined) {
        resolve(response.result);
      } else {
        reject('Invalid response: ' + JSON.stringify(response));
      }
    });
  });
}

function websql_profile(file) {
  return new Promise(function(resolve, reject) {
    sqlite_call('profile', {}, function(response) {
      if (response.error) {
        reject(response.error);
      } else {
        resolve();
      }
    });
  });
}

function fsUnlink(file) {
  return new Promise(function(resolve, reject) {
    sqlite_call('fsUnlink', {file: file}, function(response) {
      if (response.error) {
        reject(response.error);
      } else {
        resolve();
      }
    });
  });
}
