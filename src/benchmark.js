async function measure(fn) {
  var start = performance.now();
  await fn();
  var end = performance.now();
  console.log('Run: ', end - start);
}

var benchWorker = 'web';

function init() {
  switch (benchWorker) {
    case 'web':
      websql_init();
      break;
    case 'shared':
      websql_init_shared();
      break;
    default:
      throw 'Unknown worker';
  }
}

async function enable_mmap(connection) {
  const mmap_size = 10485760;
  await websql_exec(connection, `PRAGMA mmap_size=${mmap_size};`, row => { });
}

async function disable_mmap(connection) {
  await websql_exec(connection, "PRAGMA mmap_size=0;", row => { });
}

async function single(file) {
  init();

  connection = await websql_open(file);
  try {
    await websql_exec(connection, "CREATE TABLE tbl(name varchar(100));", row => { });
  } catch (e) {}

  await websql_exec(connection, "INSERT INTO tbl VALUES ('hello');", row => { });
  await websql_exec(connection, "SELECT * FROM tbl;", row => { });
  await websql_close(connection);
}

var runs = 1000;

async function many_rw(file, use_mmap) {
  var n = runs;

  try {
    await fsUnlink(file);
  } catch (e) {
    if (e.code !== "ENOENT") {
      throw e;
    }
  }

  connection = await websql_open(file);
  if (use_mmap) {
    await enable_mmap(connection);
    await websql_exec(connection, `PRAGMA mmap_size;`, row => { console.log(row); });
  }

  try {
    await websql_exec(connection, "CREATE TABLE tbl(name varchar(100));", row => { });
  } catch (e) {}

  var rows = 0;
  for (var i = 0; i < n; ++i) {
    await websql_exec(connection, `INSERT INTO tbl VALUES ('${i}');`, row => { });
    await websql_exec(connection, `SELECT * FROM tbl WHERE name = '${i}';`, row => { ++rows });
  }

  if (rows != n) {
    console.log(`${file}: readwrite: rows = ${rows}; want ${n} rows`);
  }

  await websql_close(connection);
}

async function many_wo(file, use_mmap) {
  var n = runs;

  try {
    await fsUnlink(file);
  } catch (e) {
    if (e.code !== "ENOENT") {
      throw e;
    }
  }

  connection = await websql_open(file);
  if (use_mmap) {
    await enable_mmap(connection);
    await websql_exec(connection, `PRAGMA mmap_size;`, row => { console.log(row); });
  }

  try {
    await websql_exec(connection, "CREATE TABLE tbl(name varchar(100));", row => { });
  } catch (e) {}

  for (var i = 0; i < n; ++i) {
    await websql_exec(connection, "INSERT INTO tbl VALUES ('" + i + "');", row => { })
  }

  await websql_close(connection);
}

async function many_ro(file, use_mmap) {
  var n = runs;

  connection = await websql_open(file);
  if (use_mmap) {
    await enable_mmap(connection);
  }

  var rows = 0;
  for (var i = 0; i < n; ++i) {
    await websql_exec(connection, `SELECT * FROM tbl WHERE name = '${i}';`, row => { ++rows });
  }

  if (rows != n) {
    console.log(`${file}: readonly: rows = ${rows}; want ${n} rows`);
  }

  await websql_close(connection);
}

async function runBenchmarkChromeFS() {
  console.log('Running Chrome FS benchmark');

  init();

  await measure(async () => {
    await many_wo('/chrome/hello.db');
    await many_ro('/chrome/hello.db');
    await many_rw('/chrome/hello.db');
  });

  websql_profile();
}

async function runBenchmarkIOFS() {
  console.log('Running IOFS benchmark');

  init();

  await measure(async () => {
    await many_wo('/io/hello.db');
    await many_ro('/io/hello.db');
    await many_rw('/io/hello.db');
  });

  websql_profile();
}

async function runBenchmarkNativeIOFS() {
  console.log('Running IOFS benchmark');

  init();

  await measure(async () => {
    debugger;
    await many_wo('/nativeio/hello.db');
    await many_ro('/nativeio/hello.db');
    await many_rw('/nativeio/hello.db');
  });

  websql_profile();
}
