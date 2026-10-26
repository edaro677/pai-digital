# Parameter construction only: safe to test without a SQL connection.
function Get-TrialSha256([string]$Path) {
 $algorithm=[Security.Cryptography.SHA256]::Create()
 try{return [BitConverter]::ToString($algorithm.ComputeHash([IO.File]::ReadAllBytes($Path))).Replace('-','').ToLowerInvariant()}
 finally{$algorithm.Dispose()}
}
function New-TrialSqlParameter([string]$Name,$Value) {
 $parameter=New-Object System.Data.SqlClient.SqlParameter
 $parameter.ParameterName='@'+$Name
 if($Value -is [byte[]]){
  $parameter.SqlDbType=[Data.SqlDbType]::Binary;$parameter.Size=8
  $parameter.Value=[byte[]]$Value.Clone()
 }else{
  $parameter.SqlDbType=[Data.SqlDbType]::NVarChar
  $parameter.Size=if($null -eq $Value -or ([string]$Value).Length -le 4000){4000}else{-1}
  if($null -eq $Value){$parameter.Value=[DBNull]::Value}else{$parameter.Value=$Value}
 }
 return $parameter
}
function Get-TrialMemoryFailure($PhysicalLow,$VirtualLow) {
 if($PhysicalLow -isnot [bool] -or $VirtualLow -isnot [bool]){return 'SQL_MEMORY_STATUS_UNVERIFIED'}
 if($PhysicalLow -eq $true -or $VirtualLow -eq $true){return 'SQL_MEMORY_PRESSURE'}
 return $null
}
