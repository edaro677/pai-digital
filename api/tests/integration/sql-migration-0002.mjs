// Retired ODBC/child-process launcher: administrative SQL must run directly in PowerShell.
console.log(JSON.stringify({status:'FAILED',category:'EXPLICIT_SQLCLIENT_TRIAL_REQUIRED',sqlConnections:0,
  command:'pwsh -NoProfile -File api/tests/integration/sql-migration-0002.ps1 -Run'}));
process.exitCode=1;
