// Capability pages. Each answers one real search with information specific to it, and states
// plainly what the software does today and what's planned.
export const SEO_PAGES = {
  "quarry-management-software": {
    title: "Quarry Management Software for Indian Operators | R.K. Enterprises",
    description: "Manage quarry orders, dispatch, customer ledgers, expenses, attendance and payroll in one system, in English and Marathi.",
    h1: "Quarry management software",
    intro: "A quarry generates records all day: orders at the office, vehicles at the gate, cash at the counter, attendance on site. This software keeps those records in one system so they agree with each other.",
    sections: [
      ["What it covers today", "Production is recorded by shift and goes into stock. Staff book orders against a material, weigh each truck in and out, and record the payment. That one delivery reduces stock, updates the customer's balance and appears in the daily accounts."],
      ["Who sees what", "Staff logins handle daily work: bookings, deliveries, expenses and attendance. Customer balances, reports, payroll and logins are limited to the owner. Every change is logged with who made it and when."],
      ["Working in Marathi", "Each person can switch between English and Marathi with one tap, so the office and the site can use the same records in the language they prefer."],
    ],
    available: ["Production by shift", "Live stock and physical counts", "Order booking", "Weighbridge records and challans", "Vehicles, fuel and repairs", "Customer ledgers and daily accounts", "GST invoices and GSTR-1 working sheets", "Daily cash count by site", "Royalty register and permit limits", "Comparing several sites", "Offline gate entry", "Attendance and payroll"],
    planned: ["E-invoicing (IRN)", "Tracking stock moved between sites"],
    faqs: [
      ["Can staff use it on their phones?", "Yes. It runs in the browser on any phone or computer."],
      ["Can staff see customer balances?", "No. Balances and reports are limited to the owner's login."],
    ],
  },
  "stone-crusher-management-software": {
    title: "Stone Crusher Management Software India | R.K. Enterprises",
    description: "Software for stone crushers to book orders, record each load, track customer balances and manage staff wages.",
    h1: "Stone crusher management software",
    intro: "A stone crusher sells by the load, often on credit, to customers who pay in parts. The difficulty is rarely the sale. It's knowing later what was delivered and what is still owed.",
    sections: [
      ["Selling by the load", "Orders hold the agreed rate, and the bill follows the quantity actually delivered, so a short load doesn't leave the wrong figure on the ledger."],
      ["Part payments and advances", "Money taken at delivery and payments made later both count against the same customer balance. Advances show as credit."],
      ["Daily cash", "The daily accounts page brings together sales, collections, expenses and net cash, so the day can be closed without going through each register."],
    ],
    available: ["Rate and quantity orders", "Output by shift, with boulders used", "Product-wise stock", "Part payments, advances and credit limits", "Daily accounts and cash count", "GST invoices with each delivery"],
    planned: ["Crusher running hours"],
    faqs: [["Does it produce GST invoices?", "Yes. With GST switched on, each delivery issues a tax invoice with CGST, SGST or IGST worked out, and each month is sorted into GSTR-1 working sheets. E-invoicing (IRN) isn't included yet."]],
  },
  "aggregate-inventory-management": {
    title: "Aggregate Inventory Management Software | R.K. Enterprises",
    description: "Track aggregate stock by material from production, deliveries and physical counts, with low stock and variance warnings.",
    h1: "Aggregate inventory management",
    intro: "Aggregate stock is hard to count. It sits in open piles, moves by the truckload and changes through the day. Useful stock figures depend on recording what comes in and what goes out consistently.",
    sections: [
      ["Why stock figures drift", "Dispatches are usually recorded, but production and internal movements often aren't. The difference only appears at a physical stock check, when it's too late to find out why. Moisture and density make it harder still."],
      ["How stock is worked out here", "Stock isn't typed in. It's calculated from the opening figure, production by shift, raw material used and every delivery, so it always agrees with the records behind it."],
      ["Counting what's really there", "Enter a physical count and the book figure is corrected, with the difference kept on record. Operators commonly aim to keep the two within 1 to 2%, so a bigger gap is flagged for you."],
    ],
    available: ["Stock by material", "Booked and available quantities", "Physical counts and differences", "Low stock warnings", "Movement history for each material"],
    planned: ["Stock by physical location or pile", "Drone or survey volume import"],
    faqs: [["Can it show current stock?", "Yes, once your materials and opening stock are set up. Stock is by material, not by individual pile."]],
  },
  "weighbridge-management-software": {
    title: "Weighbridge Software for Quarries in India | R.K. Enterprises",
    description: "Gross, tare and net records tied to quarry orders, with stored empty weights, printed challans and direct indicator reading.",
    h1: "Weighbridge management for quarries",
    intro: "The weighbridge is where a quarry's quantities become facts. The value comes from connecting that weight to the order, the vehicle and the customer's account, without copying it by hand.",
    sections: [
      ["What a connected weighbridge record needs", "Gross weight, tare weight, the net weight between them, the vehicle and the order it belongs to. Each of those normally ends up on a slip that someone copies later."],
      ["How weighing works", "A truck is weighed in empty and that arrival is saved, so a different person can finish the order. When it's weighed out loaded, the net weight is worked out and converted into the order's unit. A truck's empty weight is remembered for next time."],
      ["Reading the indicator directly", "Chrome and Edge on a computer can read a serial weighbridge indicator directly, and only accept a weight once it holds steady. Output formats vary by make, so we check your indicator before relying on it. Weights can always be typed in."],
    ],
    available: ["Gross, tare and net records", "Two-stage weigh-in and weigh-out", "Stored empty weights", "Printed challan with pass number", "Direct reading from serial indicators in Chrome or Edge"],
    planned: ["Camera and number-plate capture", "Boom barrier control"],
    faqs: [["Will it connect to my existing weighbridge?", "If your indicator has a serial output, it can usually be read from a computer running Chrome or Edge. We check your model first, because formats differ."]],
  },
  "quarry-dispatch-management": {
    title: "Quarry Dispatch Management Software | R.K. Enterprises",
    description: "Track pending quarry deliveries with vehicle, arrival and dispatch times, delivered quantity and payment against every order.",
    h1: "Quarry dispatch management",
    intro: "Dispatch is where an order turns into money. When loads are tracked apart from orders, it gets hard to tell what's still pending, what went out, and what was collected at the gate.",
    sections: [
      ["One list of pending deliveries", "Every booked order appears in a pending list, oldest first on the owner's dashboard, so nothing waits unnoticed."],
      ["A complete record for each load", "Completing a delivery captures the vehicle number, arrival and dispatch times, delivered quantity and the amount paid. The system won't accept dispatch before arrival."],
      ["Fixing mistakes properly", "The owner can reopen a delivery entered wrongly. The balance reverses and the old values stay in the activity log."],
    ],
    available: ["Pending delivery list", "Vehicles at the gate", "Weighbridge weights on each load", "Payment at delivery", "Printed challan", "Trip counts by vehicle", "Reopening with full history"],
    planned: ["Driver mobile app", "Generating e-way bills directly, without uploading a file"],
    faqs: [["Can two people complete the same order by accident?", "No. The order is locked while it's being completed, and a closed order can't be completed again."]],
  },
};
