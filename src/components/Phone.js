// A phone number you can tap to call.
export default function Phone({ number }) {
  if (!number) return null;
  return <a className="tel" href={`tel:${String(number).replace(/[^\d+]/g, "")}`}>{number}</a>;
}
