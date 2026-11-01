import test from 'node:test';
import assert from 'node:assert/strict';
process.env.DATABASE_URL='file::memory:';
const {db,init,query}=await import('../lib/db.mjs');
const client=db(),original=client.execute.bind(client);let schemaReads=0,failOnce=true;
client.execute=async statement=>{
 if(typeof statement==='string'&&statement.startsWith('PRAGMA')) {
  if(failOnce){failOnce=false;throw Error('temporary schema failure');}
  schemaReads++;
 }
 return original(statement);
};
test('initialization retries a failed migration and shares completed schema checks across calls',async()=>{
 await assert.rejects(()=>init(),/temporary schema failure/);
 await Promise.all([init(),init(),init()]);assert.equal(schemaReads,3);
 await Promise.all(Array.from({length:10},()=>query('owner','SELECT * FROM campaigns WHERE tenant=?')));
 assert.equal(schemaReads,3,'warm queries must not re-inspect schema');
});
