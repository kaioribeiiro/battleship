export default function Panel({ title, meta, className = '', children, ...rest }) {
  return (
    <section className={`panel ${className}`.trim()} {...rest}>
      <i className="reg reg--tl" aria-hidden="true" />
      <i className="reg reg--tr" aria-hidden="true" />
      <i className="reg reg--bl" aria-hidden="true" />
      <i className="reg reg--br" aria-hidden="true" />
      {title && (
        <h2 className="panel__title">
          <span>{title}</span>
          {meta && <small>{meta}</small>}
        </h2>
      )}
      {children}
    </section>
  );
}
