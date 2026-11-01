import { PGlite } from '@electric-sql/pglite'
import { readFile } from 'node:fs/promises'
import assert from 'node:assert/strict'

// Real PostgreSQL execution in memory; no production connection or credentials.
const db = new PGlite()
const sql = name => readFile(new URL('../' + name, import.meta.url), 'utf8')
await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
 create schema auth; create schema storage;
 create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,is_anonymous boolean default false);
 create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);`)
await db.exec(await sql('schema.sql'))
await db.exec(await sql('seed.sql'))
const migration = await sql('migrations/002_private_workspaces.sql')
await db.exec(migration)
const a = '10000000-0000-4000-8000-000000000001', b = '10000000-0000-4000-8000-000000000002'
await db.query('insert into auth.users(id,email,email_confirmed_at) values($1,$2,now()),($3,$4,now())', [a,'a@example.test',b,'b@example.test'])
await db.exec('set role service_role')
const ensure = id => db.query('select ap_ensure_workspace($1,$2)', [id,'Test reviewer'])
await ensure(a); await ensure(b); await ensure(a)
const pos = (await db.query('select id,owner_id,accepted_amount from ap_purchase_orders where reference=$1', ['PO-2026-1001'])).rows
assert.equal(pos.length,3)
const pa = pos.find(p => p.owner_id === a).id, pb = pos.find(p => p.owner_id === b).id
assert.equal((await db.query('select count(*)::int n from ap_purchase_orders where owner_id=$1',[a])).rows[0].n,2)
const ea = '20000000-0000-4000-8000-000000000001', eb = '20000000-0000-4000-8000-000000000002', dup = '20000000-0000-4000-8000-000000000003'
const insert = (id,owner,po,total=5000) => db.query(`insert into ap_executions(id,owner_id,po_id,filename,file_hash,storage_path,status,outcome,vendor_name,invoice_identity,total,currency)
 values($1,$2::uuid,$3,'test.pdf','test',($2::uuid)::text || '/test.pdf','completed','ready','Northstar Office Supplies','NORTHSTAR:TEST-1',$4,'INR')`,[id,owner,po,total])
await insert(ea,a,pa); await insert(eb,b,pb)
await assert.rejects(insert(dup,a,pb), /foreign key/)
const review = (id,owner,action='approve') => db.query('select ap_review_invoice_owned($1,$2,$3,$4,$5)',[id,owner,action,'Test reviewer','Checked evidence'])
await assert.rejects(review(ea,b),/Execution not found/)
await assert.rejects(db.query('select ap_review_invoice($1,$2,$3,$4)',[ea,'approve','Legacy reviewer','Checked evidence']),/Execution not found/)
await review(ea,a)
assert.equal(Number((await db.query('select accepted_amount from ap_purchase_orders where id=$1',[pb])).rows[0].accepted_amount),0)
await review(eb,b) // Same invoice identity is allowed in a different workspace.
await assert.rejects(review(ea,a),/already final/)
await insert(dup,a,pa)
await assert.rejects(review(dup,a),/already approved/)
await review(dup,a,'reject')
await ensure(a)
assert.equal(Number((await db.query('select accepted_amount from ap_purchase_orders where id=$1',[pa])).rows[0].accepted_amount),5000)
assert.equal((await db.query('select ap_dashboard_owned($1) d',[b])).rows[0].d.total,1)
assert.equal((await db.query('select ap_dashboard() d')).rows[0].d.total,0)
assert.equal((await db.query('select reviewer_user_id from ap_reviews where execution_id=$1',[ea])).rows[0].reviewer_user_id,a)
for (const role of ['anon','authenticated']) {
  await db.exec('reset role; set role ' + role)
  await assert.rejects(db.query('select * from ap_executions'),/permission denied/)
  await assert.rejects(ensure(a),/permission denied/)
  await assert.rejects(review(ea,a),/permission denied/)
}
await db.exec('reset role')
await db.exec(migration) // Reapplying must retain approvals and balances.
assert.equal(Number((await db.query('select accepted_amount from ap_purchase_orders where id=$1',[pa])).rows[0].accepted_amount),5000)
assert.equal((await db.query('select count(*)::int n from ap_user_profiles')).rows[0].n,2)
await db.close()
console.log('PASS: migration, idempotent provisioning, owner constraints, approval isolation, duplicate protection, balances, audit identity, and role permissions')
