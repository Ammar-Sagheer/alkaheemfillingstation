'use client';

import { useId, useState } from 'react';

/**
 * One customer, many vehicles, one ledger (migration 801, Al Hakeem first).
 *
 * The pieces every credit form uses to say WHICH vehicle took the fuel or the
 * oil: the customer's label in a picker, the vehicle choice under it, and a
 * box that finds the account from the number on the windscreen. The rules
 * (a vehicle belongs to its customer, a removed one takes no new slips) are
 * the database's; these only make the right choice the easy one.
 *
 * `customers` come from getCustomers(), each with `vehicles` already narrowed
 * to the active ones and sorted.
 */

/** "Not one of these": the slip is saved with no vehicle named. */
export const NO_VEHICLE = 'none';

export function vehiclesOf(customer) {
  return customer?.vehicles ?? [];
}

/** How a customer reads in a picker: the fleet size, or the one number. */
export function customerLabel(customer) {
  const vehicles = vehiclesOf(customer);
  if (vehicles.length > 1) return `${customer.name} · ${vehicles.length} vehicles`;
  if (vehicles.length === 1) return `${customer.name} · ${vehicles[0].vehicle_number}`;
  return customer.name;
}

/** The vehicle a slip should start on when its customer is chosen. */
export function defaultVehicleFor(customer) {
  const vehicles = vehiclesOf(customer);
  return vehicles.length === 1 ? vehicles[0].id : '';
}

/** What to send to the database: a vehicle id, or nothing. */
export function vehicleIdForSave(value) {
  return value && value !== NO_VEHICLE ? value : null;
}

/** Same rule as vehicle_key() in migration 801: no case, spaces or dashes. */
export function vehicleKey(number) {
  return String(number ?? '').replace(/[\s-]/g, '').toUpperCase();
}

/**
 * The vehicle choice for one customer. Nothing at all when they have no
 * vehicles; the one vehicle, chosen, when they have one; and a required choice
 * when they have several, so a fleet slip is never filed against nobody by
 * accident. "Not one of these" is always there, for a truck not on the list.
 */
export function VehicleSelect({ customer, value, onChange, name, id, className = 'input' }) {
  const vehicles = vehiclesOf(customer);
  if (!customer || vehicles.length === 0) {
    return name ? <input type="hidden" name={name} value="" /> : null;
  }

  return (
    <select
      id={id}
      name={name}
      required={vehicles.length > 1}
      aria-label={id ? undefined : 'Vehicle'}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className={className}
    >
      {vehicles.length > 1 ? <option value="">Which vehicle?</option> : null}
      {vehicles.map((vehicle) => (
        <option key={vehicle.id} value={vehicle.id}>
          {vehicle.vehicle_number}
        </option>
      ))}
      <option value={NO_VEHICLE}>Not one of these</option>
    </select>
  );
}

/**
 * Type the number on the windscreen, pick it from the list, and the slip's
 * customer and vehicle are both filled in. The fast way at the pump, where
 * the driver knows his truck's number and not always whose account it is on.
 */
export function VehicleFinder({ customers, onPick, className = 'input py-2 text-sm' }) {
  const listId = useId();
  const [text, setText] = useState('');

  const entries = [];
  for (const customer of customers) {
    for (const vehicle of vehiclesOf(customer)) {
      entries.push({
        key: vehicleKey(vehicle.vehicle_number),
        label: `${vehicle.vehicle_number} · ${customer.name}`,
        customerId: customer.id,
        vehicleId: vehicle.id,
      });
    }
  }
  if (entries.length === 0) return null;

  function handleChange(event) {
    const typed = event.target.value;
    setText(typed);
    const typedKey = vehicleKey(typed.split(' · ')[0]);
    const match =
      entries.find((entry) => entry.label === typed) ??
      (typedKey.length >= 3 ? entries.filter((entry) => entry.key === typedKey) : []).at(0);
    if (match) {
      onPick(match.customerId, match.vehicleId);
      setText('');
    }
  }

  return (
    <>
      <input
        type="text"
        list={listId}
        value={text}
        onChange={handleChange}
        autoComplete="off"
        aria-label="Find by vehicle number"
        placeholder="Vehicle no. (finds the customer)"
        className={className}
      />
      <datalist id={listId}>
        {entries.map((entry) => (
          <option key={entry.vehicleId} value={entry.label} />
        ))}
      </datalist>
    </>
  );
}
