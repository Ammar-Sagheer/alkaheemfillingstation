import Link from 'next/link';

/**
 * Who a delivery came from, chosen from the supplier list rather than typed.
 *
 * It was a free-text box ("e.g. PSO"). Typed names cannot hold an account: "PSO",
 * "P.S.O" and "pso " are three suppliers to a ledger and one to the owner. A
 * delivery chosen from the list posts to that supplier's account by itself
 * (migration 067), which is the whole point of the Suppliers page.
 *
 * Active suppliers only: a retired one keeps its account but takes no new
 * deliveries. Staff can read the names (067); adding one is the owner's, so an
 * empty list says where to do it rather than leaving a dead dropdown.
 */
export default function SupplierSelect({ id, suppliers = [], label = 'Supplier' }) {
  const active = suppliers.filter((supplier) => supplier.is_active);

  return (
    <div>
      <label className="label" htmlFor={id}>
        {label}
      </label>
      {active.length === 0 ? (
        <p className="callout-warn">
          No suppliers on the list yet. The owner adds them under{' '}
          <Link href="/admin/suppliers" className="font-semibold underline">
            Suppliers
          </Link>
          .
        </p>
      ) : (
        <select id={id} name="supplier_id" required defaultValue="" className="input">
          <option value="" disabled>
            Choose…
          </option>
          {active.map((supplier) => (
            <option key={supplier.id} value={supplier.id}>
              {supplier.name}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}
