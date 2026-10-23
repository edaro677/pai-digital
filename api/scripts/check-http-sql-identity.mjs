// Explicit local read-only preflight; never imported by Functions or HTTP.
import {userInfo} from 'node:os';
import {localOdbcConfig} from '../.local-build/infrastructure/sql/odbc.js';

async function check(){
  if(process.argv[2]!=='--check'||process.platform!=='win32'||userInfo().username.toLowerCase()!=='paipoc_test')
    throw new Error('PREFLIGHT_REJECTED');
  const driver=(await import('mssql/msnodesqlv8.js')).default;
  const pool=new driver.ConnectionPool(localOdbcConfig());pool.on('error',()=>{});
  let result={status:'FAILED',category:'SQL_HOST_IDENTITY_NOT_VERIFIED'};
  let stage='CONNECT';
  try{
    await pool.connect();stage='QUERY';
    const [row]=(await new driver.Request(pool).query(`SELECT
      CASE WHEN ORIGINAL_LOGIN()=CONVERT(sysname,SERVERPROPERTY('MachineName'))+N'\\PAIPOC_Test'
        AND SUSER_SNAME()=ORIGINAL_LOGIN() THEN 1 ELSE 0 END AS expectedIdentity,
      IS_SRVROLEMEMBER('sysadmin') AS sysadmin,IS_MEMBER('db_owner') AS dbOwner,
      HAS_PERMS_BY_NAME(NULL,NULL,'CONTROL SERVER') AS controlServer,
      HAS_PERMS_BY_NAME(DB_NAME(),'DATABASE','CONTROL') AS controlDatabase,
      CASE WHEN DB_NAME()='pai_poc_dev' THEN 1 ELSE 0 END AS expectedDatabase,
      CASE WHEN CONNECTIONPROPERTY('net_transport')='Shared memory' THEN 1 ELSE 0 END AS sharedMemory,
      @@TRANCOUNT AS transactions;`)).recordset;
    stage='IDENTITY_AND_PRIVILEGES';
    const passed=row.expectedIdentity===1&&row.expectedDatabase===1&&row.sharedMemory===1
      &&['sysadmin','dbOwner','controlServer','controlDatabase','transactions'].every(k=>row[k]===0);
    if(!passed)result={status:'FAILED',category:'SQL_HOST_IDENTITY_NOT_VERIFIED',stage,failedChecks:['expectedIdentity','expectedDatabase','sharedMemory'].filter(k=>row[k]!==1).concat(['sysadmin','dbOwner','controlServer','controlDatabase','transactions'].filter(k=>row[k]!==0))};
    if(passed)result={status:'OK',expectedIdentity:true,administrativeSqlPrivileges:false,
      database:'pai_poc_dev',transport:'Shared memory',transactions:0,writes:0};
  }catch(error){const allowed=['ETIMEOUT','ETIMEDOUT','ELOGIN','ESOCKET','EREQUEST','ECONNCLOSED','ENOTOPEN','HYT00','HYT01','08001','28000'];result={status:'FAILED',category:'SQL_HOST_IDENTITY_NOT_VERIFIED',stage,technicalCode:allowed.includes(error?.code)?error.code:null};}
  finally{try{await pool.close();result.closed=true;}catch{result.closed=false;result.status='FAILED';}}
  console.log(JSON.stringify(result));process.exitCode=result.status==='OK'?0:1;
}
check().catch(()=>{console.log('{"status":"FAILED","category":"SQL_HOST_PREFLIGHT_FAILED"}');process.exitCode=1;});
