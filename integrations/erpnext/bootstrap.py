"""Run through bench execute exec on the dedicated local demo site only.

Creates synthetic master data and a restricted API user. Secrets are written to a
private file, never printed. Does not submit any Purchase Invoice or Payment Entry.
"""
import json
import os
import secrets
from pathlib import Path

import frappe
from frappe.utils import today, getdate
from frappe.custom.doctype.custom_field.custom_field import create_custom_fields
from frappe.permissions import add_permission, update_permission_property
from erpnext.setup.setup_wizard.operations.install_fixtures import install as install_fixtures

frappe.set_user('Administrator')
# New sites have ERPNext installed but have not run the interactive setup wizard.
# Initialize its standard reference records before company creation.
if not frappe.db.exists('Warehouse Type', 'Transit'):
    install_fixtures('India')
COMPANY = 'Ledgerly Demo'
ROLE = 'Ledgerly Draft Integration'
USER = 'ledgerly-integration@example.test'
SUPPLIER = 'Ledgerly Demo Supplies'
ITEM = 'LEDGERLY-NONSTOCK'


def ensure(doctype, name, values):
    if frappe.db.exists(doctype, name):
        return frappe.get_doc(doctype, name)
    return frappe.get_doc({'doctype': doctype, **values}).insert(ignore_permissions=True)


company = ensure('Company', COMPANY, dict(company_name=COMPANY, abbr='LDEMO',
    default_currency='INR', country='India', chart_of_accounts='Standard',
    create_chart_of_accounts_based_on='Standard Template'))
year = getdate(today()).year
ensure('Fiscal Year', str(year), dict(year=str(year), year_start_date=f'{year}-01-01', year_end_date=f'{year}-12-31'))
ensure('Supplier', SUPPLIER, dict(supplier_name=SUPPLIER, supplier_group='All Supplier Groups',
    supplier_type='Company', country='India', tax_id='DEMO-ERP-001'))
ensure('Item', ITEM, dict(item_code=ITEM, item_name='Office consumables demo',
    item_group='All Item Groups', stock_uom='Nos', is_stock_item=0))
create_custom_fields({'Purchase Invoice': [dict(fieldname='custom_ledgerly_execution_id',
    label='Ledgerly execution ID', fieldtype='Data', insert_after='bill_no', unique=1,
    no_copy=1, read_only=1)]})
field = frappe.get_doc('Custom Field','Purchase Invoice-custom_ledgerly_execution_id')
if not field.unique:
    raise RuntimeError('Existing Ledgerly custom field is not unique; inspect it before continuing.')
ensure('Role', ROLE, dict(role_name=ROLE, desk_access=0))
for doctype in ['Supplier','Item','Company','Account','Purchase Order','Purchase Invoice','Custom Field']:
    add_permission(doctype, ROLE, 0)
    for perm in ['read','select','create','write','submit','cancel','delete','amend','export','share','print','email']:
        allowed = perm in ['read','select'] or (doctype == 'Purchase Invoice' and perm == 'create')
        update_permission_property(doctype, ROLE, 0, perm, int(allowed))
user = ensure('User', USER, dict(email=USER, first_name='Ledgerly Integration',
    enabled=1, user_type='System User', send_welcome_email=0,
    new_password=secrets.token_urlsafe(40), roles=[{'role': ROLE}]))
user.set('roles', [{'role': ROLE}])
if not user.api_key: user.api_key = secrets.token_hex(15)
secret = user.get_password('api_secret', raise_exception=False)
if not secret:
    secret = secrets.token_hex(24)
    user.api_secret = secret
user.save(ignore_permissions=True)
frappe.clear_cache(user=USER)
assert frappe.has_permission('Purchase Invoice', 'create', user=USER)
for doctype, permission in [('Purchase Invoice', 'submit'), ('Purchase Invoice', 'write'),
        ('Payment Entry', 'create'), ('Payment Entry', 'submit')]:
    if frappe.has_permission(doctype, permission, user=USER):
        raise RuntimeError(f'Integration role unexpectedly allows {doctype} {permission}')

# Reuse only our own submitted demo PO; never delete/reset balances or ERP history.
existing = frappe.get_all('Purchase Order', filters={'company': COMPANY, 'supplier': SUPPLIER,
    'docstatus': 1}, fields=['name'], order_by='creation asc', limit=1)
if existing:
    po = frappe.get_doc('Purchase Order', existing[0].name)
else:
    po = frappe.get_doc(dict(doctype='Purchase Order', company=COMPANY, supplier=SUPPLIER,
        transaction_date=today(), schedule_date=today(), currency='INR',
        items=[dict(item_code=ITEM, qty=100, rate=1000, schedule_date=today())], taxes=[]))
    po.insert(ignore_permissions=True)
    po.submit()
frappe.db.commit()
private = Path(frappe.get_site_path('private', 'ledgerly-credentials.json'))
private.write_text(json.dumps(dict(api_key=user.api_key, api_secret=secret, company=COMPANY,
    supplier=SUPPLIER, purchase_order=po.name, item_code=ITEM, integration_user=USER)))
os.chmod(private, 0o600)
print(json.dumps({'company': COMPANY, 'purchase_order': po.name, 'integration_user': USER,
    'credentials': 'saved to site private/ledgerly-credentials.json', 'mode': 'draft-only',
    'permission_checks': 'draft create allowed; invoice write/submit and payment create/submit denied'}))
