import test from 'node:test';
import assert from 'node:assert/strict';
import {storageConfig} from '../lib/storage.mjs';
test('local demo gets durable local SQLite by default',()=>assert.deepEqual(storageConfig({}),{url:'file:data/ahoy.db',temporary:false,directory:'data'}));
test('Vercel demo needs no external accounts and writes only to tmp',()=>assert.deepEqual(storageConfig({VERCEL:'1'}),{url:'file:/tmp/ahoy-demo.db',temporary:true}));
test('Vercel real-account mode cannot use ephemeral storage',()=>{assert.throws(()=>storageConfig({VERCEL:'1',DEMO_MODE:'false'}),/Connect Turso/);assert.throws(()=>storageConfig({VERCEL:'1',LIVE_SENDS_ENABLED:'true'}),/Connect Turso/);});
test('Vercel rejects local file databases and accepts Turso',()=>{assert.throws(()=>storageConfig({VERCEL:'1',DATABASE_URL:'file:data.db'}),/Turso/);assert.deepEqual(storageConfig({VERCEL:'1',DATABASE_URL:'libsql://test.turso.io',DATABASE_AUTH_TOKEN:'test'}),{url:'libsql://test.turso.io',authToken:'test',temporary:false});});
