$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'helpers/migration-sqlclient.ps1')
$checks=0
function Check-Synthetic($Condition){if(-not $Condition){throw 'SYNTHETIC_CHECK_FAILED'};$script:checks++}
$bytes=[byte[]](0,1,2,3,4,5,254,255)
$parameter=New-TrialSqlParameter 'expectedVersion' $bytes
Check-Synthetic ($parameter.SqlDbType -eq [Data.SqlDbType]::Binary -and $parameter.Size -eq 8)
Check-Synthetic ($parameter.Value -is [byte[]])
Check-Synthetic ([BitConverter]::ToString($parameter.Value) -ceq '00-01-02-03-04-05-FE-FF')
$bytes[0]=99;Check-Synthetic ($parameter.Value[0] -eq 0)
$parameter=New-TrialSqlParameter 'approval' 'LOCAL_PROGRESS_0002'
Check-Synthetic ($parameter.SqlDbType -eq [Data.SqlDbType]::NVarChar -and $parameter.Size -eq 4000)
Check-Synthetic ($parameter.Value -ceq 'LOCAL_PROGRESS_0002')
$parameter=New-TrialSqlParameter 'unicode' 'á 😀 漢字'
Check-Synthetic ($parameter.Value -ceq 'á 😀 漢字')
$parameter=New-TrialSqlParameter 'snapshot' ('a'*4001)
Check-Synthetic ($parameter.Size -eq -1 -and $parameter.Value.Length -eq 4001)
$parameter=New-TrialSqlParameter 'nullable' $null
Check-Synthetic ($parameter.Value -is [DBNull])
Check-Synthetic ((Get-TrialMemoryFailure $true $false) -ceq 'SQL_MEMORY_PRESSURE')
Check-Synthetic ((Get-TrialMemoryFailure $false $true) -ceq 'SQL_MEMORY_PRESSURE')
Check-Synthetic ($null -eq (Get-TrialMemoryFailure $false $false))
Check-Synthetic ((Get-TrialSha256 (Join-Path $PSScriptRoot '../migrations/0001_initial/up.sql')) -ceq '29634f596d609ea6b031ed50f1641180d4dd0f2d6fd40ff3357e60a184b1d35f')
Check-Synthetic ((Get-TrialMemoryFailure $null $false) -ceq 'SQL_MEMORY_STATUS_UNVERIFIED')
Check-Synthetic ((Get-TrialMemoryFailure $false $null) -ceq 'SQL_MEMORY_STATUS_UNVERIFIED')
[pscustomobject]@{status='OK';checks=$checks;sqlConnections=0}|ConvertTo-Json -Compress
