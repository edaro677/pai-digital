import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('0002 requires explicit exact database approval and only allows the two reviewed targets',()=>{
  for(const name of ['up.sql','verify.sql','down.sql']){
    const sql=readFileSync(new URL('../migrations/0002_report_progress/'+name,import.meta.url),'utf8');
    assert.match(sql,/SESSION_CONTEXT\(N'pai\.migration\.database'\)/);
    assert.match(sql,/@Target IS NULL OR DATALENGTH\(@Target\)<>DATALENGTH\(DB_NAME\(\)\)/);
    assert.match(sql,/@Target COLLATE Latin1_General_100_BIN2<>DB_NAME\(\) COLLATE Latin1_General_100_BIN2/);
    assert.match(sql,/DB_NAME\(\) COLLATE Latin1_General_100_BIN2 NOT IN \(N'pai_poc_dev',N'pai_poc_migration_test'\)/);
    assert.equal(sql.includes('\r'),false,'SQL bytes must remain LF to preserve the manifest across Git checkout');
  }
});
