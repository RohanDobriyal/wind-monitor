export function Figure({ title, note, children }) {
  return (
    <section className="figure">
      <header>
        <h2>{title}</h2>
        {note && <p className="note">{note}</p>}
      </header>
      {children}
    </section>
  );
}

export function Ledger({ items }) {
  return (
    <dl className="ledger">
      {items.map((item) => (
        <div key={item.label} className={`cell ${item.tone || ""}`}>
          <dt>{item.label}</dt>
          <dd>
            {item.value}
            {item.unit && <span className="unit"> {item.unit}</span>}
          </dd>
          {item.note && <small>{item.note}</small>}
        </div>
      ))}
    </dl>
  );
}

export function Notice({ tone, children }) {
  return <p className={`notice ${tone || ""}`}>{children}</p>;
}
