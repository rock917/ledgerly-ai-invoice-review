import { PGlite } from '@electric-sql/pglite'
import { readFile } from 'node:fs/promises'
import assert from 'node:assert/strict'

const db = new PGlite()
const sql = name => readFile(new URL('../' + name, import.meta.url), 'utf8')
await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
 create schema auth; create schema storage;
 create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,is_anonymous boolean default false);
 create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);`)
for (const path of ['schema.sql','seed.sql','migrations/002_private_workspaces.sql','migrations/003_erpnext.sql']) await db.exec(await sql(path))
const a='10000000-0000-4000-8000-000000000001', b='10000000-0000-4000-8000-000000000002'
const id='20000000-0000-4000-8000-000000000001', token='30000000-0000-4000-8000-000000000001', other='30000000-0000-4000-8000-000000000002'
await db.query('insert into auth.users(id,email,email_confirmed_at) values($1,$2,now()),($3,$4,now())',[a,'a@example.test',b,'b@example.test'])
await db.exec('set role service_role')
for (const user of [a,b]) await db.query('select ap_ensure_workspace($1,$2)',[user,'ERP test'])
const mapping={reference:'PO-ERP-1',supplier:'SUP-1',supplier_name:'ERP supplier',tax_id:null,currency:'INR',amount:'100000'}
const importPO=async (owner,map=mapping)=>(await db.query('select ap_erp_import($1,$2) d',[owner,map])).rows[0].d
const po=await importPO(a)
assert.equal((await importPO(a)).id,po.id)
assert.notEqual((await importPO(b)).id,po.id)
await assert.rejects(importPO(a,{...mapping,amount:'200000'}),/different data/)
await assert.rejects(importPO(null),/Private workspace/)
await db.query(`insert into ap_executions(id,owner_id,po_id,filename,file_hash,storage_path,status,outcome,vendor_name,invoice_identity,total,currency)
 values($1,$2,$3,'erp.pdf','hash','test.pdf','completed','ready','ERP supplier','ERP:INV-1',10000,'INR')`,[id,a,po.id])
const claim=async(owner,t=token)=>(await db.query('select ap_erp_claim($1,$2,$3) d',[owner,id,t])).rows[0].d
await assert.rejects(claim(a),/Only an approved invoice/)
await db.query('select ap_review_invoice_owned($1,$2,$3,$4,$5)',[id,a,'approve','Tester','Verified against ERP PO'])
await assert.rejects(claim(b),/Only an approved invoice/)
assert.equal((await claim(a)).lease_token,token)
assert.equal((await claim(a,other)).lease_token,token)
const finish=(owner,t,document,error=null)=>db.query('select ap_erp_finish($1,$2,$3,$4,$5) d',[owner,id,t,document,error])
await assert.rejects(finish(b,token,'PINV-1'),/lease expired/)
await assert.rejects(finish(a,other,'PINV-1'),/lease expired/)
await finish(a,token,null,'Network unavailable')
assert.equal((await claim(a,other)).attempts,2)
await assert.rejects(finish(a,token,'PINV-stale'),/lease expired/)
await finish(a,other,'PINV-1')
assert.equal((await claim(a)).erp_document_id,'PINV-1')
await assert.rejects(finish(a,other,null,'late failure'),/lease expired/)
assert.equal(Number((await importPO(a)).accepted_amount),10000)
for (const role of ['anon','authenticated']) {
  await db.exec('reset role; set role '+role)
  await assert.rejects(db.query('select * from ap_erp_exports'),/permission denied/)
  await assert.rejects(importPO(a),/permission denied/)
  await assert.rejects(claim(a),/permission denied/)
  await assert.rejects(finish(a,other,'PINV-1'),/permission denied/)
}
await db.exec('reset role')
await db.exec(await sql('migrations/003_erpnext.sql'))
assert.equal(Number((await importPO(a)).accepted_amount),10000)
assert.equal((await claim(a)).status,'synced')
await db.close()
console.log('PASS: ERP migration, owner isolation, import idempotency, preserved balances, approval gate, leases, reconciliation state and permissions')
