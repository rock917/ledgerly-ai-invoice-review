-- Synthetic reference data only. Re-running does not reset accepted PO balances.
insert into public.ap_vendors(id, name, tax_id, approved) values
('11111111-1111-4111-8111-111111111111', 'Northstar Office Supplies', 'DEMO-TAX-001', true),
('22222222-2222-4222-8222-222222222222', 'Harbor Technology Services', 'DEMO-TAX-002', true)
on conflict (id) do nothing;
insert into public.ap_purchase_orders(id, reference, vendor_id, currency, amount) values
('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'PO-2026-1001', '11111111-1111-4111-8111-111111111111', 'INR', 100000),
('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'PO-2026-1002', '22222222-2222-4222-8222-222222222222', 'INR', 50000)
on conflict (id) do nothing;
